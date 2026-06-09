import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { recordAiUsage } from "../_shared/requireAi.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import {
  isAgentEnabled,
  pausedResponse,
  beginAgentTask,
  alreadyRunningResponse,
  finishAgentRun,
  setTaskStep,
} from "../_shared/agentGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 30;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  let taskId: string | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;
  let runStartedAt: Date | null = null;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!await isAgentEnabled(supabase, "health-scoring")) return pausedResponse("health-scoring");
    const lock = await beginAgentTask(supabase, "health-scoring", "Computing project health scores and delay probabilities", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("health-scoring");
    taskId = lock.taskId;
    runStartedAt = new Date();

    await setTaskStep(supabase, taskId, "Loading projects");

    // Fetch approved projects, oldest-scored first so we rotate through the portfolio
    const { data: projects, error: projErr } = await supabase
      .from("projects")
      .select("id, name, country, sector, stage, status, risk_score, confidence, value_usd, timeline, health_score, health_scored_at, pipeline_status")
      .eq("approved", true)
      .order("health_scored_at", { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE);

    if (projErr) throw new Error(`Failed to load projects: ${projErr.message}`);
    if (!projects?.length) {
      const result = { success: true, message: "No projects to score", scored: 0 };
      if (taskId) await supabase.from("research_tasks").update({ status: "completed", completed_at: new Date().toISOString(), result }).eq("id", taskId);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await setTaskStep(supabase, taskId, "Loading alert signals");

    // Fetch recent alert counts per project (last 30 days)
    const projectIds = projects.map((p: any) => p.id);
    const since30d = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: alertRows } = await supabase
      .from("alerts")
      .select("project_id, severity")
      .in("project_id", projectIds)
      .gte("created_at", since30d);

    const alertCounts: Record<string, { total: number; high: number; critical: number }> = {};
    for (const row of alertRows ?? []) {
      if (!row.project_id) continue;
      if (!alertCounts[row.project_id]) alertCounts[row.project_id] = { total: 0, high: 0, critical: 0 };
      alertCounts[row.project_id].total++;
      if (row.severity === "high") alertCounts[row.project_id].high++;
      if (row.severity === "critical") alertCounts[row.project_id].critical++;
    }

    await setTaskStep(supabase, taskId, "Scoring with AI");

    const projectSummaries = projects.map((p: any) => {
      const ac = alertCounts[p.id] ?? { total: 0, high: 0, critical: 0 };
      return {
        id: p.id,
        name: p.name,
        country: p.country,
        sector: p.sector,
        stage: p.stage ?? "unknown",
        status: p.status ?? "unknown",
        risk_score: p.risk_score ?? 50,
        confidence: p.confidence ?? 50,
        value_usd: p.value_usd,
        timeline: p.timeline,
        recent_alerts: ac.total,
        high_alerts: ac.high,
        critical_alerts: ac.critical,
        pipeline_status: p.pipeline_status,
      };
    });

    const aiResponse = await chatCompletions({
      messages: [
        {
          role: "system",
          content: `You are an infrastructure project health scoring engine. Compute a health_score (0-100, 100 = perfectly healthy) and delay_probability (0.0-1.0) for each project based on:
- risk_score (higher = more risky = lower health)
- confidence (signal quality)
- recent alerts (high/critical alerts = lower health)
- stage and status (early stages have more uncertainty)
- timeline plausibility vs sector norms
- value_usd scale vs region capacity

Return concise signal_summary (max 20 words) explaining the main driver of the score.`,
        },
        {
          role: "user",
          content: `Score these ${projectSummaries.length} projects:\n${JSON.stringify(projectSummaries, null, 2)}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "submit_health_scores",
            description: "Submit health scores and delay probabilities for all projects",
            parameters: {
              type: "object",
              properties: {
                scores: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      project_id: { type: "string" },
                      health_score: { type: "integer", minimum: 0, maximum: 100 },
                      delay_probability: { type: "number", minimum: 0, maximum: 1 },
                      signal_summary: { type: "string" },
                      signals: {
                        type: "object",
                        properties: {
                          risk_contribution: { type: "number" },
                          alert_contribution: { type: "number" },
                          confidence_contribution: { type: "number" },
                          stage_factor: { type: "string" },
                        },
                        additionalProperties: false,
                      },
                    },
                    required: ["project_id", "health_score", "delay_probability", "signal_summary"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["scores"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "submit_health_scores" } },
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI error: ${aiResponse.status} - ${errText}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("AI returned no tool call");

    const { scores } = JSON.parse(toolCall.function.arguments) as {
      scores: Array<{
        project_id: string;
        health_score: number;
        delay_probability: number;
        signal_summary: string;
        signals?: Record<string, unknown>;
      }>;
    };

    await setTaskStep(supabase, taskId, "Persisting scores");

    let scored = 0;
    const now = new Date().toISOString();

    for (const s of scores ?? []) {
      const project = projects.find((p: any) => p.id === s.project_id);
      if (!project) continue;

      const hs = Math.max(0, Math.min(100, Math.round(s.health_score)));
      const dp = Math.max(0, Math.min(1, +s.delay_probability.toFixed(3)));
      const prevHealth = project.health_score;

      await supabase
        .from("projects")
        .update({
          health_score: hs,
          delay_probability: dp,
          health_scored_at: now,
          health_signals: { summary: s.signal_summary, ...(s.signals ?? {}) },
          last_updated: now,
        })
        .eq("id", s.project_id);

      await supabase.from("project_health_history").insert({
        project_id: s.project_id,
        health_score: hs,
        delay_probability: dp,
        signals: { summary: s.signal_summary, ...(s.signals ?? {}) },
        scored_at: now,
      });

      // Alert on significant health degradation (>= 15 pts drop or delay probability crossing 0.7)
      const wasHealthy = prevHealth === null || prevHealth >= 60;
      const nowUnhealthy = hs < 45;
      const highDelayRisk = dp >= 0.7;

      if ((wasHealthy && nowUnhealthy) || highDelayRisk) {
        await supabase.from("alerts").insert({
          project_id: s.project_id,
          project_name: project.name,
          severity: highDelayRisk ? "high" : "medium",
          message: `Health score ${prevHealth ?? "N/A"} → ${hs}. Delay probability: ${Math.round(dp * 100)}%. ${s.signal_summary}`,
          category: "risk",
          source_url: null,
        });
      }

      scored++;
    }

    const result = { success: true, projects_analyzed: projects.length, scored };
    await finishAgentRun(supabase, "health-scoring", "completed", runStartedAt);
    if (taskId) await supabase.from("research_tasks").update({ status: "completed", completed_at: now, result }).eq("id", taskId);
    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("health-score-agent error:", e);
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    if (supabase && taskId) {
      await supabase.from("research_tasks").update({ status: "failed", completed_at: new Date().toISOString(), error: errMsg }).eq("id", taskId);
    }
    if (supabase && runStartedAt) {
      await finishAgentRun(supabase, "health-scoring", "failed", runStartedAt ?? new Date()).catch(() => {});
    }
    return new Response(JSON.stringify({ error: errMsg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
