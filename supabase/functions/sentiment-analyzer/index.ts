import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
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

  let taskId: string | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!await isAgentEnabled(supabase, "sentiment-analyzer")) return pausedResponse("sentiment-analyzer");
    const lock = await beginAgentTask(supabase, "sentiment-analyzer", "Sentiment & media analysis", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("sentiment-analyzer");
    taskId = lock.taskId;

    const { data: projects } = await supabase.from("projects").select("id, name, country").eq("approved", true).limit(15);

    const rawContent: string[] = [];

    if (projects?.length) {
      const prompt = `Analyze recent media sentiment, controversy, opposition, labor disputes, environmental concerns, and delays for these infrastructure projects. Include project-specific source URLs where possible:
${projects.map((p) => `- ${p.name} (${p.country})`).join("\n")}`;
      const aiResearch = await chatCompletions({
        messages: [
          { role: "system", content: "You are a media sentiment analyst for infrastructure projects. Produce concise, source-aware research notes for each project where signals exist." },
          { role: "user", content: prompt },
        ],
      });
      if (aiResearch.ok) {
        const data = await aiResearch.json();
        const content = data?.choices?.[0]?.message?.content;
        if (content) rawContent.push(content);
      }
    }

    if (!rawContent.length) {
      if (taskId) await supabase.from("research_tasks").update({ status: "completed", result: { message: "No news found" }, completed_at: new Date().toISOString() }).eq("id", taskId);
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

    if (taskId) await supabase.from("research_tasks").update({ status: "completed", result: { analyses: analyses.length, alerts: alertsCreated }, completed_at: new Date().toISOString() }).eq("id", taskId);

    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(JSON.stringify({ success: true, analyses: analyses.length, alerts: alertsCreated }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Sentiment analyzer error:", e);
    if (taskId && supabase) {
      try {
        await supabase.from("research_tasks").update({
          status: "failed",
          error: e instanceof Error ? e.message : "Unknown error",
          completed_at: new Date().toISOString(),
        }).eq("id", taskId);
      } catch { /* best-effort */ }
    }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
