/**
 * za-etenders-ingest-agent
 *
 * Ingests South African public tenders from the National Treasury eTender
 * Portal's free OCDS API (no key), covering national, provincial and SOE
 * buyers (Eskom, Transnet, SANRAL, municipalities):
 *
 *   GET https://ocds-api.etenders.gov.za/api/OCDSReleases
 *
 * The feed carries no CPV codes, so scope is the portal's own category
 * (Construction, Construction of buildings, Civil engineering, ...) or
 * mainProcurementCategory = works. The `title` field is usually a bid number;
 * the human-readable scope is in `description`. Active tenders become
 * 'tender_open', cancelled ones 'cancellation', and releases carrying awards
 * become 'award'. The API is slow (~15s/page), hence the small page budget.
 *
 * Accepted body params:
 *   days       - release window in days   (default 3, max 30)
 *   max_pages  - pages of 100             (default 6, max 12)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { isAgentEnabled, pausedResponse, beginAgentTask, alreadyRunningResponse, finishAgentRun, recordAgentEvent } from "../_shared/agentGate.ts";
import {
  fetchFeedJson, insertNewTenderEvents, sectorFromText, severityFor, toUsd, valueLabel,
  type TenderEventInsert,
} from "../_shared/tenderIngest.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AGENT = "za-etenders-ingest";
const API = "https://ocds-api.etenders.gov.za/api/OCDSReleases";
const OPPORTUNITY_URL = "https://www.etenders.gov.za/Home/opportunities?id=";

type Value = { amount?: number; currency?: string } | null | undefined;
type Release = {
  ocid?: string;
  tender?: {
    id?: string | number;
    title?: string;
    description?: string;
    category?: string;
    mainProcurementCategory?: string;
    status?: string;
    value?: Value;
    province?: string;
    procuringEntity?: { name?: string };
    tenderPeriod?: { endDate?: string };
  };
  buyer?: { name?: string };
  awards?: { value?: Value; suppliers?: { name?: string }[]; status?: string }[];
};

function isConstruction(r: Release): boolean {
  const t = r.tender ?? {};
  return /construction|civil engineering/i.test(t.category ?? "") || t.mainProcurementCategory === "works";
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
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
    const days = Math.min(Math.max(Number(body.days) || 3, 1), 30);
    const maxPages = Math.min(Math.max(Number(body.max_pages) || 6, 1), 12);

    const lock = await beginAgentTask(supabase, AGENT, `South Africa eTenders — last ${days}d, construction`, gate.userId ?? undefined);
    if (lock.alreadyRunning) return alreadyRunningResponse(AGENT);
    taskId = lock.taskId;
    runStartedAt = new Date();

    const now = new Date();
    let next: string | null =
      `${API}?PageNumber=1&PageSize=100&dateFrom=${ymd(new Date(now.getTime() - days * 86_400_000))}&dateTo=${ymd(now)}`;
    let fetched = 0;
    let pagesRead = 0;
    const rows: TenderEventInsert[] = [];

    while (next && pagesRead < maxPages) {
      const json = await fetchFeedJson(next, "SA eTenders");
      if (!json) break;
      pagesRead++;
      const releases: Release[] = Array.isArray(json.releases) ? json.releases as Release[] : [];
      fetched += releases.length;
      const links = json.links as { next?: string } | undefined;
      next = releases.length > 0 && typeof links?.next === "string" ? links.next : null;

      for (const r of releases.filter(isConstruction)) {
        const t = r.tender ?? {};
        if (t.id == null) continue;
        const scope = (t.description || t.title || "").trim();
        if (!scope) continue;
        const buyer = t.procuringEntity?.name || r.buyer?.name || "public buyer";
        const awards = (r.awards ?? []).filter((a) => a.status !== "cancelled" && a.status !== "unsuccessful");
        const winner = [...new Set(awards.flatMap((a) => (a.suppliers ?? []).map((s) => s.name ?? "")).filter(Boolean))].join(", ");
        const awardedUsd = awards.reduce((s, a) => s + toUsd(a.value?.amount, a.value?.currency ?? "ZAR"), 0);
        const valueUsd = awardedUsd || toUsd(t.value?.amount, t.value?.currency ?? "ZAR");
        const eventType: TenderEventInsert["event_type"] =
          awards.length > 0 ? "award" : t.status === "cancelled" ? "cancellation" : "tender_open";
        const where = t.province ? `${t.province}, South Africa` : "South Africa";
        const deadline = t.tenderPeriod?.endDate?.slice(0, 10) ?? null;
        const ref = t.title && t.title !== scope ? ` (bid ${t.title})` : "";

        rows.push({
          project_name: scope,
          country: "South Africa",
          region: "Southern Africa",
          sector: sectorFromText(`${scope} ${t.category ?? ""}`),
          event_type: eventType,
          severity: severityFor(valueUsd),
          summary: eventType === "award"
            ? `Contract awarded${winner ? ` to ${winner}` : ""} by ${buyer} in ${where} (${valueLabel(valueUsd, scope)})${ref}. Source: eTender Portal.`
            : eventType === "cancellation"
            ? `Tender cancelled by ${buyer} in ${where}${ref}. Source: eTender Portal.`
            : `Open tender by ${buyer} in ${where} (${valueLabel(valueUsd, scope)})${deadline ? `, bids close ${deadline}` : ""}${ref}. Source: eTender Portal.`,
          award_value_usd: valueUsd > 0 ? valueUsd : null,
          contractor_name: eventType === "award" && winner ? winner : null,
          deadline: eventType === "tender_open" ? deadline : null,
          agency: buyer,
          // A tender changes state (open → cancelled/awarded) under the same id;
          // the event type in the URL keeps each transition as its own row.
          source_url: `${OPPORTUNITY_URL}${t.id}${eventType === "tender_open" ? "" : `&event=${eventType}`}`,
        });
      }
    }

    const { inserted, duplicates } = await insertNewTenderEvents(supabase, rows);
    const result = {
      success: true, fetched, in_scope: rows.length, inserted, duplicates, pages_read: pagesRead,
      window_days: days, source: "South Africa eTender Portal (OCDS)",
    };
    await supabase.from("research_tasks").update({ status: "completed", result, completed_at: new Date().toISOString() }).eq("id", taskId);
    await recordAgentEvent(supabase, AGENT, "completed", "South Africa eTenders ingested", taskId, result);
    await finishAgentRun(supabase, AGENT, "completed", runStartedAt);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("SA eTenders ingest error:", e);
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
