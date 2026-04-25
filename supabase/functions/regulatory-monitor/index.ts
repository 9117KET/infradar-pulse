import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { recordAiUsage } from "../_shared/requireAi.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";

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

    const { data: task } = await supabase
      .from("research_tasks")
      .insert({
        task_type: "regulatory-monitor",
        query: "Regulatory compliance scan",
        status: "running",
        requested_by: gate.userId,
      })
      .select().single();

    const { data: projects } = await supabase.from("projects").select("id, name, country, sector").eq("approved", true).limit(30);
    const countries = [...new Set(projects?.map(p => p.country) || [])];

    let raw = "";
    if (PERPLEXITY_API_KEY && countries.length) {
      try {
        const res = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              { role: "system", content: "You are a regulatory compliance analyst for infrastructure projects worldwide." },
              { role: "user", content: `Summarise (1) notable EIA approvals, denials, and pending reviews for major infrastructure projects in ${countries.join(", ")} during 2024-2025, naming specific projects, agencies, and dates; and (2) recent construction permit blocks, sanctions, and regulatory or policy changes affecting infrastructure investment in ${countries.join(", ")} during 2024-2025, focusing on items that could materially change project timelines or financing.` },
            ],
            search_recency_filter: "month",
          }),
        });
        const data = await res.json();
        raw = data?.choices?.[0]?.message?.content ?? "";
      } catch (e) { console.error("Perplexity:", e); }
    }

    if (!raw) {
      if (task) await supabase.from("research_tasks").update({ status: "failed", error: "No research text (set PERPLEXITY_API_KEY)", completed_at: new Date().toISOString() }).eq("id", task.id);
      return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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

    let findings: any[] = [];
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      try {
        const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (tc?.function?.arguments) findings = JSON.parse(tc.function.arguments).findings || [];
      } catch (e) { console.error("Parse error:", e); }
    }

    const enriched = findings.map(f => {
      const isCritical = ["sanction", "permit_block", "eia_denial"].includes(f.type);
      const match = projects?.find(p => p.country === f.country && (f.related_project_name ? p.name.toLowerCase().includes(f.related_project_name.toLowerCase()) : false));
      return { f, isCritical, match };
    });

    const alertRows = enriched.map(({ f, isCritical, match }) => ({
      project_id: match?.id || null,
      project_name: f.related_project_name || `${f.country} regulatory`,
      severity: isCritical ? "critical" : (f.severity || "medium"),
      message: `Regulatory: ${f.type.replace(/_/g, " ")} in ${f.country}: ${f.summary}`,
      category: "regulatory",
      source_url: f.source_url || null,
    }));
    if (alertRows.length) await supabase.from("alerts").insert(alertRows);

    await Promise.all(
      enriched
        .filter(({ match, isCritical }) => match && isCritical)
        .map(({ match }) => supabase.from("projects").update({ status: "At Risk", last_updated: new Date().toISOString() }).eq("id", match!.id))
    );

    const alertsCreated = alertRows.length;

    if (task) await supabase.from("research_tasks").update({ status: "completed", result: { findings: findings.length, alerts: alertsCreated }, completed_at: new Date().toISOString() }).eq("id", task.id);

    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(JSON.stringify({ success: true, findings: findings.length, alerts: alertsCreated }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Regulatory monitor error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
