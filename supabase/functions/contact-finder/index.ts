import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAgentResearch } from "../_shared/agentResearch.ts";
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
const CANONICAL_BATCH_SIZE = 300;
const DISCOVERY_BATCH_SIZE = 2;
const TIME_BUDGET_MS = 120_000;
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

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function httpUrl(value: unknown): string | null {
  const candidate = text(value);
  return HTTP_URL.test(candidate) ? candidate : null;
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

async function canonicalizeExisting(supabase: any, config: any) {
  const { data, error } = await supabase.rpc("canonicalize_contact_batch", {
    p_after_created_at: config?.contact_cursor_contact_created_at ?? null,
    p_after_id: config?.contact_cursor_contact_id ?? null,
    p_limit: CANONICAL_BATCH_SIZE,
  });
  if (error) throw error;

  const result = data ?? {};
  const nextCreatedAt = result.next_created_at as string | null | undefined;
  const nextId = result.next_id as string | null | undefined;
  const exhausted = result.exhausted === true;
  const patch = exhausted
    ? { contact_canonicalization_completed_at: new Date().toISOString(), contact_cursor_contact_created_at: null, contact_cursor_contact_id: null }
    : { contact_cursor_contact_created_at: nextCreatedAt ?? null, contact_cursor_contact_id: nextId ?? null };

  const { error: updateError } = await supabase.from("agent_config").update(patch).eq("agent_type", AGENT_TYPE);
  if (updateError) throw updateError;
  return { ...result, phase: "canonicalization", completed: exhausted };
}

async function loadConfig(supabase: any) {
  const { data, error } = await supabase.from("agent_config")
    .select("contact_canonicalization_completed_at, contact_cursor_contact_created_at, contact_cursor_contact_id")
    .eq("agent_type", AGENT_TYPE)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadDiscoveryProjects(supabase: any, requestedProjectId?: string): Promise<Project[]> {
  let query = supabase.from("projects")
    .select("id, name, country, region, sector, source_url")
    .order("created_at", { ascending: false })
    .limit(50);
  if (requestedProjectId) query = query.eq("id", requestedProjectId);
  const { data, error } = await query;
  if (error) throw error;
  if (requestedProjectId) return (data ?? []) as Project[];

  const ids = (data ?? []).map((project: Project) => project.id);
  if (!ids.length) return [];
  const { data: existing, error: existingError } = await supabase
    .from("project_contacts")
    .select("project_id")
    .in("project_id", ids);
  if (existingError) throw existingError;
  const counts = new Map<string, number>();
  for (const row of existing ?? []) counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
  return (data ?? []).filter((project: Project) => (counts.get(project.id) ?? 0) < 2).slice(0, DISCOVERY_BATCH_SIZE) as Project[];
}

async function discoverForProject(supabase: any, project: Project, taskId: string): Promise<number> {
  await setTaskStep(supabase, taskId, `Researching ${project.name}`);
  const { data: stakeholderRows, error: stakeholderError } = await supabase
    .from("project_stakeholders").select("name").eq("project_id", project.id).limit(10);
  if (stakeholderError) throw stakeholderError;
  const stakeholders = (stakeholderRows ?? []).map((row: { name: string | null }) => text(row.name)).filter(Boolean).slice(0, 5);
  const query = [
    `Find publicly listed contact details for organizations and named people involved in the infrastructure project "${project.name}".`,
    `Country: ${project.country ?? "unknown"}. Sector: ${project.sector ?? "unknown"}.`,
    `Known stakeholders: ${stakeholders.join(", ") || "none"}.`,
    "Return only contacts with a public email address or phone number and a URL that directly supports that contact.",
  ].join(" ");
  const research = await fetchAgentResearch({
    agentName: AGENT_TYPE,
    systemPrompt: "You are a source-grounded infrastructure contact researcher. Never invent names, organizations, emails, phone numbers, or URLs. Return a JSON array only, with objects containing name, role, organization, phone, email, contact_type, and source_url. If a detail is not explicitly supported by a cited public source, omit the contact.",
    userPrompt: query,
    searchRecencyFilter: "year",
  });
  if (!research.ok) {
    await recordAgentEvent(supabase, AGENT_TYPE, "research_failed", research.error, taskId, {}, { project_id: project.id });
    return 0;
  }
  if (!research.citations.length) {
    await recordAgentEvent(supabase, AGENT_TYPE, "research_degraded", "Research provider returned no citations; nothing persisted", taskId, {}, { project_id: project.id, provider: "lovable" });
    return 0;
  }

  const candidates = parseContacts(research.text);
  const citationSet = new Set(research.citations.map((url) => url.toLowerCase()));
  const rows = candidates.flatMap((candidate) => {
    const sourceUrl = httpUrl(candidate.source_url);
    const normalizedSource = sourceUrl?.toLowerCase();
    if (!isReachableContact(candidate, sourceUrl) || !normalizedSource || !citationSet.has(normalizedSource)) return [];
    const contactType = text(candidate.contact_type).toLowerCase();
    return [{
      project_id: project.id,
      name: text(candidate.name),
      role: text(candidate.role),
      organization: text(candidate.organization),
      phone: text(candidate.phone) || null,
      email: text(candidate.email) || null,
      contact_type: CONTACT_TYPES.has(contactType) ? contactType : "general",
      source: "contact-finder",
      source_url: sourceUrl,
      added_by: "ai",
    }];
  });
  if (!rows.length) return 0;

  const { error: insertError } = await supabase.from("project_contacts").upsert(rows, {
    onConflict: "project_id,name,organization",
    ignoreDuplicates: true,
  });
  if (insertError) throw insertError;
  await recordAgentEvent(supabase, AGENT_TYPE, "contacts_discovered", `${rows.length} cited contact(s) added`, taskId, { contacts_added: rows.length }, { project_id: project.id });
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

  const lock = await beginAgentTask(supabase, AGENT_TYPE, bodyProjectId ? `Contact finder: ${bodyProjectId}` : "Canonical contact indexing and discovery", gate.userId);
  if (lock.alreadyRunning) return alreadyRunningResponse(AGENT_TYPE);
  const taskId = lock.taskId;
  const startedAt = new Date();

  try {
    const config = await loadConfig(supabase);
    if (!config?.contact_canonicalization_completed_at && !bodyProjectId) {
      await setTaskStep(supabase, taskId, "Canonicalizing existing contacts");
      const result = await canonicalizeExisting(supabase, config);
      await updateTask(supabase, taskId, result);
      await finishAgentRun(supabase, AGENT_TYPE, "completed", startedAt);
      return new Response(JSON.stringify({ success: true, ...result }), { headers: corsHeaders });
    }

    const projects = await loadDiscoveryProjects(supabase, bodyProjectId);
    let contactsAdded = 0;
    let projectsScanned = 0;
    for (const project of projects) {
      if (Date.now() - startedAt.getTime() >= TIME_BUDGET_MS) break;
      contactsAdded += await discoverForProject(supabase, project, taskId);
      projectsScanned++;
    }
    const result = { phase: "discovery", projects_scanned: projectsScanned, contacts_added: contactsAdded, citations_required: true };
    await updateTask(supabase, taskId, result);
    await finishAgentRun(supabase, AGENT_TYPE, "completed", startedAt);
    return new Response(JSON.stringify({ success: true, ...result }), { headers: corsHeaders });
  } catch (error) {
    console.error("Contact finder error:", error);
    await failAgentTask(supabase, AGENT_TYPE, taskId, startedAt, error);
    return new Response(JSON.stringify({ error: "Contact finder failed", detail: error instanceof Error ? error.message : String(error) }), { status: 500, headers: corsHeaders });
  }
});
