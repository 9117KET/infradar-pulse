import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { recordAiUsage } from "../_shared/requireAi.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { beginAgentTask, alreadyRunningResponse, finishAgentRun, setTaskStep, isAgentEnabled, pausedResponse } from "../_shared/agentGate.ts";
import { fetchAgentResearch } from "../_shared/agentResearch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!await isAgentEnabled(supabase, "supply-chain-monitor")) return pausedResponse("supply-chain-monitor");
    const lock = await beginAgentTask(supabase, "supply-chain-monitor", "Supply chain & commodity scan", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("supply-chain-monitor");
    const taskId = lock.taskId;
    const runStartedAt = new Date();

    await setTaskStep(supabase, taskId, "Searching");
    const research = await fetchAgentResearch({
      agentName: "supply-chain-monitor",
      systemPrompt: "You are a supply chain analyst for infrastructure construction materials worldwide.",
      userPrompt: "Summarise (1) current global commodity prices and shortages affecting infrastructure construction in 2025 (steel, cement, copper, aluminium, lithium, fuel - include approximate price changes vs prior year and any acute disruptions); and (2) current global shipping and logistics disruptions impacting construction material delivery in 2025 (port congestion, canal issues, tariffs, sanctions, supplier insolvencies - note which regions are most affected).",
    });

    if (!research.ok) {
      const error = research.error;
      if (taskId) await supabase.from("research_tasks").update({ status: "failed", error, completed_at: new Date().toISOString() }).eq("id", taskId);
      await finishAgentRun(supabase, "supply-chain-monitor", "failed", runStartedAt);
      return new Response(JSON.stringify({ success: false, error }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const raw = research.text;
    await setTaskStep(supabase, taskId, "Extracting");

    const { data: projects } = await supabase.from("projects").select("id, name, sector, risk_score").eq("approved", true).limit(50);

    const aiRes = await chatCompletions({
        messages: [
          { role: "system", content: "Analyze supply chain risks for infrastructure projects." },
          { role: "user", content: `Sectors in portfolio: ${[...new Set(projects?.map(p => p.sector) || [])].join(", ")}\n\n${raw}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "report_supply_chain",
            description: "Report supply chain findings",
            parameters: {
              type: "object",
              properties: {
                risks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      commodity: { type: "string" },
                      affected_sectors: { type: "array", items: { type: "string" } },
                      price_change_pct: { type: "number" },
                      disruption_type: { type: "string", enum: ["price_spike", "shortage", "shipping_delay", "tariff", "none"] },
                      severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                      summary: { type: "string" },
                      source_url: { type: "string", description: "URL of the source" },
                    },
                    required: ["commodity", "summary"],
                  },
                },
              },
              required: ["risks"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_supply_chain" } },
    });

    let risks: any[] = [];
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      try {
        const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (tc?.function?.arguments) risks = JSON.parse(tc.function.arguments).risks || [];
      } catch (e) { console.error("Parse error:", e); }
    }

    const activeRisks = risks.filter(r => r.disruption_type && r.disruption_type !== "none" && r.affected_sectors?.length);

    const alertRows = activeRisks.map(r => ({
      project_id: null,
      project_name: `${r.commodity} supply chain`,
      severity: r.severity || "medium",
      message: `Supply chain: ${r.commodity} ${r.disruption_type.replace(/_/g, " ")}: ${r.summary}`,
      category: "supply_chain",
      source_url: r.source_url || null,
    }));
    if (alertRows.length) await supabase.from("alerts").insert(alertRows);

    const projectUpdates: Array<{ id: string; risk_score: number }> = [];
    for (const r of activeRisks) {
      const affected = projects?.filter(p => r.affected_sectors.includes(p.sector)) || [];
      const riskBump = r.severity === "critical" ? 20 : r.severity === "high" ? 12 : 5;
      for (const p of affected.slice(0, 10)) {
        projectUpdates.push({ id: p.id, risk_score: Math.min(100, (p.risk_score || 50) + riskBump) });
      }
    }
    const now = new Date().toISOString();
    await Promise.all(
      projectUpdates.map(({ id, risk_score }) =>
        supabase.from("projects").update({ risk_score, last_updated: now }).eq("id", id)
      )
    );

    const alertsCreated = alertRows.length;
    const updatedProjects = projectUpdates.length;

    if (taskId) await supabase.from("research_tasks").update({ status: "completed", result: { risks: risks.length, updated: updatedProjects, alerts: alertsCreated }, completed_at: new Date().toISOString() }).eq("id", taskId);

    await finishAgentRun(supabase, "supply-chain-monitor", "completed", runStartedAt);

    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(JSON.stringify({ success: true, risks: risks.length, updatedProjects, alerts: alertsCreated }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Supply chain monitor error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
