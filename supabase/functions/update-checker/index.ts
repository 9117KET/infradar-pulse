import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { runResearchPrompt } from "../_shared/webResearch.ts";
import { recordAiUsage } from "../_shared/requireAi.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { isAgentEnabled, pausedResponse, beginAgentTask, alreadyRunningResponse } from "../_shared/agentGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Supabase not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (!await isAgentEnabled(supabase, "update-check")) return pausedResponse("update-check");
  const lock = await beginAgentTask(supabase, "update-check", "Checking approved projects for recent updates", gate.userId);
  if (lock.alreadyRunning) return alreadyRunningResponse("update-check");
  const taskId = lock.taskId;

  try {
    const { data: projects } = await supabase.from("projects").select("*")
      .eq("approved", true)
      .order("last_updated", { ascending: true });
    if (!projects?.length) {
      if (taskId) await supabase.from("research_tasks").update({ status: "completed", completed_at: new Date().toISOString(), result: { message: "No projects to check" } }).eq("id", taskId);
      await recordAiUsage(gate.supabaseAdmin, gate.userId);
      return new Response(JSON.stringify({ success: true, message: "No projects to check" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let updatedCount = 0;
    let alertsCreated = 0;

    for (const project of projects.slice(0, 50)) {
      // Confidence decay
      const daysSinceUpdate = Math.floor((Date.now() - new Date(project.last_updated).getTime()) / (1000 * 60 * 60 * 24));
      const weeksSinceUpdate = Math.floor(daysSinceUpdate / 7);
      if (weeksSinceUpdate > 0 && project.confidence > 30) {
        const decayedConfidence = Math.max(30, project.confidence - weeksSinceUpdate);
        if (decayedConfidence < project.confidence) {
          await supabase.from("projects").update({ confidence: decayedConfidence }).eq("id", project.id);
          await supabase.from("project_updates").insert({
            project_id: project.id,
            field_changed: "confidence",
            old_value: String(project.confidence),
            new_value: String(decayedConfidence),
            source: "Confidence decay (time-based)",
          });
        }
      }

      {
        try {
          const content = await runResearchPrompt({
            systemRole: "You are an infrastructure analyst. Report any recent updates, delays, cancellations, or progress on the given project. Be specific and factual.",
            query: `What is the latest status update on "${project.name}" infrastructure project in ${project.country}? Any delays, stage changes, or new developments in ${new Date().getFullYear()}?`,
          });

          if (content) {
            const aiResponse = await chatCompletions({
                messages: [
                  { role: "system", content: "You analyze infrastructure project updates. Return JSON only." },
                  {
                    role: "user",
                    content: `Current project data:
Name: ${project.name}
Country: ${project.country}
Stage: ${project.stage}
Status: ${project.status}
Confidence: ${project.confidence}

Recent news:
${content}

Analyze if there are meaningful changes. Return JSON with:
- has_update: boolean
- new_stage: string or null
- new_status: string or null
- confidence_adjustment: number (-20 to +20)
- alert_message: string or null
- alert_severity: "critical" | "high" | "medium" | "low" | null`,
                  },
                ],
                tools: [{
                  type: "function",
                  function: {
                    name: "report_update",
                    description: "Report project update analysis",
                    parameters: {
                      type: "object",
                      properties: {
                        has_update: { type: "boolean" },
                        new_stage: { type: "string" },
                        new_status: { type: "string" },
                        confidence_adjustment: { type: "number" },
                        alert_message: { type: "string" },
                        alert_severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                      },
                      required: ["has_update"],
                      additionalProperties: false,
                    },
                  },
                }],
                tool_choice: { type: "function", function: { name: "report_update" } },
            });

            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
              if (toolCall?.function?.arguments) {
                const analysis = JSON.parse(toolCall.function.arguments);
                if (analysis.has_update) {
                  const updates: Record<string, unknown> = { last_updated: new Date().toISOString() };
                  if (analysis.new_stage) updates.stage = analysis.new_stage;
                  if (analysis.new_status) updates.status = analysis.new_status;
                  if (analysis.confidence_adjustment) {
                    updates.confidence = Math.max(0, Math.min(100, project.confidence + analysis.confidence_adjustment));
                  }
                  await supabase.from("projects").update(updates).eq("id", project.id);
                  updatedCount++;

                  if (analysis.alert_message) {
                    await supabase.from("alerts").insert({
                      project_id: project.id,
                      project_name: project.name,
                      severity: analysis.alert_severity || "medium",
                      message: analysis.alert_message,
                      category: "construction",
                      source_url: null,
                    });
                    alertsCreated++;
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error(`Error checking ${project.name}:`, e);
        }
      }
    }

    const result = { success: true, projects_checked: Math.min(projects.length, 50), updated: updatedCount, alerts_created: alertsCreated };
    if (taskId) await supabase.from("research_tasks").update({ status: "completed", completed_at: new Date().toISOString(), result }).eq("id", taskId);

    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Update checker error:", e);
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    if (taskId) await supabase.from("research_tasks").update({ status: "failed", completed_at: new Date().toISOString(), error: errMsg }).eq("id", taskId);
    return new Response(JSON.stringify({ error: errMsg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
