import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recordAiUsage, requireAiEntitlementOrRespond } from "../_shared/requireAi.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireAiEntitlementOrRespond(req);
  if (gate instanceof Response) return gate;

  try {
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: task } = await supabase
      .from("research_tasks")
      .insert({ task_type: "stakeholder-intel", query: "Stakeholder intelligence scan", status: "running" })
      .select().single();

    // Get existing projects with stakeholders
    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, country, region, sector")
      .eq("approved", true)
      .limit(20);

    if (!projects?.length) {
      if (task) await supabase.from("research_tasks").update({ status: "completed", result: { message: "No projects to analyze" }, completed_at: new Date().toISOString() }).eq("id", task.id);
      await recordAiUsage(gate.supabaseAdmin, gate.userId);
      return new Response(JSON.stringify({ success: true, message: "No projects" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rawContent: string[] = [];

    // Query Perplexity for stakeholder intelligence
    if (PERPLEXITY_API_KEY) {
      const countries = [...new Set(projects.map(p => p.country))].join(", ");
      const queries = [
        `major infrastructure contractors track record ${countries} 2024 2025 performance issues delays`,
        `government infrastructure agencies corruption investigations ${countries} 2025`,
        `construction companies winning multiple bids ${countries} conflict of interest 2025`,
      ];

      for (const query of queries.slice(0, 2)) {
        try {
          const res = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "sonar",
              messages: [
                { role: "system", content: "You are a stakeholder intelligence analyst tracking companies and government entities involved in infrastructure projects worldwide." },
                { role: "user", content: query },
              ],
              search_recency_filter: "month",
            }),
          });
          const data = await res.json();
          if (data?.choices?.[0]?.message?.content) {
            rawContent.push(data.choices[0].message.content);
          }
        } catch (e) { console.error("Perplexity error:", e); }
      }
    }

    if (!rawContent.length) {
      if (task) await supabase.from("research_tasks").update({ status: "failed", error: "No data sources", completed_at: new Date().toISOString() }).eq("id", task.id);
      return new Response(JSON.stringify({ success: false, error: "No data" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // AI analysis
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Extract stakeholder intelligence. Return JSON." },
          { role: "user", content: `Analyze stakeholder data for infrastructure projects. Identify: companies with poor track records, conflict-of-interest patterns, entities under investigation.\n\nExisting projects: ${projects.map(p => `${p.name} (${p.country})`).join(", ")}\n\nContent:\n${rawContent.join("\n\n")}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "report_stakeholder_intel",
            description: "Report stakeholder intelligence findings",
            parameters: {
              type: "object",
              properties: {
                findings: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      stakeholder_name: { type: "string" },
                      related_project_name: { type: "string" },
                      risk_flag: { type: "string", enum: ["poor_track_record", "conflict_of_interest", "investigation", "delays", "none"] },
                      severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                      summary: { type: "string" },
                      source_url: { type: "string", description: "URL of the source" },
                    },
                    required: ["stakeholder_name", "summary"],
                  },
                },
              },
              required: ["findings"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_stakeholder_intel" } },
      }),
    });

    let findings: any[] = [];
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      try {
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          findings = JSON.parse(toolCall.function.arguments).findings || [];
        }
      } catch (e) { console.error("Parse error:", e); }
    }

    // Create alerts for flagged stakeholders
    let alertsCreated = 0;
    for (const f of findings) {
      if (f.risk_flag && f.risk_flag !== "none") {
        const matchedProject = projects.find(p => p.name.toLowerCase().includes(f.related_project_name?.toLowerCase() || ""));
        await supabase.from("alerts").insert({
          project_id: matchedProject?.id || null,
          project_name: f.related_project_name || f.stakeholder_name,
          severity: f.severity || "medium",
          message: `Stakeholder alert: ${f.stakeholder_name}: ${f.summary}`,
          category: "stakeholder",
          source_url: f.source_url || null,
        });
        alertsCreated++;
      }
    }

    if (task) await supabase.from("research_tasks").update({ status: "completed", result: { findings: findings.length, alerts: alertsCreated }, completed_at: new Date().toISOString() }).eq("id", task.id);

    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(JSON.stringify({ success: true, findings: findings.length, alerts: alertsCreated }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Stakeholder intel error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
