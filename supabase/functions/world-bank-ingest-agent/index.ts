/**
 * world-bank-ingest-agent
 *
 * Queries the World Bank Projects API (free, no API key required) and ingests
 * infrastructure projects directly into the InfraRadar projects table.
 *
 * API docs: https://search.worldbank.org/api/v2/projects
 *
 * Accepts optional body params:
 *   status   - "Active" | "Pipeline" | "Closed"  (default: "Active,Pipeline")
 *   limit    - total projects to fetch            (default: 200)
 *   offset   - pagination offset                  (default: 0)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { isAgentEnabled, pausedResponse } from "../_shared/agentGate.ts";

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
  if (s === "closed") {
    // Closed but within last 2 years = Completed
    if (closingDate) {
      const closed = new Date(closingDate);
      if (!isNaN(closed.getTime()) && closed.getFullYear() >= new Date().getFullYear() - 2) return "Completed";
    }
    return "Completed";
  }
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

/** Country name → approximate centroid [lat, lng] */
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  "nigeria": [9.08, 8.68], "kenya": [-0.02, 37.91], "ethiopia": [9.14, 40.49],
  "tanzania": [-6.37, 34.89], "ghana": [7.95, -1.02], "south africa": [-30.56, 22.94],
  "egypt": [26.82, 30.80], "morocco": [31.79, -7.09], "algeria": [28.03, 1.66],
  "saudi arabia": [23.89, 45.08], "uae": [23.42, 53.85], "qatar": [25.35, 51.18],
  "iraq": [33.22, 43.68], "iran": [32.43, 53.69], "pakistan": [30.38, 69.35],
  "india": [20.59, 78.96], "bangladesh": [23.68, 90.36], "indonesia": [-0.79, 113.92],
  "vietnam": [14.06, 108.28], "philippines": [12.88, 121.77], "thailand": [15.87, 100.99],
  "malaysia": [4.21, 101.98], "china": [35.86, 104.20], "cambodia": [12.57, 104.99],
  "myanmar": [21.91, 95.96], "laos": [19.86, 102.50], "mongolia": [46.86, 103.85],
  "kazakhstan": [48.02, 66.92], "uzbekistan": [41.38, 64.59], "kyrgyz republic": [41.20, 74.77],
  "tajikistan": [38.86, 71.28], "turkmenistan": [38.97, 59.56], "georgia": [42.32, 43.36],
  "armenia": [40.07, 45.04], "azerbaijan": [40.14, 47.58], "ukraine": [48.38, 31.17],
  "turkey": [38.96, 35.24], "poland": [51.92, 19.15], "romania": [45.94, 24.97],
  "brazil": [-14.24, -51.93], "mexico": [23.63, -102.55], "colombia": [4.57, -74.30],
  "peru": [-9.19, -75.02], "chile": [-35.68, -71.54], "argentina": [-38.42, -63.62],
  "ecuador": [-1.83, -78.18], "bolivia": [-16.29, -63.59], "paraguay": [-23.44, -58.44],
  "uruguay": [-32.52, -55.77], "venezuela": [6.42, -66.59],
  "united states": [37.09, -95.71], "canada": [56.13, -106.35],
  "haiti": [18.97, -72.29], "dominican republic": [18.74, -70.16],
  "jamaica": [18.11, -77.30], "trinidad and tobago": [10.69, -61.22],
  "senegal": [14.50, -14.45], "mali": [17.57, -4.00], "cameroon": [7.37, 12.35],
  "zambia": [-13.13, 27.85], "mozambique": [-18.67, 35.53], "angola": [-11.20, 17.87],
  "zimbabwe": [-19.02, 29.15], "rwanda": [-1.94, 29.87], "uganda": [1.37, 32.29],
  "malawi": [-13.25, 34.30], "madagascar": [-18.77, 46.87],
  "dr congo": [-4.04, 21.76], "congo": [-0.23, 15.83],
  "burkina faso": [12.36, -1.56], "niger": [17.61, 8.08], "chad": [15.45, 18.73],
  "guinea": [11.80, -15.18], "sierra leone": [8.46, -11.78],
  "côte d'ivoire": [7.54, -5.55], "ivory coast": [7.54, -5.55],
  "papua new guinea": [-6.31, 143.96], "fiji": [-17.71, 178.07],
};

function getCountryCentroid(country: string): [number, number] {
  const key = country.toLowerCase().trim();
  if (COUNTRY_CENTROIDS[key]) return COUNTRY_CENTROIDS[key];
  // Try partial match
  for (const [k, v] of Object.entries(COUNTRY_CENTROIDS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return [0, 0]; // fallback to null island
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  let task: { id: string } | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;

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
    const totalLimit: number = Math.min(Number(body.limit) || 200, 500);
    const startOffset: number = Number(body.offset) || 0;

    const { data: taskData } = await supabase
      .from("research_tasks")
      .insert({
        task_type: "world-bank-ingest",
        query: `World Bank Projects API — status:${statusFilter} limit:${totalLimit}`,
        status: "running",
        requested_by: gate.userId,
      })
      .select()
      .single();
    task = taskData;

    // Infrastructure-relevant World Bank sector codes
    // TX=Transport, YA=Energy & Mining, WS=Water, TU=Urban Dev, TC=ICT, YB=Industry & Trade
    // YZ=Mining, LZ=General Infra, JA=Other
    const SECTOR_CODES = "TX,YA,WS,TU,TC,YB,YZ,JA,LZ";

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let fetched = 0;
    const pageSize = 100;
    const statuses = statusFilter.split(",").map((s) => s.trim());

    for (const status of statuses) {
      let offset = startOffset;
      const perStatusLimit = Math.ceil(totalLimit / statuses.length);
      let statusFetched = 0;

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

        if (projectList.length === 0) break; // no more results

        fetched += projectList.length;
        statusFetched += projectList.length;

        for (const p of projectList) {
          try {
            const name: string = (p.projectname || p.project_name || "").trim();
            if (!name) { skipped++; continue; }

            const country: string = (p.countryname || p.country_namecode?.split(";")[0] || "").trim();
            const wbRegion: string = p.regionname || p.region_namecode?.split(";")[0] || "";
            const wbSector: string = p.sector1?.Name || p.sectorname || "";
            const wbStatus: string = p.status || "Active";
            const closingDate: string = p.closingdate || p.expectedclosingdate || "";
            const approvalDate: string = p.boardapprovaldate || p.approvaldate || "";

            const totalAmt: number = Number(p.totalamt) || Number(p.curr_total_commitment) || 0;

            const description: string =
              (p.project_abstract?.cdata || p.project_abstract || p.grantamt_label || "").toString().slice(0, 500).trim() ||
              `${wbSector} infrastructure project in ${country} financed by the World Bank.`;

            const projectUrl: string = p.url || `https://projects.worldbank.org/en/projects-operations/project-detail/${p.id}`;

            const sector = mapSector(wbSector);
            const region = mapRegion(wbRegion, country);
            const stage = mapStage(wbStatus, closingDate);
            const infraStatus = mapStatus(wbStatus);
            const [lat, lng] = getCountryCentroid(country);

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

            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

            // Check for existing project
            const { data: existing } = await supabase!
              .from("projects")
              .select("id, confidence, source_url")
              .eq("slug", slug)
              .maybeSingle();

            if (existing) {
              // Update if World Bank confidence is higher or source URL was missing
              const missingSource = !existing.source_url;
              if (confidence > (existing.confidence || 0) || missingSource) {
                await supabase!.from("projects").update({
                  confidence: Math.max(confidence, existing.confidence || 0),
                  stage,
                  status: infraStatus,
                  source_url: existing.source_url || projectUrl,
                  last_updated: new Date().toISOString(),
                }).eq("id", existing.id);
                updated++;
              } else {
                skipped++;
              }
            } else {
              // Insert new project
              const { data: newProject } = await supabase!
                .from("projects")
                .insert({
                  slug,
                  name,
                  country,
                  region,
                  sector,
                  stage,
                  status: infraStatus,
                  value_usd: totalAmt,
                  value_label: valueLabel,
                  confidence,
                  risk_score: 40, // baseline; risk-scorer will refine
                  lat,
                  lng,
                  description,
                  timeline,
                  source_url: projectUrl,
                  ai_generated: false, // this is real primary source data
                  approved: false,
                })
                .select()
                .single();

              if (newProject) {
                // Add World Bank as evidence source
                await supabase!.from("evidence_sources").insert({
                  project_id: newProject.id,
                  source: "World Bank Projects Database",
                  url: projectUrl,
                  type: "Filing",
                  verified: true, // World Bank data is authoritative
                  date: new Date().toISOString().split("T")[0],
                  title: name,
                  description: description.substring(0, 200),
                });

                // Add borrower as stakeholder if available
                if (p.borrower) {
                  await supabase!.from("project_stakeholders").insert({
                    project_id: newProject.id,
                    name: String(p.borrower).trim(),
                  });
                }
                if (p.impagency) {
                  await supabase!.from("project_stakeholders").insert({
                    project_id: newProject.id,
                    name: String(p.impagency).trim(),
                  });
                }

                // Create discovery alert
                await supabase!.from("alerts").insert({
                  project_id: newProject.id,
                  project_name: name,
                  severity: "low",
                  message: `World Bank project ingested: ${name} (${country}) — ${valueLabel}`,
                  category: "market",
                  source_url: projectUrl,
                });

                inserted++;
              }
            }
          } catch (projectErr) {
            console.error(`Error processing project ${p.id}:`, projectErr);
            skipped++;
          }
        }

        // If we got fewer results than requested, we've hit the end
        if (projectList.length < rows) break;
        offset += rows;
      }
    }

    const result = { success: true, fetched, inserted, updated, skipped, status_filter: statusFilter };

    if (task) {
      await supabase.from("research_tasks").update({
        status: "completed",
        result,
        completed_at: new Date().toISOString(),
      }).eq("id", task.id);
    }

    console.log(`World Bank ingest complete: fetched=${fetched} inserted=${inserted} updated=${updated} skipped=${skipped}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("World Bank ingest agent error:", e);
    if (task && supabase) {
      try {
        await supabase.from("research_tasks").update({
          status: "failed",
          error: e instanceof Error ? e.message : "Unknown error",
          completed_at: new Date().toISOString(),
        }).eq("id", task.id);
      } catch { /* best-effort */ }
    }
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
