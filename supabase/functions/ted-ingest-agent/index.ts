/**
 * ted-ingest-agent (redeploy nudge 2026-07-09)
 *
 * Ingests EU public procurement notices from TED (Tenders Electronic Daily)
 * via the free v3 search API — no API key required for read access:
 *
 *   POST https://api.ted.europa.eu/v3/notices/search
 *
 * Filtered to construction/infrastructure works (CPV 45*) above a value
 * threshold. Contract notices become 'tender_open' rows and contract award
 * notices become 'award' rows in the tender_events table, which powers the
 * Tenders dashboard and tender calendar.
 *
 * Deduplication is by notice URL, so repeated runs over overlapping date
 * windows are safe. A daily cron pulling the last few days keeps the feed
 * fresh; a manual run with a large `days` value backfills history.
 *
 * Accepted body params:
 *   days           - publication window in days      (default 3, max 90)
 *   limit          - max notices per notice type     (default 200, max 500)
 *   min_value_usd  - skip notices below this value   (default 5,000,000)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { isAgentEnabled, pausedResponse, beginAgentTask, alreadyRunningResponse, finishAgentRun, recordAgentEvent } from "../_shared/agentGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TED_API = "https://api.ted.europa.eu/v3/notices/search";
const TED_FIELDS = [
  "publication-number", "notice-title", "buyer-name", "buyer-country",
  "publication-date", "deadline-receipt-tender-date-lot",
  "estimated-value-lot", "estimated-value-cur-lot",
  "total-value", "total-value-cur", "winner-name", "classification-cpv", "links",
];

// Rough FX to USD for the currencies that appear on TED.
const FX_TO_USD: Record<string, number> = {
  EUR: 1.08, USD: 1, GBP: 1.27, CHF: 1.12, CZK: 0.044, PLN: 0.25, SEK: 0.095,
  DKK: 0.145, NOK: 0.095, HUF: 0.0027, RON: 0.22, BGN: 0.55, ISK: 0.0072, HRK: 0.14,
};

const ISO3_COUNTRY: Record<string, string> = {
  AUT: "Austria", BEL: "Belgium", BGR: "Bulgaria", HRV: "Croatia", CYP: "Cyprus",
  CZE: "Czech Republic", DNK: "Denmark", EST: "Estonia", FIN: "Finland", FRA: "France",
  DEU: "Germany", GRC: "Greece", HUN: "Hungary", IRL: "Ireland", ITA: "Italy",
  LVA: "Latvia", LTU: "Lithuania", LUX: "Luxembourg", MLT: "Malta", NLD: "Netherlands",
  POL: "Poland", PRT: "Portugal", ROU: "Romania", SVK: "Slovakia", SVN: "Slovenia",
  ESP: "Spain", SWE: "Sweden", NOR: "Norway", ISL: "Iceland", CHE: "Switzerland",
  GBR: "United Kingdom", UKR: "Ukraine", SRB: "Serbia", MKD: "North Macedonia",
  ALB: "Albania", MNE: "Montenegro", BIH: "Bosnia and Herzegovina", MDA: "Moldova",
  TUR: "Turkey", LIE: "Liechtenstein",
};

// CPV prefix → platform sector (all under CPV 45 construction works).
function mapCpvSector(cpvs: string[]): string {
  const joined = (cpvs || []).join(",");
  if (/,?4523/.test(joined)) return "Transport";           // roads, rail, pipelines
  if (/,?4525/.test(joined)) return "Energy";              // power plants, mining plant
  if (/,?4524/.test(joined)) return "Water";               // water projects
  if (/,?4522[34]/.test(joined)) return "Infrastructure";  // bridges, structures
  return "Building Construction";
}

function pickLang(obj: unknown): string {
  if (!obj || typeof obj !== "object") return String(obj ?? "").trim();
  const rec = obj as Record<string, unknown>;
  const val = rec.eng ?? Object.values(rec)[0];
  if (Array.isArray(val)) return String(val[0] ?? "").trim();
  return String(val ?? "").trim();
}

/** TED titles look like "Germany – Construction work – Actual project title". */
function extractTitle(fullTitle: string): string {
  const parts = fullTitle.split(" – ");
  if (parts.length >= 3) return parts.slice(2).join(" – ").trim();
  return fullTitle.trim();
}

function toDateOnly(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const match = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
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

    if (!await isAgentEnabled(supabase, "ted-ingest")) return pausedResponse("ted-ingest");

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body */ }

    const days = Math.min(Math.max(Number(body.days) || 3, 1), 90);
    const perTypeLimit = Math.min(Math.max(Number(body.limit) || 200, 1), 500);
    const minValueUsd = Math.max(Number(body.min_value_usd) || 5_000_000, 0);

    const lock = await beginAgentTask(supabase, "ted-ingest", `TED procurement notices — last ${days}d, CPV 45*`, gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("ted-ingest");
    taskId = lock.taskId;
    runStartedAt = new Date();

    const since = new Date(Date.now() - days * 86_400_000);
    const sinceStr = since.toISOString().slice(0, 10).replace(/-/g, "");

    const PAGE = 100;
    let inserted = 0;
    let duplicates = 0;
    let belowThreshold = 0;
    let fetched = 0;

    // cn-standard = contract notice (tender open); can-standard = award notice.
    const noticeTypes: { type: string; eventType: string }[] = [
      { type: "cn-standard", eventType: "tender_open" },
      { type: "can-standard", eventType: "award" },
    ];

    for (const { type, eventType } of noticeTypes) {
      let page = 1;
      let typeFetched = 0;
      while (typeFetched < perTypeLimit) {
        const pageLimit = Math.min(PAGE, perTypeLimit - typeFetched);
        const query = `classification-cpv IN (45000000) AND notice-type IN (${type}) AND publication-date>=${sinceStr}`;
        const res = await fetch(TED_API, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ query, fields: TED_FIELDS, limit: pageLimit, page }),
        });
        if (!res.ok) {
          console.error(`TED API error for ${type}: ${res.status} ${await res.text().catch(() => "")}`);
          break;
        }
        const json = await res.json();
        const notices: Record<string, unknown>[] = json?.notices || [];
        if (notices.length === 0) break;
        typeFetched += notices.length;
        fetched += notices.length;

        // Batch-dedupe by notice URL.
        const rows = notices.map((n) => {
          const pubNumber = String(n["publication-number"] ?? "");
          const links = (n.links ?? {}) as Record<string, Record<string, string>>;
          const sourceUrl = links.html?.ENG || `https://ted.europa.eu/en/notice/-/detail/${pubNumber}`;

          const isAward = eventType === "award";
          const rawValue = isAward
            ? Number(n["total-value"]) || 0
            : Number(Array.isArray(n["estimated-value-lot"]) ? (n["estimated-value-lot"] as unknown[])[0] : n["estimated-value-lot"]) || 0;
          const curRaw = isAward ? n["total-value-cur"] : n["estimated-value-cur-lot"];
          const currency = String(Array.isArray(curRaw) ? curRaw[0] : curRaw ?? "EUR").toUpperCase();
          const valueUsd = Math.round(rawValue * (FX_TO_USD[currency] ?? 1));

          const iso3 = String(Array.isArray(n["buyer-country"]) ? (n["buyer-country"] as unknown[])[0] : n["buyer-country"] ?? "");
          const country = ISO3_COUNTRY[iso3] || iso3 || "European Union";
          const title = extractTitle(pickLang(n["notice-title"]));
          const buyer = pickLang(n["buyer-name"]);
          const winner = pickLang(n["winner-name"]);
          const deadline = toDateOnly(n["deadline-receipt-tender-date-lot"]);
          const cpvs = (n["classification-cpv"] as string[]) ?? [];

          return {
            sourceUrl, valueUsd, title, buyer, winner, deadline, country,
            sector: mapCpvSector(cpvs), pubNumber,
          };
        }).filter((r) => r.title && r.pubNumber);

        const urls = rows.map((r) => r.sourceUrl);
        const { data: existing } = await supabase
          .from("tender_events")
          .select("source_url")
          .in("source_url", urls);
        const existingSet = new Set((existing ?? []).map((e: { source_url: string }) => e.source_url));

        const inserts = [];
        for (const r of rows) {
          if (existingSet.has(r.sourceUrl)) { duplicates++; continue; }
          if (minValueUsd > 0 && r.valueUsd > 0 && r.valueUsd < minValueUsd) { belowThreshold++; continue; }
          // Notices without a stated value are kept — large works often withhold estimates.
          const severity = r.valueUsd >= 1_000_000_000 ? "critical" : r.valueUsd >= 100_000_000 ? "high" : "medium";
          const valueLabel = r.valueUsd >= 1_000_000_000
            ? `$${(r.valueUsd / 1_000_000_000).toFixed(1)}B` : r.valueUsd >= 1_000_000
            ? `$${(r.valueUsd / 1_000_000).toFixed(0)}M` : "value undisclosed";
          inserts.push({
            project_name: r.title.slice(0, 300),
            country: r.country,
            region: "Europe",
            sector: r.sector,
            event_type: eventType,
            severity,
            summary: eventType === "award"
              ? `Contract awarded${r.winner ? ` to ${r.winner}` : ""} by ${r.buyer || "public buyer"} in ${r.country} (${valueLabel}). Source: TED ${r.pubNumber}.`
              : `Open tender by ${r.buyer || "public buyer"} in ${r.country} (${valueLabel})${r.deadline ? `, bids due ${r.deadline}` : ""}. Source: TED ${r.pubNumber}.`,
            award_value_usd: r.valueUsd > 0 ? r.valueUsd : null,
            contractor_name: eventType === "award" && r.winner ? r.winner.slice(0, 200) : null,
            deadline: r.deadline,
            agency: r.buyer ? r.buyer.slice(0, 200) : null,
            source_url: r.sourceUrl,
          });
        }

        if (inserts.length > 0) {
          const { error: insertError } = await supabase.from("tender_events").insert(inserts);
          if (insertError) throw insertError;
          inserted += inserts.length;
        }

        if (notices.length < pageLimit) break;
        page++;
      }
    }

    const result = { success: true, fetched, inserted, duplicates, below_threshold: belowThreshold, window_days: days, min_value_usd: minValueUsd, source: "TED" };
    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed", result, completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }

    await recordAgentEvent(supabase, "ted-ingest", "completed", "TED procurement notices ingested", taskId, result);
    if (runStartedAt) await finishAgentRun(supabase, "ted-ingest", "completed", runStartedAt);
    console.log(`TED ingest complete: fetched=${fetched} inserted=${inserted} duplicates=${duplicates} below_threshold=${belowThreshold}`);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("TED ingest error:", e);
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    if (taskId && supabase) {
      try {
        await supabase.from("research_tasks").update({
          status: "failed", error: errMsg, completed_at: new Date().toISOString(),
        }).eq("id", taskId);
        await recordAgentEvent(supabase, "ted-ingest", "failed", errMsg, taskId);
        if (runStartedAt) await finishAgentRun(supabase, "ted-ingest", "failed", runStartedAt);
      } catch { /* best-effort */ }
    }
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
