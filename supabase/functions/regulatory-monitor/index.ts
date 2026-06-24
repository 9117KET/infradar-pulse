import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { recordAiUsage } from "../_shared/requireAi.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { beginAgentTask, alreadyRunningResponse, finishAgentRun, setTaskStep, isAgentEnabled, pausedResponse, failAgentTask } from "../_shared/agentGate.ts";
import { fetchAgentResearch } from "../_shared/agentResearch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  let taskId: string | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;
  let runStartedAt = new Date();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!await isAgentEnabled(supabase, "regulatory-monitor")) return pausedResponse("regulatory-monitor");
    const lock = await beginAgentTask(supabase, "regulatory-monitor", "Regulatory compliance scan", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("regulatory-monitor");
    taskId = lock.taskId;
    runStartedAt = new Date();

    const { data: projects } = await supabase.from("projects").select("id, name, country, sector").eq("approved", true).limit(30);
    const countries = [...new Set(projects?.map(p => p.country) || [])];

    await setTaskStep(supabase, taskId, "Searching");
    const research = countries.length ? await fetchAgentResearch({
      agentName: "regulatory-monitor",
      systemPrompt: "You are a regulatory compliance analyst for infrastructure projects worldwide.",
      userPrompt: `Summarise (1) notable EIA approvals, denials, and pending reviews for major infrastructure projects in ${countries.join(", ")} during 2024-2025, naming specific projects, agencies, and dates; and (2) recent construction permit blocks, sanctions, and regulatory or policy changes affecting infrastructure investment in ${countries.join(", ")} during 2024-2025, focusing on items that could materially change project timelines or financing.`,
    }) : { ok: false as const, error: "No countries available for regulatory scan" };

    if (!research.ok) {
      const error = research.error;
      if (taskId) await supabase.from("research_tasks").update({ status: "failed", error, completed_at: new Date().toISOString() }).eq("id", taskId);
      await finishAgentRun(supabase, "regulatory-monitor", "failed", runStartedAt);
      return new Response(JSON.stringify({ success: false, error }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const raw = research.text;
    await setTaskStep(supabase, taskId, "Extracting");

    const aiRes = await chatCompletions({
        messages: [
          { role: "system", content: "Extract regulatory and compliance findings for infrastructure projects." },
          { role: "user", content: `Projects: ${projects?.map(p => `${p.name} (${p.country}, ${p.sector})`).join(", ")}\n\n${raw}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "report_regulatory",
            description: "Report regulatory findings",
            parameters: {
              type: "object",
              properties: {
                findings: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      country: { type: "string" },
                      related_project_name: { type: "string" },
                      type: { type: "string", enum: ["eia_approval", "eia_denial", "permit_block", "sanction", "policy_change", "regulation_update"] },
                      severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                      summary: { type: "string" },
                      source_url: { type: "string", description: "URL of the source article or filing" },
                    },
                    required: ["country", "type", "summary"],
                  },
                },
              },
              required: ["findings"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_regulatory" } },
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      throw new Error(`AI extraction failed: ${aiRes.status} ${errText.slice(0, 300)}`);
    }

    let findings: any[] = [];
    const aiData = await aiRes.json();
    try {
      const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (tc?.function?.arguments) findings = JSON.parse(tc.function.arguments).findings || [];
    } catch (e) { console.error("Parse error:", e); }

    const enriched = findings.map(f => {
      const isCritical = ["sanction", "permit_block", "eia_denial"].includes(f.type);
      const match = projects?.find(p => p.country === f.country && (f.related_project_name ? p.name.toLowerCase().includes(f.related_project_name.toLowerCase()) : false));
      const hasSource = typeof f.source_url === "string" && f.source_url.startsWith("http");
      return { f, isCritical, match, hasSource };
    });

    const alertRows = enriched.map(({ f, isCritical, match }) => ({
      project_id: match?.id || null,
      project_name: f.related_project_name || `${f.country} regulatory`,
      severity: isCritical ? "critical" : (f.severity || "medium"),
      message: `Regulatory: ${f.type.replace(/_/g, " ")} in ${f.country}: ${f.summary}`,
      category: "regulatory",
      source_url: f.source_url || null,
      origin: "ai_agent",
    }));
    if (alertRows.length) await supabase.from("alerts").insert(alertRows);

    // Only flip live project status when the finding carries a source URL —
    // AI research without provenance must not change verified project state.
    await Promise.all(
      enriched
        .filter(({ match, isCritical, hasSource }) => match && isCritical && hasSource)
        .map(({ match }) => supabase!.from("projects").update({ status: "At Risk", last_updated: new Date().toISOString() }).eq("id", match!.id))
    );

    const alertsCreated = alertRows.length;

    if (taskId) await supabase.from("research_tasks").update({ status: "completed", result: { findings: findings.length, alerts: alertsCreated }, completed_at: new Date().toISOString() }).eq("id", taskId);

    await finishAgentRun(supabase, "regulatory-monitor", "completed", runStartedAt);

    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(JSON.stringify({ success: true, findings: findings.length, alerts: alertsCreated }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Regulatory monitor error:", e);
    if (supabase) await failAgentTask(supabase, "regulatory-monitor", taskId, runStartedAt, e);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
