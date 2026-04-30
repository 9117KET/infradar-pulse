/**
 * ESG, climate, permits, litigation, and social license signals for infrastructure projects.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { recordAiUsage } from "../_shared/requireAi.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { beginAgentTask, alreadyRunningResponse, finishAgentRun, setTaskStep, isAgentEnabled, pausedResponse } from "../_shared/agentGate.ts";
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

    if (!await isAgentEnabled(supabase, "esg-social-monitor")) return pausedResponse("esg-social-monitor");
    const lock = await beginAgentTask(supabase, "esg-social-monitor", "ESG / social license scan", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("esg-social-monitor");
    const taskId = lock.taskId;
    const runStartedAt = new Date();

    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, country, sector")
      .eq("approved", true)
      .limit(25);

    await setTaskStep(supabase, taskId, "Searching");
    const q = `environmental permit litigation protest community opposition climate water stress megaproject infrastructure ${projects?.map((p) => p.country).filter((c, i, a) => a.indexOf(c) === i).slice(0, 6).join(" ") || "global"} 2025`;
    const research = projects?.length ? await fetchAgentResearch({
      agentName: "esg-social-monitor",
      systemPrompt: "ESG and social license analyst for large infrastructure.",
      userPrompt: q,
    }) : { ok: false as const, error: "No projects available for ESG scan" };

    if (!research.ok) {
      const error = research.error;
      if (taskId) await supabase.from("research_tasks").update({ status: "failed", error, completed_at: new Date().toISOString() }).eq("id", taskId);
      await finishAgentRun(supabase, "esg-social-monitor", "failed", runStartedAt);
      return new Response(JSON.stringify({ success: false, error }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const raw = [research.text];
    await setTaskStep(supabase, taskId, "Extracting");

    const aiRes = await chatCompletions({
        messages: [
          { role: "system", content: "Extract ESG and social license events; map to infrastructure projects when possible." },
          {
            role: "user",
            content: `Projects:\n${projects?.map((p) => `${p.name} (${p.country}, ${p.sector})`).join("\n")}\n\nResearch:\n${raw.join("\n")}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "report_esg",
            parameters: {
              type: "object",
              properties: {
                findings: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      related_project_name: { type: "string" },
                      country: { type: "string" },
                      type: { type: "string", enum: ["permit", "litigation", "protest", "climate", "water", "biodiversity", "esg_disclosure"] },
                      severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                      summary: { type: "string" },
                      source_url: { type: "string" },
                    },
                    required: ["type", "summary", "severity"],
                  },
                },
              },
              required: ["findings"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_esg" } },
    });

    let findings: Array<Record<string, string>> = [];
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      try {
        const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (tc?.function?.arguments) findings = JSON.parse(tc.function.arguments).findings || [];
      } catch { /* ignore */ }
    }

    let alertsCreated = 0;
    for (const f of findings) {
      const match = projects?.find((p) =>
        f.related_project_name && p.name.toLowerCase().includes(String(f.related_project_name).toLowerCase().slice(0, 10))
      );
      await supabase.from("alerts").insert({
        project_id: match?.id || null,
        project_name: match?.name || `${f.country || "Region"} ESG`,
        severity: (f.severity as "critical" | "high" | "medium" | "low") || "medium",
        message: `ESG / social: ${f.type} — ${f.summary}`,
        category: "environmental",
        source_url: f.source_url || null,
      });
      alertsCreated++;
    }

    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed",
        result: { findings: findings.length, alerts: alertsCreated },
        completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }
    await finishAgentRun(supabase, "esg-social-monitor", "completed", runStartedAt);
    await recordAiUsage(gate.supabaseAdmin, gate.userId);
    return new Response(JSON.stringify({ success: true, findings: findings.length, alerts: alertsCreated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("esg-social-monitor error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
