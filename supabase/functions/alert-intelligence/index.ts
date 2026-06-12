import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { recordAiUsage } from "../_shared/requireAi.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { beginAgentTask, alreadyRunningResponse, isAgentEnabled, pausedResponse, finishAgentRun, failAgentTask } from "../_shared/agentGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchRecentAlerts(supabase: any, sinceIso: string) {
  const pageSize = 1000;
  const rows: any[] = [];
  for (let from = 0; from < 50000; from += pageSize) {
    const { data, error } = await supabase
      .from("alerts")
      .select("*")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

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

    if (!await isAgentEnabled(supabase, "alert-intelligence")) return pausedResponse("alert-intelligence");
    const lock = await beginAgentTask(supabase, "alert-intelligence", "Alert pattern analysis & intelligence brief", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("alert-intelligence");
    taskId = lock.taskId;
    runStartedAt = new Date();

    // Fetch alerts from the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const alerts = await fetchRecentAlerts(supabase, thirtyDaysAgo);

    if (!alerts?.length) {
      if (taskId) await supabase.from("research_tasks").update({ status: "completed", result: { message: "No recent alerts to analyze" }, completed_at: new Date().toISOString() }).eq("id", taskId);
      await finishAgentRun(supabase, "alert-intelligence", "completed", runStartedAt);
      await recordAiUsage(gate.supabaseAdmin, gate.userId);
      return new Response(JSON.stringify({ success: true, brief: null, message: "No recent alerts" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Group alerts by category for the prompt
    const byCategory: Record<string, any[]> = {};
    for (const a of alerts) {
      const cat = a.category || "market";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push({ severity: a.severity, message: a.message, project: a.project_name, date: a.created_at });
    }

    const alertSummary = Object.entries(byCategory)
      .map(([cat, items]) => `## ${cat.toUpperCase()} (${items.length} alerts)\n${items.slice(0, 10).map(i => `- [${i.severity}] ${i.message} (${i.project})`).join("\n")}`)
      .join("\n\n");

    const aiRes = await chatCompletions({
        messages: [
          {
            role: "system",
            content: "You are an infrastructure intelligence analyst. Analyze alert patterns across categories to identify emerging risks, regional hotspots, and actionable recommendations for infrastructure investors and project managers worldwide.",
          },
          {
            role: "user",
            content: `Analyze these ${alerts.length} alerts from the past 30 days across ${Object.keys(byCategory).length} categories:\n\n${alertSummary}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_intelligence_brief",
            description: "Generate a structured intelligence brief from alert analysis",
            parameters: {
              type: "object",
              properties: {
                patterns: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      category: { type: "string" },
                      severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                      description: { type: "string" },
                      affected_projects: { type: "array", items: { type: "string" } },
                    },
                    required: ["title", "category", "severity", "description"],
                  },
                },
                hotspots: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      region: { type: "string" },
                      alert_count: { type: "number" },
                      dominant_category: { type: "string" },
                      summary: { type: "string" },
                    },
                    required: ["region", "summary"],
                  },
                },
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      action: { type: "string" },
                      priority: { type: "string", enum: ["immediate", "short_term", "monitor"] },
                      rationale: { type: "string" },
                    },
                    required: ["action", "priority", "rationale"],
                  },
                },
                overall_risk_trend: { type: "string", enum: ["escalating", "stable", "improving"] },
                summary: { type: "string" },
              },
              required: ["patterns", "hotspots", "recommendations", "overall_risk_trend", "summary"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_intelligence_brief" } },
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      throw new Error(`AI brief generation failed: ${aiRes.status} ${errText.slice(0, 300)}`);
    }

    let brief: any = null;
    const aiData = await aiRes.json();
    try {
      const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (tc?.function?.arguments) brief = JSON.parse(tc.function.arguments);
    } catch (e) { console.error("Parse error:", e); }

    if (!brief) throw new Error("AI returned no parseable intelligence brief");

    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed",
        result: { brief, alert_count: alerts.length, categories: Object.keys(byCategory).length },
        completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }

    await finishAgentRun(supabase, "alert-intelligence", "completed", runStartedAt);
    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(JSON.stringify({ success: true, brief, alert_count: alerts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Alert intelligence error:", e);
    if (supabase) await failAgentTask(supabase, "alert-intelligence", taskId, runStartedAt, e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
