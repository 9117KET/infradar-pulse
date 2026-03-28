import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: task } = await supabase
      .from("research_tasks")
      .insert({ task_type: "alert-intelligence", query: "Alert pattern analysis & intelligence brief", status: "running" })
      .select().single();

    // Fetch alerts from the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: alerts } = await supabase
      .from("alerts")
      .select("*")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false });

    if (!alerts?.length) {
      if (task) await supabase.from("research_tasks").update({ status: "completed", result: { message: "No recent alerts to analyze" }, completed_at: new Date().toISOString() }).eq("id", task.id);
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

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "You are an infrastructure intelligence analyst. Analyze alert patterns across categories to identify emerging risks, regional hotspots, and actionable recommendations for infrastructure investors and project managers in MENA and Africa.",
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
      }),
    });

    let brief: any = null;
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      try {
        const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (tc?.function?.arguments) brief = JSON.parse(tc.function.arguments);
      } catch (e) { console.error("Parse error:", e); }
    } else {
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);
    }

    if (task) {
      await supabase.from("research_tasks").update({
        status: "completed",
        result: brief ? { brief, alert_count: alerts.length, categories: Object.keys(byCategory).length } : { error: "Failed to generate brief" },
        completed_at: new Date().toISOString(),
      }).eq("id", task.id);
    }

    return new Response(JSON.stringify({ success: true, brief, alert_count: alerts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Alert intelligence error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
