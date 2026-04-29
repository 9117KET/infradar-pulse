/**
 * aiib-ingest-agent
 *
 * Ingests Asian Infrastructure Investment Bank (AIIB) infrastructure projects.
 * AIIB does not publish a public REST API, so this MVP agent uses Lovable AI
 * to create a source-aware research corpus and extract structured project data.
 *
 * Portal: https://www.aiib.org/en/projects/list/index.html
 * Coverage: 77 member states across Asia, Middle East, Africa, Europe
 *
 * Requires: LOVABLE_API_KEY, provided by Lovable Cloud.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { isAgentEnabled, pausedResponse, beginAgentTask, alreadyRunningResponse, finishAgentRun, recordAgentEvent } from "../_shared/agentGate.ts";
import { chatCompletions } from "../_shared/llm.ts";
import { registerPipelineSource, stagePipelineProject } from "../_shared/pipelineIngest.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AIIB_PORTAL_PAGES = [
  "https://www.aiib.org/en/projects/list/index.html",
  "https://www.aiib.org/en/projects/list/index.html?status=Active",
  "https://www.aiib.org/en/projects/list/index.html?status=Approved",
];

const AIIB_SECTORS = [
  "transport", "energy", "water", "urban", "digital", "rural",
  "environment", "social", "health", "finance",
];

const AIIB_RESEARCH_PROMPTS = [
  "AIIB Asian Infrastructure Investment Bank approved infrastructure projects 2023 2024 2025 transport energy",
  "AIIB new projects Central Asia South Asia Southeast Asia construction pipeline funding",
  "AIIB Bangladesh India Indonesia Pakistan Vietnam infrastructure loan approval amount",
];

interface AiibProject {
  name: string;
  country: string;
  sector: string;
  status: string;
  amount_usd?: number;
  project_id?: string;
  description?: string;
  approval_year?: string;
}

const AIIB_COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  "china": [35.86, 104.20], "india": [20.59, 78.96], "indonesia": [-0.79, 113.92],
  "bangladesh": [23.68, 90.36], "pakistan": [30.38, 69.35], "vietnam": [14.06, 108.28],
  "philippines": [12.88, 121.77], "thailand": [15.87, 100.99], "myanmar": [21.91, 95.96],
  "cambodia": [12.57, 104.99], "laos": [19.86, 102.50], "nepal": [28.39, 84.12],
  "sri lanka": [7.87, 80.77], "mongolia": [46.86, 103.85], "papua new guinea": [-6.31, 143.96],
  "fiji": [-17.71, 178.07], "timor-leste": [-8.87, 125.73], "kazakhstan": [48.02, 66.92],
  "uzbekistan": [41.38, 64.59], "kyrgyzstan": [41.20, 74.77], "tajikistan": [38.86, 71.28],
  "turkmenistan": [38.97, 59.56], "afghanistan": [33.94, 67.71], "azerbaijan": [40.14, 47.58],
  "georgia": [42.32, 43.36], "armenia": [40.07, 45.04], "oman": [21.51, 55.92],
  "turkey": [38.96, 35.24], "egypt": [26.82, 30.80], "iran": [32.43, 53.69],
  "iraq": [33.22, 43.68], "jordan": [30.59, 36.24], "ethiopia": [9.15, 40.49],
  "kenya": [-0.02, 37.91], "ghana": [7.95, -1.02], "russia": [61.52, 105.32],
  "ukraine": [48.38, 31.17], "poland": [51.92, 19.15], "romania": [45.94, 24.97],
  "malaysia": [4.21, 101.98], "singapore": [1.35, 103.82],
};

function getAiibCentroid(country: string): [number, number] {
  const key = (country || "").toLowerCase().trim();
  if (AIIB_COUNTRY_CENTROIDS[key]) return AIIB_COUNTRY_CENTROIDS[key];
  for (const [k, v] of Object.entries(AIIB_COUNTRY_CENTROIDS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return [25.0, 90.0]; // default: South Asia
}

function mapAiibRegion(country: string): string {
  const c = (country || "").toLowerCase();
  const east = ["china", "mongolia", "korea"];
  const southeast = ["vietnam", "indonesia", "philippines", "thailand", "malaysia", "cambodia", "laos", "myanmar", "timor", "singapore", "papua", "fiji"];
  const south = ["india", "bangladesh", "pakistan", "sri lanka", "nepal", "bhutan", "maldives"];
  const central = ["kazakhstan", "uzbekistan", "kyrgyz", "tajikistan", "turkmenistan", "afghanistan", "mongolia"];
  const mena = ["oman", "turkey", "egypt", "iran", "iraq", "jordan", "saudi", "uae", "qatar", "bahrain", "kuwait", "azerbaijan", "georgia", "armenia"];
  const europe = ["russia", "ukraine", "poland", "romania", "hungary", "czech", "slovak", "albania", "serbia", "north macedon"];
  const africa = ["ethiopia", "kenya", "ghana", "nigeria", "cameroon", "egypt"];

  if (east.some((x) => c.includes(x))) return "East Asia";
  if (southeast.some((x) => c.includes(x))) return "Southeast Asia";
  if (south.some((x) => c.includes(x))) return "South Asia";
  if (central.some((x) => c.includes(x))) return "Central Asia";
  if (mena.some((x) => c.includes(x))) return "MENA";
  if (europe.some((x) => c.includes(x))) return "Europe";
  if (africa.some((x) => c.includes(x))) return "East Africa";
  return "South Asia";
}

function mapAiibSector(sector: string): string {
  const s = (sector || "").toLowerCase();
  if (s.includes("transport") || s.includes("road") || s.includes("rail") || s.includes("port") || s.includes("airport") || s.includes("highway")) return "Transport";
  if (s.includes("energy") || s.includes("power") || s.includes("electricity") || s.includes("hydro")) return "Energy";
  if (s.includes("renewable") || s.includes("solar") || s.includes("wind")) return "Renewable Energy";
  if (s.includes("water") || s.includes("sanitation") || s.includes("irrigation") || s.includes("flood")) return "Water";
  if (s.includes("urban") || s.includes("city") || s.includes("housing") || s.includes("municipal")) return "Urban Development";
  if (s.includes("digital") || s.includes("telecom") || s.includes("ict") || s.includes("broadband")) return "Digital Infrastructure";
  if (s.includes("environment") || s.includes("climate") || s.includes("green")) return "Renewable Energy";
  if (s.includes("rural") || s.includes("agriculture")) return "Infrastructure";
  return "Infrastructure";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  let taskId: string | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;
    let runStartedAt: Date | null = null;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!await isAgentEnabled(supabase, "aiib-ingest")) return pausedResponse("aiib-ingest");

    const lock = await beginAgentTask(supabase, "aiib-ingest", "AIIB Projects Portal", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("aiib-ingest");
    taskId = lock.taskId;
    runStartedAt = new Date();

    const sourceRow = await registerPipelineSource(supabase, {
      sourceKey: "aiib-projects",
      name: "Asian Infrastructure Investment Bank Projects Portal",
      baseUrl: "https://www.aiib.org/en/projects/list/index.html",
      reliabilityScore: 84,
      supportsApi: false,
    });

    const rawChunks: string[] = [];

    for (const q of AIIB_RESEARCH_PROMPTS) {
      try {
        const research = await chatCompletions({
          messages: [
            { role: "system", content: "You are an infrastructure intelligence analyst covering Asian Infrastructure Investment Bank projects. Produce source-aware notes with project names, countries, sectors, approval years, amounts and official AIIB URLs where known." },
            { role: "user", content: `${q}. Also consider AIIB portal pages: ${AIIB_PORTAL_PAGES.join(", ")}` },
          ],
        });
        if (research.ok) {
          const data = await research.json();
          const content = data?.choices?.[0]?.message?.content;
          if (content) rawChunks.push(`Lovable AI AIIB research:
${content}`);
        }
      } catch (e) { console.warn("Lovable AI AIIB research failed:", e); }
    }

    const raw = rawChunks.join("\n\n---\n\n");
    if (!raw.trim()) {
      const errMsg = "No research text collected from AIIB portal";
      if (taskId) {
        await supabase.from("research_tasks").update({
          status: "failed", error: errMsg, completed_at: new Date().toISOString(),
        }).eq("id", taskId);
      }
      return new Response(JSON.stringify({ error: errMsg }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`Collected ${raw.length} chars from AIIB portal. Extracting projects...`);

    // Use LLM to extract structured project data
    const extraction = await chatCompletions({
      messages: [
        {
          role: "system",
          content: `You are an expert at extracting structured infrastructure project data from text.
Extract all AIIB (Asian Infrastructure Investment Bank) infrastructure projects from the provided text.
For each project return a JSON object. Only include real projects with at minimum a name and country.
Focus on: transport, energy, renewable energy, water, urban development, digital infrastructure projects.
Return a JSON array of objects with these fields (omit fields if unknown):
- name: string (project title)
- country: string
- sector: string (e.g. "Transport", "Energy", "Water", "Urban Development", "Digital Infrastructure", "Renewable Energy")
- status: string ("Active" | "Approved" | "Proposed" | "Completed")
- amount_usd: number (in USD, convert from millions if needed — e.g. "$200 million" = 200000000)
- project_id: string (AIIB project ID if present, e.g. "P-IN-E00-001")
- description: string (brief description, max 200 chars)
- approval_year: string (4-digit year)
Return ONLY valid JSON array, no markdown, no explanation.`,
        },
        {
          role: "user",
          content: raw.substring(0, 28000),
        },
      ],
    });

    let projects: AiibProject[] = [];
    try {
      const data = extraction.ok ? await extraction.json() : null;
      const content = data?.choices?.[0]?.message?.content || "[]";
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      projects = JSON.parse(cleaned);
      if (!Array.isArray(projects)) projects = [];
    } catch (e) {
      console.error("Failed to parse LLM extraction:", e);
    }

    console.log(`Extracted ${projects.length} AIIB projects from text`);

    let candidatesWritten = 0;
    let candidatesUpdated = 0;
    let updatesProposed = 0;
    let skipped = 0;

    for (const p of projects) {
      if (!p.name || !p.country) { skipped++; continue; }
      try {
        const totalAmt = p.amount_usd ? Math.round(p.amount_usd) : 0;
        const projectUrl = p.project_id
          ? `https://www.aiib.org/en/projects/details/${p.project_id}.html`
          : "https://www.aiib.org/en/projects/list/index.html";

        let valueLabel = "";
        if (totalAmt >= 1_000_000_000) valueLabel = `$${(totalAmt / 1_000_000_000).toFixed(1)}B`;
        else if (totalAmt >= 1_000_000) valueLabel = `$${(totalAmt / 1_000_000).toFixed(0)}M`;
        else valueLabel = "Value TBD";

        const statusLower = (p.status || "").toLowerCase();
        const stage = statusLower.includes("complet") ? "Completed"
          : statusLower.includes("active") || statusLower.includes("approved") ? "Construction"
          : "Planned";
        const infraStatus = statusLower.includes("active") || statusLower.includes("approved") ? "Verified" : "Pending";
        const confidence = infraStatus === "Verified" ? 80 : 62;

        const sector = mapAiibSector(p.sector || "");
        const region = mapAiibRegion(p.country);
        const [lat, lng] = getAiibCentroid(p.country);
        const timeline = p.approval_year ? `${p.approval_year}–` : "";
        const description = p.description
          || `AIIB-financed ${sector.toLowerCase()} project in ${p.country}${p.approval_year ? ` (approved ${p.approval_year})` : ""}.`;

        const staged = await stagePipelineProject(supabase!, {
          sourceId: sourceRow?.id ?? null,
          sourceKey: "aiib-projects",
          sourceName: "Asian Infrastructure Investment Bank Projects Portal",
          discoveredBy: "aiib-ingest",
          externalId: p.project_id ?? null,
          apiUrl: AIIB_PORTAL_PAGES[0],
          name: p.name,
          country: p.country,
          region, sector, stage, status: infraStatus,
          valueUsd: totalAmt,
          valueLabel,
          confidence,
          riskScore: 38,
          lat, lng,
          description: description.substring(0, 200),
          timeline,
          sourceUrl: projectUrl,
          publishedAt: p.approval_year ? `${p.approval_year}-01-01` : null,
          rawPayload: p,
          extractedClaims: { aiib_project_id: p.project_id ?? null, extraction_source: "lovable-ai-aiib-research" },
        });
        if (staged.outcome === "candidate_created") candidatesWritten++;
        else if (staged.outcome === "candidate_updated") candidatesUpdated++;
        else if (staged.outcome === "update_proposed") updatesProposed++;
        else skipped++;
      } catch (rowErr) {
        console.error("Error processing AIIB project:", rowErr);
        skipped++;
      }
    }

    const result = { success: true, extracted: projects.length, candidates_created: candidatesWritten, candidates_updated: candidatesUpdated, update_proposals_created: updatesProposed, skipped, source: "AIIB" };
    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed", result, completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }

    await recordAgentEvent(supabase, "aiib-ingest", "completed", "AIIB ingest wrote source-first candidates", taskId, result);
    if (runStartedAt) await finishAgentRun(supabase, "aiib-ingest", "completed", runStartedAt);
    console.log(`AIIB ingest complete: extracted=${projects.length} candidates=${candidatesWritten} updated_candidates=${candidatesUpdated} update_proposals=${updatesProposed} skipped=${skipped}`);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("AIIB ingest error:", e);
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
