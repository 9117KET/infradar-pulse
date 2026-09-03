import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { fetchAgentResearch } from "../_shared/agentResearch.ts";
import { firecrawlScrape, isFirecrawlConfigured } from "../_shared/firecrawlClient.ts";
import { chatCompletions, isLlmConfigured } from "../_shared/llm.ts";
import { isPlausibleSourceUrl } from "../_shared/urlHygiene.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import {
  alreadyRunningResponse,
  beginAgentTask,
  failAgentTask,
  finishAgentRun,
  isAgentEnabled,
  pausedResponse,
  recordAgentEvent,
  setTaskStep,
} from "../_shared/agentGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Content-Type": "application/json",
};

const AGENT_TYPE = "contact-finder";
const CANONICAL_BATCH_SIZE = 500;
const DISCOVERY_BATCH_SIZE = 25;
const ORG_REUSE_BATCH = 400;
const TIME_BUDGET_MS = 150_000;
const CANONICAL_BUDGET_MS = 60_000;
const HTTP_URL = /^https?:\/\//i;
const CONTACT_TYPES = new Set(["contractor", "government", "financier", "consultant", "owner", "general"]);

type ContactCandidate = {
  name?: unknown;
  role?: unknown;
  organization?: unknown;
  phone?: unknown;
  email?: unknown;
  contact_type?: unknown;
  source_url?: unknown;
};

type Project = {
  id: string;
  name: string;
  country: string | null;
  region: string | null;
  sector: string | null;
  source_url: string | null;
};

/** Postgrest/JS errors stringify to "[object Object]" — keep the real detail. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const parts = [e.message, e.details, e.hint, e.code].filter(Boolean).map(String);
    if (parts.length) return parts.join(" | ");
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function httpUrl(value: unknown): string | null {
  const candidate = text(value);
  return HTTP_URL.test(candidate) && isPlausibleSourceUrl(candidate) ? candidate : null;
}

function isReachableContact(candidate: ContactCandidate, sourceUrl: string | null): boolean {
  return Boolean(text(candidate.name) && (text(candidate.email) || text(candidate.phone)) && sourceUrl);
}

function parseContacts(raw: string): ContactCandidate[] {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  try {
    const parsed = JSON.parse(fenced);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.contacts) ? parsed.contacts : [];
  } catch {
    const start = fenced.indexOf("[");
    const end = fenced.lastIndexOf("]");
    if (start < 0 || end <= start) return [];
    try {
      const parsed = JSON.parse(fenced.slice(start, end + 1));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

async function updateTask(supabase: any, taskId: string, result: Record<string, unknown>) {
  await supabase.from("research_tasks").update({
    status: "completed",
    result,
    completed_at: new Date().toISOString(),
  }).eq("id", taskId);
}

async function loadConfig(supabase: any) {
  const { data, error } = await supabase.from("agent_config")
    .select("contact_canonicalization_completed_at, contact_cursor_contact_created_at, contact_cursor_contact_id")
    .eq("agent_type", AGENT_TYPE)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Phase 1 — drain the legacy backlog into canonical companies/contacts. Bounded by its own budget. */
async function canonicalizeExisting(supabase: any, startedAt: Date) {
  let config = await loadConfig(supabase);
  const totals = { processed: 0, companies_upserted: 0, contacts_upserted: 0, roles_upserted: 0, skipped: 0, completed: false, last_error: null as string | null };

  while (Date.now() - startedAt.getTime() < CANONICAL_BUDGET_MS) {
    const { data, error } = await supabase.rpc("canonicalize_contact_batch", {
      p_after_created_at: config?.contact_cursor_contact_created_at ?? null,
      p_after_id: config?.contact_cursor_contact_id ?? null,
      p_limit: CANONICAL_BATCH_SIZE,
    });
    if (error) throw error;

    const result = data ?? {};
    totals.processed += Number(result.processed ?? 0);
    totals.companies_upserted += Number(result.companies_upserted ?? 0);
    totals.contacts_upserted += Number(result.contacts_upserted ?? 0);
    totals.roles_upserted += Number(result.roles_upserted ?? 0);
    totals.skipped += Number(result.skipped ?? 0);
    if (result.last_error) totals.last_error = String(result.last_error);

    const exhausted = result.exhausted === true;
    const patch = exhausted
      ? {
          contact_canonicalization_completed_at: new Date().toISOString(),
          contact_cursor_contact_created_at: null,
          contact_cursor_contact_id: null,
        }
      : {
          contact_cursor_contact_created_at: (result.next_created_at as string | null) ?? null,
          contact_cursor_contact_id: (result.next_id as string | null) ?? null,
        };
    const { error: updateError } = await supabase.from("agent_config").update(patch).eq("agent_type", AGENT_TYPE);
    if (updateError) throw updateError;

    if (exhausted) {
      totals.completed = true;
      break;
    }
    config = {
      contact_cursor_contact_created_at: patch.contact_cursor_contact_created_at,
      contact_cursor_contact_id: patch.contact_cursor_contact_id,
    };
  }

  return totals;
}

async function loadDiscoveryQueue(supabase: any, requestedProjectId?: string): Promise<Project[]> {
  if (requestedProjectId) {
    const { data, error } = await supabase.from("projects")
      .select("id, name, country, region, sector, source_url")
      .eq("id", requestedProjectId)
      .limit(1);
    if (error) throw error;
    return (data ?? []) as Project[];
  }
  const { data, error } = await supabase.rpc("contact_discovery_queue", {
    p_limit: DISCOVERY_BATCH_SIZE,
    p_cooldown_hours: 336,
  });
  if (error) throw error;
  return (data ?? []) as Project[];
}

function normalizeRows(project: Project, candidates: ContactCandidate[], allowedUrls: Set<string>) {
  return candidates.flatMap((candidate) => {
    const sourceUrl = httpUrl(candidate.source_url);
    if (!isReachableContact(candidate, sourceUrl)) return [];
    if (allowedUrls.size && !allowedUrls.has(sourceUrl!.toLowerCase())) return [];
    const contactType = text(candidate.contact_type).toLowerCase();
    return [{
      project_id: project.id,
      name: text(candidate.name).slice(0, 200),
      role: text(candidate.role).slice(0, 200),
      organization: text(candidate.organization).slice(0, 200),
      phone: text(candidate.phone) || null,
      email: text(candidate.email) || null,
      contact_type: CONTACT_TYPES.has(contactType) ? contactType : "general",
      source: "contact-finder",
      source_url: sourceUrl,
      added_by: "ai",
    }];
  });
}

async function insertContacts(supabase: any, rows: Record<string, unknown>[]): Promise<number> {
  if (!rows.length) return 0;
  const { error } = await supabase.from("project_contacts").upsert(rows, {
    onConflict: "project_id,name,organization",
    ignoreDuplicates: true,
  });
  if (error) throw error;
  return rows.length;
}

/** Step A — read the project's own registry/official page and extract contacts from it. */
async function harvestFromOwnPage(supabase: any, project: Project): Promise<{ contacts: number; links: string[] }> {
  const pageUrl = httpUrl(project.source_url);
  if (!pageUrl || !isFirecrawlConfigured() || !isLlmConfigured()) return { contacts: 0, links: [] };

  const page = await firecrawlScrape(pageUrl, { formats: ["markdown", "links"], onlyMainContent: true });
  const markdown = page?.markdown;
  if (!markdown || markdown.length < 200) return { contacts: 0, links: [] };

  const res = await chatCompletions({
    messages: [
      {
        role: "system",
        content:
          "Extract contact details that literally appear in the supplied page text. Never invent names, emails, phone numbers, organizations or URLs. Return ONLY a JSON array of objects with name, role, organization, phone, email, contact_type (contractor|government|financier|consultant|owner|general). Omit any contact without an email or phone that appears verbatim in the text. Return [] when there are none.",
      },
      {
        role: "user",
        content: `Project: ${project.name} (${project.country ?? "unknown"}, ${project.sector ?? "unknown"}).\nPage: ${pageUrl}\n\n${markdown.slice(0, 24_000)}`,
      },
    ],
    temperature: 0,
  });
  if (!res.ok) return { contacts: 0, links: [] };
  const body = await res.json().catch(() => null);
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return { contacts: 0, links: [] };

  const candidates = parseContacts(content).map((c) => ({ ...c, source_url: pageUrl }));
  const rows = normalizeRows(project, candidates, new Set([pageUrl.toLowerCase()]));
  const inserted = await insertContacts(supabase, rows);
  if (inserted) {
    await recordAgentEvent(supabase, AGENT_TYPE, "contacts_scraped", `${inserted} contact(s) from the project page`, null, { contacts_added: inserted }, { project_id: project.id });
  }
  const links = Array.isArray((page as any)?.links) ? ((page as any).links as string[]) : [];
  return { contacts: inserted, links };
}

/** Step B — cited web research when the project's own page yields nothing. */
async function researchContacts(supabase: any, project: Project, taskId: string): Promise<{ contacts: number; citations: string[] }> {
  const { data: stakeholderRows } = await supabase
    .from("project_stakeholders").select("name").eq("project_id", project.id).limit(10);
  const stakeholders = (stakeholderRows ?? []).map((row: { name: string | null }) => text(row.name)).filter(Boolean).slice(0, 5);

  const research = await fetchAgentResearch({
    agentName: AGENT_TYPE,
    systemPrompt:
      "You are a source-grounded infrastructure contact researcher. Never invent names, organizations, emails, phone numbers, or URLs. Return a JSON array only, with objects containing name, role, organization, phone, email, contact_type, and source_url. If a detail is not explicitly supported by a cited public source, omit the contact.",
    userPrompt: [
      `Find publicly listed contact details for organizations and named people involved in the infrastructure project "${project.name}".`,
      `Country: ${project.country ?? "unknown"}. Sector: ${project.sector ?? "unknown"}.`,
      `Known stakeholders: ${stakeholders.join(", ") || "none"}.`,
      "Return only contacts with a public email address or phone number and a URL that directly supports that contact.",
    ].join(" "),
    searchRecencyFilter: "year",
  });

  if (!research.ok) {
    await recordAgentEvent(supabase, AGENT_TYPE, "research_failed", research.error, taskId, {}, { project_id: project.id });
    return { contacts: 0, citations: [] };
  }
  if (!research.citations.length) {
    await recordAgentEvent(supabase, AGENT_TYPE, "research_degraded", "Research provider returned no citations; nothing persisted", taskId, {}, { project_id: project.id, provider: "lovable" });
    return { contacts: 0, citations: [] };
  }

  const allowed = new Set(research.citations.map((url) => url.toLowerCase()));
  const rows = normalizeRows(project, parseContacts(research.text), allowed);
  const inserted = await insertContacts(supabase, rows);
  if (inserted) {
    await recordAgentEvent(supabase, AGENT_TYPE, "contacts_discovered", `${inserted} cited contact(s) added`, taskId, { contacts_added: inserted }, { project_id: project.id });
  }
  return { contacts: inserted, citations: research.citations };
}

/** Step C — record corroborating sources so projects stop living on a single registry URL. */
async function addEvidence(supabase: any, project: Project, urls: string[]): Promise<number> {
  const clean = Array.from(new Set(urls.filter((u) => isPlausibleSourceUrl(u)).map((u) => u.trim()))).slice(0, 5);
  if (!clean.length) return 0;

  const { data: existing } = await supabase.from("evidence_sources").select("url").eq("project_id", project.id);
  const known = new Set((existing ?? []).map((row: { url: string | null }) => (row.url ?? "").toLowerCase()));
  const rows = clean
    .filter((url) => !known.has(url.toLowerCase()))
    .map((url) => {
      let host = "";
      try {
        host = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        host = "source";
      }
      return {
        project_id: project.id,
        source: host,
        url,
        type: "News",
        verified: false,
        date: new Date().toISOString().split("T")[0],
        title: `Corroborating source (${host})`,
        description: `Discovered while researching contacts for ${project.name}.`,
        added_by: "ai",
      };
    });
  if (!rows.length) return 0;
  const { error } = await supabase.from("evidence_sources").insert(rows);
  if (error) return 0;
  return rows.length;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  const supabase = gate.supabaseAdmin;
  if (!await isAgentEnabled(supabase, AGENT_TYPE)) return pausedResponse(AGENT_TYPE);

  let bodyProjectId: string | undefined;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (typeof body?.project_id === "string" && body.project_id.trim()) bodyProjectId = body.project_id.trim();
    } catch { /* scheduled invocation has an empty body */ }
  }

  const lock = await beginAgentTask(supabase, AGENT_TYPE, bodyProjectId ? `Contact finder: ${bodyProjectId}` : "Canonical indexing, organisation reuse and contact discovery", gate.userId ?? undefined);
  if (lock.alreadyRunning) return alreadyRunningResponse(AGENT_TYPE);
  const taskId = lock.taskId;
  const startedAt = new Date();

  const summary: Record<string, unknown> = { phases: [] as string[] };

  try {
    // Phase 1 — canonicalization backlog (skipped for single-project requests).
    if (!bodyProjectId) {
      const config = await loadConfig(supabase);
      if (!config?.contact_canonicalization_completed_at) {
        await setTaskStep(supabase, taskId, "Canonicalizing existing contacts");
        summary.canonicalization = await canonicalizeExisting(supabase, startedAt);
        (summary.phases as string[]).push("canonicalization");
      }

      // Phase 2 — organisation-level reuse (pure SQL, no AI credits).
      await setTaskStep(supabase, taskId, "Reusing organisation contacts");
      const { data: reuse, error: reuseError } = await supabase.rpc("attach_org_contacts", { p_limit: ORG_REUSE_BATCH });
      if (reuseError) {
        await recordAgentEvent(supabase, AGENT_TYPE, "org_reuse_failed", describeError(reuseError), taskId, {}, {});
      } else {
        summary.organisation_reuse = reuse;
        (summary.phases as string[]).push("organisation_reuse");
      }
    }

    // Phase 3 — discovery over the real backlog queue.
    let contactsAdded = 0;
    let evidenceAdded = 0;
    let projectsScanned = 0;
    if (Date.now() - startedAt.getTime() < TIME_BUDGET_MS) {
      await setTaskStep(supabase, taskId, "Discovering contacts and evidence");
      const projects = await loadDiscoveryQueue(supabase, bodyProjectId);
      for (const project of projects) {
        if (Date.now() - startedAt.getTime() >= TIME_BUDGET_MS) break;
        projectsScanned++;
        try {
          const scraped = await harvestFromOwnPage(supabase, project);
          contactsAdded += scraped.contacts;
          let citations: string[] = [];
          if (!scraped.contacts) {
            const researched = await researchContacts(supabase, project, taskId);
            contactsAdded += researched.contacts;
            citations = researched.citations;
          }
          evidenceAdded += await addEvidence(supabase, project, citations);
        } catch (projectError) {
          await recordAgentEvent(supabase, AGENT_TYPE, "project_scan_failed", describeError(projectError), taskId, {}, { project_id: project.id });
        }
        await supabase.from("projects").update({ last_contact_scan_at: new Date().toISOString() }).eq("id", project.id);
      }
      summary.discovery = {
        projects_scanned: projectsScanned,
        contacts_added: contactsAdded,
        evidence_added: evidenceAdded,
        citations_required: true,
      };
      (summary.phases as string[]).push("discovery");
    }

    await updateTask(supabase, taskId, summary);
    await finishAgentRun(supabase, AGENT_TYPE, "completed", startedAt);
    return new Response(JSON.stringify({ success: true, ...summary }), { headers: corsHeaders });
  } catch (error) {
    const detail = describeError(error);
    console.error("Contact finder error:", detail);
    await failAgentTask(supabase, AGENT_TYPE, taskId, startedAt, detail);
    return new Response(JSON.stringify({ error: "Contact finder failed", detail }), { status: 500, headers: corsHeaders });
  }
});
