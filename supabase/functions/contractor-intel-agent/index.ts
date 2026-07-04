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

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

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

    if (!await isAgentEnabled(supabase, "contractor-intel")) return pausedResponse("contractor-intel");
    const lock = await beginAgentTask(supabase, "contractor-intel", "Aggregating contractor intelligence from tender awards", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("contractor-intel");
    taskId = lock.taskId;
    runStartedAt = new Date();

    await setTaskStep(supabase, taskId, "Loading tender award alerts");

    // Pull recent tender-award alerts not yet processed into contractor_awards
    const since90d = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data: awardAlerts } = await supabase
      .from("alerts")
      .select("id, project_id, project_name, message, source_url, created_at, severity")
      .ilike("message", "Contract: award%")
      .gte("created_at", since90d)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!awardAlerts?.length) {
      const result = { success: true, message: "No new award alerts to process", processed: 0 };
      if (taskId) await supabase.from("research_tasks").update({ status: "completed", completed_at: new Date().toISOString(), result }).eq("id", taskId);
      await finishAgentRun(supabase, "contractor-intel", "completed", runStartedAt);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await setTaskStep(supabase, taskId, "Extracting contractor entities with AI");

    // Use AI to extract contractor names + award values from alert messages
    const alertSummaries = awardAlerts.map((a: any) => ({
      id: a.id,
      project_name: a.project_name ?? "Unknown",
      project_id: a.project_id,
      message: a.message,
      source_url: a.source_url,
      date: a.created_at?.split("T")[0],
    }));

    const aiResponse = await chatCompletions({
      messages: [
        {
          role: "system",
          content: `You are an infrastructure procurement analyst. Extract contractor/firm names and award details from tender award alert messages.
Return only entities you are confident about from the message text. If no clear contractor name is present, skip the entry.`,
        },
        {
          role: "user",
          content: `Extract contractor entities from these ${alertSummaries.length} award alerts:\n${JSON.stringify(alertSummaries, null, 2)}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "submit_contractor_extractions",
            description: "Submit extracted contractor award information",
            parameters: {
              type: "object",
              properties: {
                extractions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      alert_id: { type: "string" },
                      project_name: { type: "string" },
                      project_id: { type: "string" },
                      contractor_name: { type: "string" },
                      award_value_usd: { type: "number" },
                      contract_type: { type: "string" },
                      award_date: { type: "string" },
                      source_url: { type: "string" },
                    },
                    required: ["alert_id", "project_name", "contractor_name"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["extractions"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "submit_contractor_extractions" } },
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI error: ${aiResponse.status} - ${errText}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("AI returned no extractions");

    const { extractions } = JSON.parse(toolCall.function.arguments) as {
      extractions: Array<{
        alert_id: string;
        project_name: string;
        project_id?: string;
        contractor_name: string;
        award_value_usd?: number;
        contract_type?: string;
        award_date?: string;
        source_url?: string;
      }>;
    };

    await setTaskStep(supabase, taskId, "Upserting contractor records");

    let processed = 0;
    const now = new Date().toISOString();

    for (const ex of extractions ?? []) {
      if (!ex.contractor_name?.trim()) continue;

      const normalized = normalizeName(ex.contractor_name);

      // Upsert contractor entity
      const { data: contractor } = await supabase
        .from("contractors")
        .upsert(
          { name: ex.contractor_name.trim(), normalized_name: normalized, updated_at: now },
          { onConflict: "normalized_name", ignoreDuplicates: false }
        )
        .select("id, total_awards, total_award_value_usd")
        .single();

      if (!contractor) continue;

      // Check we haven't already processed this alert for this contractor
      const { count: existing } = await supabase
        .from("contractor_awards")
        .select("id", { count: "exact", head: true })
        .eq("contractor_id", contractor.id)
        .eq("source_alert_id", ex.alert_id);

      if ((existing ?? 0) > 0) continue;

      // Insert the award record
      await supabase.from("contractor_awards").insert({
        contractor_id: contractor.id,
        project_id: ex.project_id || null,
        project_name: ex.project_name,
        award_value_usd: ex.award_value_usd ? Math.round(ex.award_value_usd) : null,
        award_date: ex.award_date || null,
        contract_type: ex.contract_type || null,
        source_alert_id: ex.alert_id,
        source_url: ex.source_url || null,
      });

      // Update contractor aggregate stats
      await supabase
        .from("contractors")
        .update({
          total_awards: (contractor.total_awards ?? 0) + 1,
          total_award_value_usd: (contractor.total_award_value_usd ?? 0) + (ex.award_value_usd ? Math.round(ex.award_value_usd) : 0),
          last_award_at: now,
          updated_at: now,
        })
        .eq("id", contractor.id);

      processed++;
    }

    // Run distress signal check on contractors with recent awards
    await setTaskStep(supabase, taskId, "Checking financial distress signals");

    const { data: activeContractors } = await supabase
      .from("contractors")
      .select("id, name, sectors")
      .gt("total_awards", 0)
      .order("last_award_at", { ascending: false })
      .limit(20);

    if (activeContractors?.length) {
      const distressResponse = await chatCompletions({
        messages: [
          {
            role: "system",
            content: `You are an infrastructure finance analyst. Assess financial distress risk (0-100, 100 = severe distress) for infrastructure contractors based on general knowledge of their sector, reputation, and any known issues. Return 0 for unknown firms. Focus on well-known firms only.`,
          },
          {
            role: "user",
            content: `Assess distress risk for: ${activeContractors.map((c: any) => c.name).join(", ")}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_distress_scores",
              parameters: {
                type: "object",
                properties: {
                  scores: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        contractor_name: { type: "string" },
                        distress_score: { type: "integer", minimum: 0, maximum: 100 },
                        signals: { type: "array", items: { type: "string" } },
                      },
                      required: ["contractor_name", "distress_score"],
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
        tool_choice: { type: "function", function: { name: "submit_distress_scores" } },
      });

      if (distressResponse.ok) {
        const distressData = await distressResponse.json();
        const distressCall = distressData.choices?.[0]?.message?.tool_calls?.[0];
        if (distressCall?.function?.arguments) {
          const { scores } = JSON.parse(distressCall.function.arguments) as {
            scores: Array<{ contractor_name: string; distress_score: number; signals?: string[] }>;
          };
          for (const s of scores ?? []) {
            const normalized = normalizeName(s.contractor_name);
            await supabase
              .from("contractors")
              .update({
                distress_score: Math.max(0, Math.min(100, s.distress_score)),
                distress_signals: s.signals ?? [],
                distress_updated_at: now,
              })
              .eq("normalized_name", normalized);

            // Alert on high distress contractors
            if (s.distress_score >= 60) {
              await supabase.from("alerts").insert({
                project_id: null,
                project_name: s.contractor_name,
                severity: s.distress_score >= 80 ? "high" : "medium",
                message: `Contractor distress signal: ${s.contractor_name} — distress score ${s.distress_score}/100. ${(s.signals ?? []).join("; ")}`,
                category: "financial",
                origin: "ai_agent",
                source_url: null,
              });
            }
          }
        }
      }
    }

    const result = { success: true, award_alerts_processed: processed, contractors_checked: activeContractors?.length ?? 0 };
    await finishAgentRun(supabase, "contractor-intel", "completed", runStartedAt);
    if (taskId) await supabase.from("research_tasks").update({ status: "completed", completed_at: now, result }).eq("id", taskId);
    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("contractor-intel-agent error:", e);
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    if (supabase && taskId) {
      await supabase.from("research_tasks").update({ status: "failed", completed_at: new Date().toISOString(), error: errMsg }).eq("id", taskId);
    }
    if (supabase && runStartedAt) {
      await finishAgentRun(supabase, "contractor-intel", "failed", runStartedAt).catch(() => {});
    }
    return new Response(JSON.stringify({ error: errMsg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
