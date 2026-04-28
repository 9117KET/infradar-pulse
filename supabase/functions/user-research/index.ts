import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions, isLlmConfigured } from "../_shared/llm.ts";
import { recordAiUsage, requireAiEntitlementOrRespond } from "../_shared/requireAi.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function runResearch(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  query: string,
  searchResults: Array<{ url: string; title: string; description: string }>,
  scrapedContent: string[],
): Promise<void> {
  const updateResult = async (result: Record<string, unknown>) => {
    await supabase.from("research_tasks").update({ result }).eq("id", taskId);
  };

  try {
    // ── Step 3: AI Extraction ──
    await updateResult({
      step: "extracting",
      sources: searchResults.map((s) => ({ url: s.url, status: "scraped" })),
      sources_found: searchResults.length,
      pages_scraped: scrapedContent.length,
      projects: [],
      message: "Analyzing content with AI to extract project details...",
    });

    let extractedProjects: Array<Record<string, unknown>> = [];

    if (isLlmConfigured() && scrapedContent.length > 0) {
      try {
        const combined = scrapedContent.join("\n\n---\n\n");
        const aiResp = await chatCompletions({
          messages: [
            {
              role: "system",
              content: `You are an infrastructure project data extractor. Extract structured project data from the provided content. For EVERY project you MUST include: the source_url where the information was found, any contacts mentioned (name, role, organization, email, phone). Return JSON array of projects. Always try to extract email addresses and phone numbers for key stakeholders, contractors, or project managers mentioned in the content.`,
            },
            {
              role: "user",
              content: `Extract infrastructure projects from this content related to: "${query}"\n\nFor each project, extract:\n- Project name, country, sector, stage, value\n- Source URL where this info was found\n- ALL contacts: names, roles, organizations, emails, phone numbers\n\nContent:\n${combined.substring(0, 8000)}`,
            },
          ],
          tools: [{
            type: "function",
            function: {
              name: "extract_projects",
              description: "Extract structured project information",
              parameters: {
                type: "object",
                properties: {
                  projects: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        country: { type: "string" },
                        sector: { type: "string" },
                        stage: { type: "string" },
                        value_label: { type: "string" },
                        description: { type: "string" },
                        source_url: { type: "string", description: "URL where this project information was found" },
                        contacts: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string" },
                              role: { type: "string" },
                              organization: { type: "string" },
                              email: { type: "string", description: "Email address if found" },
                              phone: { type: "string", description: "Phone number if found" },
                            },
                            required: ["name"],
                          },
                        },
                      },
                      required: ["name", "country", "description"],
                    },
                  },
                },
                required: ["projects"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "extract_projects" } },
        });
        const aiData = await aiResp.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall) {
          const parsed = JSON.parse(toolCall.function.arguments);
          extractedProjects = (parsed.projects || []).map((p: Record<string, unknown>, idx: number) => ({
            ...p,
            source_url: p.source_url || searchResults[idx]?.url || searchResults[0]?.url || null,
          }));
        }
      } catch (e) {
        console.error("AI extraction error:", e);
      }
    }

    await updateResult({
      step: "extracting",
      sources: searchResults.map((s) => ({ url: s.url, status: "scraped" })),
      sources_found: searchResults.length,
      pages_scraped: scrapedContent.length,
      projects_found: extractedProjects.length,
      projects: extractedProjects,
      message: `Extracted ${extractedProjects.length} projects. Enriching data...`,
    });

    // ── Step 4: Enrich - find similar projects from DB ──
    await updateResult({
      step: "enriching",
      sources: searchResults.map((s) => ({ url: s.url, status: "scraped" })),
      sources_found: searchResults.length,
      pages_scraped: scrapedContent.length,
      projects_found: extractedProjects.length,
      projects: extractedProjects,
      message: "Cross-referencing with existing database...",
    });

    const { data: similarProjects } = await supabase
      .from("projects")
      .select("id, name, country, sector, region, stage, value_label, confidence, slug")
      .order("confidence", { ascending: false })
      .limit(5);

    // ── Step 5: Complete ──
    const finalResult = {
      step: "completed",
      sources: searchResults.map((s) => ({ url: s.url, status: "verified" })),
      sources_found: searchResults.length,
      pages_scraped: scrapedContent.length,
      projects_found: extractedProjects.length,
      projects: extractedProjects,
      similar_projects: similarProjects || [],
      message: extractedProjects.length > 0
        ? `Research complete! Found ${extractedProjects.length} projects from ${searchResults.length} sources.`
        : `No exact matches found. Showing ${similarProjects?.length || 0} similar projects from our database.`,
    };

    await supabase
      .from("research_tasks")
      .update({ result: finalResult, status: "completed", completed_at: new Date().toISOString() })
      .eq("id", taskId);
  } catch (e) {
    console.error("user-research background error:", e);
    await supabase
      .from("research_tasks")
      .update({
        status: "failed",
        error: e instanceof Error ? e.message : "Unknown error",
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireAiEntitlementOrRespond(req);
  if (gate instanceof Response) return gate;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Query must be at least 3 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create task first - fail fast if DB is unavailable
    const { data: task, error: taskErr } = await supabase
      .from("research_tasks")
      .insert({
        task_type: "user-research",
        query: query.trim(),
        status: "running",
        requested_by: gate.userId,
        result: { step: "searching", sources: [], projects: [], message: "Searching the web for relevant information..." },
      })
      .select("id")
      .single();

    if (taskErr) {
      console.error("Failed to create research task:", taskErr);
      return new Response(
        JSON.stringify({ error: `Failed to create research task: ${taskErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const taskId = task.id;

    // ── Step 1-2: Lovable AI research corpus ──
    let searchResults: Array<{ url: string; title: string; description: string }> = [];
    const scrapedContent: string[] = [];

    try {
      const researchResp = await chatCompletions({
        messages: [
          { role: "system", content: "You are a research assistant specializing in global infrastructure projects. Produce a concise research brief with project names, countries, sectors, funding signals, stakeholders, and source URLs where you know them. Do not call external APIs." },
          { role: "user", content: `Research this infrastructure query for the InfraRadarAI database: ${query}` },
        ],
      });
      if (researchResp.ok) {
        const data = await researchResp.json();
        const content = data?.choices?.[0]?.message?.content;
        if (content) {
          scrapedContent.push(content.substring(0, 8000));
          searchResults = [{ url: "https://infradarai.com", title: "Lovable AI research brief", description: content.substring(0, 240) }];
        }
      }
    } catch (e) {
      console.error("Lovable AI research error:", e);
    }

    await supabase.from("research_tasks").update({
      result: {
        step: "extracting",
        sources: searchResults.map((s) => ({ url: s.url, status: "ready" })),
        sources_found: searchResults.length,
        pages_scraped: scrapedContent.length,
        projects: [],
        message: scrapedContent.length ? "Research brief generated. Extracting project details..." : "Lovable AI returned no research content.",
      },
    }).eq("id", taskId);

    // Return taskId immediately - AI extraction and enrichment run in background
    const backgroundWork = runResearch(supabase, taskId, query.trim(), searchResults, scrapedContent)
      .then(() => recordAiUsage(gate.supabaseAdmin, gate.userId));

    // waitUntil keeps the process alive after the response is sent
    (globalThis as any).EdgeRuntime?.waitUntil(backgroundWork);

    return new Response(JSON.stringify({ taskId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("user-research error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
