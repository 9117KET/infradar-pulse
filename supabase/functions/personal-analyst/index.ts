/**
 * personal-analyst
 *
 * Every user gets one standing AI analyst. It watches their patch (regions,
 * sectors, stages, countries, value floor, tracked projects), answers their
 * saved standing questions, and writes cited briefings into
 * public.user_agent_briefings.
 *
 * Two entry modes:
 *   mode: "run"      — a signed-in user runs their own analyst now (AI quota).
 *   mode: "dispatch" — the scheduler (service-role bearer) processes every
 *                      analyst whose next_run_at is due.
 *
 * Guardrails:
 *   - Nothing is asserted without a source URL; uncited claims are dropped.
 *   - AI credit / policy failures (402/403/429) end the run cleanly and leave
 *     next_run_at untouched so the next tick retries.
 *   - Anything the analyst cannot decide is escalated via escalate_to_human.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions, GatewayError, gatewayFailure } from "../_shared/llm.ts";
import { requireAiEntitlementOrRespond } from "../_shared/requireAi.ts";
import { getEntitlementForUser } from "../_shared/entitlementCheck.ts";
import { getAnalystCap } from "../_shared/billing.ts";
import { fetchAgentResearch } from "../_shared/agentResearch.ts";
import {
  isAgentEnabled,
  pausedResponse,
  beginAgentTask,
  alreadyRunningResponse,
  finishAgentRun,
  failAgentTask,
  recordAgentEvent,
  setTaskStep,
} from "../_shared/agentGate.ts";

const AGENT = "personal-analyst";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

const OVERALL_BUDGET_MS = 100_000;
const PER_AGENT_BUDGET_MS = 40_000;

type AnalystRow = {
  id: string;
  user_id: string;
  name: string;
  enabled: boolean;
  regions: string[];
  sectors: string[];
  stages: string[];
  countries: string[];
  min_value_usd: number | null;
  tracked_only: boolean;
  cadence: "daily" | "weekly";
  channels: string[];
  include_report: boolean;
  last_run_at: string | null;
};

type Citation = { label: string; url: string };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function isHttpUrl(u: unknown): u is string {
  return typeof u === "string" && /^https?:\/\/\S+$/i.test(u.trim());
}

function nextRunFrom(cadence: string): string {
  const hours = cadence === "daily" ? 24 : 24 * 7;
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

/** Load (or lazily create) the caller's analyst. */
async function loadOrCreateAnalyst(supabase: SupabaseClient, userId: string): Promise<AnalystRow> {
  const { data } = await supabase.from("user_agents").select("*").eq("user_id", userId).maybeSingle();
  if (data) return data as AnalystRow;

  const { data: profile } = await supabase
    .from("profiles")
    .select("regions, sectors, stages")
    .eq("id", userId)
    .maybeSingle();

  const { data: created, error } = await supabase
    .from("user_agents")
    .insert({
      user_id: userId,
      regions: profile?.regions ?? [],
      sectors: profile?.sectors ?? [],
      stages: profile?.stages ?? [],
    })
    .select("*")
    .single();
  if (error) throw new Error(`Could not create analyst: ${error.message}`);
  return created as AnalystRow;
}

/** Projects matching the analyst's focus. */
async function matchingProjects(supabase: SupabaseClient, agent: AnalystRow) {
  let trackedIds: string[] | null = null;
  if (agent.tracked_only) {
    const { data } = await supabase.from("tracked_projects").select("project_id").eq("user_id", agent.user_id);
    trackedIds = (data ?? []).map((r: { project_id: string }) => r.project_id);
    if (trackedIds.length === 0) return { projects: [], trackedIds };
  }

  let q = supabase
    .from("projects")
    .select("id, name, country, region, sector, stage, status, value_usd, risk_score, confidence, source_url, last_updated")
    .eq("approval_status", "approved")
    .order("last_updated", { ascending: false })
    .limit(60);

  if (agent.regions.length) q = q.in("region", agent.regions);
  if (agent.sectors.length) q = q.in("sector", agent.sectors);
  if (agent.stages.length) q = q.in("stage", agent.stages);
  if (agent.countries.length) q = q.in("country", agent.countries);
  if (agent.min_value_usd) q = q.gte("value_usd", agent.min_value_usd);
  if (trackedIds) q = q.in("id", trackedIds);

  const { data, error } = await q;
  if (error) throw new Error(`Project lookup failed: ${error.message}`);
  return { projects: data ?? [], trackedIds };
}

/** Material changes since the analyst last ran. */
async function watchChanges(supabase: SupabaseClient, agent: AnalystRow, projectIds: string[]) {
  if (projectIds.length === 0) return [];
  const since = agent.last_run_at ?? new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const { data } = await supabase
    .from("project_updates")
    .select("project_id, field_changed, old_value, new_value, source, created_at, projects ( name, country, sector, source_url )")
    .in("project_id", projectIds.slice(0, 100))
    .gte("created_at", since)
    .in("field_changed", ["stage", "status", "value_usd", "confidence"])
    .order("created_at", { ascending: false })
    .limit(25);
  return data ?? [];
}

/** Ask the model for a cited briefing. Throws GatewayError on gateway failures. */
async function synthesise(payload: unknown, instruction: string) {
  const res = await chatCompletions({
    messages: [
      {
        role: "system",
        content:
          "You are a senior infrastructure intelligence analyst writing for one named client. Be specific and short. Every factual claim must be traceable to a URL supplied in the input or found by research — never invent a source, a contact, a value or a date. If the evidence is thin, say so plainly and mark it as unconfirmed.",
      },
      { role: "user", content: `${instruction}\n\nInput JSON:\n${JSON.stringify(payload).slice(0, 90_000)}` },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "write_briefing",
          description: "Write a cited intelligence briefing",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              summary: { type: "string" },
              markdown: { type: "string" },
              unconfirmed: { type: "array", items: { type: "string" } },
              citations: {
                type: "array",
                items: {
                  type: "object",
                  properties: { label: { type: "string" }, url: { type: "string" } },
                  required: ["label", "url"],
                },
              },
            },
            required: ["title", "summary", "markdown", "citations"],
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "write_briefing" } },
  });

  if (!res.ok) throw await gatewayFailure(res, "personal-analyst synthesis");

  const data = await res.json();
  try {
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    const parsed = JSON.parse(args) as {
      title: string;
      summary: string;
      markdown: string;
      unconfirmed?: string[];
      citations?: Citation[];
    };
    const citations = (parsed.citations ?? []).filter((c) => c && isHttpUrl(c.url)).slice(0, 20);
    return { ...parsed, citations };
  } catch {
    return null;
  }
}

async function sendBriefingEmail(
  supabase: SupabaseClient,
  userId: string,
  briefingId: string,
  title: string,
  summary: string,
  citations: Citation[],
) {
  try {
    const [{ data: profile }, { data: authRes }] = await Promise.all([
      supabase.from("profiles").select("email_alerts").eq("id", userId).maybeSingle(),
      supabase.auth.admin.getUserById(userId),
    ]);
    const email = authRes?.user?.email;
    if (!email || profile?.email_alerts === false) return;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      body: JSON.stringify({
        templateName: "digest-email",
        recipientEmail: email,
        idempotencyKey: `analyst-briefing:${briefingId}`,
        templateData: {
          title,
          summary,
          sections: [],
          citations,
          ruleName: "Your Analyst",
        },
      }),
    });
    await supabase.from("user_agent_briefings").update({ emailed_at: new Date().toISOString() }).eq("id", briefingId);
  } catch (e) {
    console.error("personal-analyst: email delivery failed", e);
  }
}

/** One full analyst run. Returns counts; throws GatewayError when AI is blocked. */
async function runAnalyst(
  supabase: SupabaseClient,
  agent: AnalystRow,
  taskId: string | null,
  deadline: number,
): Promise<{ briefings: number; alerts: number; answers: number }> {
  const ent = await getEntitlementForUser(supabase, agent.user_id, "live");
  const cap = getAnalystCap(ent.plan);
  const counts = { briefings: 0, alerts: 0, answers: 0 };

  if (taskId) await setTaskStep(supabase, taskId, "Analyzing");

  const { projects } = await matchingProjects(supabase, agent);
  const projectIds = projects.map((p: { id: string }) => p.id);
  const changes = await watchChanges(supabase, agent, projectIds);

  // 1) The brief.
  const brief = await synthesise(
    {
      analyst: agent.name,
      focus: {
        regions: agent.regions,
        sectors: agent.sectors,
        stages: agent.stages,
        countries: agent.countries,
        min_value_usd: agent.min_value_usd,
        tracked_only: agent.tracked_only,
      },
      cadence: agent.cadence,
      projects: projects.slice(0, 40),
      material_changes: changes,
    },
    `Write the client's ${agent.cadence} intelligence brief. Lead with what changed and what it means for them. Cite the project source URLs supplied. Keep it under 400 words.`,
  );

  if (brief) {
    const { data: inserted } = await supabase
      .from("user_agent_briefings")
      .insert({
        agent_id: agent.id,
        user_id: agent.user_id,
        kind: "brief",
        title: brief.title,
        summary: brief.summary,
        body: brief.markdown,
        sources: brief.citations,
        metadata: { unconfirmed: brief.unconfirmed ?? [], projects: projectIds.length, changes: changes.length },
      })
      .select("id")
      .single();
    counts.briefings++;
    if (inserted && agent.channels.includes("email")) {
      await sendBriefingEmail(supabase, agent.user_id, inserted.id, brief.title, brief.summary, brief.citations);
    }
  }

  // 2) Watch findings into the alerts feed.
  if (agent.channels.includes("alerts")) {
    for (const c of changes.slice(0, 8)) {
      const p = (c as { projects?: { name?: string; source_url?: string } }).projects ?? {};
      const { error } = await supabase.from("alerts").insert({
        project_id: (c as { project_id: string }).project_id,
        project_name: p.name ?? null,
        message: `${p.name ?? "Tracked project"}: ${(c as { field_changed: string }).field_changed} changed from "${(c as { old_value: string }).old_value ?? "—"}" to "${(c as { new_value: string }).new_value ?? "—"}".`,
        severity: "medium",
        category: "market",
        source_url: p.source_url ?? null,
        origin: "ai_agent",
      });
      if (!error) counts.alerts++;
    }
  }

  // 3) Standing questions, grounded in real research.
  const { data: questions } = await supabase
    .from("user_agent_questions")
    .select("id, question")
    .eq("agent_id", agent.id)
    .eq("enabled", true)
    .order("created_at", { ascending: true })
    .limit(cap.maxQuestions);

  for (const q of questions ?? []) {
    if (Date.now() > deadline) break;
    const research = await fetchAgentResearch({
      agentName: AGENT,
      systemPrompt:
        "You research global infrastructure projects. Answer only from sources you can cite with a URL. If you cannot verify, say so.",
      userPrompt: (q as { question: string }).question,
      searchRecencyFilter: "week",
    });
    if (!research.ok) {
      await recordAgentEvent(supabase, AGENT, "research_failed", research.error, taskId, {}, { question_id: q.id });
      continue;
    }
    const answer = await synthesise(
      {
        question: (q as { question: string }).question,
        research: research.text.slice(0, 20_000),
        research_citations: research.citations,
        related_projects: projects.slice(0, 15),
      },
      "Answer the client's standing question. Only state what the research supports, and cite it. If the research does not answer it, say so and list what is still unknown.",
    );
    if (!answer) continue;
    const sources = answer.citations.length
      ? answer.citations
      : research.citations.filter(isHttpUrl).map((url) => ({ label: "Source", url }));
    if (sources.length === 0) {
      await recordAgentEvent(supabase, AGENT, "uncited_answer_dropped", "Answer had no citable source", taskId, {}, {
        question_id: q.id,
      });
      continue;
    }
    await supabase.from("user_agent_briefings").insert({
      agent_id: agent.id,
      user_id: agent.user_id,
      question_id: q.id,
      kind: "answer",
      title: answer.title,
      summary: answer.summary,
      body: answer.markdown,
      sources,
      metadata: { unconfirmed: answer.unconfirmed ?? [] },
    });
    await supabase.from("user_agent_questions").update({ last_answered_at: new Date().toISOString() }).eq("id", q.id);
    counts.answers++;
  }

  // 4) Period report (paid plans).
  if (agent.include_report && cap.autoReport && Date.now() < deadline) {
    const report = await synthesise(
      {
        focus: { regions: agent.regions, sectors: agent.sectors, countries: agent.countries },
        projects: projects.slice(0, 40),
        material_changes: changes,
      },
      "Draft a client-ready report: market context, pipeline by stage, the movements that matter, risks, and the opportunity windows in the next 90 days. Cite every claim.",
    );
    if (report) {
      await supabase.from("user_agent_briefings").insert({
        agent_id: agent.id,
        user_id: agent.user_id,
        kind: "report",
        title: report.title,
        summary: report.summary,
        body: report.markdown,
        sources: report.citations,
        metadata: { unconfirmed: report.unconfirmed ?? [] },
      });
      counts.briefings++;
    }
  }

  if (counts.briefings === 0 && counts.answers === 0) {
    await supabase.rpc("escalate_to_human", {
      p_process: AGENT,
      p_reason_code: "analyst_produced_nothing",
      p_detail: "The analyst run finished without a usable briefing — check the user's focus filters and the AI response.",
      p_severity: "low",
      p_subject_type: "user_agent",
      p_subject_id: agent.id,
      p_project_id: null,
      p_metadata: { user_id: agent.user_id, projects: projectIds.length },
    }).then(() => {}, () => {});
  }

  await supabase
    .from("user_agents")
    .update({
      last_run_at: new Date().toISOString(),
      next_run_at: nextRunFrom(cap.allowDaily ? agent.cadence : "weekly"),
      run_state: { ...counts, at: new Date().toISOString() },
    })
    .eq("id", agent.id);

  return counts;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const body = req.method === "POST" ? await req.clone().json().catch(() => ({})) : {};
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const isScheduler = bearer.length > 0 && bearer === serviceKey;
  const mode = isScheduler && body?.mode !== "run" ? "dispatch" : "run";

  if (!(await isAgentEnabled(supabase, AGENT))) return pausedResponse(AGENT);

  const startedAt = new Date();
  const deadline = Date.now() + OVERALL_BUDGET_MS;

  // ---- Scheduled dispatch: every analyst that is due. ----
  if (mode === "dispatch") {
    const lock = await beginAgentTask(supabase, AGENT, "dispatch", undefined);
    if (lock.alreadyRunning) return alreadyRunningResponse(AGENT);
    const taskId = lock.taskId;
    let processed = 0;
    let aiBlocked: GatewayError | null = null;
    try {
      const limit = Math.min(Math.max(Number(body?.limit) || 10, 1), 50);
      const { data: due, error } = await supabase.rpc("due_user_agents", { p_limit: limit });
      if (error) throw new Error(`due_user_agents failed: ${error.message}`);

      for (const agent of (due ?? []) as AnalystRow[]) {
        if (Date.now() > deadline - PER_AGENT_BUDGET_MS) break;
        try {
          await runAnalyst(supabase, agent, taskId, Math.min(deadline, Date.now() + PER_AGENT_BUDGET_MS));
          processed++;
        } catch (e) {
          if (e instanceof GatewayError && e.endRunGracefully) {
            aiBlocked = e;
            break;
          }
          await recordAgentEvent(supabase, AGENT, "agent_run_failed", String(e).slice(0, 500), taskId, {}, {
            user_agent_id: agent.id,
          });
        }
      }

      if (aiBlocked) {
        await recordAgentEvent(supabase, AGENT, "ai_unavailable", aiBlocked.message, taskId, { processed });
        await supabase
          .from("research_tasks")
          .update({
            status: "completed",
            result: { processed, ai_unavailable: true, status: aiBlocked.status },
            completed_at: new Date().toISOString(),
          })
          .eq("id", taskId);
        await finishAgentRun(supabase, AGENT, "completed", startedAt);
        return json({ success: false, code: "ai_unavailable", status: aiBlocked.status, error: aiBlocked.message, processed });
      }

      await supabase
        .from("research_tasks")
        .update({ status: "completed", result: { processed }, completed_at: new Date().toISOString() })
        .eq("id", taskId);
      await finishAgentRun(supabase, AGENT, "completed", startedAt);
      return json({ success: true, processed });
    } catch (e) {
      await failAgentTask(supabase, AGENT, taskId, startedAt, e);
      return json({ success: false, error: "An internal error occurred." }, 500);
    }
  }

  // ---- On-demand: the signed-in user runs their own analyst. ----
  const gate = await requireAiEntitlementOrRespond(req);
  if (gate instanceof Response) return gate;

  try {
    const agent = await loadOrCreateAnalyst(supabase, gate.userId);
    if (!agent.enabled) return json({ success: false, error: "Your analyst is switched off." }, 400);
    const counts = await runAnalyst(supabase, agent, null, Date.now() + PER_AGENT_BUDGET_MS * 2);
    return json({ success: true, ...counts });
  } catch (e) {
    if (e instanceof GatewayError && e.endRunGracefully) {
      await recordAgentEvent(supabase, AGENT, "ai_unavailable", e.message, null, {}, { user_id: gate.userId });
      return json({ success: false, code: "ai_unavailable", status: e.status, error: e.message }, 200);
    }
    console.error("personal-analyst error:", e);
    return json({ success: false, error: "An internal error occurred. Please try again." }, 500);
  }
});
