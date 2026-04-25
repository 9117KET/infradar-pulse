/**
 * Cyber, outage, and critical-infrastructure security signals (esp. digital / energy assets).
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
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const lock = await beginAgentTask(supabase, "security-resilience", "Security & resilience scan", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("security-resilience");
    const taskId = lock.taskId;

    const { data: pool } = await supabase
      .from("projects")
      .select("id, name, country, sector")
      .eq("approved", true)
      .order("last_updated", { ascending: false })
      .limit(30);

    const raw: string[] = [];
    if (PERPLEXITY_API_KEY) {
      const q =
        "critical infrastructure cybersecurity outage ransomware grid data center energy pipeline OT security incidents 2025 2026";
      try {
        const res = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              { role: "system", content: "Infrastructure security and resilience analyst." },
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

    if (!pool?.length) {
      if (taskId) {
        await supabase.from("research_tasks").update({
          status: "completed",
          result: { message: "No projects" },
          completed_at: new Date().toISOString(),
        }).eq("id", taskId);
      }
      await recordAiUsage(gate.supabaseAdmin, gate.userId);
      return new Response(JSON.stringify({ success: true, incidents: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!raw.length) {
      if (taskId) {
        await supabase.from("research_tasks").update({
          status: "failed",
          error: "No research text",
          completed_at: new Date().toISOString(),
        }).eq("id", taskId);
      }
      return new Response(JSON.stringify({ success: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiRes = await chatCompletions({
        messages: [
          { role: "system", content: "Extract security/resilience events; relate to tracked projects when possible." },
          {
            role: "user",
            content: `Projects:\n${pool.map((p) => `${p.name} (${p.country}, ${p.sector})`).join("\n")}\n\nResearch:\n${raw.join("\n")}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "report_security",
            parameters: {
              type: "object",
              properties: {
                incidents: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      related_project_name: { type: "string" },
                      country: { type: "string" },
                      type: { type: "string", enum: ["cyber", "outage", "physical", "supply_attack", "regulatory_security"] },
                      severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                      summary: { type: "string" },
                      source_url: { type: "string" },
                    },
                    required: ["type", "summary", "severity"],
                  },
                },
              },
              required: ["incidents"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_security" } },
    });

    let incidents: Array<Record<string, string>> = [];
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      try {
        const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (tc?.function?.arguments) incidents = JSON.parse(tc.function.arguments).incidents || [];
      } catch { /* ignore */ }
    }

    let alertsCreated = 0;
    for (const inc of incidents) {
      const match = pool.find((p) =>
        inc.related_project_name && p.name.toLowerCase().includes(String(inc.related_project_name).toLowerCase().slice(0, 8))
      );
      await supabase.from("alerts").insert({
        project_id: match?.id || null,
        project_name: match?.name || `${inc.country || "Infrastructure"} security`,
        severity: (inc.severity as "critical" | "high" | "medium" | "low") || "medium",
        message: `Security: ${inc.type} — ${inc.summary}`,
        category: "security",
        source_url: inc.source_url || null,
      });
      alertsCreated++;
    }

    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed",
        result: { incidents: incidents.length, alerts: alertsCreated },
        completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }
    await recordAiUsage(gate.supabaseAdmin, gate.userId);
    return new Response(JSON.stringify({ success: true, incidents: incidents.length, alerts: alertsCreated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("security-resilience error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
