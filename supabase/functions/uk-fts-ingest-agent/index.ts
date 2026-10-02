/**
 * uk-fts-ingest-agent
 *
 * Ingests UK public procurement notices from Find a Tender Service (FTS) via
 * its free Open Contracting Data Standard (OCDS) API — no API key required:
 *
 *   GET https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages
 *
 * FTS has no server-side CPV filter, so releases are paged by update window
 * and filtered locally to construction/infrastructure works (CPV 45*), the
 * same scope as ted-ingest-agent. Tender releases become 'tender_open' rows and
 * award releases become 'award' rows in tender_events.
 *
 * Deduplication is by notice URL, so overlapping windows are safe.
 *
 * Accepted body params:
 *   days           - update window in days            (default 2, max 30)
 *   max_pages      - FTS pages of 100 per stage        (default 40, max 150)
 *   min_value_usd  - skip notices below this value     (default 1,000,000)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { isAgentEnabled, pausedResponse, beginAgentTask, alreadyRunningResponse, finishAgentRun, recordAgentEvent } from "../_shared/agentGate.ts";
import {
  fetchFeedJson, insertNewTenderEvents, sectorFromCpv, severityFor, toUsd as toUsdRaw, valueLabel,
  type TenderEventInsert,
} from "../_shared/tenderIngest.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AGENT = "uk-fts-ingest";
const FTS_API = "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages";
const NOTICE_URL = "https://www.find-tender.service.gov.uk/Notice/";

type OcdsValue = { amount?: number; currency?: string } | null | undefined;
type OcdsRelease = {
  id?: string;
  tag?: string[];
  buyer?: { name?: string };
  tender?: {
    title?: string;
    classification?: { id?: string };
    items?: { additionalClassifications?: { id?: string }[] }[];
    value?: OcdsValue;
    lots?: { value?: OcdsValue }[];
    tenderPeriod?: { endDate?: string };
  };
  awards?: { value?: OcdsValue; suppliers?: { name?: string }[]; status?: string }[];
  contracts?: { value?: OcdsValue }[];
};

function cpvCodes(r: OcdsRelease): string[] {
  const main = r.tender?.classification?.id;
  const extra = (r.tender?.items ?? []).flatMap((i) => (i.additionalClassifications ?? []).map((c) => c.id ?? ""));
  return [main ?? "", ...extra].filter(Boolean);
}

function toUsd(v: OcdsValue): number {
  return toUsdRaw(v?.amount, v?.currency ?? "GBP");
}

/** Best stated value: award → contract → tender → sum of lots. */
function releaseValueUsd(r: OcdsRelease, isAward: boolean): number {
  if (isAward) {
    const awarded = (r.awards ?? []).reduce((s, a) => s + toUsd(a.value), 0);
    if (awarded > 0) return awarded;
    const contracted = (r.contracts ?? []).reduce((s, c) => s + toUsd(c.value), 0);
    if (contracted > 0) return contracted;
  }
  const tender = toUsd(r.tender?.value);
  if (tender > 0) return tender;
  return (r.tender?.lots ?? []).reduce((s, l) => s + toUsd(l.value), 0);
}

function fmtFtsDate(d: Date): string {
  return d.toISOString().slice(0, 19); // FTS expects YYYY-MM-DDTHH:MM:SS
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  let taskId: string | null = null;
  // deno-lint-ignore no-explicit-any
  let supabase: any = null;
  let runStartedAt: Date | null = null;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!await isAgentEnabled(supabase, AGENT)) return pausedResponse(AGENT);

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body */ }

    const days = Math.min(Math.max(Number(body.days) || 2, 1), 30);
    const maxPages = Math.min(Math.max(Number(body.max_pages) || 40, 1), 150);
    const minValueUsd = Math.max(Number(body.min_value_usd ?? 1_000_000) || 0, 0);

    const lock = await beginAgentTask(supabase, AGENT, `UK Find a Tender notices — last ${days}d, CPV 45*`, gate.userId ?? undefined);
    if (lock.alreadyRunning) return alreadyRunningResponse(AGENT);
    taskId = lock.taskId;
    runStartedAt = new Date();

    const updatedFrom = fmtFtsDate(new Date(Date.now() - days * 86_400_000));

    let fetched = 0;
    let inScope = 0;
    let inserted = 0;
    let duplicates = 0;
    let belowThreshold = 0;
    let pagesRead = 0;

    const stages: { stage: string; eventType: "tender_open" | "award" }[] = [
      { stage: "tender", eventType: "tender_open" },
      { stage: "award", eventType: "award" },
    ];

    for (const { stage, eventType } of stages) {
      let next: string | null = `${FTS_API}?stages=${stage}&limit=100&updatedFrom=${updatedFrom}`;
      for (let page = 0; next && page < maxPages; page++) {
        // FTS 403s Deno's default User-Agent; fetchFeedJson identifies us.
        const json = await fetchFeedJson(next, `FTS ${stage}`);
        if (!json) break;
        pagesRead++;
        const releases: OcdsRelease[] = Array.isArray(json?.releases) ? json.releases : [];
        fetched += releases.length;
        const nextLink = (json.links as { next?: unknown } | undefined)?.next;
        next = typeof nextLink === "string" && releases.length > 0 ? nextLink : null;

        const isAward = eventType === "award";
        const rows = releases
          .filter((r) => r.id && r.tender?.title && cpvCodes(r).some((c) => c.startsWith("45")))
          .map((r) => {
            const winners = (r.awards ?? [])
              .filter((a) => a.status !== "cancelled" && a.status !== "unsuccessful")
              .flatMap((a) => (a.suppliers ?? []).map((s) => s.name ?? ""))
              .filter(Boolean);
            return {
              sourceUrl: `${NOTICE_URL}${r.id}`,
              noticeId: r.id as string,
              title: String(r.tender?.title).trim(),
              buyer: r.buyer?.name?.trim() ?? "",
              winner: [...new Set(winners)].join(", "),
              deadline: r.tender?.tenderPeriod?.endDate?.slice(0, 10) ?? null,
              valueUsd: releaseValueUsd(r, isAward),
              sector: sectorFromCpv(cpvCodes(r)),
            };
          });
        inScope += rows.length;
        if (rows.length === 0) continue;

        const inserts: TenderEventInsert[] = [];
        for (const r of rows) {
          if (minValueUsd > 0 && r.valueUsd > 0 && r.valueUsd < minValueUsd) { belowThreshold++; continue; }
          const label = valueLabel(r.valueUsd, r.title);
          inserts.push({
            project_name: r.title,
            country: "United Kingdom",
            region: "Europe",
            sector: r.sector,
            event_type: eventType,
            severity: severityFor(r.valueUsd),
            summary: isAward
              ? `Contract awarded${r.winner ? ` to ${r.winner}` : ""} by ${r.buyer || "public buyer"} in the United Kingdom (${label}). Source: Find a Tender ${r.noticeId}.`
              : `Open tender by ${r.buyer || "public buyer"} in the United Kingdom (${label})${r.deadline ? `, bids due ${r.deadline}` : ""}. Source: Find a Tender ${r.noticeId}.`,
            award_value_usd: r.valueUsd > 0 ? r.valueUsd : null,
            contractor_name: isAward && r.winner ? r.winner : null,
            deadline: isAward ? null : r.deadline,
            agency: r.buyer || null,
            source_url: r.sourceUrl,
          });
        }
        const counts = await insertNewTenderEvents(supabase, inserts);
        inserted += counts.inserted;
        duplicates += counts.duplicates;
      }
    }

    const result = {
      success: true, fetched, in_scope: inScope, inserted, duplicates, below_threshold: belowThreshold,
      pages_read: pagesRead, window_days: days, min_value_usd: minValueUsd, source: "UK Find a Tender (OCDS)",
    };
    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed", result, completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }

    await recordAgentEvent(supabase, AGENT, "completed", "UK Find a Tender notices ingested", taskId, result);
    if (runStartedAt) await finishAgentRun(supabase, AGENT, "completed", runStartedAt);
    console.log(`UK FTS ingest complete: fetched=${fetched} in_scope=${inScope} inserted=${inserted} duplicates=${duplicates}`);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("UK FTS ingest error:", e);
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    if (taskId && supabase) {
      try {
        await supabase.from("research_tasks").update({
          status: "failed", error: errMsg, completed_at: new Date().toISOString(),
        }).eq("id", taskId);
        await recordAgentEvent(supabase, AGENT, "failed", errMsg, taskId);
        if (runStartedAt) await finishAgentRun(supabase, AGENT, "failed", runStartedAt);
      } catch { /* best-effort */ }
    }
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
