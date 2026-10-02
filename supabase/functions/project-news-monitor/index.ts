/**
 * project-news-monitor
 *
 * Watches global news for the projects users actually track, using the free
 * GDELT 2.0 DOC API (no key; ~65 languages of online news, updated every 15
 * minutes):
 *
 *   GET https://api.gdeltproject.org/api/v2/doc/doc?mode=artlist&format=json
 *
 * For each project (tracked projects first, then the largest approved ones)
 * it searches the exact project name. Every new article becomes a 'News'
 * row in evidence_sources (unverified), so analysts and users see cited
 * coverage on the project page. Articles whose headline signals an event —
 * delay, cancellation, award, dispute, financing — also raise an alert.
 * Alerts are keyword-rule based, not model output, so origin is 'system'.
 *
 * GDELT is rate limited, so a run checks a small rotating batch; schedule it
 * hourly to cover a few hundred projects a day.
 *
 * Accepted body params:
 *   limit     - projects checked this run   (default 10, max 12; ~10s each)
 *   timespan  - news lookback, GDELT syntax (default "7d")
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { isAgentEnabled, pausedResponse, beginAgentTask, alreadyRunningResponse, finishAgentRun, recordAgentEvent } from "../_shared/agentGate.ts";
import { FEED_HEADERS } from "../_shared/tenderIngest.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AGENT = "project-news-monitor";
const GDELT = "https://api.gdeltproject.org/api/v2/doc/doc";
// GDELT documents one request per 5s per IP, but in practice throttles tighter
// (and Supabase egress IPs are shared), so space generously and retry once.
const GDELT_SPACING_MS = 10_000;
const GDELT_RETRY_MS = 15_000;

type Project = { id: string; name: string; country: string | null };
type Article = { url?: string; title?: string; seendate?: string; domain?: string; sourcecountry?: string };

/** Headline patterns that turn a mention into an alert. First match wins. */
export const SIGNALS: { re: RegExp; category: string; severity: string; label: string }[] = [
  { re: /\b(cancel(l)?ed|scrapped|terminated|suspend(ed)?|halt(ed)?|abandon(ed)?)\b/i, category: "construction", severity: "high", label: "Cancellation / suspension" },
  { re: /\b(delay(ed|s)?|behind schedule|stalled|postpone(d)?|overrun)\b/i, category: "construction", severity: "medium", label: "Delay" },
  { re: /\b(dispute|arbitration|lawsuit|sued|court|protest|strike)\b/i, category: "stakeholder", severity: "medium", label: "Dispute / opposition" },
  { re: /\b(corruption|fraud|probe|investigation|bribe(ry)?)\b/i, category: "regulatory", severity: "high", label: "Integrity risk" },
  { re: /\b(award(ed|s)?|contract (signed|won)|wins? contract|selected as|preferred bidder)\b/i, category: "construction", severity: "medium", label: "Award" },
  { re: /\b(financ(e|ing) (close|closed|secured)|loan (approved|signed)|funding (secured|approved))\b/i, category: "financial", severity: "medium", label: "Financing" },
];

/** Names too short or generic to search as an exact phrase produce noise. */
function searchable(name: string): boolean {
  const words = name.trim().split(/\s+/);
  return name.length >= 12 && words.length >= 3 && !/^(project|programme|program)\b/i.test(name);
}

function phraseQuery(name: string): string {
  // GDELT rejects very long phrases; keep the distinctive head of the name.
  const words = name.replace(/["()]/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 8);
  return `"${words.join(" ")}"`;
}

function gdeltDate(s: string | undefined): string {
  const m = (s ?? "").match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : new Date().toISOString().slice(0, 10);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 12);
    const timespan = /^\d{1,2}(d|w|h)$/.test(String(body.timespan ?? "")) ? String(body.timespan) : "7d";

    const lock = await beginAgentTask(supabase, AGENT, `News monitoring for ${limit} projects (GDELT, ${timespan})`, gate.userId ?? undefined);
    if (lock.alreadyRunning) return alreadyRunningResponse(AGENT);
    taskId = lock.taskId;
    runStartedAt = new Date();

    // Tracked projects first (what users care about), topped up by largest approved.
    const { data: tracked } = await supabase.from("tracked_projects").select("project_id").limit(500);
    const trackedIds = [...new Set((tracked ?? []).map((t: { project_id: string }) => t.project_id))] as string[];
    const pool: Project[] = [];
    if (trackedIds.length) {
      const { data } = await supabase.from("projects").select("id, name, country").in("id", trackedIds.slice(0, 200));
      pool.push(...(data ?? []));
    }
    const { data: big } = await supabase.from("projects").select("id, name, country")
      .eq("approved", true).order("value_usd", { ascending: false, nullsFirst: false }).limit(200);
    for (const p of big ?? []) if (!pool.some((q) => q.id === p.id)) pool.push(p);

    // Rotate: check the projects whose news we looked at least recently.
    const candidates = pool.filter((p) => searchable(p.name));
    const { data: lastChecks } = await supabase.from("evidence_sources")
      .select("project_id, date").eq("type", "News").in("project_id", candidates.map((p) => p.id).slice(0, 300))
      .order("date", { ascending: false });
    const lastSeen = new Map<string, string>();
    for (const r of lastChecks ?? []) if (!lastSeen.has(r.project_id)) lastSeen.set(r.project_id, r.date);
    const batch = candidates
      .sort((a, b) => (lastSeen.get(a.id) ?? "").localeCompare(lastSeen.get(b.id) ?? ""))
      .slice(0, limit);

    let articlesSeen = 0;
    let evidenceAdded = 0;
    let alertsRaised = 0;
    let errors = 0;

    let checked = 0;
    for (const [i, project] of batch.entries()) {
      // Stay inside the edge wall-clock limit; the rest rotate into the next run.
      if (Date.now() - runStartedAt.getTime() > 110_000) break;
      if (i > 0) await sleep(GDELT_SPACING_MS);
      checked++;
      const url = `${GDELT}?query=${encodeURIComponent(phraseQuery(project.name))}&mode=artlist&maxrecords=25&format=json&sort=datedesc&timespan=${timespan}`;
      let articles: Article[] = [];
      try {
        let res = await fetch(url, { headers: FEED_HEADERS });
        let text = await res.text();
        if (/limit requests/i.test(text)) {
          await sleep(GDELT_RETRY_MS);
          res = await fetch(url, { headers: FEED_HEADERS });
          text = await res.text();
        }
        if (!res.ok || !text.trim().startsWith("{")) { errors++; console.error(`GDELT ${res.status}: ${text.slice(0, 120)}`); continue; }
        articles = (JSON.parse(text).articles ?? []).filter((a: Article) => a.url?.startsWith("http") && a.title);
      } catch (e) {
        errors++;
        console.error("GDELT fetch failed", e);
        continue;
      }
      articlesSeen += articles.length;
      if (articles.length === 0) continue;

      const { data: known } = await supabase.from("evidence_sources").select("url")
        .eq("project_id", project.id).in("url", articles.map((a) => a.url));
      const knownUrls = new Set((known ?? []).map((k: { url: string }) => k.url));
      const fresh = articles.filter((a, idx) => !knownUrls.has(a.url!) && articles.findIndex((b) => b.url === a.url) === idx);
      if (fresh.length === 0) continue;

      const { error: evErr } = await supabase.from("evidence_sources").insert(fresh.map((a) => ({
        project_id: project.id,
        type: "News",
        source: a.domain ?? new URL(a.url!).hostname,
        title: a.title!.slice(0, 300),
        description: `News mention found by ${AGENT}${a.sourcecountry ? ` (${a.sourcecountry})` : ""}. Unverified — confirm relevance before relying on it.`,
        url: a.url,
        date: gdeltDate(a.seendate),
        verified: false,
      })));
      if (evErr) { errors++; console.error("evidence insert failed", evErr.message); continue; }
      evidenceAdded += fresh.length;

      const alerts = fresh.flatMap((a) => {
        const s = SIGNALS.find((sig) => sig.re.test(a.title!));
        return s ? [{
          project_id: project.id,
          project_name: project.name,
          category: s.category,
          severity: s.severity,
          message: `${s.label} in the news: "${a.title!.slice(0, 220)}" (${a.domain ?? "news"})`,
          source_url: a.url,
          origin: "system",
        }] : [];
      });
      if (alerts.length) {
        const { error: alErr } = await supabase.from("alerts").insert(alerts);
        if (alErr) { errors++; console.error("alert insert failed", alErr.message); } else alertsRaised += alerts.length;
      }
    }

    const result = {
      success: true, projects_checked: checked, tracked_pool: trackedIds.length,
      articles_seen: articlesSeen, evidence_added: evidenceAdded, alerts_raised: alertsRaised, errors, timespan,
      source: "GDELT 2.0 DOC API",
    };
    await supabase.from("research_tasks").update({ status: "completed", result, completed_at: new Date().toISOString() }).eq("id", taskId);
    await recordAgentEvent(supabase, AGENT, "completed", "Project news monitored", taskId, result);
    await finishAgentRun(supabase, AGENT, "completed", runStartedAt);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("project-news-monitor error:", e);
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
