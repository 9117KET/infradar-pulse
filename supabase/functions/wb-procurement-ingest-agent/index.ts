/**
 * wb-procurement-ingest-agent
 *
 * Ingests World Bank procurement notices (free, keyless) for every borrower
 * country — the earliest public signal that an MDB-financed project is
 * buying works:
 *
 *   GET https://search.worldbank.org/api/v2/procnotices
 *
 * Kept: civil works (procurement_group CW) of every notice type, plus
 * consulting (CS) Requests for Expression of Interest — feasibility/design
 * studies that precede works tenders by months. Invitations become
 * 'tender_open' rows and Contract Awards become 'award' rows (winner and
 * signed price parsed from the notice text). Each row is linked to the parent
 * project in `projects` when we already track it (matched by WB project URL).
 *
 * Accepted body params:
 *   days           - notice window in days             (default 2, max 30)
 *   max_rows       - notices scanned, newest first     (default 1500, max 5000)
 *   min_value_usd  - skip awards below this value      (default 250,000)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { isAgentEnabled, pausedResponse, beginAgentTask, alreadyRunningResponse, finishAgentRun, recordAgentEvent } from "../_shared/agentGate.ts";
import {
  fetchFeedJson, insertNewTenderEvents, regionForCountry, sectorFromText, severityFor, toUsd, valueLabel,
  type TenderEventInsert,
} from "../_shared/tenderIngest.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AGENT = "wb-procurement-ingest";
const API = "https://search.worldbank.org/api/v2/procnotices";
const NOTICE_URL = "https://projects.worldbank.org/en/projects-operations/procurement-detail/";
const PROJECT_URL = "https://projects.worldbank.org/en/projects-operations/project-detail/";
const PAGE = 500;

type Notice = {
  id?: string;
  notice_type?: string;
  procurement_group?: string;
  submission_date?: string;
  submission_deadline_date?: string;
  project_ctry_name?: string;
  project_id?: string;
  project_name?: string;
  bid_description?: string;
  contact_organization?: string;
  notice_text?: string;
};

function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " | ")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/(\s*\|\s*)+/g, " | ");
}

/** Winner names and signed price from a Contract Award notice body. */
export function parseAward(noticeHtml: string): { winner: string | null; valueUsd: number } {
  const t = plainText(noticeHtml);
  const winners = [...t.matchAll(/Awarded Bidder\(s\):\s*\|\s*([^|(]+?)\s*(?:\(|\|)/gi)].map((m) => m[1].trim());
  const price = t.match(/Signed Contract price\s*\|\s*([A-Z]{3})\s*([\d,.]+)/i)
    ?? t.match(/Evaluated Bid Price\s*\|\s*([A-Z]{3})\s*([\d,.]+)/i);
  return {
    winner: winners.length ? [...new Set(winners)].join(", ") : null,
    valueUsd: price ? toUsd(price[2].replace(/,/g, ""), price[1]) : 0,
  };
}

function isInScope(n: Notice): boolean {
  if (n.procurement_group === "CW") return true;
  return n.procurement_group === "CS" && /expression of interest/i.test(n.notice_type ?? "");
}

function eventTypeFor(n: Notice): "award" | "tender_open" | null {
  const t = n.notice_type ?? "";
  if (/contract award/i.test(t)) return "award";
  if (/invitation|expression of interest|prequalification|general procurement/i.test(t)) return "tender_open";
  return null;
}

function titleCase(s: string): string {
  return s.replace(/^"+|"+$/g, "").trim();
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
    const maxRows = Math.min(Math.max(Number(body.max_rows) || 1500, 1), 5000);
    const minValueUsd = Math.max(Number(body.min_value_usd ?? 250_000) || 0, 0);

    const lock = await beginAgentTask(supabase, AGENT, `World Bank procurement notices — last ${days}d (civil works + consulting EOIs)`, gate.userId ?? undefined);
    if (lock.alreadyRunning) return alreadyRunningResponse(AGENT);
    taskId = lock.taskId;
    runStartedAt = new Date();

    const since = Date.now() - days * 86_400_000;
    const candidates: { n: Notice; eventType: "award" | "tender_open" }[] = [];
    let scanned = 0;

    for (let offset = 0; offset < maxRows; offset += PAGE) {
      const url = `${API}?format=json&rows=${Math.min(PAGE, maxRows - offset)}&os=${offset}&srt=submission_date&order=desc`;
      const json = await fetchFeedJson(url, "World Bank procnotices");
      const page: Notice[] = Array.isArray(json?.procnotices) ? json!.procnotices as Notice[] : [];
      if (page.length === 0) break;
      scanned += page.length;
      let reachedWindowEnd = false;
      for (const n of page) {
        const at = Date.parse(n.submission_date ?? "");
        if (Number.isFinite(at) && at < since) { reachedWindowEnd = true; continue; }
        const eventType = eventTypeFor(n);
        if (n.id && eventType && isInScope(n)) candidates.push({ n, eventType });
      }
      if (reachedWindowEnd) break;
    }

    // Link to tracked projects by their canonical World Bank project URL.
    const projectIds = [...new Set(candidates.map((c) => c.n.project_id).filter(Boolean))] as string[];
    const linked = new Map<string, string>();
    for (let i = 0; i < projectIds.length; i += 100) {
      const urls = projectIds.slice(i, i + 100).map((id) => `${PROJECT_URL}${id}`);
      const { data } = await supabase.from("projects").select("id, source_url").in("source_url", urls);
      for (const p of data ?? []) {
        const wbId = String(p.source_url).split("/").pop();
        if (wbId) linked.set(wbId, p.id);
      }
    }

    let belowThreshold = 0;
    const rows: TenderEventInsert[] = [];
    for (const { n, eventType } of candidates) {
      const country = n.project_ctry_name ?? null;
      const scope = titleCase(n.bid_description || n.project_name || "World Bank financed works");
      const isAward = eventType === "award";
      const award = isAward ? parseAward(n.notice_text ?? "") : { winner: null, valueUsd: 0 };
      if (isAward && minValueUsd > 0 && award.valueUsd > 0 && award.valueUsd < minValueUsd) { belowThreshold++; continue; }
      const buyer = n.contact_organization || n.project_name || "the borrower";
      const kind = n.procurement_group === "CS" ? "Consulting EOI" : (n.notice_type ?? "Tender");
      rows.push({
        project_name: scope,
        country,
        region: regionForCountry(country),
        sector: sectorFromText(`${scope} ${n.project_name ?? ""}`),
        event_type: eventType,
        severity: severityFor(award.valueUsd),
        summary: isAward
          ? `Contract awarded${award.winner ? ` to ${award.winner}` : ""} under ${n.project_name ?? "a World Bank project"} (${n.project_id}) in ${country ?? "borrower country"} (${valueLabel(award.valueUsd)}). Source: World Bank notice ${n.id}.`
          : `${kind} by ${buyer} in ${country ?? "borrower country"} under ${n.project_name ?? "a World Bank project"} (${n.project_id})${n.submission_deadline_date ? `, responses due ${n.submission_deadline_date.slice(0, 10)}` : ""}. Source: World Bank notice ${n.id}.`,
        award_value_usd: award.valueUsd > 0 ? award.valueUsd : null,
        contractor_name: award.winner,
        deadline: isAward ? null : n.submission_deadline_date?.slice(0, 10) ?? null,
        agency: buyer,
        source_url: `${NOTICE_URL}${n.id}`,
        project_id: n.project_id ? linked.get(n.project_id) ?? null : null,
      });
    }

    let inserted = 0;
    let duplicates = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const r = await insertNewTenderEvents(supabase, rows.slice(i, i + 200));
      inserted += r.inserted;
      duplicates += r.duplicates;
    }

    const result = {
      success: true, scanned, in_scope: candidates.length, inserted, duplicates,
      below_threshold: belowThreshold, linked_to_projects: rows.filter((r) => r.project_id).length,
      window_days: days, source: "World Bank procurement notices",
    };
    await supabase.from("research_tasks").update({ status: "completed", result, completed_at: new Date().toISOString() }).eq("id", taskId);
    await recordAgentEvent(supabase, AGENT, "completed", "World Bank procurement notices ingested", taskId, result);
    await finishAgentRun(supabase, AGENT, "completed", runStartedAt);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("WB procurement ingest error:", e);
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    if (taskId && supabase) {
      try {
        await supabase.from("research_tasks").update({ status: "failed", error: errMsg, completed_at: new Date().toISOString() }).eq("id", taskId);
        await recordAgentEvent(supabase, AGENT, "failed", errMsg, taskId);
        if (runStartedAt) await finishAgentRun(supabase, AGENT, "failed", runStartedAt);
      } catch { /* best-effort */ }
    }
    return new Response(JSON.stringify({ error: errMsg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
