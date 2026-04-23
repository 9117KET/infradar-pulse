import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { recordAiUsage } from "../_shared/requireAi.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { runResearchBatch } from "../_shared/webResearch.ts";

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

    const { data: task } = await supabase
      .from("research_tasks")
      .insert({
        task_type: "supply-chain-monitor",
        query: "Supply chain & commodity scan",
        status: "running",
        requested_by: gate.userId,
      })
      .select().single();

    const systemRole =
      "You are a supply chain analyst for infrastructure construction materials worldwide.";
    const rawContent = await runResearchBatch([
      {
        systemRole,
        query:
          "Summarise the current state of global commodity prices and shortages affecting infrastructure construction in 2025: steel, cement, copper, aluminium, lithium, and fuel. Include approximate price changes vs prior year and any acute disruptions.",
      },
      {
        systemRole,
        query:
          "Summarise current global shipping and logistics disruptions impacting construction material delivery in 2025 (port congestion, canal issues, tariffs, sanctions, supplier insolvencies). Note which regions are most affected.",
      },
    ]);

    if (!rawContent.length) {
      if (task) await supabase.from("research_tasks").update({ status: "failed", error: "No data", completed_at: new Date().toISOString() }).eq("id", task.id);
      return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: projects } = await supabase.from("projects").select("id, name, sector, risk_score").eq("approved", true).limit(50);

    const aiRes = await chatCompletions({
        messages: [
          { role: "system", content: "Analyze supply chain risks for infrastructure projects." },
          { role: "user", content: `Sectors in portfolio: ${[...new Set(projects?.map(p => p.sector) || [])].join(", ")}\n\n${rawContent.join("\n\n")}` },
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

    let updatedProjects = 0;
    let alertsCreated = 0;

    for (const r of risks) {
      if (r.disruption_type && r.disruption_type !== "none" && r.affected_sectors?.length) {
        // Update risk scores for affected sector projects
        const affected = projects?.filter(p => r.affected_sectors.includes(p.sector)) || [];
        const riskBump = r.severity === "critical" ? 20 : r.severity === "high" ? 12 : 5;

        for (const p of affected.slice(0, 10)) {
          const newRisk = Math.min(100, (p.risk_score || 50) + riskBump);
          await supabase.from("projects").update({ risk_score: newRisk, last_updated: new Date().toISOString() }).eq("id", p.id);
          updatedProjects++;
        }

        await supabase.from("alerts").insert({
          project_id: null,
          project_name: `${r.commodity} supply chain`,
          severity: r.severity || "medium",
          message: `Supply chain: ${r.commodity} ${r.disruption_type.replace(/_/g, " ")}: ${r.summary}`,
          category: "supply_chain",
          source_url: r.source_url || null,
        });
        alertsCreated++;
      }
    }

    if (task) await supabase.from("research_tasks").update({ status: "completed", result: { risks: risks.length, updated: updatedProjects, alerts: alertsCreated }, completed_at: new Date().toISOString() }).eq("id", task.id);

    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(JSON.stringify({ success: true, risks: risks.length, updatedProjects, alerts: alertsCreated }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Supply chain monitor error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
