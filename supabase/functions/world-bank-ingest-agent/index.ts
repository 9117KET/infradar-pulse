/**
 * world-bank-ingest-agent
 *
 * Queries the World Bank Projects API (free, no API key required) and stages
 * infrastructure projects through the shared source-first pipeline. Records
 * that clear the quality bar auto-publish with provenance='official_registry'.
 *
 * API docs: https://search.worldbank.org/api/v2/projects
 *
 * Accepts optional body params:
 *   status   - "Active" | "Pipeline" | "Closed"  (default: "Active,Pipeline")
 *   limit    - total projects to fetch            (default: 200)
 *   offset   - pagination offset                  (default: 0)
 *   mode     - "backfill" resumes from the persisted ingest cursor per status
 *              and advances it, so scheduled runs walk the whole dataset
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { isAgentEnabled, pausedResponse, beginAgentTask, alreadyRunningResponse, finishAgentRun, recordAgentEvent } from "../_shared/agentGate.ts";
import { registerPipelineSource, stagePipelineProject, slugifyProjectName } from "../_shared/pipelineIngest.ts";
import { resolveCountryCoords } from "../_shared/countryCentroids.ts";
import { getIngestCursor, saveIngestCursor } from "../_shared/ingestCursor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

/** World Bank sector label → InfraRadar sector enum */
function mapSector(wbSector: string): string {
  const s = (wbSector || "").toLowerCase();
  if (s.includes("transport") || s.includes("road") || s.includes("rail") || s.includes("port") || s.includes("airport")) return "Transport";
  if (s.includes("energy") || s.includes("power") || s.includes("electricity") || s.includes("hydropower")) return "Energy";
  if (s.includes("renewable") || s.includes("solar") || s.includes("wind") || s.includes("geothermal")) return "Renewable Energy";
  if (s.includes("mining") || s.includes("mineral") || s.includes("extractive")) return "Mining";
  if (s.includes("oil") || s.includes("gas") || s.includes("petroleum") || s.includes("lng")) return "Oil & Gas";
  if (s.includes("chemical") || s.includes("petrochemical") || s.includes("fertilizer")) return "Chemical";
  if (s.includes("water") || s.includes("sanitation") || s.includes("irrigation") || s.includes("flood")) return "Water";
  if (s.includes("urban") || s.includes("city") || s.includes("housing") || s.includes("municipal")) return "Urban Development";
  if (s.includes("information") || s.includes("telecom") || s.includes("ict") || s.includes("digital") || s.includes("broadband")) return "Digital Infrastructure";
  if (s.includes("data center") || s.includes("technology")) return "Data Centers";
  if (s.includes("industry") || s.includes("manufacturing") || s.includes("industrial")) return "Industrial";
  if (s.includes("construction") || s.includes("building") || s.includes("health") || s.includes("education")) return "Building Construction";
  return "Infrastructure";
}

/** World Bank region label + country → InfraRadar region enum */
function mapRegion(wbRegion: string, country: string): string {
  const r = (wbRegion || "").toLowerCase();
  const c = (country || "").toLowerCase();

  if (r.includes("middle east") || r.includes("north africa") || r.includes("mena")) return "MENA";

  if (r.includes("africa")) {
    // Rough sub-region split by country
    const east = ["kenya", "ethiopia", "tanzania", "uganda", "rwanda", "somalia", "mozambique", "madagascar", "zambia", "malawi", "zimbabwe"];
    const west = ["nigeria", "ghana", "senegal", "côte d'ivoire", "ivory coast", "cameroon", "mali", "burkina faso", "guinea", "sierra leone", "liberia", "togo", "benin", "niger"];
    const southern = ["south africa", "namibia", "botswana", "angola", "lesotho", "eswatini", "swaziland"];
    const central = ["dr congo", "congo", "central african republic", "chad", "gabon", "equatorial guinea"];
    if (east.some((x) => c.includes(x))) return "East Africa";
    if (west.some((x) => c.includes(x))) return "West Africa";
    if (southern.some((x) => c.includes(x))) return "Southern Africa";
    if (central.some((x) => c.includes(x))) return "Central Africa";
    return "East Africa"; // fallback
  }

  if (r.includes("east asia") || r.includes("pacific")) {
    const southeast = ["vietnam", "indonesia", "philippines", "thailand", "malaysia", "cambodia", "laos", "myanmar", "singapore", "timor"];
    if (southeast.some((x) => c.includes(x))) return "Southeast Asia";
    if (c.includes("pacific") || c.includes("papua") || c.includes("fiji") || c.includes("solomon") || c.includes("vanuatu") || c.includes("samoa") || c.includes("tonga")) return "Oceania";
    return "East Asia";
  }

  if (r.includes("europe") || r.includes("central asia")) {
    const centralAsia = ["kazakhstan", "uzbekistan", "kyrgyz", "tajikistan", "turkmenistan", "mongolia", "georgia", "armenia", "azerbaijan"];
    if (centralAsia.some((x) => c.includes(x))) return "Central Asia";
    return "Europe";
  }

  if (r.includes("latin america") || r.includes("caribbean")) {
    const caribbean = ["haiti", "jamaica", "dominican", "trinidad", "barbados", "bahamas", "antigua", "belize", "guyana", "suriname"];
    if (caribbean.some((x) => c.includes(x))) return "Caribbean";
    return "South America";
  }

  if (r.includes("north america")) return "North America";
  if (r.includes("south asia")) return "South Asia";
  if (r.includes("oceania") || r.includes("pacific islands")) return "Oceania";

  return "South Asia"; // safest fallback for unmatched WB projects
}

/** World Bank project status → InfraRadar stage */
function mapStage(wbStatus: string, closingDate: string): string {
  const s = (wbStatus || "").toLowerCase();
  if (s === "pipeline") return "Planned";
  if (s === "closed") return "Completed";
  // Active — infer construction vs financing by date
  if (closingDate) {
    const closing = new Date(closingDate);
    if (!isNaN(closing.getTime())) {
      const yearsLeft = (closing.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 365);
      if (yearsLeft > 3) return "Financing";
      return "Construction";
    }
  }
  return "Construction";
}

/** World Bank project status → InfraRadar status */
function mapStatus(wbStatus: string): string {
  const s = (wbStatus || "").toLowerCase();
  if (s === "active") return "Verified";
  if (s === "pipeline") return "Pending";
  if (s === "closed") return "Stable";
  return "Pending";
}

/** WB returns some fields as arrays and amounts as comma-strings. */
function firstString(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

function parseAmount(value: unknown): number {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

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

    if (!await isAgentEnabled(supabase, "world-bank-ingest")) return pausedResponse("world-bank-ingest");

    // Parse request options
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body is fine */ }

    const statusFilter: string = (body.status as string) || "Active,Pipeline";
    // World Bank rows require several evidence/quality writes each; keep each
    // invocation below the edge CPU budget and let the queue call us again.
    const totalLimit: number = Math.min(Math.max(Number(body.limit) || 150, 1), 150);
    const startOffset: number = Math.max(Number(body.offset) || 0, 0);
    const backfill = body.mode === "backfill";

    const lock = await beginAgentTask(supabase, "world-bank-ingest", `World Bank Projects API - status:${statusFilter} limit:${totalLimit}${backfill ? " (backfill)" : ""}`, gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("world-bank-ingest");
    taskId = lock.taskId;
    runStartedAt = new Date();

    const sourceRow = await registerPipelineSource(supabase, {
      sourceKey: "world-bank-projects",
      name: "World Bank Projects Database",
      baseUrl: "https://projects.worldbank.org",
      reliabilityScore: 95,
      supportsApi: true,
    });

    // Infrastructure-relevant World Bank sector codes
    // TX=Transport, YA=Energy & Mining, WS=Water, TU=Urban Dev, TC=ICT, YB=Industry & Trade
    // YZ=Mining, LZ=General Infra, JA=Other
    const SECTOR_CODES = "TX,YA,WS,TU,TC,YB,YZ,JA,LZ";

    let autoPublished = 0;
    let candidatesWritten = 0;
    let candidatesUpdated = 0;
    let updatesProposed = 0;
    let skipped = 0;
    let fetched = 0;
    const pageSize = 50;
    const statuses = statusFilter.split(",").map((s) => s.trim());

    for (const status of statuses) {
      const cursorKey = `world-bank-ingest:${status}`;
      let offset = startOffset;
      if (backfill) {
        const cursor = await getIngestCursor(supabase, cursorKey);
        offset = cursor.nextOffset;
      }
      const perStatusLimit = Math.ceil(totalLimit / statuses.length);
      let statusFetched = 0;
      let exhausted = false;

      while (statusFetched < perStatusLimit) {
        const rows = Math.min(pageSize, perStatusLimit - statusFetched);

        const apiUrl = new URL("https://search.worldbank.org/api/v2/projects");
        apiUrl.searchParams.set("format", "json");
        apiUrl.searchParams.set("rows", String(rows));
        apiUrl.searchParams.set("os", String(offset));
        apiUrl.searchParams.set("sectorcode_exact", SECTOR_CODES);
        apiUrl.searchParams.set("status_exact", status);
        // Sort by totalamt descending to get the largest/most significant projects first
        apiUrl.searchParams.set("sort", "totalamt");
        apiUrl.searchParams.set("order", "desc");

        console.log(`Fetching WB projects: status=${status} offset=${offset} rows=${rows}`);

        const res = await fetch(apiUrl.toString(), {
          headers: { "Accept": "application/json" },
        });

        if (!res.ok) {
          console.error(`World Bank API error: ${res.status}`);
          break;
        }

        const data = await res.json();
        const projectsMap: Record<string, any> = data?.projects || {};
        const projectList = Object.values(projectsMap).filter(
          (p: any) => p && typeof p === "object" && p.id
        );

        if (projectList.length === 0) { exhausted = true; break; }

        fetched += projectList.length;
        statusFetched += projectList.length;

        for (const p of projectList) {
          try {
            const name: string = firstString(p.projectname || p.project_name);
            if (!name) { skipped++; continue; }

            const country: string = firstString(p.countryname || p.country_namecode?.split?.(";")[0]);
            const wbRegion: string = firstString(p.regionname || p.region_namecode?.split?.(";")[0]);
            const wbSector: string = p.sector1?.Name || firstString(p.sectorname);
            const wbStatus: string = firstString(p.status) || "Active";
            const closingDate: string = firstString(p.closingdate || p.expectedclosingdate);
            const approvalDate: string = firstString(p.boardapprovaldate || p.approvaldate);

            const totalAmt: number = parseAmount(p.totalamt) || parseAmount(p.curr_total_commitment);

            const description: string =
              (p.project_abstract?.cdata || p.project_abstract?.["cdata!"] || p.project_abstract || "").toString().slice(0, 500).trim() ||
              `${wbSector || "Infrastructure"} project in ${country} financed by the World Bank.`;

            const projectUrl: string = p.url || `https://projects.worldbank.org/en/projects-operations/project-detail/${p.id}`;

            const sector = mapSector(wbSector);
            const region = mapRegion(wbRegion, country);
            const stage = mapStage(wbStatus, closingDate);
            const infraStatus = mapStatus(wbStatus);
            const coords = resolveCountryCoords(country, slugifyProjectName(name));

            // Build timeline string
            let timeline = "";
            if (approvalDate && closingDate) {
              timeline = `${approvalDate.slice(0, 4)}–${closingDate.slice(0, 4)}`;
            } else if (approvalDate) {
              timeline = `${approvalDate.slice(0, 4)}–`;
            }

            // Value label
            let valueLabel = "";
            if (totalAmt >= 1_000_000_000) valueLabel = `$${(totalAmt / 1_000_000_000).toFixed(1)}B`;
            else if (totalAmt >= 1_000_000) valueLabel = `$${(totalAmt / 1_000_000).toFixed(0)}M`;
            else if (totalAmt > 0) valueLabel = `$${totalAmt.toLocaleString()}`;
            else valueLabel = "Value TBD";

            // Confidence: World Bank projects are highly reliable primary sources
            const confidence = wbStatus === "Active" ? 85 : wbStatus === "Pipeline" ? 70 : 75;

            const staged = await stagePipelineProject(supabase!, {
              sourceId: sourceRow?.id ?? null,
              sourceKey: "world-bank-projects",
              sourceName: "World Bank Projects Database",
              discoveredBy: "world-bank-ingest",
              externalId: p.id,
              apiUrl: apiUrl.toString(),
              name, country, region, sector, stage, status: infraStatus,
              valueUsd: totalAmt,
              valueLabel,
              confidence,
              riskScore: 40,
              lat: coords.lat,
              lng: coords.lng,
              coordPrecision: coords.precision,
              description,
              timeline,
              sourceUrl: projectUrl,
              publishedAt: approvalDate || null,
              rawPayload: { id: p.id, name, country, wbRegion, wbSector, wbStatus, totalAmt, projectUrl, description },
              extractedClaims: { world_bank_id: p.id, borrower: p.borrower ?? null, implementing_agency: p.impagency ?? null },
              stakeholder: p.borrower ? firstString(p.borrower) : null,
              autoPublish: true,
            });
            if (staged.outcome === "auto_published") autoPublished++;
            else if (staged.outcome === "candidate_created") candidatesWritten++;
            else if (staged.outcome === "candidate_updated") candidatesUpdated++;
            else if (staged.outcome === "update_proposed") updatesProposed++;
            else skipped++;
          } catch (projectErr) {
            console.error(`Error processing project ${p.id}:`, projectErr);
            skipped++;
          }
        }

        // If we got fewer results than requested, we've hit the end
        if (projectList.length < rows) { exhausted = true; break; }
        offset += rows;
      }

      if (backfill) {
        await saveIngestCursor(supabase, cursorKey, { nextOffset: offset, exhausted });
      }
    }

    const result = {
      success: true,
      fetched,
      auto_published: autoPublished,
      candidates_created: candidatesWritten,
      candidates_updated: candidatesUpdated,
      update_proposals_created: updatesProposed,
      skipped,
      status_filter: statusFilter,
      mode: backfill ? "backfill" : "standard",
    };

    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed",
        result,
        completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }

    await recordAgentEvent(supabase, "world-bank-ingest", "completed", "World Bank ingest wrote source-first candidates", taskId, result);
    if (runStartedAt) await finishAgentRun(supabase, "world-bank-ingest", "completed", runStartedAt);

    console.log(`World Bank ingest complete: fetched=${fetched} auto_published=${autoPublished} candidates=${candidatesWritten} skipped=${skipped}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("World Bank ingest agent error:", e);
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    if (taskId && supabase) {
      try {
        await supabase.from("research_tasks").update({
          status: "failed",
          error: errMsg,
          completed_at: new Date().toISOString(),
        }).eq("id", taskId);
        await recordAgentEvent(supabase, "world-bank-ingest", "failed", errMsg, taskId);
        if (runStartedAt) await finishAgentRun(supabase, "world-bank-ingest", "failed", runStartedAt);
      } catch { /* best-effort */ }
    }
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
