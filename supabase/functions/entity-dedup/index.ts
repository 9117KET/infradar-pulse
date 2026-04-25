/**
 * Suggests likely duplicate project pairs from the approved portfolio; creates review alerts (data quality).
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

    const lock = await beginAgentTask(supabase, "entity-dedup", "Duplicate project pair detection", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("entity-dedup");
    const taskId = lock.taskId;

    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, country, sector, stage, value_label, lat, lng")
      .eq("approved", true)
      .order("last_updated", { ascending: false })
      .limit(45);

    if (!projects?.length) {
      if (taskId) {
        await supabase.from("research_tasks").update({
          status: "completed",
          result: { message: "No projects to compare" },
          completed_at: new Date().toISOString(),
        }).eq("id", taskId);
      }
      await recordAiUsage(gate.supabaseAdmin, gate.userId);
      return new Response(JSON.stringify({ success: true, pairs: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const summary = projects
      .map((p) => `${p.id}|${p.name}|${p.country}|${p.sector}|${p.stage}|${p.value_label}|${p.lat},${p.lng}`)
      .join("\n");

    const aiRes = await chatCompletions({
        messages: [
          {
            role: "system",
            content:
              "You detect duplicate or near-duplicate infrastructure project records (same real-world project, different wording). Only flag pairs with high confidence. Ignore different projects in same city.",
          },
          { role: "user", content: `Projects (id|name|country|sector|stage|value|lat,lng):\n${summary}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "report_duplicates",
            description: "List duplicate candidates",
            parameters: {
              type: "object",
              properties: {
                pairs: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      project_id_a: { type: "string" },
                      project_id_b: { type: "string" },
                      confidence: { type: "number", description: "0-1" },
                      reason: { type: "string" },
                    },
                    required: ["project_id_a", "project_id_b", "confidence", "reason"],
                  },
                },
              },
              required: ["pairs"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_duplicates" } },
    });

    let pairs: Array<{ project_id_a: string; project_id_b: string; confidence: number; reason: string }> = [];
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      try {
        const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (tc?.function?.arguments) pairs = JSON.parse(tc.function.arguments).pairs || [];
      } catch { /* ignore */ }
    }

    const validIds = new Set(projects.map((p) => p.id));
    let alertsCreated = 0;
    for (const p of pairs) {
      if (p.confidence < 0.65) continue;
      if (!validIds.has(p.project_id_a) || !validIds.has(p.project_id_b)) continue;
      const pa = projects.find((x) => x.id === p.project_id_a);
      const pb = projects.find((x) => x.id === p.project_id_b);
      await supabase.from("alerts").insert({
        project_id: p.project_id_a,
        project_name: pa?.name || "Project",
        severity: p.confidence >= 0.85 ? "high" : "medium",
        message: `Possible duplicate records: "${pa?.name}" vs "${pb?.name}" (${p.reason})`,
        category: "market",
        source_url: null,
      });
      alertsCreated++;
    }

    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed",
        result: { pairs_found: pairs.length, alerts: alertsCreated, reviewed: pairs.slice(0, 20) },
        completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }
    await recordAiUsage(gate.supabaseAdmin, gate.userId);
    return new Response(JSON.stringify({ success: true, pairs: pairs.length, alerts: alertsCreated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("entity-dedup error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
