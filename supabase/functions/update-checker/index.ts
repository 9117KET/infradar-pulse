import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all approved projects
    const { data: projects } = await supabase.from("projects").select("*").eq("approved", true);
    if (!projects?.length) {
      return new Response(JSON.stringify({ success: true, message: "No projects to check" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updatedCount = 0;
    let alertsCreated = 0;

    for (const project of projects.slice(0, 5)) { // limit per run
      // Confidence decay: reduce by 1 point per week since last update
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

      // Search for recent news about the project
      if (PERPLEXITY_API_KEY) {
        try {
          const pxResponse = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "sonar",
              messages: [
                { role: "system", content: "You are an infrastructure analyst. Report any recent updates, delays, cancellations, or progress on the given project. Be specific and factual." },
                { role: "user", content: `What is the latest status update on "${project.name}" infrastructure project in ${project.country}? Any delays, stage changes, or new developments in 2025?` },
              ],
              search_recency_filter: "week",
            }),
          });
          const pxData = await pxResponse.json();
          const content = pxData?.choices?.[0]?.message?.content;

          if (content) {
            // Use AI to analyze if there's a meaningful update
            const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash-lite",
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
- new_stage: string or null (if stage changed)
- new_status: string or null (if status changed)
- confidence_adjustment: number (-20 to +20, 0 if no change)
- alert_message: string or null (if alert-worthy)
- alert_severity: "critical" | "high" | "medium" | "low" | null`,
                  },
                ],
                tools: [
                  {
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
                  },
                ],
                tool_choice: { type: "function", function: { name: "report_update" } },
              }),
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

    return new Response(
      JSON.stringify({ success: true, projects_checked: Math.min(projects.length, 5), updated: updatedCount, alerts_created: alertsCreated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Update checker error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
