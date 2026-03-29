/**
 * Tenders, awards, cancellations, re-tenders, and major disputes on infrastructure contracts.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { recordAiUsage } from "../_shared/requireAi.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";

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
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: task } = await supabase.from("research_tasks").insert({
      task_type: "tender-award-monitor",
      query: "Tender / award / dispute scan",
      status: "running",
      requested_by: gate.userId,
    }).select().single();

    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, country, sector, stage")
      .eq("approved", true)
      .limit(25);

    const raw: string[] = [];
    if (PERPLEXITY_API_KEY && projects?.length) {
      const q =
        `infrastructure EPC tender award contract dispute arbitration cancellation ${projects?.slice(0, 6).map((p) => p.name).join(" ")} 2025`;
      try {
        const res = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              { role: "system", content: "Infrastructure procurement and contracts analyst." },
              { role: "user", content: q },
            ],
            search_recency_filter: "month",
          }),
        });
        const data = await res.json();
        if (data?.choices?.[0]?.message?.content) raw.push(data.choices[0].message.content);
      } catch (e) {
        console.error("Perplexity:", e);
      }
    }

    if (!raw.length) {
      if (task) {
        await supabase.from("research_tasks").update({
          status: "failed",
          error: "No research text",
          completed_at: new Date().toISOString(),
        }).eq("id", task.id);
      }
      return new Response(JSON.stringify({ success: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiRes = await chatCompletions({
        messages: [
          { role: "system", content: "Extract tender, award, dispute, and contract events for infrastructure." },
          {
            role: "user",
            content: `Projects:\n${projects?.map((p) => `${p.name} (${p.country}, stage ${p.stage})`).join("\n")}\n\nResearch:\n${raw.join("\n")}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "report_tender",
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
                      type: { type: "string", enum: ["award", "tender_open", "cancellation", "re_tender", "dispute", "arbitration"] },
                      severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                      summary: { type: "string" },
                      source_url: { type: "string" },
                    },
                    required: ["type", "summary", "severity"],
                  },
                },
              },
              required: ["events"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_tender" } },
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
        ev.related_project_name && p.name.toLowerCase().includes(String(ev.related_project_name).toLowerCase().slice(0, 10))
      );
      const dispute = ev.type === "dispute" || ev.type === "arbitration";
      await supabase.from("alerts").insert({
        project_id: match?.id || null,
        project_name: match?.name || `${ev.country || "Project"} tender`,
        severity: dispute ? "high" : ((ev.severity as "critical" | "high" | "medium" | "low") || "medium"),
        message: `Contract: ${ev.type} — ${ev.summary}`,
        category: "construction",
        source_url: ev.source_url || null,
      });
      alertsCreated++;
    }

    if (task) {
      await supabase.from("research_tasks").update({
        status: "completed",
        result: { events: events.length, alerts: alertsCreated },
        completed_at: new Date().toISOString(),
      }).eq("id", task.id);
    }
    await recordAiUsage(gate.supabaseAdmin, gate.userId);
    return new Response(JSON.stringify({ success: true, events: events.length, alerts: alertsCreated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("tender-award-monitor error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
