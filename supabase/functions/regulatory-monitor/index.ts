import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
      .insert({ task_type: "regulatory-monitor", query: "Regulatory compliance scan", status: "running" })
      .select().single();

    const { data: projects } = await supabase.from("projects").select("id, name, country, sector").eq("approved", true).limit(30);
    const countries = [...new Set(projects?.map(p => p.country) || [])];

    const rawContent: string[] = [];

    if (PERPLEXITY_API_KEY) {
      const queries = [
        `environmental impact assessment EIA approvals denials infrastructure ${countries.join(" ")} 2025`,
        `construction permits regulatory changes sanctions ${countries.join(" ")} 2025`,
        `government policy changes infrastructure investment regulations ${countries.join(" ")} 2025`,
      ];
      for (const q of queries.slice(0, 2)) {
        try {
          const res = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "sonar",
              messages: [
                { role: "system", content: "You are a regulatory compliance analyst for infrastructure projects worldwide." },
                { role: "user", content: q },
              ],
              search_recency_filter: "month",
            }),
          });
          const data = await res.json();
          if (data?.choices?.[0]?.message?.content) rawContent.push(data.choices[0].message.content);
        } catch (e) { console.error("Perplexity error:", e); }
      }
    }

    if (!rawContent.length) {
      if (task) await supabase.from("research_tasks").update({ status: "failed", error: "No data", completed_at: new Date().toISOString() }).eq("id", task.id);
      return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Extract regulatory and compliance findings for infrastructure projects." },
          { role: "user", content: `Projects: ${projects?.map(p => `${p.name} (${p.country}, ${p.sector})`).join(", ")}\n\n${rawContent.join("\n\n")}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "report_regulatory",
            description: "Report regulatory findings",
            parameters: {
              type: "object",
              properties: {
                findings: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      country: { type: "string" },
                      related_project_name: { type: "string" },
                      type: { type: "string", enum: ["eia_approval", "eia_denial", "permit_block", "sanction", "policy_change", "regulation_update"] },
                      severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                      summary: { type: "string" },
                      source_url: { type: "string", description: "URL of the source article or filing" },
                    },
                    required: ["country", "type", "summary"],
                  },
                },
              },
              required: ["findings"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_regulatory" } },
      }),
    });

    let findings: any[] = [];
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      try {
        const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (tc?.function?.arguments) findings = JSON.parse(tc.function.arguments).findings || [];
      } catch (e) { console.error("Parse error:", e); }
    }

    let alertsCreated = 0;
    for (const f of findings) {
      const isCritical = ["sanction", "permit_block", "eia_denial"].includes(f.type);
      const match = projects?.find(p => p.country === f.country && (f.related_project_name ? p.name.toLowerCase().includes(f.related_project_name.toLowerCase()) : false));

      await supabase.from("alerts").insert({
        project_id: match?.id || null,
        project_name: f.related_project_name || `${f.country} regulatory`,
        severity: isCritical ? "critical" : (f.severity || "medium"),
        message: `Regulatory: ${f.type.replace(/_/g, " ")} in ${f.country}: ${f.summary}`,
        category: "regulatory",
        source_url: f.source_url || null,
      });
      alertsCreated++;

      // Update project status if sanction or permit block
      if (match && isCritical) {
        await supabase.from("projects").update({ status: "At Risk", last_updated: new Date().toISOString() }).eq("id", match.id);
      }
    }

    if (task) await supabase.from("research_tasks").update({ status: "completed", result: { findings: findings.length, alerts: alertsCreated }, completed_at: new Date().toISOString() }).eq("id", task.id);

    return new Response(JSON.stringify({ success: true, findings: findings.length, alerts: alertsCreated }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Regulatory monitor error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
