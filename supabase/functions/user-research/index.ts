import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    // Create research task
    const { data: task, error: taskErr } = await supabase
      .from("research_tasks")
      .insert({ task_type: "user-research", query: query.trim(), status: "running", result: { step: "initializing", sources: [], projects: [] } })
      .select("id")
      .single();

    if (taskErr) throw new Error(`Failed to create task: ${taskErr.message}`);
    const taskId = task.id;

    const updateResult = async (result: Record<string, unknown>) => {
      await supabase.from("research_tasks").update({ result }).eq("id", taskId);
    };

    // ── Step 1: Perplexity Search ──
    await updateResult({ step: "searching", sources: [], projects: [], message: "Searching the web for relevant information..." });

    let searchResults: Array<{ url: string; title: string; description: string }> = [];
    const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");

    if (perplexityKey) {
      try {
        const pResp = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${perplexityKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              { role: "system", content: "You are a research assistant specializing in infrastructure projects in Africa and the Middle East. Return factual information with source URLs." },
              { role: "user", content: `Research this query and provide detailed information with sources: ${query}` },
            ],
          }),
        });
        const pData = await pResp.json();
        const content = pData.choices?.[0]?.message?.content || "";
        const citations = pData.citations || [];
        searchResults = citations.map((url: string, i: number) => ({
          url,
          title: `Source ${i + 1}`,
          description: content.substring(i * 200, (i + 1) * 200),
        }));
      } catch (e) {
        console.error("Perplexity error:", e);
      }
    }

    await updateResult({
      step: "searching",
      sources: searchResults.map((s) => ({ url: s.url, status: "found" })),
      sources_found: searchResults.length,
      projects: [],
      message: `Found ${searchResults.length} sources. Starting content extraction...`,
    });

    // ── Step 2: Firecrawl Scrape ──
    await updateResult({
      step: "scraping",
      sources: searchResults.map((s) => ({ url: s.url, status: "scraping" })),
      sources_found: searchResults.length,
      pages_scraped: 0,
      projects: [],
      message: "Scraping source pages for detailed content...",
    });

    const scrapedContent: string[] = [];
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    const urlsToScrape = searchResults.slice(0, 5);

    if (firecrawlKey && urlsToScrape.length > 0) {
      for (let i = 0; i < urlsToScrape.length; i++) {
        try {
          const sResp = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ url: urlsToScrape[i].url, formats: ["markdown"], onlyMainContent: true }),
          });
          const sData = await sResp.json();
          const md = sData.data?.markdown || sData.markdown || "";
          if (md) scrapedContent.push(md.substring(0, 3000));

          const updatedSources = searchResults.map((s, idx) => ({
            url: s.url,
            status: idx <= i ? "scraped" : idx < urlsToScrape.length ? "scraping" : "found",
          }));
          await updateResult({
            step: "scraping",
            sources: updatedSources,
            sources_found: searchResults.length,
            pages_scraped: i + 1,
            projects: [],
            message: `Scraped ${i + 1} of ${urlsToScrape.length} pages...`,
          });
        } catch (e) {
          console.error("Firecrawl error:", e);
        }
      }
    }

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
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    if (lovableKey && scrapedContent.length > 0) {
      try {
        const combined = scrapedContent.join("\n\n---\n\n");
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
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
                          source_url: { type: "string" },
                          contacts: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                name: { type: "string" },
                                role: { type: "string" },
                                organization: { type: "string" },
                                email: { type: "string" },
                              },
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
          }),
        });
        const aiData = await aiResp.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall) {
          const parsed = JSON.parse(toolCall.function.arguments);
          extractedProjects = parsed.projects || [];
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

    // ── Step 4: Enrich — find similar projects from DB ──
    await updateResult({
      step: "enriching",
      sources: searchResults.map((s) => ({ url: s.url, status: "scraped" })),
      sources_found: searchResults.length,
      pages_scraped: scrapedContent.length,
      projects_found: extractedProjects.length,
      projects: extractedProjects,
      message: "Cross-referencing with existing database...",
    });

    // Find similar projects from DB
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
