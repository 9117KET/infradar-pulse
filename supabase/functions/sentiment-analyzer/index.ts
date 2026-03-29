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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: task } = await supabase
      .from("research_tasks")
      .insert({
        task_type: "sentiment-analyzer",
        query: "Sentiment & media analysis",
        status: "running",
        requested_by: gate.userId,
      })
      .select().single();

    const { data: projects } = await supabase.from("projects").select("id, name, country").eq("approved", true).limit(15);

    const rawContent: string[] = [];

    // Scrape news about existing projects
    if (FIRECRAWL_API_KEY && projects?.length) {
      const sampleProjects = projects.slice(0, 5);
      for (const p of sampleProjects) {
        try {
          const res = await fetch("https://api.firecrawl.dev/v1/search", {
            method: "POST",
            headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ query: `"${p.name}" ${p.country} infrastructure news opposition protest delay`, limit: 3, scrapeOptions: { formats: ["markdown"] } }),
          });
          const data = await res.json();
          if (data?.data) {
            for (const r of data.data.slice(0, 2)) {
              if (r.markdown) rawContent.push(`Project: ${p.name}\nSource: ${r.url}\n${r.markdown.slice(0, 1500)}`);
            }
          }
        } catch (e) { console.error("Firecrawl error:", e); }
      }
    }

    if (!rawContent.length) {
      if (task) await supabase.from("research_tasks").update({ status: "completed", result: { message: "No news found" }, completed_at: new Date().toISOString() }).eq("id", task.id);
      await recordAiUsage(gate.supabaseAdmin, gate.userId);
      return new Response(JSON.stringify({ success: true, message: "No news to analyze" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiRes = await chatCompletions({
        messages: [
          { role: "system", content: "Analyze media sentiment for infrastructure projects. Detect opposition, controversy, labor disputes." },
          { role: "user", content: `Analyze sentiment for these project news articles:\n\n${rawContent.join("\n\n---\n\n")}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "report_sentiment",
            description: "Report sentiment analysis",
            parameters: {
              type: "object",
              properties: {
                analyses: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      project_name: { type: "string" },
                      sentiment: { type: "string", enum: ["positive", "neutral", "negative", "very_negative"] },
                      issues: { type: "array", items: { type: "string", enum: ["community_opposition", "labor_dispute", "political_controversy", "environmental_concern", "cost_overrun", "delay", "none"] } },
                      severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                      summary: { type: "string" },
                      source_url: { type: "string", description: "URL of the news source" },
                    },
                    required: ["project_name", "sentiment", "summary"],
                  },
                },
              },
              required: ["analyses"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_sentiment" } },
    });

    let analyses: any[] = [];
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      try {
        const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (tc?.function?.arguments) analyses = JSON.parse(tc.function.arguments).analyses || [];
      } catch (e) { console.error("Parse error:", e); }
    }

    let alertsCreated = 0;
    for (const a of analyses) {
      if (a.sentiment === "negative" || a.sentiment === "very_negative") {
        const match = projects?.find(p => p.name.toLowerCase().includes(a.project_name?.toLowerCase() || ""));
        await supabase.from("alerts").insert({
          project_id: match?.id || null,
          project_name: a.project_name,
          severity: a.severity || (a.sentiment === "very_negative" ? "high" : "medium"),
          message: `Negative sentiment: ${a.project_name}: ${a.summary}`,
          category: "political",
          source_url: a.source_url || null,
        });
        alertsCreated++;

        // Bump risk score for projects with negative sentiment
        if (match) {
          const { data: current } = await supabase.from("projects").select("risk_score").eq("id", match.id).single();
          if (current) {
            const newRisk = Math.min(100, (current.risk_score || 50) + (a.sentiment === "very_negative" ? 15 : 8));
            await supabase.from("projects").update({ risk_score: newRisk, last_updated: new Date().toISOString() }).eq("id", match.id);
          }
        }
      }
    }

    if (task) await supabase.from("research_tasks").update({ status: "completed", result: { analyses: analyses.length, alerts: alertsCreated }, completed_at: new Date().toISOString() }).eq("id", task.id);

    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(JSON.stringify({ success: true, analyses: analyses.length, alerts: alertsCreated }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Sentiment analyzer error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
