import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { topic } = await req.json();

    // Gather context: recent projects, research tasks, alerts
    const [projectsRes, alertsRes, researchRes] = await Promise.all([
      supabase.from("projects").select("name, country, sector, region, stage, status, value_label, confidence, risk_score").eq("approved", true).order("last_updated", { ascending: false }).limit(20),
      supabase.from("alerts").select("message, severity, project_name").order("created_at", { ascending: false }).limit(10),
      supabase.from("research_tasks").select("query, result, status").eq("status", "completed").order("completed_at", { ascending: false }).limit(5),
    ]);

    const context = {
      projects: projectsRes.data || [],
      alerts: alertsRes.data || [],
      research: researchRes.data || [],
    };

    const systemPrompt = `You are InfraRadar AI's senior infrastructure analyst. You write insightful, data-driven articles about infrastructure development in MENA and Africa.

Your tone is authoritative but accessible — like a top-tier consulting firm's research arm. Use specific data points from the provided context. Format in Markdown with ## headings, bullet points, and bold key terms.

Context about current projects and intelligence:
${JSON.stringify(context, null, 2)}`;

    const userPrompt = topic
      ? `Write a comprehensive insight article about: ${topic}. Include specific project references from our database where relevant.`
      : `Based on the current project data, alerts, and research findings, identify the most important emerging trend or insight. Write a comprehensive article about it. Pick a specific, compelling angle — not a generic overview.`;

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
              },
              required: ["title", "excerpt", "content", "tag", "reading_time_min"],
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

    const insight = JSON.parse(toolCall.function.arguments);
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
      published: false, // Draft by default — admin must publish
      author: "InfraRadar AI",
    }).select().single();

    if (error) throw error;

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
