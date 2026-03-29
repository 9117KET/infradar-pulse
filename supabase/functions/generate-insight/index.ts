import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recordAiUsage, requireAiEntitlementOrRespond } from "../_shared/requireAi.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireAiEntitlementOrRespond(req);
  if (gate instanceof Response) return gate;

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { topic } = await req.json();

    // Gather context: recent projects, research tasks, alerts
    const [projectsRes, alertsRes, researchRes] = await Promise.all([
      supabase.from("projects").select("name, country, sector, region, stage, status, value_label, confidence, risk_score, source_url").eq("approved", true).order("last_updated", { ascending: false }).limit(20),
      supabase.from("alerts").select("message, severity, project_name").order("created_at", { ascending: false }).limit(10),
      supabase.from("research_tasks").select("query, result, status").eq("status", "completed").order("completed_at", { ascending: false }).limit(5),
    ]);

    const context = {
      projects: projectsRes.data || [],
      alerts: alertsRes.data || [],
      research: researchRes.data || [],
    };

    const systemPrompt = `You are InfraRadar AI's senior infrastructure analyst. You write insightful, data-driven articles about global infrastructure development.

Your tone is authoritative but accessible, like a top-tier consulting firm's research arm. Use specific data points from the provided context. Format in Markdown with ## headings, bullet points, and bold key terms.

You MUST populate the sources array with verifiable links: include every distinct http(s) source_url from the projects list that you cite or that supports claims. Add other reputable public URLs (news, government, filings) when implied by the article. Each source needs a short label and full URL. Minimum 1 source if any project has source_url; otherwise use at least one clearly labeled reference to public data.

Context about current projects and intelligence:
${JSON.stringify(context, null, 2)}`;

    const userPrompt = topic
      ? `Write a comprehensive insight article about: ${topic}. Include specific project references from our database where relevant.`
      : `Based on the current project data, alerts, and research findings, identify the most important emerging trend or insight. Write a comprehensive article about it. Pick a specific, compelling angle, not a generic overview.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_insight",
            description: "Create a structured insight article",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "Compelling article title" },
                excerpt: { type: "string", description: "2-3 sentence summary for card display" },
                content: { type: "string", description: "Full article content in Markdown" },
                tag: { type: "string", enum: ["Verification", "Risk", "Region", "Market", "Technology", "Policy", "Analysis"], description: "Article category" },
                reading_time_min: { type: "integer", description: "Estimated reading time in minutes" },
                sources: {
                  type: "array",
                  description: "Verifiable references (URLs) for HITL review — include project source_url entries from context where relevant",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string", description: "Short citation label" },
                      url: { type: "string", description: "https://... only" },
                    },
                    required: ["label", "url"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["title", "excerpt", "content", "tag", "reading_time_min", "sources"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "create_insight" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Add funds in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No structured output from AI");

    const insight = JSON.parse(toolCall.function.arguments) as {
      title: string;
      excerpt: string;
      content: string;
      tag: string;
      reading_time_min: number;
      sources?: { label: string; url: string }[];
    };
    let sourcesJson = (Array.isArray(insight.sources) ? insight.sources : [])
      .filter((s: { label?: string; url?: string }) => typeof s?.url === "string" && s.url.startsWith("http"))
      .map((s: { label: string; url: string }) => ({ label: String(s.label || "Reference"), url: String(s.url) }));

    if (sourcesJson.length === 0 && projectsRes.data?.length) {
      const fallback = (projectsRes.data as { name?: string; source_url?: string | null }[])
        .filter((p) => p.source_url && String(p.source_url).startsWith("http"))
        .slice(0, 8)
        .map((p) => ({
          label: `${p.name || "Project"} — verified project record`,
          url: String(p.source_url),
        }));
      sourcesJson = fallback;
    }

    const slug = insight.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);

    const { data, error } = await supabase.from("insights").insert({
      title: insight.title,
      slug,
      excerpt: insight.excerpt,
      content: insight.content,
      tag: insight.tag,
      reading_time_min: insight.reading_time_min,
      ai_generated: true,
      published: false, // Draft — review in dashboard before publish
      author: "InfraRadar AI",
      sources: sourcesJson.length ? sourcesJson : [],
    }).select().single();

    if (error) throw error;

    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(JSON.stringify({ success: true, insight: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-insight error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
