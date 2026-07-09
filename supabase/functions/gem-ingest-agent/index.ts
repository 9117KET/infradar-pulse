/**
 * gem-ingest-agent (redeploy nudge 2026-07-09)
 *
 * Ingests power infrastructure from Global Energy Monitor's Global Integrated
 * Power Tracker (GIPT) — coal, oil/gas, nuclear, hydro, wind, solar,
 * geothermal and bioenergy plants worldwide with EXACT per-facility
 * coordinates. Data is CC BY 4.0; attribution is recorded on the source and
 * every evidence row links to the plant's gem.wiki page.
 *
 * The dataset is a ~67 MB CSV on GEM's public CDN (the same file that powers
 * their official tracker map). Far too large for one edge invocation, so the
 * agent reads it in HTTP byte-range chunks and persists a byte-offset cursor
 * in ingest_cursors — hourly backfill cron runs walk the whole file, then roll
 * over when a new release URL appears (the cursor is keyed by file name).
 *
 * Rows are per unit/phase; consecutive rows for the same plant are aggregated
 * into one project (summed capacity, best status, earliest start year).
 *
 * Accepted body params:
 *   mode        - "backfill" resumes from the persisted byte cursor
 *   offset      - explicit byte offset (non-backfill runs; default 0)
 *   limit       - max plants to stage per run   (default 150, max 300)
 *   chunk_bytes - bytes to read per run         (default 786432, max 2 MB)
 *   min_mw      - min aggregated capacity in MW (default 50)
 *   file_url    - override the CSV URL (otherwise discovered from GEM's map config)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { isAgentEnabled, pausedResponse, beginAgentTask, alreadyRunningResponse, finishAgentRun, recordAgentEvent } from "../_shared/agentGate.ts";
import { registerPipelineSource, stagePipelineProject, slugifyProjectName } from "../_shared/pipelineIngest.ts";
import { jitterCentroid, resolveCountryCoords } from "../_shared/countryCentroids.ts";
import { getIngestCursor, saveIngestCursor } from "../_shared/ingestCursor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEM_MAP_CONFIG_URL = "https://globalenergymonitor.github.io/maps/trackers/integrated/config.js";
// Fallback if config discovery fails (verified 2026-07).
const GEM_FALLBACK_CSV = "https://publicgemdata.nyc3.cdn.digitaloceanspaces.com/Integrated/2026-04/gipt-data-2026-03-27.csv";
const GEM_ATTRIBUTION = "Global Energy Monitor, Global Integrated Power Tracker (CC BY 4.0)";

// Statuses we publish; retired/cancelled/shelved/mothballed are skipped.
const INCLUDED_STATUSES = new Set(["operating", "construction", "pre-construction", "announced"]);
// Higher = wins when picking the plant-level status from its units.
const STATUS_PRIORITY: Record<string, number> = { construction: 4, "pre-construction": 3, announced: 2, operating: 1 };

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function mapGemSector(type: string): string {
  const t = (type || "").toLowerCase();
  if (t.includes("solar") || t.includes("wind") || t.includes("hydro") || t.includes("geothermal") || t.includes("bioenergy")) return "Renewable Energy";
  if (t.includes("oil") || t.includes("gas")) return "Oil & Gas";
  return "Energy"; // coal, nuclear, other thermal
}

function mapGemStage(status: string): { stage: string; infraStatus: string; confidence: number } {
  switch (status) {
    case "construction": return { stage: "Construction", infraStatus: "Verified", confidence: 88 };
    case "pre-construction": return { stage: "Financing", infraStatus: "Verified", confidence: 75 };
    case "announced": return { stage: "Planned", infraStatus: "Pending", confidence: 68 };
    default: return { stage: "Completed", infraStatus: "Stable", confidence: 85 }; // operating
  }
}

function mapGemRegion(subregion: string, country: string): string {
  const s = (subregion || "").toLowerCase();
  const c = (country || "").toLowerCase();
  if (s.includes("northern africa") || s.includes("western asia")) return "MENA";
  if (s.includes("sub-saharan")) {
    const west = ["nigeria", "ghana", "senegal", "côte d'ivoire", "ivory coast", "cameroon", "mali", "burkina", "guinea", "sierra leone", "liberia", "togo", "benin", "niger", "gambia", "mauritania"];
    const southern = ["south africa", "namibia", "botswana", "angola", "lesotho", "eswatini", "zimbabwe", "zambia", "malawi", "mozambique"];
    const central = ["congo", "central african", "chad", "gabon", "equatorial guinea"];
    if (west.some((x) => c.includes(x))) return "West Africa";
    if (southern.some((x) => c.includes(x))) return "Southern Africa";
    if (central.some((x) => c.includes(x))) return "Central Africa";
    return "East Africa";
  }
  if (s.includes("southern asia")) return "South Asia";
  if (s.includes("south-eastern asia")) return "Southeast Asia";
  if (s.includes("eastern asia")) return "East Asia";
  if (s.includes("central asia")) return "Central Asia";
  if (s.includes("europe")) return "Europe";
  if (s.includes("northern america")) return "North America";
  if (s.includes("latin america") || s.includes("caribbean")) {
    const caribbean = ["haiti", "jamaica", "dominican", "trinidad", "barbados", "bahamas", "antigua", "belize", "guyana", "suriname", "cuba", "grenada", "lucia", "dominica"];
    if (caribbean.some((x) => c.includes(x))) return "Caribbean";
    if (c.includes("mexico")) return "North America";
    return "South America";
  }
  if (s.includes("oceania") || s.includes("australia") || s.includes("melanesia") || s.includes("polynesia") || s.includes("micronesia")) return "Oceania";
  return "South Asia";
}

interface GemUnit {
  name: string;
  country: string;
  subregion: string;
  type: string;
  status: string;
  capacityMw: number;
  startYear: string;
  owner: string;
  lat: number | null;
  lng: number | null;
  locationAccuracy: string;
  locationId: string;
  url: string;
}

interface GemPlant {
  name: string;
  country: string;
  units: GemUnit[];
  startByteOffset: number;
}

async function discoverCsvUrl(): Promise<string> {
  try {
    const res = await fetch(GEM_MAP_CONFIG_URL, { headers: { "User-Agent": "Mozilla/5.0 InfraRadarBot/1.0" } });
    if (res.ok) {
      const text = await res.text();
      const match = text.match(/csv:\s*['"]([^'"]+\.csv)['"]/);
      if (match) return match[1];
    }
  } catch (e) {
    console.error("GEM config discovery failed:", e instanceof Error ? e.message : e);
  }
  return GEM_FALLBACK_CSV;
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

    if (!await isAgentEnabled(supabase, "gem-ingest")) return pausedResponse("gem-ingest");

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body */ }

    const plantLimit = Math.min(Math.max(Number(body.limit) || 150, 1), 300);
    const chunkBytes = Math.min(Math.max(Number(body.chunk_bytes) || 786_432, 65_536), 2_097_152);
    const minMw = Math.max(Number(body.min_mw) || 50, 0);
    const backfill = body.mode === "backfill";

    const csvUrl = typeof body.file_url === "string" && body.file_url.startsWith("http")
      ? body.file_url
      : await discoverCsvUrl();
    const fileName = csvUrl.split("/").pop() || "gipt.csv";
    const cursorKey = `gem-ingest:${fileName}`;

    let pos = Math.max(Number(body.offset) || 0, 0);
    if (backfill) {
      const cursor = await getIngestCursor(supabase, cursorKey);
      pos = cursor.nextOffset;
    }

    const lock = await beginAgentTask(supabase, "gem-ingest", `GEM Integrated Power Tracker — ${fileName} @ byte ${pos}${backfill ? " (backfill)" : ""}`, gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("gem-ingest");
    taskId = lock.taskId;
    runStartedAt = new Date();

    const sourceRow = await registerPipelineSource(supabase, {
      sourceKey: "gem-integrated-power",
      name: GEM_ATTRIBUTION,
      kind: "research",
      baseUrl: "https://globalenergymonitor.org/projects/global-integrated-power-tracker/",
      reliabilityScore: 93,
      crawlFrequencyMinutes: 10080,
      supportsApi: true,
    });

    // --- Header: always parse from the top of the file (cheap 16 KB range) ---
    const headRes = await fetch(csvUrl, { headers: { Range: "bytes=0-16383" } });
    if (!headRes.ok && headRes.status !== 206) throw new Error(`GEM CSV head fetch failed: ${headRes.status}`);
    const headText = await headRes.text();
    const headerLine = headText.slice(0, headText.indexOf("\n"));
    const headers = splitCsvLine(headerLine).map((h) => h.trim());
    const col = (name: string) => headers.indexOf(name);
    const IDX = {
      type: col("type"), country: col("country/area"), subregion: col("subregion"),
      name: col("plant-/-project-name"), unit: col("unit-/-phase-name"),
      capacity: col("capacity-(mw)"), status: col("status"), startYear: col("start-year"),
      owner: col("owner(s)"), lat: col("lat"), lng: col("lng"),
      locAccuracy: col("location-accuracy"), locationId: col("gem-location-id"), url: col("url"),
    };
    if (IDX.name === -1 || IDX.status === -1 || IDX.lat === -1) {
      throw new Error(`GEM CSV format changed — missing expected columns in: ${headerLine.slice(0, 300)}`);
    }
    const headerBytes = new TextEncoder().encode(headerLine).length + 1;
    if (pos === 0) pos = headerBytes;

    // --- Read one chunk from the cursor position ---
    const rangeRes = await fetch(csvUrl, { headers: { Range: `bytes=${pos}-${pos + chunkBytes - 1}` } });
    if (!rangeRes.ok && rangeRes.status !== 206) throw new Error(`GEM CSV range fetch failed: ${rangeRes.status}`);
    const contentRange = rangeRes.headers.get("content-range") || "";
    const fileSize = Number(contentRange.split("/")[1]) || 0;
    const chunkBuf = new Uint8Array(await rangeRes.arrayBuffer());
    const atEof = fileSize > 0 && pos + chunkBuf.length >= fileSize;

    // Decode and split into lines, tracking the byte offset of each line so the
    // cursor can be advanced to the exact start of the first unprocessed plant.
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const chunkText = decoder.decode(chunkBuf);
    const rawLines = chunkText.split("\n");
    // The final element is a partial line unless we hit EOF.
    const completeLines = atEof ? rawLines : rawLines.slice(0, -1);

    let lineOffset = pos;
    const units: GemUnit[] = [];
    const unitOffsets: number[] = [];
    for (const line of completeLines) {
      const lineBytes = encoder.encode(line).length + 1;
      const trimmed = line.replace(/\r$/, "");
      if (trimmed) {
        const cells = splitCsvLine(trimmed);
        if (cells.length >= headers.length - 5) {
          const latNum = Number(cells[IDX.lat]);
          const lngNum = Number(cells[IDX.lng]);
          units.push({
            name: (cells[IDX.name] || "").trim(),
            country: (cells[IDX.country] || "").split(";")[0].trim(),
            subregion: (cells[IDX.subregion] || "").trim(),
            type: (cells[IDX.type] || "").trim(),
            status: (cells[IDX.status] || "").trim().toLowerCase(),
            capacityMw: Number(cells[IDX.capacity]) || 0,
            startYear: (cells[IDX.startYear] || "").trim(),
            owner: (cells[IDX.owner] || "").split(";")[0].replace(/\[[^\]]*\]/g, "").trim(),
            lat: Number.isFinite(latNum) && (latNum !== 0 || lngNum !== 0) ? latNum : null,
            lng: Number.isFinite(lngNum) && (latNum !== 0 || lngNum !== 0) ? lngNum : null,
            locationAccuracy: (cells[IDX.locAccuracy] || "").trim().toLowerCase(),
            locationId: (cells[IDX.locationId] || "").trim(),
            url: (cells[IDX.url] || "").trim(),
          });
          unitOffsets.push(lineOffset);
        }
      }
      lineOffset += lineBytes;
    }
    const chunkEndOffset = lineOffset;

    // --- Group consecutive units into plants ---
    const plants: GemPlant[] = [];
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.name) continue;
      const last = plants[plants.length - 1];
      if (last && last.name === u.name && last.country === u.country) {
        last.units.push(u);
      } else {
        plants.push({ name: u.name, country: u.country, units: [u], startByteOffset: unitOffsets[i] });
      }
    }
    // Unless at EOF, the last group may continue into the next chunk — defer it.
    const processablePlants = atEof ? plants : plants.slice(0, -1);

    let autoPublished = 0;
    let candidatesWritten = 0;
    let candidatesUpdated = 0;
    let updatesProposed = 0;
    let skipped = 0;
    let staged = 0;
    let nextPos = atEof ? chunkEndOffset : (plants.length > 0 ? plants[plants.length - 1].startByteOffset : chunkEndOffset);

    // Byte offset the cursor may advance to once plant i is fully handled
    // (staged, skipped, or failed) — the start of the next group.
    const advanceTarget = (i: number) =>
      i + 1 < processablePlants.length
        ? processablePlants[i + 1].startByteOffset
        : (atEof ? chunkEndOffset : plants[plants.length - 1].startByteOffset);

    for (let i = 0; i < processablePlants.length; i++) {
      const plant = processablePlants[i];
      if (staged >= plantLimit) {
        nextPos = plant.startByteOffset;
        break;
      }
      try {
        const activeUnits = plant.units.filter((u) => INCLUDED_STATUSES.has(u.status));
        if (activeUnits.length === 0) { skipped++; nextPos = advanceTarget(i); continue; }
        const capacity = activeUnits.reduce((s, u) => s + u.capacityMw, 0);
        if (capacity < minMw) { skipped++; nextPos = advanceTarget(i); continue; }

        const bestStatus = activeUnits.reduce((best, u) =>
          (STATUS_PRIORITY[u.status] || 0) > (STATUS_PRIORITY[best] || 0) ? u.status : best, activeUnits[0].status);
        const { stage, infraStatus, confidence } = mapGemStage(bestStatus);
        const first = activeUnits[0];
        const sector = mapGemSector(first.type);
        const region = mapGemRegion(first.subregion, plant.country);
        const slug = slugifyProjectName(plant.name);

        // Exact facility coordinates when GEM has them; jitter approximate
        // ones slightly; fall back to country centroid.
        let lat = first.lat, lng = first.lng;
        let precision: "exact" | "country" | null = "exact";
        if (lat == null || lng == null) {
          const cc = resolveCountryCoords(plant.country, slug);
          lat = cc.lat; lng = cc.lng; precision = cc.precision;
        } else if (first.locationAccuracy && first.locationAccuracy !== "exact") {
          [lat, lng] = jitterCentroid(lat, lng, slug);
        }

        const startYears = activeUnits.map((u) => Number(u.startYear)).filter((y) => y > 1900);
        const startYear = startYears.length ? Math.min(...startYears) : null;
        const capLabel = capacity >= 1000 ? `${(capacity / 1000).toFixed(1)} GW` : `${Math.round(capacity)} MW`;
        const statusLabel = bestStatus === "operating" ? "operating" : bestStatus.replace("-", " ");
        const description = `${capLabel} ${first.type} power project (${statusLabel}) in ${plant.country}${first.owner ? `, developed by ${first.owner}` : ""}. Facility-level data with exact coordinates from the ${GEM_ATTRIBUTION}.`;
        const sourceUrl = first.url && first.url.startsWith("http")
          ? first.url
          : `https://globalenergymonitor.org/projects/global-integrated-power-tracker/`;

        const result = await stagePipelineProject(supabase!, {
          sourceId: sourceRow?.id ?? null,
          sourceKey: "gem-integrated-power",
          sourceName: GEM_ATTRIBUTION,
          discoveredBy: "gem-ingest",
          externalId: first.locationId || null,
          apiUrl: csvUrl,
          name: plant.name,
          country: plant.country,
          region, sector, stage,
          status: infraStatus,
          valueUsd: 0, // GEM does not publish costs — capacity shown instead
          valueLabel: capLabel,
          confidence,
          riskScore: 35,
          lat, lng,
          coordPrecision: precision,
          description,
          timeline: startYear ? `${startYear}–` : "",
          sourceUrl,
          publishedAt: null,
          rawPayload: { plant: plant.name, country: plant.country, units: plant.units.length, capacity_mw: capacity, status: bestStatus, type: first.type, gem_location_id: first.locationId },
          extractedClaims: {
            gem_location_id: first.locationId || null,
            capacity_mw: capacity,
            technology: first.type,
            license: "CC BY 4.0",
            attribution: GEM_ATTRIBUTION,
          },
          stakeholder: first.owner || null,
          autoPublish: true,
        });
        staged++;
        if (result.outcome === "auto_published") autoPublished++;
        else if (result.outcome === "candidate_created") candidatesWritten++;
        else if (result.outcome === "candidate_updated") candidatesUpdated++;
        else if (result.outcome === "update_proposed") updatesProposed++;
        else skipped++;

        // Cursor safe-point: everything up to and including this plant is done.
        nextPos = advanceTarget(i);
      } catch (plantErr) {
        // Advance past poison plants too, or the backfill cursor would stall on them.
        console.error(`Error staging GEM plant ${plant.name}:`, plantErr);
        skipped++;
        nextPos = advanceTarget(i);
      }
    }

    const exhausted = atEof && nextPos >= chunkEndOffset;
    if (backfill) {
      await saveIngestCursor(supabase, cursorKey, { nextOffset: nextPos, exhausted });
    }

    const result = {
      success: true,
      file: fileName,
      file_size: fileSize,
      byte_range: `${pos}-${chunkEndOffset}`,
      next_offset: exhausted ? 0 : nextPos,
      exhausted,
      units_parsed: units.length,
      plants_grouped: plants.length,
      plants_staged: staged,
      auto_published: autoPublished,
      candidates_created: candidatesWritten,
      candidates_updated: candidatesUpdated,
      update_proposals_created: updatesProposed,
      skipped,
      source: "GEM",
      mode: backfill ? "backfill" : "standard",
    };

    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed", result, completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }
    await recordAgentEvent(supabase, "gem-ingest", "completed", "GEM Integrated Power Tracker ingest", taskId, result);
    if (runStartedAt) await finishAgentRun(supabase, "gem-ingest", "completed", runStartedAt);

    console.log(`GEM ingest complete: units=${units.length} plants=${plants.length} staged=${staged} auto_published=${autoPublished} next=${nextPos}${exhausted ? " (exhausted)" : ""}`);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("GEM ingest error:", e);
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    if (taskId && supabase) {
      try {
        await supabase.from("research_tasks").update({
          status: "failed", error: errMsg, completed_at: new Date().toISOString(),
        }).eq("id", taskId);
        await recordAgentEvent(supabase, "gem-ingest", "failed", errMsg, taskId);
        if (runStartedAt) await finishAgentRun(supabase, "gem-ingest", "failed", runStartedAt);
      } catch { /* best-effort */ }
    }
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
