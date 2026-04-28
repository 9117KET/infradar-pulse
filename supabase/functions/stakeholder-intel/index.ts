import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { recordAiUsage } from "../_shared/requireAi.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { beginAgentTask, alreadyRunningResponse, finishAgentRun, setTaskStep } from "../_shared/agentGate.ts";
import { fetchPerplexityResearch } from "../_shared/perplexity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  try {
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const lock = await beginAgentTask(supabase, "stakeholder-intel", "Stakeholder intelligence scan", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("stakeholder-intel");
    const taskId = lock.taskId;
    const runStartedAt = new Date();

    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, country, region, sector")
      .eq("approved", true)
      .limit(20);

    if (!projects?.length) {
      if (taskId) await supabase.from("research_tasks").update({ status: "completed", result: { message: "No projects to analyze" }, completed_at: new Date().toISOString() }).eq("id", taskId);
      await recordAiUsage(gate.supabaseAdmin, gate.userId);
      return new Response(JSON.stringify({ success: true, message: "No projects" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const countries = [...new Set(projects.map((p) => p.country))].join(", ");

    await setTaskStep(supabase, taskId, "Searching");
    const research = await fetchPerplexityResearch({
      apiKey: PERPLEXITY_API_KEY,
      agentName: "stakeholder-intel",
      systemPrompt: "You are a stakeholder intelligence analyst tracking companies and government entities involved in infrastructure projects worldwide.",
      userPrompt: `Summarise (1) notable infrastructure contractors in ${countries} with material performance issues, delays, or disputes during 2024-2025; and (2) government infrastructure agencies or officials in ${countries} linked to corruption investigations, conflict-of-interest concerns, or unusual bid-award patterns during 2024-2025. Name specific firms, agencies, and projects.`,
    });

    if (!research.ok) {
      const error = research.error;
      if (taskId) await supabase.from("research_tasks").update({ status: "failed", error, completed_at: new Date().toISOString() }).eq("id", taskId);
      await finishAgentRun(supabase, "stakeholder-intel", "failed", runStartedAt);
      return new Response(JSON.stringify({ success: false, error }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const raw = research.text;
    await setTaskStep(supabase, taskId, "Extracting");

    const aiRes = await chatCompletions({
        messages: [
          { role: "system", content: "Extract stakeholder intelligence. Return JSON." },
          { role: "user", content: `Analyze stakeholder data for infrastructure projects. Identify: companies with poor track records, conflict-of-interest patterns, entities under investigation.\n\nExisting projects: ${projects.map(p => `${p.name} (${p.country})`).join(", ")}\n\nContent:\n${raw}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "report_stakeholder_intel",
            description: "Report stakeholder intelligence findings",
            parameters: {
              type: "object",
              properties: {
                findings: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      stakeholder_name: { type: "string" },
                      related_project_name: { type: "string" },
                      risk_flag: { type: "string", enum: ["poor_track_record", "conflict_of_interest", "investigation", "delays", "none"] },
                      severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                      summary: { type: "string" },
                      source_url: { type: "string", description: "URL of the source" },
                    },
                    required: ["stakeholder_name", "summary"],
                  },
                },
              },
              required: ["findings"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_stakeholder_intel" } },
    });

    let findings: any[] = [];
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      try {
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          findings = JSON.parse(toolCall.function.arguments).findings || [];
        }
      } catch (e) { console.error("Parse error:", e); }
    }

    const alertRows = findings
      .filter(f => f.risk_flag && f.risk_flag !== "none")
      .map(f => {
        const matchedProject = projects.find(p => p.name.toLowerCase().includes(f.related_project_name?.toLowerCase() || ""));
        return {
          project_id: matchedProject?.id || null,
          project_name: f.related_project_name || f.stakeholder_name,
          severity: f.severity || "medium",
          message: `Stakeholder alert: ${f.stakeholder_name}: ${f.summary}`,
          category: "stakeholder",
          source_url: f.source_url || null,
        };
      });
    if (alertRows.length) await supabase.from("alerts").insert(alertRows);
    const alertsCreated = alertRows.length;

    if (taskId) await supabase.from("research_tasks").update({ status: "completed", result: { findings: findings.length, alerts: alertsCreated }, completed_at: new Date().toISOString() }).eq("id", taskId);

    await finishAgentRun(supabase, "stakeholder-intel", "completed", runStartedAt);

    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(JSON.stringify({ success: true, findings: findings.length, alerts: alertsCreated }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Stakeholder intel error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
