import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NEWS_SOURCES = [
  "MEED infrastructure projects MENA 2025",
  "IJGlobal infrastructure Africa MENA",
  "African Development Bank new projects 2025",
  "Construction Week Middle East projects",
  "infrastructure mega projects East Africa West Africa 2025",
];

const RESEARCH_QUERIES = [
  "latest infrastructure megaprojects Middle East North Africa 2025 construction awarded",
  "new infrastructure projects East Africa West Africa 2025 tender awarded financing",
  "major construction projects Saudi Arabia UAE Egypt Morocco 2025",
  "renewable energy projects Africa MENA 2025 solar wind",
  "transport rail port projects Africa 2025",
];

interface ExtractedProject {
  name: string;
  country: string;
  region: "MENA" | "East Africa" | "West Africa";
  sector: string;
  stage: string;
  status: string;
  value_usd: number;
  value_label: string;
  confidence: number;
  risk_score: number;
  lat: number;
  lng: number;
  description: string;
  timeline: string;
  stakeholders: string[];
  evidence_source: string;
  evidence_url: string;
  evidence_type: string;
  contacts?: { name: string; role?: string; organization?: string; phone?: string; email?: string }[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Create research task record
    const { data: task } = await supabase
      .from("research_tasks")
      .insert({ task_type: "discovery", query: "Full pipeline run", status: "running" })
      .select()
      .single();

    const rawContent: string[] = [];

    // Step 1: Scrape news sources with Firecrawl
    if (FIRECRAWL_API_KEY) {
      console.log("Searching with Firecrawl...");
      try {
        const searchResponse = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: NEWS_SOURCES[Math.floor(Math.random() * NEWS_SOURCES.length)],
            limit: 5,
            scrapeOptions: { formats: ["markdown"] },
          }),
        });
        const searchData = await searchResponse.json();
        if (searchData?.data) {
          for (const result of searchData.data.slice(0, 3)) {
            if (result.markdown) {
              rawContent.push(`Source: ${result.url}\n${result.markdown.slice(0, 3000)}`);
            }
          }
        }
      } catch (e) {
        console.error("Firecrawl error:", e);
      }
    }

    // Step 2: Deep research with Perplexity
    if (PERPLEXITY_API_KEY) {
      console.log("Researching with Perplexity...");
      try {
        const query = RESEARCH_QUERIES[Math.floor(Math.random() * RESEARCH_QUERIES.length)];
        const pxResponse = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              { role: "system", content: "You are an infrastructure intelligence analyst. Provide detailed information about current infrastructure megaprojects in MENA and Africa regions." },
              { role: "user", content: query },
            ],
            search_recency_filter: "month",
          }),
        });
        const pxData = await pxResponse.json();
        if (pxData?.choices?.[0]?.message?.content) {
          rawContent.push(`Perplexity Research:\n${pxData.choices[0].message.content}`);
          if (pxData.citations) {
            rawContent.push(`Citations: ${pxData.citations.join(", ")}`);
          }
        }
      } catch (e) {
        console.error("Perplexity error:", e);
      }
    }

    if (rawContent.length === 0) {
      // Update task as failed
      if (task) {
        await supabase.from("research_tasks").update({ status: "failed", error: "No data sources available", completed_at: new Date().toISOString() }).eq("id", task.id);
      }
      return new Response(
        JSON.stringify({ success: false, error: "No data collected from sources" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: AI extraction with Lovable AI
    console.log("Extracting structured data with AI...");
    const extractionPrompt = `Analyze the following infrastructure news and research content. Extract any NEW infrastructure projects you can identify.

For each project, extract:
- name: project name
- country: country where project is located
- region: must be one of "MENA", "East Africa", "West Africa"
- sector: one of "Urban Development", "Digital Infrastructure", "Renewable Energy", "Transport", "Water", "Energy"
- stage: one of "Planned", "Tender", "Awarded", "Financing", "Construction", "Completed", "Cancelled", "Stopped"
- status: one of "Verified", "Stable", "Pending", "At Risk"
- value_usd: estimated value in USD (number)
- value_label: human readable value like "$2.5B"
- confidence: 0-100 based on evidence quality
- risk_score: 0-100 based on risk factors
- lat: latitude coordinate
- lng: longitude coordinate
- description: 1-2 sentence description
- timeline: e.g. "2024-2030"
- stakeholders: array of key stakeholder names
- evidence_source: name of the source
- evidence_url: URL of the source
- evidence_type: one of "Satellite", "Filing", "News", "Registry", "Partner"

Content to analyze:
${rawContent.join("\n\n---\n\n")}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an infrastructure data extraction engine. Return valid JSON only." },
          { role: "user", content: extractionPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_projects",
              description: "Extract infrastructure projects from content",
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
                        region: { type: "string", enum: ["MENA", "East Africa", "West Africa"] },
                        sector: { type: "string", enum: ["Urban Development", "Digital Infrastructure", "Renewable Energy", "Transport", "Water", "Energy"] },
                        stage: { type: "string", enum: ["Planned", "Tender", "Awarded", "Financing", "Construction", "Completed", "Cancelled", "Stopped"] },
                        status: { type: "string", enum: ["Verified", "Stable", "Pending", "At Risk"] },
                        value_usd: { type: "number" },
                        value_label: { type: "string" },
                        confidence: { type: "number" },
                        risk_score: { type: "number" },
                        lat: { type: "number" },
                        lng: { type: "number" },
                        description: { type: "string" },
                        timeline: { type: "string" },
                        stakeholders: { type: "array", items: { type: "string" } },
                        evidence_source: { type: "string" },
                        evidence_url: { type: "string" },
                        evidence_type: { type: "string", enum: ["Satellite", "Filing", "News", "Registry", "Partner"] },
                        contacts: {
                          type: "array",
                          description: "Optional contacts found for this project",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string" },
                              role: { type: "string" },
                              organization: { type: "string" },
                              phone: { type: "string" },
                              email: { type: "string" },
                            },
                            required: ["name"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["name", "country", "region", "sector", "stage", "value_usd", "lat", "lng", "description"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["projects"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_projects" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      if (task) {
        await supabase.from("research_tasks").update({ status: "failed", error: `AI error: ${aiResponse.status}`, completed_at: new Date().toISOString() }).eq("id", task.id);
      }
      return new Response(
        JSON.stringify({ success: false, error: `AI extraction failed: ${aiResponse.status}` }),
        { status: aiResponse.status === 429 ? 429 : aiResponse.status === 402 ? 402 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    let extractedProjects: ExtractedProject[] = [];

    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        extractedProjects = parsed.projects || [];
      }
    } catch (e) {
      console.error("Failed to parse AI response:", e);
    }

    // Step 4: Upsert into database
    let inserted = 0;
    let updated = 0;

    for (const ep of extractedProjects) {
      const slug = ep.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      // Check if project exists
      const { data: existing } = await supabase
        .from("projects")
        .select("id, confidence")
        .eq("slug", slug)
        .maybeSingle();

      if (existing) {
        // Update if new confidence is higher
        if (ep.confidence > (existing.confidence || 0)) {
          await supabase.from("projects").update({
            confidence: ep.confidence,
            stage: ep.stage,
            status: ep.status || "Pending",
            last_updated: new Date().toISOString(),
          }).eq("id", existing.id);

          await supabase.from("project_updates").insert({
            project_id: existing.id,
            field_changed: "confidence",
            old_value: String(existing.confidence),
            new_value: String(ep.confidence),
            source: ep.evidence_source || "AI Research Agent",
          });

          updated++;
        }
      } else {
        // Insert new project
        const { data: newProject } = await supabase.from("projects").insert({
          slug,
          name: ep.name,
          country: ep.country,
          region: ep.region,
          sector: ep.sector,
          stage: ep.stage,
          status: ep.status || "Pending",
          value_usd: ep.value_usd || 0,
          value_label: ep.value_label || "$0",
          confidence: ep.confidence || 50,
          risk_score: ep.risk_score || 50,
          lat: ep.lat,
          lng: ep.lng,
          description: ep.description,
          timeline: ep.timeline || "",
          source_url: ep.evidence_url || "",
          ai_generated: true,
          approved: false, // requires admin approval
        }).select().single();

        if (newProject) {
          // Add stakeholders
          if (ep.stakeholders?.length) {
            await supabase.from("project_stakeholders").insert(
              ep.stakeholders.map((name) => ({ project_id: newProject.id, name }))
            );
          }

          // Add evidence
          if (ep.evidence_source) {
            await supabase.from("evidence_sources").insert({
              project_id: newProject.id,
              source: ep.evidence_source,
              url: ep.evidence_url || "#",
              type: ep.evidence_type || "News",
              verified: false,
              date: new Date().toISOString().split("T")[0],
            });
          }

          // Add contacts if extracted
          if (ep.contacts?.length) {
            const validContacts = ep.contacts.filter(c => c.name && (c.phone || c.email));
            if (validContacts.length > 0) {
              await supabase.from("project_contacts").insert(
                validContacts.map(c => ({
                  project_id: newProject.id,
                  name: c.name,
                  role: c.role || '',
                  organization: c.organization || '',
                  phone: c.phone || null,
                  email: c.email || null,
                  source: ep.evidence_source || 'AI Research Agent',
                  added_by: 'ai',
                }))
              );
            }
          }

          // Create alert for new discovery
          await supabase.from("alerts").insert({
            project_id: newProject.id,
            project_name: ep.name,
            severity: "medium",
            message: `New project discovered: ${ep.name} (${ep.country}) — ${ep.value_label || "value TBD"}`,
            category: "market",
            source_url: ep.evidence_url || null,
          });

          inserted++;
        }
      }
    }

    // Update task as completed
    if (task) {
      await supabase.from("research_tasks").update({
        status: "completed",
        result: { extracted: extractedProjects.length, inserted, updated, sources: rawContent.length },
        completed_at: new Date().toISOString(),
      }).eq("id", task.id);
    }

    console.log(`Research complete: ${extractedProjects.length} extracted, ${inserted} new, ${updated} updated`);

    return new Response(
      JSON.stringify({
        success: true,
        extracted: extractedProjects.length,
        inserted,
        updated,
        sources_processed: rawContent.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Research agent error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
