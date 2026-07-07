/**
 * aiib-ingest-agent
 *
 * Ingests Asian Infrastructure Investment Bank (AIIB) projects directly from
 * the official structured data file that powers the public project list:
 *
 *   https://www.aiib.org/en/projects/list/.content/all-projects-data.js
 *
 * This file is a JS bootstrap (`var data=[ {...}, {...} ];`) containing every
 * project AIIB lists publicly. Parsing it directly removes the previous
 * LLM-based extraction (which was both inaccurate and expensive) and gives us
 * deterministic, source-true ingestion at near-zero cost.
 *
 * No API key required. Lovable AI is no longer used by this agent.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import {
  isAgentEnabled,
  pausedResponse,
  beginAgentTask,
  alreadyRunningResponse,
  finishAgentRun,
  recordAgentEvent,
} from "../_shared/agentGate.ts";
import { registerPipelineSource, stagePipelineProject, slugifyProjectName } from "../_shared/pipelineIngest.ts";
import { resolveCountryCoords } from "../_shared/countryCentroids.ts";
import { getIngestCursor, saveIngestCursor } from "../_shared/ingestCursor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AIIB_DATA_URL =
  "https://www.aiib.org/en/projects/list/.content/all-projects-data.js";
const AIIB_LIST_URL = "https://www.aiib.org/en/projects/list/index.html";

interface AiibRow {
  date?: string;
  pos?: string;
  economy?: string;
  sector?: string;
  financing_type?: string;
  project_type?: string;
  name?: string;
  approved_funding?: string;
  committed_funding?: string;
  proposed_funding?: string;
  special_funding?: string;
  status?: string;
  path?: string;
}

function mapAiibRegion(country: string): string {
  const c = (country || "").toLowerCase();
  if (["china", "korea"].some((x) => c.includes(x))) return "East Asia";
  if (c.includes("mongolia")) return "Central Asia";
  if (["vietnam", "indonesia", "philippines", "thailand", "malaysia", "cambodia", "laos", "myanmar", "timor", "singapore", "papua", "fiji"].some((x) => c.includes(x))) return "Southeast Asia";
  if (["india", "bangladesh", "pakistan", "sri lanka", "nepal", "bhutan", "maldives"].some((x) => c.includes(x))) return "South Asia";
  if (["kazakhstan", "uzbekistan", "kyrgyz", "tajikistan", "turkmenistan", "afghanistan"].some((x) => c.includes(x))) return "Central Asia";
  if (["oman", "turkey", "türkiye", "egypt", "iran", "iraq", "jordan", "saudi", "uae", "qatar", "bahrain", "kuwait", "azerbaijan", "georgia", "armenia"].some((x) => c.includes(x))) return "MENA";
  if (["russia", "ukraine", "poland", "romania", "hungary", "czech", "slovak", "albania", "serbia", "north macedon"].some((x) => c.includes(x))) return "Europe";
  if (["ethiopia", "kenya", "ghana", "nigeria", "cameroon", "rwanda", "ivory", "côte"].some((x) => c.includes(x))) return c.includes("ghana") || c.includes("nigeria") || c.includes("ivory") || c.includes("côte") ? "West Africa" : "East Africa";
  if (c.includes("egypt")) return "MENA";
  if (["brazil", "ecuador", "argentina", "chile", "peru", "colombia"].some((x) => c.includes(x))) return "South America";
  return "South Asia";
}

function mapAiibSector(sector: string): string {
  const s = (sector || "").toLowerCase();
  if (s.includes("transport") || s.includes("road") || s.includes("rail") || s.includes("port") || s.includes("airport") || s.includes("highway") || s.includes("metro")) return "Transport";
  if (s.includes("renewable") || s.includes("solar") || s.includes("wind")) return "Renewable Energy";
  if (s.includes("energy") || s.includes("power") || s.includes("electricity") || s.includes("hydro")) return "Energy";
  if (s.includes("water") || s.includes("sanitation") || s.includes("irrigation") || s.includes("flood") || s.includes("sewer")) return "Water";
  if (s.includes("urban") || s.includes("city") || s.includes("housing") || s.includes("municipal")) return "Urban Development";
  if (s.includes("digital") || s.includes("telecom") || s.includes("ict") || s.includes("broadband")) return "Digital Infrastructure";
  if (s.includes("environment") || s.includes("climate") || s.includes("green")) return "Renewable Energy";
  if (s.includes("rural") || s.includes("agriculture")) return "Infrastructure";
  if (s.includes("finance") || s.includes("liquidity")) return "Infrastructure";
  return "Infrastructure";
}

/**
 * Parse strings like "USD500 million", "EUR125 million", "USD1,500 million".
 * Returns USD value (best-effort); EUR converted at 1.08 ≈ USD.
 */
function parseFunding(raw: string | undefined): number {
  if (!raw) return 0;
  const text = raw.trim();
  if (!text) return 0;
  const match = text.match(/(USD|EUR|GBP|CNY|JPY)?\s*([\d,]+(?:\.\d+)?)\s*(million|billion|m|bn)?/i);
  if (!match) return 0;
  const currency = (match[1] || "USD").toUpperCase();
  const value = parseFloat(match[2].replace(/,/g, ""));
  if (!Number.isFinite(value)) return 0;
  const unit = (match[3] || "million").toLowerCase();
  let multiplier = 1;
  if (unit.startsWith("b")) multiplier = 1_000_000_000;
  else multiplier = 1_000_000; // default to million for AIIB
  let usd = value * multiplier;
  // Rough FX to keep the data field "value_usd" consistent
  if (currency === "EUR") usd *= 1.08;
  else if (currency === "GBP") usd *= 1.27;
  else if (currency === "CNY") usd *= 0.14;
  else if (currency === "JPY") usd *= 0.0067;
  return Math.round(usd);
}

function formatValueLabel(amt: number): string {
  if (amt >= 1_000_000_000) return `$${(amt / 1_000_000_000).toFixed(1)}B`;
  if (amt >= 1_000_000) return `$${(amt / 1_000_000).toFixed(0)}M`;
  return "Value TBD";
}

function mapStatus(raw: string | undefined): { stage: string; status: string; confidence: number } {
  const s = (raw || "").toLowerCase();
  if (s.includes("complet") || s.includes("closed")) return { stage: "Completed", status: "Stable", confidence: 78 };
  if (s.includes("approved")) return { stage: "Construction", status: "Verified", confidence: 82 };
  if (s.includes("proposed") || s.includes("pipeline") || s.includes("concept")) return { stage: "Planned", status: "Pending", confidence: 65 };
  if (s.includes("on hold")) return { stage: "Planned", status: "Pending", confidence: 50 };
  if (s.includes("terminat") || s.includes("cancel")) return { stage: "Cancelled", status: "Cancelled", confidence: 60 };
  return { stage: "Planned", status: "Pending", confidence: 60 };
}

/**
 * The AIIB data file ships as `var data=[ {...}, {...} ];`. We parse the
 * array safely without `eval` by trimming the JS wrapper and swapping
 * trailing commas to make it valid JSON.
 */
function parseAiibDataFile(jsBody: string): AiibRow[] {
  const start = jsBody.indexOf("[");
  const end = jsBody.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  let arrText = jsBody.substring(start, end + 1);
  // Remove trailing commas before } or ]
  arrText = arrText.replace(/,\s*([}\]])/g, "$1");
  try {
    const parsed = JSON.parse(arrText);
    return Array.isArray(parsed) ? parsed as AiibRow[] : [];
  } catch (e) {
    console.error("AIIB JSON parse failed:", e instanceof Error ? e.message : e);
    return [];
  }
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

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body */ }
    // Per-invocation cap kept small to stay under edge-runtime CPU limit (~2s).
    // Larger backfills should paginate via repeated calls with `offset`.
    const totalLimit: number = Math.min(Math.max(Number(body.limit) || 75, 1), 200);
    const backfill = body.mode === "backfill";
    let startOffset: number = Math.max(Number(body.offset) || 0, 0);
    if (backfill) {
      const cursor = await getIngestCursor(supabase, "aiib-ingest");
      startOffset = cursor.nextOffset;
    }

    const lock = await beginAgentTask(supabase, "aiib-ingest", `AIIB official data file - limit:${totalLimit}${backfill ? " (backfill)" : ""}`, gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("aiib-ingest");
    taskId = lock.taskId;
    runStartedAt = new Date();

    const sourceRow = await registerPipelineSource(supabase, {
      sourceKey: "aiib-projects",
      name: "Asian Infrastructure Investment Bank Projects Portal",
      baseUrl: "https://www.aiib.org/en/projects/list/index.html",
      reliabilityScore: 92,
      supportsApi: true,
    });

    console.log(`Fetching AIIB data file: ${AIIB_DATA_URL}`);
    const res = await fetch(AIIB_DATA_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 InfraRadarBot/1.0",
        "Accept": "application/javascript,text/javascript,*/*",
        "Referer": AIIB_LIST_URL,
      },
    });
    if (!res.ok) throw new Error(`AIIB data fetch failed: ${res.status}`);
    const jsBody = await res.text();
    const rows = parseAiibDataFile(jsBody);
    console.log(`Parsed ${rows.length} AIIB project rows from official data file`);

    if (!rows.length) {
      const errMsg = "No projects parsed from AIIB data file (file format may have changed)";
      if (taskId) {
        await supabase.from("research_tasks").update({
          status: "failed", error: errMsg, completed_at: new Date().toISOString(),
        }).eq("id", taskId);
      }
      if (runStartedAt) await finishAgentRun(supabase, "aiib-ingest", "failed", runStartedAt);
      return new Response(JSON.stringify({ error: errMsg, fetched_bytes: jsBody.length }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let autoPublished = 0;
    let candidatesWritten = 0;
    let candidatesUpdated = 0;
    let updatesProposed = 0;
    let skipped = 0;

    const processLimit = Math.min(Math.max(rows.length - startOffset, 0), totalLimit);

    for (let i = 0; i < processLimit; i++) {
      const row = rows[startOffset + i];
      try {
        const fullName = (row.name || "").trim();
        if (!fullName) { skipped++; continue; }

        // AIIB names are formatted "Country: Project Name" — split for clarity
        const nameParts = fullName.split(":");
        const projectName = nameParts.length > 1 ? nameParts.slice(1).join(":").trim() : fullName;
        const country = (row.economy || (nameParts[0] || "")).trim();
        if (!country) { skipped++; continue; }

        const sectorRaw = (row.sector || "").trim();
        const statusRaw = (row.status || "").trim();
        const approvalYearRaw = (row.date || "").trim();
        const approvalYear = /^\d{4}$/.test(approvalYearRaw) ? approvalYearRaw : "";

        const fundingRaw = row.approved_funding || row.committed_funding || row.proposed_funding || row.special_funding || "";
        const totalAmt = parseFunding(fundingRaw);
        const valueLabel = formatValueLabel(totalAmt);

        const { stage, status: infraStatus, confidence } = mapStatus(statusRaw);
        const sector = mapAiibSector(sectorRaw);
        const region = mapAiibRegion(country);
        const coords = resolveCountryCoords(country, slugifyProjectName(`${country}: ${projectName}`));

        const projectUrl = row.path
          ? `https://www.aiib.org${row.path.startsWith("/") ? "" : "/"}${row.path}`
          : AIIB_LIST_URL;

        const description = `AIIB-financed ${sector.toLowerCase()} project in ${country}${approvalYear ? ` (${statusRaw.toLowerCase()} ${approvalYear})` : statusRaw ? ` — ${statusRaw}` : ""}.${fundingRaw ? ` Funding: ${fundingRaw}.` : ""}`.substring(0, 240);

        const timeline = approvalYear ? `${approvalYear}–` : "";

        const staged = await stagePipelineProject(supabase!, {
          sourceId: sourceRow?.id ?? null,
          sourceKey: "aiib-projects",
          sourceName: "Asian Infrastructure Investment Bank Projects Portal",
          discoveredBy: "aiib-ingest",
          externalId: row.pos ?? null,
          apiUrl: AIIB_DATA_URL,
          name: `${country}: ${projectName}`,
          country, region, sector, stage,
          status: infraStatus,
          valueUsd: totalAmt,
          valueLabel,
          confidence,
          riskScore: 38,
          lat: coords.lat,
          lng: coords.lng,
          coordPrecision: coords.precision,
          description,
          timeline,
          sourceUrl: projectUrl,
          publishedAt: approvalYear ? `${approvalYear}-01-01` : null,
          rawPayload: row,
          extractedClaims: {
            aiib_pos: row.pos ?? null,
            financing_type: row.financing_type ?? null,
            project_type: row.project_type ?? null,
            funding_raw: fundingRaw,
            source_data_url: AIIB_DATA_URL,
          },
          autoPublish: true,
        });
        if (staged.outcome === "auto_published") autoPublished++;
        else if (staged.outcome === "candidate_created") candidatesWritten++;
        else if (staged.outcome === "candidate_updated") candidatesUpdated++;
        else if (staged.outcome === "update_proposed") updatesProposed++;
        else skipped++;
      } catch (rowErr) {
        console.error(`Error processing AIIB row ${i}:`, rowErr);
        skipped++;
      }
    }

    if (backfill) {
      await saveIngestCursor(supabase, "aiib-ingest", {
        nextOffset: startOffset + processLimit,
        exhausted: startOffset + processLimit >= rows.length,
      });
    }

    const result = {
      success: true,
      total_rows: rows.length,
      processed: processLimit,
      auto_published: autoPublished,
      candidates_created: candidatesWritten,
      candidates_updated: candidatesUpdated,
      update_proposals_created: updatesProposed,
      skipped,
      source: "AIIB",
      sourceUrl: AIIB_DATA_URL,
      offset: startOffset,
    };
    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed", result, completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }
    if (runStartedAt) await finishAgentRun(supabase, "aiib-ingest", "completed", runStartedAt);
    await recordAgentEvent(supabase, "aiib-ingest", "completed", "AIIB ingest from official data file", taskId, result);
    console.log(`AIIB ingest complete: total=${rows.length} processed=${processLimit} created=${candidatesWritten} updated=${candidatesUpdated} proposals=${updatesProposed} skipped=${skipped}`);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("AIIB ingest error:", e);
    if (taskId && supabase) {
      try {
        await supabase.from("research_tasks").update({
          status: "failed", error: "An internal error occurred. Please try again.",
          completed_at: new Date().toISOString(),
        }).eq("id", taskId);
        await recordAgentEvent(supabase, "aiib-ingest", "failed", e instanceof Error ? e.message : "Unknown error", taskId);
        if (runStartedAt) await finishAgentRun(supabase, "aiib-ingest", "failed", runStartedAt);
      } catch { /* best-effort */ }
    }
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
