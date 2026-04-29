/**
 * iadb-ingest-agent
 *
 * Ingests Inter-American Development Bank (IDB/IADB) infrastructure projects.
 * Uses the IADB public CKAN data API — no API key required.
 *
 * API: https://data.iadb.org/api/action/datastore_search
 * Resource: 814b7b54-477a-4c25-b3bf-6be05412069d (All Operations dataset)
 *
 * Accepted body params:
 *   limit   - max projects to ingest (default: 300, max: 10000)
 *   status  - filter by project status: "Active" | "Implementation" | "Closed" (default: "Active,Implementation")
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { isAgentEnabled, pausedResponse, beginAgentTask, alreadyRunningResponse, finishAgentRun, recordAgentEvent } from "../_shared/agentGate.ts";
import { registerPipelineSource, stagePipelineProject } from "../_shared/pipelineIngest.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IADB_RESOURCE_ID = "814b7b54-477a-4c25-b3bf-6be05412069d";
const IADB_API = "https://data.iadb.org/api/action/datastore_search";

// Latin American and Caribbean country centroids
const IADB_COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  "argentina": [-38.42, -63.62], "bolivia": [-16.29, -63.59], "brazil": [-14.24, -51.93],
  "chile": [-35.68, -71.54], "colombia": [4.57, -74.30], "costa rica": [9.75, -83.75],
  "cuba": [21.52, -77.78], "dominican republic": [18.74, -70.16], "ecuador": [-1.83, -78.18],
  "el salvador": [13.79, -88.90], "guatemala": [15.78, -90.23], "guyana": [4.86, -58.93],
  "haiti": [18.97, -72.29], "honduras": [15.20, -86.24], "jamaica": [18.10, -77.30],
  "mexico": [23.63, -102.55], "nicaragua": [12.87, -85.21], "panama": [8.54, -80.78],
  "paraguay": [-23.44, -58.44], "peru": [-9.19, -75.02], "suriname": [3.92, -56.03],
  "trinidad and tobago": [10.69, -61.22], "trinidad": [10.69, -61.22], "uruguay": [-32.52, -55.77],
  "venezuela": [6.42, -66.59], "barbados": [13.19, -59.54], "bahamas": [25.03, -77.40],
  "belize": [17.19, -88.50], "grenada": [12.12, -61.68], "saint lucia": [13.91, -60.98],
  "antigua": [17.06, -61.80], "dominica": [15.41, -61.37], "regional": [4.00, -74.00],
};

function getIadbCentroid(country: string): [number, number] {
  const key = (country || "").toLowerCase().trim();
  if (IADB_COUNTRY_CENTROIDS[key]) return IADB_COUNTRY_CENTROIDS[key];
  for (const [k, v] of Object.entries(IADB_COUNTRY_CENTROIDS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return [4.0, -74.0]; // default: Colombia
}

function mapIadbRegion(country: string): string {
  const c = (country || "").toLowerCase();
  const caribbean = ["cuba", "haiti", "dominican", "jamaica", "barbados", "bahamas", "trinidad", "grenada", "lucia", "antigua", "dominica", "guyana", "suriname", "belize"];
  if (caribbean.some((x) => c.includes(x))) return "Caribbean";
  return "Latin America";
}

function mapIadbSector(sector: string, subsector: string): string {
  const s = ((sector || "") + " " + (subsector || "")).toLowerCase();
  if (s.includes("transport") || s.includes("road") || s.includes("rail") || s.includes("port") || s.includes("airport") || s.includes("highway")) return "Transport";
  if (s.includes("energy") || s.includes("electricity") || s.includes("power grid") || s.includes("hydropower")) return "Energy";
  if (s.includes("renewable") || s.includes("solar") || s.includes("wind")) return "Renewable Energy";
  if (s.includes("water") || s.includes("sanitation") || s.includes("sewage") || s.includes("flood")) return "Water";
  if (s.includes("urban") || s.includes("housing") || s.includes("municipal") || s.includes("city")) return "Urban Development";
  if (s.includes("digital") || s.includes("telecom") || s.includes("ict") || s.includes("information")) return "Digital Infrastructure";
  if (s.includes("mining") || s.includes("extractive") || s.includes("natural resources")) return "Mining";
  if (s.includes("oil") || s.includes("gas") || s.includes("petroleum")) return "Oil & Gas";
  if (s.includes("industry") || s.includes("manufacturing") || s.includes("trade")) return "Industrial";
  return "Infrastructure";
}

function mapIadbStatus(status: string): { stage: string; infraStatus: string } {
  const s = (status || "").toLowerCase();
  if (s.includes("active") || s.includes("implementation") || s.includes("executing")) return { stage: "Construction", infraStatus: "Verified" };
  if (s.includes("approved") || s.includes("pipeline") || s.includes("pre-execution")) return { stage: "Financing", infraStatus: "Pending" };
  if (s.includes("closed") || s.includes("completed") || s.includes("finished")) return { stage: "Completed", infraStatus: "Stable" };
  if (s.includes("preparation") || s.includes("concept") || s.includes("profile")) return { stage: "Planned", infraStatus: "Pending" };
  return { stage: "Construction", infraStatus: "Pending" };
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

    if (!await isAgentEnabled(supabase, "iadb-ingest")) return pausedResponse("iadb-ingest");

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body */ }
    const totalLimit: number = Math.min(Math.max(Number(body.limit) || 300, 1), 10000);
    const startOffset: number = Math.max(Number(body.offset) || 0, 0);
    const statusFilter: string = String(body.status || "Active,Implementation");

    const lock = await beginAgentTask(supabase, "iadb-ingest", `IADB Projects API — status:${statusFilter} limit:${totalLimit}`, gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("iadb-ingest");
    taskId = lock.taskId;
    runStartedAt = new Date();

    const sourceRow = await registerPipelineSource(supabase, {
      sourceKey: "iadb-projects",
      name: "Inter-American Development Bank Operations Data",
      baseUrl: "https://data.iadb.org",
      reliabilityScore: 90,
      supportsApi: true,
    });

    console.log(`Fetching IADB projects (status:${statusFilter}, limit:${totalLimit})...`);

    let candidatesWritten = 0;
    let candidatesUpdated = 0;
    let updatesProposed = 0;
    let skipped = 0;
    let fetched = 0;
    const BATCH = 100;

    // Infrastructure-relevant sectors to filter down to
    const infraSectors = [
      "TRANSPORT AND URBAN DEVELOPMENT",
      "ENERGY",
      "WATER AND SANITATION",
      "ENVIRONMENT AND NATURAL DISASTERS",
      "INFORMATION AND COMMUNICATION TECHNOLOGY",
      "PRODUCTIVE INFRASTRUCTURE",
      "URBAN DEVELOPMENT AND HOUSING",
      "NATURAL RESOURCES AND ENVIRONMENT",
      "INDUSTRY",
    ];

    const statusVariants = statusFilter.toLowerCase().split(",").map((s) => s.trim());

    for (let offset = startOffset; offset < startOffset + totalLimit; offset += BATCH) {
      const batchSize = Math.min(BATCH, startOffset + totalLimit - offset);
      const url = new URL(IADB_API);
      url.searchParams.set("resource_id", IADB_RESOURCE_ID);
      url.searchParams.set("limit", String(batchSize));
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("sort", "apprvl_dt desc");

      const res = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
      if (!res.ok) throw new Error(`IADB API error: ${res.status} ${res.statusText}`);
      const json = await res.json();
      if (!json.success) throw new Error(`IADB API returned error: ${JSON.stringify(json.error)}`);

      const records: Record<string, unknown>[] = json.result?.records || [];
      if (records.length === 0) break;
      fetched += records.length;

      for (const row of records) {
        try {
          const statusRaw = String(row["publc_sts_nm"] || row["oper_sts_nm"] || "");
          const statusLower = statusRaw.toLowerCase();

          // Skip if not in target status
          if (statusVariants.length > 0 && !statusVariants.some((v) => statusLower.includes(v))) {
            skipped++;
            continue;
          }

          const sectorRaw = String(row["sector_nm"] || "");
          // Skip non-infrastructure sectors
          const isInfra = infraSectors.some((s) => sectorRaw.toUpperCase().includes(s.split(" ")[0]));
          if (!isInfra && sectorRaw && !sectorRaw.toLowerCase().includes("infra")) {
            skipped++;
            continue;
          }

          const name = String(row["oper_nm"] || "").trim();
          if (!name || name.length < 5) { skipped++; continue; }

          const country = String(row["cntry_nm"] || "").trim();
          const subsectorRaw = String(row["subsector_nm"] || "");
          const operNum = String(row["oper_num"] || "").trim();
          const amtRaw = Number(row["orig_apprvd_useq_amnt"] || row["totl_cost_orig"] || 0);
          const approvalDate = String(row["apprvl_dt"] || "");
          const description = String(row["objtv"] || "").trim();
          const lendingType = String(row["lending_typ_nm"] || "").trim();

          const totalAmt = Math.round(amtRaw) || 0;
          const approvalYear = approvalDate ? approvalDate.substring(0, 4) : "";
          const projectUrl = operNum
            ? `https://www.iadb.org/en/project/${operNum}`
            : "https://data.iadb.org";

          const { stage, infraStatus } = mapIadbStatus(statusRaw);
          const sector = mapIadbSector(sectorRaw, subsectorRaw);
          const region = mapIadbRegion(country);
          const [lat, lng] = getIadbCentroid(country);

          let valueLabel = "";
          if (totalAmt >= 1_000_000_000) valueLabel = `$${(totalAmt / 1_000_000_000).toFixed(1)}B`;
          else if (totalAmt >= 1_000_000) valueLabel = `$${(totalAmt / 1_000_000).toFixed(0)}M`;
          else if (totalAmt > 0) valueLabel = `$${totalAmt.toLocaleString()}`;
          else valueLabel = "Value TBD";

          const confidence = infraStatus === "Verified" ? 84 : 67;
          const shortDesc = description
            ? description.substring(0, 200)
            : `IADB-financed ${sector.toLowerCase()} project in ${country}${approvalYear ? ` (approved ${approvalYear})` : ""}.`;
          const timeline = approvalYear ? `${approvalYear}–` : "";

          const staged = await stagePipelineProject(supabase!, {
            sourceId: sourceRow?.id ?? null,
            sourceKey: "iadb-projects",
            sourceName: `Inter-American Development Bank${lendingType ? ` — ${lendingType}` : ""}`,
            discoveredBy: "iadb-ingest",
            externalId: operNum,
            apiUrl: url.toString(),
            name, country, region, sector, stage, status: infraStatus,
            valueUsd: totalAmt,
            valueLabel,
            confidence,
            riskScore: 35,
            lat, lng,
            description: shortDesc,
            timeline,
            sourceUrl: projectUrl,
            publishedAt: approvalDate || null,
            rawPayload: row,
            extractedClaims: { iadb_operation_number: operNum, lending_type: lendingType },
          });
          if (staged.outcome === "candidate_created") candidatesWritten++;
          else if (staged.outcome === "candidate_updated") candidatesUpdated++;
          else if (staged.outcome === "update_proposed") updatesProposed++;
          else skipped++;
        } catch (rowErr) {
          console.error(`Error processing IADB row:`, rowErr);
          skipped++;
        }
      }

      if (records.length < batchSize) break;
    }

    const result = { success: true, fetched, candidates_created: candidatesWritten, candidates_updated: candidatesUpdated, update_proposals_created: updatesProposed, skipped, source: "IADB", offset: startOffset };
    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed", result, completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }

    await recordAgentEvent(supabase, "iadb-ingest", "completed", "IADB ingest wrote source-first candidates", taskId, result);
    if (runStartedAt) await finishAgentRun(supabase, "iadb-ingest", "completed", runStartedAt);
    console.log(`IADB ingest complete: fetched=${fetched} candidates=${candidatesWritten} updated_candidates=${candidatesUpdated} update_proposals=${updatesProposed} skipped=${skipped}`);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("IADB ingest error:", e);
    if (taskId && supabase) {
      try {
        await supabase.from("research_tasks").update({
          status: "failed", error: e instanceof Error ? e.message : "Unknown error",
          completed_at: new Date().toISOString(),
        }).eq("id", taskId);
        await recordAgentEvent(supabase, "iadb-ingest", "failed", e instanceof Error ? e.message : "Unknown error", taskId);
        if (runStartedAt) await finishAgentRun(supabase, "iadb-ingest", "failed", runStartedAt);
      } catch { /* best-effort */ }
    }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
