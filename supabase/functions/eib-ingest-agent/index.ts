/**
 * eib-ingest-agent (redeploy nudge 2026-07-09)
 *
 * Ingests European Investment Bank financed projects from the public JSON API
 * that powers eib.org's own project list (no API key required):
 *
 *   https://www.eib.org/page-provider/projects/list
 *
 * ~17k approved/signed operations with title, description, country, sector,
 * status, date and amounts (EUR). Fills the platform's weakest region —
 * Europe — though the EIB also lends globally.
 *
 * Accepted body params:
 *   statuses - comma list of EIB statuses     (default "approved,signed")
 *   limit    - max records to process per run (default 300, max 1000)
 *   offset   - item offset                    (default 0)
 *   mode     - "backfill" resumes from the persisted ingest cursor
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

const EIB_API = "https://www.eib.org/page-provider/projects/list";
const EUR_USD = 1.08; // rough FX to keep value_usd consistent

// EIB sector labels that are NOT physical infrastructure — skipped.
const EXCLUDED_SECTORS = ["credit lines", "services", "education", "health"];

function mapEibSector(sectorLabel: string): string {
  const s = (sectorLabel || "").toLowerCase();
  if (s.includes("transport")) return "Transport";
  if (s.includes("energy")) return "Energy";
  if (s.includes("water") || s.includes("sewerage")) return "Water";
  if (s.includes("urban")) return "Urban Development";
  if (s.includes("telecom")) return "Digital Infrastructure";
  if (s.includes("industry")) return "Industrial";
  if (s.includes("agriculture") || s.includes("forestry") || s.includes("fisheries")) return "Infrastructure";
  if (s.includes("solid waste") || s.includes("composite")) return "Infrastructure";
  return "Infrastructure";
}

function mapEibRegion(country: string): string {
  const c = (country || "").toLowerCase();
  const mena = ["morocco", "tunisia", "egypt", "algeria", "jordan", "lebanon", "israel", "palestine", "west bank", "turkey", "türkiye", "syria", "libya", "iraq"];
  if (mena.some((x) => c.includes(x))) return "MENA";
  const eastAfrica = ["kenya", "ethiopia", "tanzania", "uganda", "rwanda", "mozambique", "madagascar", "zambia", "malawi", "burundi"];
  if (eastAfrica.some((x) => c.includes(x))) return "East Africa";
  const westAfrica = ["nigeria", "ghana", "senegal", "côte", "ivory", "cameroon", "mali", "burkina", "benin", "togo", "niger", "mauritania", "guinea", "liberia", "sierra"];
  if (westAfrica.some((x) => c.includes(x))) return "West Africa";
  const southernAfrica = ["south africa", "namibia", "botswana", "angola", "lesotho", "eswatini", "zimbabwe"];
  if (southernAfrica.some((x) => c.includes(x))) return "Southern Africa";
  const centralAfrica = ["congo", "chad", "gabon", "central african"];
  if (centralAfrica.some((x) => c.includes(x))) return "Central Africa";
  const southAsia = ["india", "bangladesh", "pakistan", "sri lanka", "nepal", "bhutan", "maldives"];
  if (southAsia.some((x) => c.includes(x))) return "South Asia";
  const seAsia = ["vietnam", "indonesia", "philippines", "thailand", "malaysia", "cambodia", "laos", "myanmar"];
  if (seAsia.some((x) => c.includes(x))) return "Southeast Asia";
  const centralAsia = ["kazakhstan", "uzbekistan", "kyrgyz", "tajikistan", "mongolia", "georgia", "armenia", "azerbaijan"];
  if (centralAsia.some((x) => c.includes(x))) return "Central Asia";
  const southAmerica = ["brazil", "argentina", "chile", "peru", "colombia", "ecuador", "bolivia", "paraguay", "uruguay", "venezuela"];
  if (southAmerica.some((x) => c.includes(x))) return "South America";
  const caribbean = ["haiti", "jamaica", "dominican", "barbados", "bahamas", "trinidad", "guyana", "suriname", "belize"];
  if (caribbean.some((x) => c.includes(x))) return "Caribbean";
  const northAmerica = ["united states", "canada", "mexico"];
  if (northAmerica.some((x) => c.includes(x))) return "North America";
  const eastAsia = ["china", "japan", "korea", "taiwan"];
  if (eastAsia.some((x) => c.includes(x))) return "East Asia";
  const oceania = ["australia", "new zealand", "fiji", "papua", "pacific"];
  if (oceania.some((x) => c.includes(x))) return "Oceania";
  return "Europe";
}

interface EibItem {
  id?: string;
  title?: string;
  description?: string;
  additionalInformation?: unknown[];
  primaryTags?: { label?: string; subType?: string }[];
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

    if (!await isAgentEnabled(supabase, "eib-ingest")) return pausedResponse("eib-ingest");

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body */ }

    const statuses = String(body.statuses || "approved,signed");
    const totalLimit = Math.min(Math.max(Number(body.limit) || 300, 1), 1000);
    const backfill = body.mode === "backfill";
    let startOffset = Math.max(Number(body.offset) || 0, 0);
    if (backfill) {
      const cursor = await getIngestCursor(supabase, "eib-ingest");
      startOffset = cursor.nextOffset;
    }

    const lock = await beginAgentTask(supabase, "eib-ingest", `EIB Projects API — statuses:${statuses} limit:${totalLimit}${backfill ? " (backfill)" : ""}`, gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("eib-ingest");
    taskId = lock.taskId;
    runStartedAt = new Date();

    const sourceRow = await registerPipelineSource(supabase, {
      sourceKey: "eib-projects",
      name: "European Investment Bank Financed Projects",
      baseUrl: "https://www.eib.org/en/projects",
      reliabilityScore: 94,
      supportsApi: true,
    });

    let autoPublished = 0;
    let candidatesWritten = 0;
    let candidatesUpdated = 0;
    let updatesProposed = 0;
    let skipped = 0;
    let fetched = 0;
    let exhausted = false;
    let endOffset = startOffset;
    const PAGE = 100;

    // Offsets are kept page-aligned: each iteration requests one full page and
    // processes everything in it, so the cursor always lands on a page boundary.
    for (let offset = startOffset - (startOffset % PAGE); offset < startOffset + totalLimit; offset += PAGE) {
      const pageNumber = Math.floor(offset / PAGE);
      const url = new URL(EIB_API);
      url.searchParams.set("pageNumber", String(pageNumber));
      url.searchParams.set("itemPerPage", String(PAGE));
      url.searchParams.set("pageable", "true");
      url.searchParams.set("language", "EN");
      url.searchParams.set("defaultLanguage", "EN");
      url.searchParams.set("loanPart", "");
      url.searchParams.set("statuses", statuses);
      // Newest first so standard (non-backfill) runs act as freshness pulls
      url.searchParams.set("sortColumn", "statusDate");
      url.searchParams.set("sortDir", "desc");

      console.log(`Fetching EIB projects: page=${pageNumber} size=${PAGE}`);
      const res = await fetch(url.toString(), {
        headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0 InfraRadarBot/1.0" },
      });
      if (!res.ok) throw new Error(`EIB API error: ${res.status}`);
      const json = await res.json();
      const items: EibItem[] = json?.data || [];
      const totalItems = Number(json?.totalItems) || 0;

      if (items.length === 0) { exhausted = true; break; }
      fetched += items.length;
      endOffset = offset + items.length;

      for (const item of items) {
        try {
          const name = (item.title || "").trim();
          if (!name || !item.id) { skipped++; continue; }

          const tags = item.primaryTags || [];
          const country = (tags.find((t) => t.subType === "countries")?.label || "").trim();
          const sectorLabel = (tags.find((t) => t.subType === "sectors")?.label || "").trim();
          if (EXCLUDED_SECTORS.some((x) => sectorLabel.toLowerCase().includes(x))) { skipped++; continue; }

          const info = item.additionalInformation || [];
          const statusLabel = String(info[0] || "").trim(); // "Approved" | "Signed" | ...
          const statusDate = String(info[1] || "").trim();  // dd/mm/yyyy
          const amountEur = Math.max(Number(info[2]) || 0, Number(info[3]) || 0);
          const totalAmt = Math.round(amountEur * EUR_USD);

          const isSigned = statusLabel.toLowerCase().includes("signed");
          const stage = "Financing";
          const infraStatus = "Verified";
          const confidence = isSigned ? 87 : 84;

          const year = statusDate.split("/")[2] || "";
          const coords = resolveCountryCoords(country, slugifyProjectName(name));
          const sector = mapEibSector(sectorLabel);
          const region = mapEibRegion(country);
          const projectUrl = `https://www.eib.org/en/projects/all/${item.id}`;

          let valueLabel = "Value TBD";
          if (totalAmt >= 1_000_000_000) valueLabel = `$${(totalAmt / 1_000_000_000).toFixed(1)}B`;
          else if (totalAmt >= 1_000_000) valueLabel = `$${(totalAmt / 1_000_000).toFixed(0)}M`;

          const description = (item.description || "").trim().slice(0, 500) ||
            `EIB-financed ${sectorLabel || "infrastructure"} project in ${country}${year ? ` (${statusLabel.toLowerCase()} ${year})` : ""}.`;

          const staged = await stagePipelineProject(supabase!, {
            sourceId: sourceRow?.id ?? null,
            sourceKey: "eib-projects",
            sourceName: "European Investment Bank Financed Projects",
            discoveredBy: "eib-ingest",
            externalId: item.id,
            apiUrl: url.toString(),
            name, country, region, sector, stage,
            status: infraStatus,
            valueUsd: totalAmt,
            valueLabel,
            confidence,
            riskScore: 30,
            lat: coords.lat,
            lng: coords.lng,
            coordPrecision: coords.precision,
            description,
            timeline: year ? `${year}–` : "",
            sourceUrl: projectUrl,
            publishedAt: year ? `${year}-01-01` : null,
            rawPayload: { id: item.id, name, country, sectorLabel, statusLabel, statusDate, amountEur },
            extractedClaims: { eib_project_id: item.id, eib_status: statusLabel, amount_eur: amountEur },
            autoPublish: true,
          });
          if (staged.outcome === "auto_published") autoPublished++;
          else if (staged.outcome === "candidate_created") candidatesWritten++;
          else if (staged.outcome === "candidate_updated") candidatesUpdated++;
          else if (staged.outcome === "update_proposed") updatesProposed++;
          else skipped++;
        } catch (itemErr) {
          console.error(`Error processing EIB item:`, itemErr);
          skipped++;
        }
      }

      if (totalItems > 0 && endOffset >= totalItems) { exhausted = true; break; }
      if (items.length < PAGE) { exhausted = true; break; }
    }

    if (backfill) {
      await saveIngestCursor(supabase, "eib-ingest", { nextOffset: endOffset, exhausted });
    }

    const result = { success: true, fetched, auto_published: autoPublished, candidates_created: candidatesWritten, candidates_updated: candidatesUpdated, update_proposals_created: updatesProposed, skipped, source: "EIB", offset: startOffset, mode: backfill ? "backfill" : "standard" };
    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed", result, completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }

    await recordAgentEvent(supabase, "eib-ingest", "completed", "EIB ingest wrote source-first candidates", taskId, result);
    if (runStartedAt) await finishAgentRun(supabase, "eib-ingest", "completed", runStartedAt);
    console.log(`EIB ingest complete: fetched=${fetched} auto_published=${autoPublished} candidates=${candidatesWritten} skipped=${skipped}`);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("EIB ingest error:", e);
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    if (taskId && supabase) {
      try {
        await supabase.from("research_tasks").update({
          status: "failed", error: errMsg, completed_at: new Date().toISOString(),
        }).eq("id", taskId);
        await recordAgentEvent(supabase, "eib-ingest", "failed", errMsg, taskId);
        if (runStartedAt) await finishAgentRun(supabase, "eib-ingest", "failed", runStartedAt);
      } catch { /* best-effort */ }
    }
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
