/**
 * afdb-ingest-agent
 *
 * Ingests African Development Bank (AfDB) infrastructure projects.
 * AfDB has no formal REST API — this agent uses Firecrawl to scrape their
 * public projects portal and AI to extract structured project data.
 *
 * Portal: https://projectsportal.afdb.org/dataportal/VProject/ongoingProjects
 *
 * Coverage: All 54 African Union member states across all 5 sub-regions.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { recordAiUsage } from "../_shared/requireAi.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { isAgentEnabled, pausedResponse, beginAgentTask, alreadyRunningResponse } from "../_shared/agentGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// AfDB portal pages to scrape — covers all Africa regions and sectors
const AFDB_PAGES = [
  { url: "https://projectsportal.afdb.org/dataportal/VProject/ongoingProjects", label: "Ongoing Projects" },
  { url: "https://projectsportal.afdb.org/dataportal/VProject/approvedProjects", label: "Approved Projects" },
];

// AfDB also publishes searchable results — these targeted Firecrawl queries focus on sectors
const AFDB_SEARCH_QUERIES = [
  "AfDB African Development Bank infrastructure project ongoing construction transport energy water 2022 2023 2024",
  "African Development Bank approved project transport road rail port airport Africa 2023 2024",
  "AfDB energy power renewable solar wind infrastructure Africa approved 2023 2024",
  "African Development Bank water sanitation irrigation dam Africa approved ongoing",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  let taskId: string | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;

  try {
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!await isAgentEnabled(supabase, "afdb-ingest")) return pausedResponse("afdb-ingest");
    const lock = await beginAgentTask(supabase, "afdb-ingest", "African Development Bank Projects Portal", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("afdb-ingest");
    taskId = lock.taskId;

    const rawContent: string[] = [];

    if (!FIRECRAWL_API_KEY) {
      if (taskId) await supabase.from("research_tasks").update({ status: "failed", error: "FIRECRAWL_API_KEY not set", completed_at: new Date().toISOString() }).eq("id", taskId);
      return new Response(JSON.stringify({ success: false, error: "FIRECRAWL_API_KEY required" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Scrape AfDB portal pages directly
    for (const page of AFDB_PAGES) {
      try {
        const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: page.url, formats: ["markdown"], waitFor: 2000 }),
        });
        const scrapeData = await scrapeRes.json();
        if (scrapeData?.data?.markdown) {
          rawContent.push(`AfDB ${page.label}:\nSource: ${page.url}\n${scrapeData.data.markdown.slice(0, 4000)}`);
        }
      } catch (e) { console.error(`Firecrawl scrape error for ${page.url}:`, e); }
    }

    // Also run targeted search queries about AfDB projects
    const query = AFDB_SEARCH_QUERIES[Math.floor(Math.random() * AFDB_SEARCH_QUERIES.length)];
    try {
      const searchRes = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 5, scrapeOptions: { formats: ["markdown"] } }),
      });
      const searchData = await searchRes.json();
      if (searchData?.data) {
        for (const result of searchData.data.slice(0, 3)) {
          if (result.markdown) rawContent.push(`AfDB Search Result:\nSource: ${result.url}\n${result.markdown.slice(0, 3000)}`);
        }
      }
    } catch (e) { console.error("Firecrawl search error:", e); }

    if (rawContent.length === 0) {
      if (taskId) await supabase.from("research_tasks").update({ status: "failed", error: "No content scraped from AfDB portal", completed_at: new Date().toISOString() }).eq("id", taskId);
      return new Response(JSON.stringify({ success: false, error: "No content collected" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // AI extraction
    console.log("Extracting AfDB projects with AI...");
    const aiResponse = await chatCompletions({
      messages: [
        { role: "system", content: "You are an infrastructure data extraction engine specializing in African Development Bank projects. Extract structured project data from the provided content. Return only African infrastructure projects financed or approved by AfDB." },
        {
          role: "user",
          content: `Extract all infrastructure projects from this African Development Bank content. Focus on transport, energy, water, urban development projects.

For each project extract:
- name: project name
- country: African country
- region: one of "MENA", "East Africa", "West Africa", "Southern Africa", "Central Africa"
- sector: one of "Transport", "Energy", "Renewable Energy", "Water", "Urban Development", "Digital Infrastructure", "Industrial", "Mining", "Building Construction", "Infrastructure"
- stage: one of "Planned", "Financing", "Construction", "Completed"
- status: one of "Verified", "Stable", "Pending"
- value_usd: project value in USD (number)
- value_label: human readable e.g. "$500M"
- confidence: 0-100 (AfDB projects are authoritative — use 78-88)
- source_url: URL to the AfDB project page if available

Content:
${rawContent.join("\n\n---\n\n").slice(0, 12000)}`,
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "extract_afdb_projects",
          description: "Extract AfDB infrastructure projects",
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
                    region: { type: "string", enum: ["MENA", "East Africa", "West Africa", "Southern Africa", "Central Africa"] },
                    sector: { type: "string" },
                    stage: { type: "string", enum: ["Planned", "Financing", "Construction", "Completed"] },
                    status: { type: "string", enum: ["Verified", "Stable", "Pending"] },
                    value_usd: { type: "number" },
                    value_label: { type: "string" },
                    confidence: { type: "number" },
                    source_url: { type: "string" },
                  },
                  required: ["name", "country", "region", "sector", "stage"],
                  additionalProperties: false,
                },
              },
            },
            required: ["projects"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_afdb_projects" } },
    });

    let extractedProjects: any[] = [];
    if (aiResponse.ok) {
      const aiData = await aiResponse.json();
      try {
        const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (tc?.function?.arguments) extractedProjects = JSON.parse(tc.function.arguments).projects || [];
      } catch (e) { console.error("Parse error:", e); }
    }

    if (extractedProjects.length === 0) {
      if (taskId) await supabase.from("research_tasks").update({ status: "failed", error: "AI extracted 0 AfDB projects", completed_at: new Date().toISOString() }).eq("id", taskId);
      return new Response(JSON.stringify({ success: false, error: "AI extracted 0 projects" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Africa country centroid lookup (simplified)
    const AFRICA_CENTROIDS: Record<string, [number, number]> = {
      "nigeria": [9.08, 8.68], "kenya": [-0.02, 37.91], "ethiopia": [9.14, 40.49],
      "tanzania": [-6.37, 34.89], "ghana": [7.95, -1.02], "south africa": [-30.56, 22.94],
      "egypt": [26.82, 30.80], "morocco": [31.79, -7.09], "algeria": [28.03, 1.66],
      "mozambique": [-18.67, 35.53], "zambia": [-13.13, 27.85], "zimbabwe": [-19.02, 29.15],
      "uganda": [1.37, 32.29], "rwanda": [-1.94, 29.87], "senegal": [14.50, -14.45],
      "mali": [17.57, -4.00], "cameroon": [7.37, 12.35], "angola": [-11.20, 17.87],
      "dr congo": [-4.04, 21.76], "congo": [-0.23, 15.83], "burkina faso": [12.36, -1.56],
      "côte d'ivoire": [7.54, -5.55], "ivory coast": [7.54, -5.55],
      "niger": [17.61, 8.08], "chad": [15.45, 18.73], "guinea": [11.80, -15.18],
      "malawi": [-13.25, 34.30], "madagascar": [-18.77, 46.87], "botswana": [-22.33, 24.68],
      "namibia": [-22.96, 18.49], "somalia": [5.15, 46.20], "sudan": [12.86, 30.22],
      "libya": [26.34, 17.23], "tunisia": [33.89, 9.54],
    };
    function getAfricaCentroid(country: string): [number, number] {
      const key = country.toLowerCase().trim();
      if (AFRICA_CENTROIDS[key]) return AFRICA_CENTROIDS[key];
      for (const [k, v] of Object.entries(AFRICA_CENTROIDS)) {
        if (key.includes(k) || k.includes(key)) return v;
      }
      return [0, 20]; // center of Africa
    }

    let inserted = 0;
    let updated = 0;

    for (const ep of extractedProjects) {
      try {
        const name = (ep.name || "").trim();
        if (!name) continue;

        const bestUrl = (ep.source_url && String(ep.source_url).startsWith("http"))
          ? ep.source_url
          : "https://projectsportal.afdb.org/dataportal/VProject/ongoingProjects";

        const [lat, lng] = getAfricaCentroid(ep.country || "");
        const totalAmt = Number(ep.value_usd) || 0;
        let valueLabel = ep.value_label || "";
        if (!valueLabel) {
          if (totalAmt >= 1_000_000_000) valueLabel = `$${(totalAmt / 1_000_000_000).toFixed(1)}B`;
          else if (totalAmt >= 1_000_000) valueLabel = `$${(totalAmt / 1_000_000).toFixed(0)}M`;
          else valueLabel = "Value TBD";
        }

        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const { data: existing } = await supabase!.from("projects").select("id, confidence, source_url").eq("slug", slug).maybeSingle();
        const confidence = Number(ep.confidence) || 78;

        if (existing) {
          if (confidence > (existing.confidence || 0) || !existing.source_url) {
            await supabase!.from("projects").update({
              confidence: Math.max(confidence, existing.confidence || 0),
              stage: ep.stage, status: ep.status || "Pending",
              source_url: existing.source_url || bestUrl,
              last_updated: new Date().toISOString(),
            }).eq("id", existing.id);
            updated++;
          }
        } else {
          const { data: newProject } = await supabase!.from("projects").insert({
            slug, name, country: ep.country, region: ep.region, sector: ep.sector,
            stage: ep.stage, status: ep.status || "Pending",
            value_usd: totalAmt, value_label: valueLabel, confidence,
            risk_score: 45, lat, lng,
            description: `AfDB-financed ${ep.sector} project in ${ep.country}.`,
            timeline: "", source_url: bestUrl, ai_generated: false, approved: true,
          }).select().single();

          if (newProject) {
            await supabase!.from("evidence_sources").insert({
              project_id: newProject.id, source: "African Development Bank Projects Portal",
              url: bestUrl, type: "Filing", verified: true,
              date: new Date().toISOString().split("T")[0], title: name,
              description: `AfDB ${ep.sector} project in ${ep.country}.`,
            });
            await supabase!.from("alerts").insert({
              project_id: newProject.id, project_name: name, severity: "low",
              message: `AfDB project ingested: ${name} (${ep.country}) — ${valueLabel}`,
              category: "market", source_url: bestUrl,
            });
            inserted++;
          }
        }
      } catch (projectErr) { console.error("Error processing AfDB project:", projectErr); }
    }

    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    const result = { success: true, extracted: extractedProjects.length, inserted, updated, source: "AfDB" };
    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed", result, completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("AfDB ingest error:", e);
    if (taskId && supabase) {
      try {
        await supabase.from("research_tasks").update({
          status: "failed", error: e instanceof Error ? e.message : "Unknown error",
          completed_at: new Date().toISOString(),
        }).eq("id", taskId);
      } catch { /* best-effort */ }
    }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
