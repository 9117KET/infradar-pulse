/**
 * Synthesizes an executive-style brief from recent alerts and project churn (staff-only).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { recordAiUsage } from "../_shared/requireAi.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { beginAgentTask, alreadyRunningResponse } from "../_shared/agentGate.ts";

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

    const lock = await beginAgentTask(supabase, "executive-briefing", "Executive intelligence brief", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("executive-briefing");
    const taskId = lock.taskId;

    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: alerts }, { data: projects }] = await Promise.all([
      supabase.from("alerts").select("message, severity, category, project_name, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(80),
      supabase.from("projects").select("name, country, sector, status, risk_score, last_updated").eq("approved", true).order("last_updated", { ascending: false }).limit(25),
    ]);

    if (!alerts?.length && !projects?.length) {
      if (taskId) {
        await supabase.from("research_tasks").update({
          status: "completed",
          result: { message: "Insufficient data for brief" },
          completed_at: new Date().toISOString(),
        }).eq("id", taskId);
      }
      await recordAiUsage(gate.supabaseAdmin, gate.userId);
      return new Response(JSON.stringify({ success: true, brief: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiRes = await chatCompletions({
        messages: [
          {
            role: "system",
            content:
              "You are a senior infrastructure strategist. Produce a concise executive brief: priorities, risks, regions to watch, and 3–5 bullet actions. Use Markdown headings.",
          },
          {
            role: "user",
            content: `Recent alerts (14d):\n${JSON.stringify(alerts?.slice(0, 40) || [])}\n\nTop projects:\n${JSON.stringify(projects || [])}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "executive_brief",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                markdown: { type: "string", description: "Full brief in Markdown" },
                priority_regions: { type: "array", items: { type: "string" } },
                risk_themes: { type: "array", items: { type: "string" } },
              },
              required: ["title", "markdown"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "executive_brief" } },
    });

    let brief: { title?: string; markdown?: string; priority_regions?: string[]; risk_themes?: string[] } = {};
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      try {
        const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (tc?.function?.arguments) brief = JSON.parse(tc.function.arguments);
      } catch { /* ignore */ }
    }

    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed",
        result: {
          title: brief.title,
          brief: brief.markdown,
          priority_regions: brief.priority_regions,
          risk_themes: brief.risk_themes,
        },
        completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }
    await recordAiUsage(gate.supabaseAdmin, gate.userId);
    return new Response(JSON.stringify({ success: true, ...brief }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("executive-briefing error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
