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
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: task } = await supabase
      .from("research_tasks")
      .insert({
        task_type: "funding-tracker",
        query: "Development bank funding scan",
        status: "running",
        requested_by: gate.userId,
      })
      .select().single();

    const rawContent: string[] = [];

    // Search Firecrawl for dev bank announcements
    if (FIRECRAWL_API_KEY) {
      const searches = [
        "World Bank infrastructure project approval worldwide 2025",
        "Asian Development Bank ADB new project funding 2025",
        "IFC AIIB EBRD infrastructure investment global 2025",
        "African Development Bank AfDB new project funding 2025",
      ];
      for (const q of searches.slice(0, 2)) {
        try {
          const res = await fetch("https://api.firecrawl.dev/v1/search", {
            method: "POST",
            headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ query: q, limit: 3, scrapeOptions: { formats: ["markdown"] } }),
          });
          const data = await res.json();
          if (data?.data) {
            for (const r of data.data.slice(0, 2)) {
              if (r.markdown) rawContent.push(`Source: ${r.url}\n${r.markdown.slice(0, 2000)}`);
            }
          }
        } catch (e) { console.error("Firecrawl error:", e); }
      }
    }

    // Perplexity for financial intelligence
    if (PERPLEXITY_API_KEY) {
      try {
        const res = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              { role: "system", content: "You are a development finance analyst tracking infrastructure funding flows worldwide." },
              { role: "user", content: "Latest development bank infrastructure project approvals, bond issuances, sovereign wealth fund investments worldwide 2025. Include amounts, countries, and project names." },
            ],
            search_recency_filter: "week",
          }),
        });
        const data = await res.json();
        if (data?.choices?.[0]?.message?.content) rawContent.push(data.choices[0].message.content);
      } catch (e) { console.error("Perplexity error:", e); }
    }

    if (!rawContent.length) {
      if (task) await supabase.from("research_tasks").update({ status: "failed", error: "No data sources", completed_at: new Date().toISOString() }).eq("id", task.id);
      return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get existing projects for matching
    const { data: projects } = await supabase.from("projects").select("id, name, value_usd, value_label").limit(50);

    const aiRes = await chatCompletions({
        messages: [
          { role: "system", content: "Extract funding and financial data for infrastructure projects." },
          { role: "user", content: `Analyze funding data. Match to existing projects if possible: ${projects?.map(p => p.name).join(", ") || "none"}.\n\n${rawContent.join("\n\n")}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "report_funding",
            description: "Report funding findings",
            parameters: {
              type: "object",
              properties: {
                updates: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      project_name: { type: "string" },
                      funding_source: { type: "string" },
                      amount_usd: { type: "number" },
                      amount_label: { type: "string" },
                      event_type: { type: "string", enum: ["new_funding", "disbursement", "budget_overrun", "funding_gap", "bond_issuance"] },
                      severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                      summary: { type: "string" },
                      source_url: { type: "string", description: "URL of the source article" },
                    },
                    required: ["project_name", "summary"],
                  },
                },
              },
              required: ["updates"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_funding" } },
    });

    let updates: any[] = [];
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      try {
        const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (tc?.function?.arguments) updates = JSON.parse(tc.function.arguments).updates || [];
      } catch (e) { console.error("Parse error:", e); }
    }

    let alertsCreated = 0;
    for (const u of updates) {
      // Try to match and update existing project values
      const match = projects?.find(p => p.name.toLowerCase().includes(u.project_name?.toLowerCase() || ""));
      if (match && u.amount_usd && u.amount_usd > (match.value_usd || 0)) {
        await supabase.from("projects").update({ value_usd: u.amount_usd, value_label: u.amount_label || match.value_label, last_updated: new Date().toISOString() }).eq("id", match.id);
        await supabase.from("project_updates").insert({ project_id: match.id, field_changed: "value_usd", old_value: String(match.value_usd), new_value: String(u.amount_usd), source: u.funding_source || "Funding Tracker" });
      }

      if (u.event_type === "budget_overrun" || u.event_type === "funding_gap") {
        await supabase.from("alerts").insert({
          project_id: match?.id || null,
          project_name: u.project_name,
          severity: u.severity || "high",
          message: `Financial alert: ${u.project_name}: ${u.summary}`,
          category: "financial",
          source_url: u.source_url || null,
        });
        alertsCreated++;
      }
    }

    if (task) await supabase.from("research_tasks").update({ status: "completed", result: { updates: updates.length, alerts: alertsCreated }, completed_at: new Date().toISOString() }).eq("id", task.id);

    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(JSON.stringify({ success: true, updates: updates.length, alerts: alertsCreated }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Funding tracker error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
