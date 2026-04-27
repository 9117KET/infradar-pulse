/**
 * adb-ingest-agent
 *
 * Ingests Asian Development Bank (ADB) infrastructure projects.
 * Uses the ADB open data portal (CKAN) to discover available datasets,
 * then downloads the CSV of sovereign/infrastructure projects.
 *
 * Primary dataset: ADB Sovereign Operations Project List
 * Portal: https://data.adb.org  (CKAN-based, no key required)
 *
 * Accepted body params:
 *   limit   - max projects to ingest (default: 300)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { isAgentEnabled, pausedResponse, beginAgentTask, alreadyRunningResponse } from "../_shared/agentGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ADB uses a region system — map to InfraRadar regions
function mapAdbRegion(adbRegion: string, country: string): string {
  const r = (adbRegion || "").toLowerCase();
  const c = (country || "").toLowerCase();
  if (r.includes("central and west asia") || r.includes("central asia")) {
    const central = ["kazakhstan", "uzbekistan", "kyrgyz", "tajikistan", "turkmenistan", "afghanistan", "azerbaijan", "armenia", "georgia"];
    if (central.some((x) => c.includes(x))) return "Central Asia";
    return "MENA";
  }
  if (r.includes("east asia")) return "East Asia";
  if (r.includes("pacific")) return "Oceania";
  if (r.includes("south asia")) return "South Asia";
  if (r.includes("southeast asia")) return "Southeast Asia";
  // Fallback by country
  const southeast = ["vietnam", "indonesia", "philippines", "thailand", "malaysia", "cambodia", "laos", "myanmar", "timor"];
  if (southeast.some((x) => c.includes(x))) return "Southeast Asia";
  const south = ["india", "bangladesh", "pakistan", "sri lanka", "nepal", "bhutan", "maldives"];
  if (south.some((x) => c.includes(x))) return "South Asia";
  const east = ["china", "mongolia", "korea"];
  if (east.some((x) => c.includes(x))) return "East Asia";
  return "South Asia";
}

function mapAdbSector(sector: string): string {
  const s = (sector || "").toLowerCase();
  if (s.includes("transport") || s.includes("road") || s.includes("rail") || s.includes("port") || s.includes("urban transport")) return "Transport";
  if (s.includes("energy") || s.includes("power") || s.includes("electricity")) return "Energy";
  if (s.includes("renewable") || s.includes("solar") || s.includes("wind") || s.includes("hydropower")) return "Renewable Energy";
  if (s.includes("water") || s.includes("sanitation") || s.includes("irrigation") || s.includes("flood")) return "Water";
  if (s.includes("urban") || s.includes("city") || s.includes("housing") || s.includes("municipal")) return "Urban Development";
  if (s.includes("information") || s.includes("telecom") || s.includes("ict") || s.includes("digital")) return "Digital Infrastructure";
  if (s.includes("industry") || s.includes("trade") || s.includes("manufacturing")) return "Industrial";
  if (s.includes("mining") || s.includes("natural resources") || s.includes("extractive")) return "Mining";
  return "Infrastructure";
}

function mapAdbStatus(status: string): { stage: string; infraStatus: string } {
  const s = (status || "").toLowerCase();
  if (s.includes("active") || s.includes("ongoing") || s.includes("implementation")) return { stage: "Construction", infraStatus: "Verified" };
  if (s.includes("proposed") || s.includes("pipeline") || s.includes("concept")) return { stage: "Planned", infraStatus: "Pending" };
  if (s.includes("approved") || s.includes("loan") || s.includes("grant")) return { stage: "Financing", infraStatus: "Verified" };
  if (s.includes("closed") || s.includes("completed") || s.includes("pcr")) return { stage: "Completed", infraStatus: "Stable" };
  return { stage: "Construction", infraStatus: "Pending" };
}

const ADB_COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  "india": [20.59, 78.96], "indonesia": [-0.79, 113.92], "vietnam": [14.06, 108.28],
  "philippines": [12.88, 121.77], "thailand": [15.87, 100.99], "bangladesh": [23.68, 90.36],
  "pakistan": [30.38, 69.35], "china": [35.86, 104.20], "mongolia": [46.86, 103.85],
  "cambodia": [12.57, 104.99], "myanmar": [21.91, 95.96], "laos": [19.86, 102.50],
  "nepal": [28.39, 84.12], "sri lanka": [7.87, 80.77], "bhutan": [27.51, 90.43],
  "maldives": [3.20, 73.22], "papua new guinea": [-6.31, 143.96], "fiji": [-17.71, 178.07],
  "timor-leste": [-8.87, 125.73], "kazakhstan": [48.02, 66.92], "uzbekistan": [41.38, 64.59],
  "kyrgyz republic": [41.20, 74.77], "kyrgyzstan": [41.20, 74.77], "tajikistan": [38.86, 71.28],
  "turkmenistan": [38.97, 59.56], "afghanistan": [33.94, 67.71], "azerbaijan": [40.14, 47.58],
  "georgia": [42.32, 43.36], "armenia": [40.07, 45.04], "malaysia": [4.21, 101.98],
};

function getAdbCentroid(country: string): [number, number] {
  const key = country.toLowerCase().trim();
  if (ADB_COUNTRY_CENTROIDS[key]) return ADB_COUNTRY_CENTROIDS[key];
  for (const [k, v] of Object.entries(ADB_COUNTRY_CENTROIDS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return [10, 100]; // default to Southeast Asia region center
}

/** Simple CSV parser — handles quoted fields with embedded commas */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  const results: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    if (values.length < 2) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h.trim()] = (values[idx] || "").trim(); });
    results.push(row);
  }
  return results;
}

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  let taskId: string | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!await isAgentEnabled(supabase, "adb-ingest")) return pausedResponse("adb-ingest");

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body */ }
    const totalLimit: number = Math.min(Number(body.limit) || 300, 1000);

    const lock = await beginAgentTask(supabase, "adb-ingest", `ADB Projects Portal - limit:${totalLimit}`, gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("adb-ingest");
    taskId = lock.taskId;

    // Step 1: Discover available project datasets via CKAN package list
    console.log("Fetching ADB dataset catalog...");
    let csvUrl: string | null = null;

    try {
      // Try the well-known sovereign operations dataset first
      const packageRes = await fetch(
        "https://data.adb.org/api/3/action/package_show?id=adb-sovereign-operations",
        { headers: { "Accept": "application/json" } }
      );
      if (packageRes.ok) {
        const pkg = await packageRes.json();
        const resources = pkg?.result?.resources || [];
        // Find a CSV resource
        const csvResource = resources.find(
          (r: any) => (r.format || "").toUpperCase() === "CSV" || (r.url || "").endsWith(".csv")
        );
        if (csvResource?.url) csvUrl = csvResource.url;
      }
    } catch (e) {
      console.error("CKAN package lookup failed:", e);
    }

    // Step 2: If CKAN didn't yield a URL, try a broader package search
    if (!csvUrl) {
      try {
        const searchRes = await fetch(
          "https://data.adb.org/api/3/action/package_search?q=infrastructure+projects&rows=10",
          { headers: { "Accept": "application/json" } }
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const packages = searchData?.result?.results || [];
          for (const pkg of packages) {
            const csvResource = (pkg.resources || []).find(
              (r: any) => (r.format || "").toUpperCase() === "CSV" || (r.url || "").endsWith(".csv")
            );
            if (csvResource?.url) { csvUrl = csvResource.url; break; }
          }
        }
      } catch (e) {
        console.error("CKAN search failed:", e);
      }
    }

    // Step 3: Try known direct ADB CSV download paths when CKAN discovery fails
    if (!csvUrl) {
      const directUrls = [
        "https://www.adb.org/sites/default/files/institutional-document/838751/adb-sovereign-operations-projects.csv",
        "https://data.adb.org/dataset/adb-sovereign-operations/resource/adb-sovereign-operations.csv",
        "https://www.adb.org/sites/default/files/institutional-document/adb-operations-projects.csv",
        "https://data.adb.org/dataset/adb-sovereign-loan-disbursements/resource/adb-sovereign-operations.csv",
      ];
      for (const url of directUrls) {
        try {
          const probe = await fetch(url, { method: "HEAD" });
          if (probe.ok) { csvUrl = url; console.log(`ADB direct URL found: ${url}`); break; }
        } catch { /* try next */ }
      }
    }

    if (!csvUrl) {
      const result = { success: false, error: "Could not locate ADB CSV dataset. Check https://data.adb.org/dataset/adb-sovereign-operations for the current CSV URL and update directUrls in adb-ingest-agent." };
      if (taskId) {
        await supabase.from("research_tasks").update({
          status: "failed", error: result.error, completed_at: new Date().toISOString(),
        }).eq("id", taskId);
      }
      return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 3: Download and parse the CSV
    console.log(`Downloading ADB CSV: ${csvUrl}`);
    const csvRes = await fetch(csvUrl);
    if (!csvRes.ok) throw new Error(`CSV download failed: ${csvRes.status}`);

    const csvText = await csvRes.text();
    const rows = parseCsv(csvText);
    console.log(`Parsed ${rows.length} ADB project rows`);

    // Step 4: Upsert into projects table
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const processLimit = Math.min(rows.length, totalLimit);

    for (let i = 0; i < processLimit; i++) {
      const row = rows[i];
      try {
        // ADB CSV columns vary; try multiple possible column names
        const name = (
          row["Project Title"] || row["project_title"] || row["Project Name"] || row["project_name"] || ""
        ).trim();
        if (!name) { skipped++; continue; }

        const country = (row["Country"] || row["country"] || row["DMC"] || "").trim();
        const adbRegion = (row["Region"] || row["region"] || row["ADB Region"] || "").trim();
        const sectorRaw = (row["Sector"] || row["sector"] || row["Project Sector"] || "").trim();
        const statusRaw = (row["Project Status"] || row["project_status"] || row["Status"] || row["status"] || "").trim();
        const projectId = (row["Project Number"] || row["project_number"] || row["ID"] || row["id"] || "").trim();
        const totalCostStr = (row["Total Project Cost ($ million)"] || row["total_project_cost"] || row["Total Cost"] || row["Amount"] || "0").replace(/,/g, "");
        const approvalYear = (row["Approval Year"] || row["approval_year"] || row["Year of Approval"] || "").trim();
        const closingYear = (row["Closing Year"] || row["closing_year"] || row["Expected Completion"] || "").trim();

        const totalAmt = Math.round(parseFloat(totalCostStr || "0") * 1_000_000) || 0;

        const projectUrl = projectId
          ? `https://www.adb.org/projects/${projectId}/main`
          : "https://data.adb.org";

        const { stage, infraStatus } = mapAdbStatus(statusRaw);
        const sector = mapAdbSector(sectorRaw);
        const region = mapAdbRegion(adbRegion, country);
        const [lat, lng] = getAdbCentroid(country);

        let timeline = "";
        if (approvalYear && closingYear) timeline = `${approvalYear}–${closingYear}`;
        else if (approvalYear) timeline = `${approvalYear}–`;

        let valueLabel = "";
        if (totalAmt >= 1_000_000_000) valueLabel = `$${(totalAmt / 1_000_000_000).toFixed(1)}B`;
        else if (totalAmt >= 1_000_000) valueLabel = `$${(totalAmt / 1_000_000).toFixed(0)}M`;
        else valueLabel = "Value TBD";

        const confidence = infraStatus === "Verified" ? 82 : 65;
        const description = `ADB-financed ${sectorRaw || "infrastructure"} project in ${country}${approvalYear ? ` (approved ${approvalYear})` : ""}.`;
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

        const { data: existing } = await supabase!.from("projects").select("id, confidence, source_url").eq("slug", slug).maybeSingle();

        if (existing) {
          if (confidence > (existing.confidence || 0) || !existing.source_url) {
            await supabase!.from("projects").update({
              confidence: Math.max(confidence, existing.confidence || 0),
              stage, status: infraStatus,
              source_url: existing.source_url || projectUrl,
              last_updated: new Date().toISOString(),
            }).eq("id", existing.id);
            updated++;
          } else { skipped++; }
        } else {
          const { data: newProject } = await supabase!.from("projects").insert({
            slug, name, country, region, sector, stage, status: infraStatus,
            value_usd: totalAmt, value_label: valueLabel, confidence,
            risk_score: 38, lat, lng, description, timeline,
            source_url: projectUrl, ai_generated: false, approved: true,
          }).select().single();

          if (newProject) {
            await supabase!.from("evidence_sources").insert({
              project_id: newProject.id, source: "Asian Development Bank Data Portal",
              url: projectUrl, type: "Filing", verified: true,
              date: new Date().toISOString().split("T")[0], title: name,
              description: description.substring(0, 200),
            });
            await supabase!.from("alerts").insert({
              project_id: newProject.id, project_name: name, severity: "low",
              message: `ADB project ingested: ${name} (${country}) — ${valueLabel}`,
              category: "market", source_url: projectUrl,
            });
            inserted++;
          }
        }
      } catch (rowErr) {
        console.error(`Error processing ADB row ${i}:`, rowErr);
        skipped++;
      }
    }

    const result = { success: true, fetched: processLimit, inserted, updated, skipped, source: "ADB" };
    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed", result, completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }

    console.log(`ADB ingest complete: fetched=${processLimit} inserted=${inserted} updated=${updated} skipped=${skipped}`);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("ADB ingest error:", e);
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
