/**
 * ifc-ingest-agent
 *
 * Ingests IFC (International Finance Corporation) infrastructure projects
 * using the same World Bank Projects API as world-bank-ingest-agent,
 * filtered to source=IF (IFC-financed projects).
 *
 * IFC finances private sector infrastructure — this complements the World Bank
 * (public sector) data and gives access to private investment flows.
 *
 * API: https://search.worldbank.org/api/v2/projects?source=IF
 * No API key required.
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

// Reuse the same helpers as world-bank-ingest-agent (inlined for standalone deployment)
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

function mapRegion(wbRegion: string, country: string): string {
  const r = (wbRegion || "").toLowerCase();
  const c = (country || "").toLowerCase();
  if (r.includes("middle east") || r.includes("north africa") || r.includes("mena")) return "MENA";
  if (r.includes("africa")) {
    const east = ["kenya", "ethiopia", "tanzania", "uganda", "rwanda", "mozambique", "zambia", "malawi", "zimbabwe", "madagascar", "somalia"];
    const west = ["nigeria", "ghana", "senegal", "côte d'ivoire", "ivory coast", "cameroon", "mali", "burkina faso", "guinea", "sierra leone", "liberia", "togo", "benin", "niger"];
    const southern = ["south africa", "namibia", "botswana", "angola", "lesotho", "eswatini"];
    const central = ["dr congo", "congo", "central african republic", "chad", "gabon", "equatorial guinea"];
    if (east.some((x) => c.includes(x))) return "East Africa";
    if (west.some((x) => c.includes(x))) return "West Africa";
    if (southern.some((x) => c.includes(x))) return "Southern Africa";
    if (central.some((x) => c.includes(x))) return "Central Africa";
    return "East Africa";
  }
  if (r.includes("east asia") || r.includes("pacific")) {
    const southeast = ["vietnam", "indonesia", "philippines", "thailand", "malaysia", "cambodia", "laos", "myanmar", "singapore", "timor"];
    if (southeast.some((x) => c.includes(x))) return "Southeast Asia";
    if (c.includes("pacific") || c.includes("papua") || c.includes("fiji") || c.includes("solomon")) return "Oceania";
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
  return "South Asia";
}

function mapStage(wbStatus: string, closingDate: string): string {
  const s = (wbStatus || "").toLowerCase();
  if (s === "pipeline") return "Planned";
  if (s === "closed") return "Completed";
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

const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  "nigeria": [9.08, 8.68], "kenya": [-0.02, 37.91], "ethiopia": [9.14, 40.49],
  "india": [20.59, 78.96], "indonesia": [-0.79, 113.92], "vietnam": [14.06, 108.28],
  "philippines": [12.88, 121.77], "thailand": [15.87, 100.99], "bangladesh": [23.68, 90.36],
  "pakistan": [30.38, 69.35], "egypt": [26.82, 30.80], "morocco": [31.79, -7.09],
  "saudi arabia": [23.89, 45.08], "uae": [23.42, 53.85], "turkey": [38.96, 35.24],
  "brazil": [-14.24, -51.93], "mexico": [23.63, -102.55], "colombia": [4.57, -74.30],
  "peru": [-9.19, -75.02], "chile": [-35.68, -71.54], "argentina": [-38.42, -63.62],
  "ghana": [7.95, -1.02], "tanzania": [-6.37, 34.89], "mozambique": [-18.67, 35.53],
  "zambia": [-13.13, 27.85], "south africa": [-30.56, 22.94], "uganda": [1.37, 32.29],
  "kazakhstan": [48.02, 66.92], "uzbekistan": [41.38, 64.59], "ukraine": [48.38, 31.17],
  "romania": [45.94, 24.97], "poland": [51.92, 19.15],
};

function getCountryCentroid(country: string): [number, number] {
  const key = country.toLowerCase().trim();
  if (COUNTRY_CENTROIDS[key]) return COUNTRY_CENTROIDS[key];
  for (const [k, v] of Object.entries(COUNTRY_CENTROIDS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return [0, 0];
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

    if (!await isAgentEnabled(supabase, "ifc-ingest")) return pausedResponse("ifc-ingest");

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body */ }

    const statusFilter: string = (body.status as string) || "Active,Pipeline";
    const totalLimit: number = Math.min(Number(body.limit) || 200, 500);

    const lock = await beginAgentTask(supabase, "ifc-ingest", `IFC Projects API - status:${statusFilter} limit:${totalLimit}`, gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("ifc-ingest");
    taskId = lock.taskId;

    // IFC-financed projects via World Bank API (source=IF)
    const SECTOR_CODES = "TX,YA,WS,TU,TC,YB,YZ,JA,LZ";
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let fetched = 0;
    const pageSize = 100;
    const statuses = statusFilter.split(",").map((s) => s.trim());

    for (const status of statuses) {
      let offset = 0;
      const perStatusLimit = Math.ceil(totalLimit / statuses.length);
      let statusFetched = 0;

      while (statusFetched < perStatusLimit) {
        const rows = Math.min(pageSize, perStatusLimit - statusFetched);
        const apiUrl = new URL("https://search.worldbank.org/api/v2/projects");
        apiUrl.searchParams.set("format", "json");
        apiUrl.searchParams.set("source", "IF"); // IFC = source "IF"
        apiUrl.searchParams.set("rows", String(rows));
        apiUrl.searchParams.set("os", String(offset));
        apiUrl.searchParams.set("sectorcode_exact", SECTOR_CODES);
        apiUrl.searchParams.set("status_exact", status);
        apiUrl.searchParams.set("sort", "totalamt");
        apiUrl.searchParams.set("order", "desc");

        console.log(`Fetching IFC projects: status=${status} offset=${offset}`);
        const res = await fetch(apiUrl.toString(), { headers: { "Accept": "application/json" } });
        if (!res.ok) { console.error(`IFC API error: ${res.status}`); break; }

        const data = await res.json();
        const projectList = Object.values(data?.projects || {}).filter(
          (p: any) => p && typeof p === "object" && p.id
        );
        if (projectList.length === 0) break;

        fetched += projectList.length;
        statusFetched += projectList.length;

        for (const p of projectList as any[]) {
          try {
            const name: string = (p.projectname || "").trim();
            if (!name) { skipped++; continue; }

            const country: string = (p.countryname || "").trim();
            const wbSector: string = p.sector1?.Name || p.sectorname || "";
            const wbStatus: string = p.status || "Active";
            const closingDate: string = p.closingdate || "";
            const approvalDate: string = p.boardapprovaldate || "";
            const totalAmt: number = Number(p.totalamt) || 0;
            const description: string =
              (p.project_abstract?.cdata || p.project_abstract || "").toString().slice(0, 500).trim() ||
              `IFC-financed ${wbSector} project in ${country}.`;
            const projectUrl: string = p.url || `https://projects.worldbank.org/en/projects-operations/project-detail/${p.id}`;

            const sector = mapSector(wbSector);
            const region = mapRegion(p.regionname || "", country);
            const stage = mapStage(wbStatus, closingDate);
            const infraStatus = wbStatus === "Active" ? "Verified" : wbStatus === "Pipeline" ? "Pending" : "Stable";
            const [lat, lng] = getCountryCentroid(country);

            let timeline = "";
            if (approvalDate && closingDate) timeline = `${approvalDate.slice(0, 4)}–${closingDate.slice(0, 4)}`;
            else if (approvalDate) timeline = `${approvalDate.slice(0, 4)}–`;

            let valueLabel = "";
            if (totalAmt >= 1_000_000_000) valueLabel = `$${(totalAmt / 1_000_000_000).toFixed(1)}B`;
            else if (totalAmt >= 1_000_000) valueLabel = `$${(totalAmt / 1_000_000).toFixed(0)}M`;
            else valueLabel = "Value TBD";

            const confidence = wbStatus === "Active" ? 82 : 68;
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
                  project_id: newProject.id, source: "IFC Projects Database",
                  url: projectUrl, type: "Filing", verified: true,
                  date: new Date().toISOString().split("T")[0], title: name,
                  description: description.substring(0, 200),
                });
                if (p.borrower) {
                  await supabase!.from("project_stakeholders").insert({ project_id: newProject.id, name: String(p.borrower).trim() });
                }
                await supabase!.from("alerts").insert({
                  project_id: newProject.id, project_name: name, severity: "low",
                  message: `IFC project ingested: ${name} (${country}) — ${valueLabel}`,
                  category: "market", source_url: projectUrl,
                });
                inserted++;
              }
            }
          } catch (err) { console.error(`Error processing IFC project ${(p as any).id}:`, err); skipped++; }
        }

        if (projectList.length < rows) break;
        offset += rows;
      }
    }

    const result = { success: true, fetched, inserted, updated, skipped, source: "IFC" };
    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed", result, completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("IFC ingest error:", e);
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
