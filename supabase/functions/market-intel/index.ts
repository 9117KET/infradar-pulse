import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { runResearchPrompt } from "../_shared/webResearch.ts";
import { recordAiUsage } from "../_shared/requireAi.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { beginAgentTask, alreadyRunningResponse } from "../_shared/agentGate.ts";

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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const lock = await beginAgentTask(supabase, "market-intel", "Competitive market intelligence scan", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("market-intel");
    const taskId = lock.taskId;

    const rawContent: string[] = [];

    if (FIRECRAWL_API_KEY) {
      try {
        const res = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: "infrastructure construction contract awards bids global worldwide 2025", limit: 5, scrapeOptions: { formats: ["markdown"] } }),
        });
        const data = await res.json();
        if (data?.data) {
          for (const r of data.data.slice(0, 3)) {
            if (r.markdown) rawContent.push(`Source: ${r.url}\n${r.markdown.slice(0, 2000)}`);
          }
        }
      } catch (e) { console.error("Firecrawl error:", e); }
    }

    const aiResearch = await runResearchPrompt({
      systemRole: "You are a competitive intelligence analyst for the global infrastructure construction sector.",
      query: "Latest contract awards, bidding activity, market share shifts in infrastructure construction worldwide 2025. Which companies are winning the most bids? Any new market entrants?",
    });
    if (aiResearch) rawContent.push(aiResearch);

    if (!rawContent.length) {
      if (taskId) await supabase.from("research_tasks").update({ status: "failed", error: "No data", completed_at: new Date().toISOString() }).eq("id", taskId);
      return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiRes = await chatCompletions({
        messages: [
          { role: "system", content: "Extract competitive intelligence about infrastructure firms." },
          { role: "user", content: `Analyze market intelligence:\n\n${rawContent.join("\n\n")}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "report_market_intel",
            description: "Report market intelligence",
            parameters: {
              type: "object",
              properties: {
                insights: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      company: { type: "string" },
                      event_type: { type: "string", enum: ["contract_award", "new_bid", "market_entry", "market_exit", "partnership", "acquisition"] },
                      region: { type: "string" },
                      sector: { type: "string" },
                      value_usd: { type: "number" },
                      summary: { type: "string" },
                      source_url: { type: "string", description: "URL of the source" },
                    },
                    required: ["company", "event_type", "summary"],
                  },
                },
              },
              required: ["insights"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_market_intel" } },
    });

    let insights: any[] = [];
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      try {
        const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (tc?.function?.arguments) insights = JSON.parse(tc.function.arguments).insights || [];
      } catch (e) { console.error("Parse error:", e); }
    }

    let alertsCreated = 0;
    for (const i of insights) {
      await supabase.from("alerts").insert({
        project_id: null,
        project_name: i.company,
        severity: "low",
        message: `Market intel: ${i.company}: ${i.event_type.replace(/_/g, " ")}: ${i.summary}`,
        category: "market",
        source_url: i.source_url || null,
      });
      alertsCreated++;
    }

    if (taskId) await supabase.from("research_tasks").update({ status: "completed", result: { insights: insights.length, alerts: alertsCreated }, completed_at: new Date().toISOString() }).eq("id", taskId);

    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(JSON.stringify({ success: true, insights: insights.length, alerts: alertsCreated }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Market intel error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
