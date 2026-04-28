/**
 * Corporate ownership, M&A, JV and counterparty changes affecting infrastructure SPVs.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { recordAiUsage } from "../_shared/requireAi.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { beginAgentTask, alreadyRunningResponse, finishAgentRun, setTaskStep } from "../_shared/agentGate.ts";
import { fetchAgentResearch } from "../_shared/agentResearch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const lock = await beginAgentTask(supabase, "corporate-ma-monitor", "Corporate / M&A / counterparty scan", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("corporate-ma-monitor");
    const taskId = lock.taskId;
    const runStartedAt = new Date();

    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, country, sector")
      .eq("approved", true)
      .limit(25);

    await setTaskStep(supabase, taskId, "Searching");
    const q = `infrastructure project ownership changes M&A joint venture SPV acquisition ${projects?.slice(0, 8).map((p) => p.name).join(" ") || "global infrastructure"} 2025 2026`;
    const research = projects?.length ? await fetchAgentResearch({
      agentName: "corporate-ma-monitor",
      systemPrompt: "You are a corporate intelligence analyst for infrastructure and project finance.",
      userPrompt: q,
    }) : { ok: false as const, error: "No projects available for corporate scan" };

    if (!research.ok) {
      const error = research.error;
      if (taskId) await supabase.from("research_tasks").update({ status: "failed", error, completed_at: new Date().toISOString() }).eq("id", taskId);
      await finishAgentRun(supabase, "corporate-ma-monitor", "failed", runStartedAt);
      return new Response(JSON.stringify({ success: false, error }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const raw = [research.text];
    await setTaskStep(supabase, taskId, "Extracting");

    const aiRes = await chatCompletions({
        messages: [
          { role: "system", content: "Extract structured M&A, JV, ownership, and counterparty events for infrastructure." },
          {
            role: "user",
            content: `Projects:\n${projects?.map((p) => `${p.name} (${p.country})`).join(", ")}\n\nResearch:\n${raw.join("\n")}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "report_corporate",
            parameters: {
              type: "object",
              properties: {
                events: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      related_project_name: { type: "string" },
                      country: { type: "string" },
                      event_type: { type: "string", enum: ["acquisition", "divestiture", "jv", "ownership_change", "spv_change", "credit_event"] },
                      summary: { type: "string" },
                      severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                      source_url: { type: "string" },
                    },
                    required: ["event_type", "summary", "severity"],
                  },
                },
              },
              required: ["events"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_corporate" } },
    });

    let events: Array<Record<string, string>> = [];
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      try {
        const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (tc?.function?.arguments) events = JSON.parse(tc.function.arguments).events || [];
      } catch { /* ignore */ }
    }

    let alertsCreated = 0;
    for (const ev of events) {
      const match = projects?.find((p) =>
        ev.related_project_name && p.name.toLowerCase().includes(String(ev.related_project_name).toLowerCase().slice(0, 12))
      );
      const sev = ev.severity === "critical" || ev.severity === "high" ? ev.severity : "medium";
      await supabase.from("alerts").insert({
        project_id: match?.id || null,
        project_name: match?.name || `${ev.country || "Global"} corporate`,
        severity: sev as "critical" | "high" | "medium" | "low",
        message: `Corporate: ${ev.event_type} — ${ev.summary}`,
        category: "financial",
        source_url: ev.source_url || null,
      });
      alertsCreated++;
    }

    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed",
        result: { events: events.length, alerts: alertsCreated },
        completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }
    await finishAgentRun(supabase, "corporate-ma-monitor", "completed", runStartedAt);
    await recordAiUsage(gate.supabaseAdmin, gate.userId);
    return new Response(JSON.stringify({ success: true, events: events.length, alerts: alertsCreated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("corporate-ma-monitor error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
