import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { recordAiUsage } from "../_shared/requireAi.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { isAgentEnabled, pausedResponse } from "../_shared/agentGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Supabase not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (!await isAgentEnabled(supabase, "risk-scoring")) return pausedResponse("risk-scoring");

  // Log task start
  const { data: task } = await supabase.from("research_tasks").insert({
    task_type: "risk-scoring",
    query: "Scoring risk for approved projects using geopolitical context",
    status: "running",
    requested_by: gate.userId,
  }).select().single();
  const taskId = task?.id;

  try {
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");

    const { data: projects } = await supabase.from("projects").select("*").eq("approved", true);
    if (!projects?.length) {
      if (taskId) await supabase.from("research_tasks").update({ status: "completed", completed_at: new Date().toISOString(), result: { message: "No projects to score" } }).eq("id", taskId);
      await recordAiUsage(gate.supabaseAdmin, gate.userId);
      return new Response(JSON.stringify({ success: true, message: "No projects to score" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let scored = 0;
    let geoContext = "";

    if (PERPLEXITY_API_KEY) {
      try {
        const countries = [...new Set(projects.map((p: any) => p.country))].join(", ");
        const pxResponse = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              { role: "system", content: "You are a geopolitical risk analyst. Provide concise risk signals." },
              { role: "user", content: `What are the current geopolitical, economic, and supply chain risk signals for infrastructure projects in these countries: ${countries}? Focus on political instability, currency risks, sanctions, supply chain disruptions, and regulatory changes in the past month.` },
            ],
            search_recency_filter: "month",
          }),
        });
        const pxData = await pxResponse.json();
        geoContext = pxData?.choices?.[0]?.message?.content || "";
      } catch (e) {
        console.error("Perplexity risk context error:", e);
      }
    }

    if (!geoContext) {
      const result = { success: true, message: "No risk context available", scored: 0 };
      if (taskId) await supabase.from("research_tasks").update({ status: "completed", completed_at: new Date().toISOString(), result }).eq("id", taskId);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const projectSummaries = projects.slice(0, 25).map((p: any) =>
      `- ${p.name} (${p.country}, ${p.sector}, ${p.stage}, current risk: ${p.risk_score})`
    ).join("\n");

    const aiResponse = await chatCompletions({
        messages: [
          { role: "system", content: "You are an infrastructure risk scoring engine." },
          { role: "user", content: `Based on this geopolitical context:\n${geoContext}\n\nScore these projects (0-100 risk, higher = more risky):\n${projectSummaries}\n\nReturn updated risk scores and any alerts for significant risk changes.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "score_risks",
            description: "Update risk scores for projects",
            parameters: {
              type: "object",
              properties: {
                scores: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      project_name: { type: "string" },
                      risk_score: { type: "number" },
                      alert: { type: "string" },
                    },
                    required: ["project_name", "risk_score"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["scores"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "score_risks" } },
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI error: ${aiResponse.status} - ${errText}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const { scores } = JSON.parse(toolCall.function.arguments);
      for (const score of scores || []) {
        const project = projects.find((p: any) => p.name === score.project_name);
        if (!project) continue;
        const oldRisk = project.risk_score;
        const newRisk = Math.max(0, Math.min(100, score.risk_score));

        if (Math.abs(newRisk - oldRisk) >= 5) {
          await supabase.from("projects").update({ risk_score: newRisk, last_updated: new Date().toISOString() }).eq("id", project.id);
          await supabase.from("project_updates").insert({
            project_id: project.id,
            field_changed: "risk_score",
            old_value: String(oldRisk),
            new_value: String(newRisk),
            source: "Risk Scorer Agent",
          });
          scored++;

          if (Math.abs(newRisk - oldRisk) >= 15 || score.alert) {
            await supabase.from("alerts").insert({
              project_id: project.id,
              project_name: project.name,
              severity: newRisk > 60 ? "high" : "medium",
              message: score.alert || `Risk score changed from ${oldRisk} to ${newRisk}`,
              category: "security",
              source_url: null,
            });
          }
        }
      }
    }

    const result = { success: true, projects_analyzed: Math.min(projects.length, 25), scored };
    if (taskId) await supabase.from("research_tasks").update({ status: "completed", completed_at: new Date().toISOString(), result }).eq("id", taskId);

    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Risk scorer error:", e);
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    if (taskId) await supabase.from("research_tasks").update({ status: "failed", completed_at: new Date().toISOString(), error: errMsg }).eq("id", taskId);
    return new Response(JSON.stringify({ error: errMsg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
