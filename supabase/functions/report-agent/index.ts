/**
 * report-agent
 *
 * Generates scheduled weekly/monthly intelligence briefs and market review artifacts.
 * Stores Markdown + citations in public.report_runs and mirrors progress in research_tasks.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { requireAiEntitlementOrRespond, requirePlanAndAiOrRespond } from "../_shared/requireAi.ts";
import { finishAgentRun, failAgentTask, isAgentEnabled, pausedResponse } from "../_shared/agentGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

const REPORT_TEMPLATES: Record<string, { label: string; focus: string }> = {
  country_projects_market: {
    label: "Country Projects Market Report",
    focus: "country-level project pipeline, sector momentum, major stakeholders, tender outlook, and risks",
  },
  sector_pipeline: {
    label: "Sector Pipeline Report",
    focus: "sector-level investment pipeline, stage progression, project sponsors, supply-chain needs, and opportunity map",
  },
  tender_awards_outlook: {
    label: "Tender & Awards Outlook",
    focus: "near-term tender, award, procurement, construction, and contracting signals",
  },
  portfolio_risk_brief: {
    label: "Portfolio Risk Brief",
    focus: "tracked high-risk projects, critical alerts, delivery threats, and recommended mitigation actions",
  },
  weekly_market_snapshot: {
    label: "Weekly Market Snapshot",
    focus: "recent market movements, project changes, alerts, and executive takeaways",
  },
  custom_brief: {
    label: "Custom Intelligence Brief",
    focus: "the user's own question, answered strictly from platform evidence with explicit uncertainty notes",
  },
};

/** Depth controls how much evidence is loaded and how long the output should be. */
const DEPTH_PROFILES: Record<string, { label: string; projects: number; alerts: number; words: string; minPlan: "free" | "starter" | "pro" }> = {
  brief:    { label: "Brief",     projects: 60,  alerts: 60,  words: "700-1,200 words",   minPlan: "free" },
  standard: { label: "Standard",  projects: 150, alerts: 200, words: "1,800-3,000 words", minPlan: "free" },
  deep:     { label: "Deep dive", projects: 300, alerts: 400, words: "4,000-6,000 words", minPlan: "pro" },
};


function cleanText(value: unknown, max = 120): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "all") return null;
  return trimmed.slice(0, max);
}

function countBy<T extends Record<string, unknown>>(rows: T[], key: keyof T): Record<string, number> {
  return rows.reduce((acc, row) => {
    const value = String(row[key] ?? "Unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function sumValues(rows: Array<{ value_usd?: number | string | null }>): number {
  return rows.reduce((sum, row) => sum + Number(row.value_usd ?? 0), 0);
}

function formatUsd(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${Math.round(value).toLocaleString()}`;
}

function uniqueCitations(items: Array<{ label?: string | null; url?: string | null }>) {
  const seen = new Set<string>();
  return items
    .filter((item) => item.url && String(item.url).startsWith("http"))
    .filter((item) => {
      const url = String(item.url);
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .slice(0, 30)
    .map((item, index) => ({ label: item.label || `Source ${index + 1}`, url: String(item.url) }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Peek at the requested depth before gating: deep dives are a paid tier.
  const peek = req.method === "POST" ? await req.clone().json().catch(() => ({})) : {};
  const depthKey = typeof peek?.depth === "string" && DEPTH_PROFILES[peek.depth] ? peek.depth : "standard";
  const depth = DEPTH_PROFILES[depthKey];

  const gate = depth.minPlan === "free"
    ? await requireAiEntitlementOrRespond(req)
    : await requirePlanAndAiOrRespond(req, depth.minPlan);
  if (gate instanceof Response) return gate;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let taskId: string | undefined;
  let runStartedAt = new Date();
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const reportType = typeof body?.report_type === "string" && REPORT_TEMPLATES[body.report_type]
      ? body.report_type
      : "weekly_market_snapshot";
    const daysRaw = Number(body?.days);
    const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.round(daysRaw), 1), 365) : 30;
    const country = cleanText(body?.country);
    const region = cleanText(body?.region);
    const sector = cleanText(body?.sector);
    const stage = cleanText(body?.stage);
    const question = cleanText(body?.question, 500);
    const trackedOnly = body?.tracked_only === true;
    const savedSearchId = cleanText(body?.saved_search_id, 60);
    const template = REPORT_TEMPLATES[reportType];

    // Resolve "my tracked projects" / a saved search into concrete filters.
    let trackedIds: string[] = [];
    let savedFilters: Record<string, unknown> | null = null;
    if (trackedOnly) {
      const { data } = await supabase
        .from("tracked_projects")
        .select("project_id")
        .eq("user_id", gate.userId)
        .limit(500);
      trackedIds = (data ?? []).map((r: { project_id: string }) => r.project_id).filter(Boolean);
    }
    if (savedSearchId) {
      const { data } = await supabase
        .from("saved_searches")
        .select("filters, name")
        .eq("id", savedSearchId)
        .eq("user_id", gate.userId)
        .maybeSingle();
      savedFilters = (data?.filters ?? null) as Record<string, unknown> | null;
    }

    const effCountry = country ?? cleanText(savedFilters?.country);
    const effRegion = region ?? cleanText(savedFilters?.region);
    const effSector = sector ?? cleanText(savedFilters?.sector);
    const effStage = stage ?? cleanText(savedFilters?.stage);

    const scopeParts = [effCountry, effRegion, effSector, effStage].filter(Boolean);
    if (trackedOnly) scopeParts.unshift("My tracked projects");
    const scopeLabel = scopeParts.length ? scopeParts.join(" · ") : "Global infrastructure coverage";

    if (!await isAgentEnabled(supabase, "report-agent")) return pausedResponse("report-agent");

    // No global concurrency lock: reports are user-initiated and quota-gated,
    // so one user's run must never block another's.
    const { data: taskRow } = await supabase
      .from("research_tasks")
      .insert({
        task_type: "report-agent",
        query: `${reportType}:${scopeLabel}:${days}d:${depthKey}`,
        status: "running",
        requested_by: gate.userId,
      })
      .select("id")
      .single();
    taskId = taskRow?.id as string | undefined;
    runStartedAt = new Date();

    const parameters = {
      days,
      country: effCountry,
      region: effRegion,
      sector: effSector,
      stage: effStage,
      tracked_only: trackedOnly,
      saved_search_id: savedSearchId,
      question,
      depth: depthKey,
      depth_label: depth.label,
      scope_label: scopeLabel,
      template: template.label,
    };

    const updateTask = async (patch: Record<string, unknown>) => {
      if (!taskId) return;
      await supabase.from("research_tasks").update({ result: patch }).eq("id", taskId);
    };

    const { data: runRow, error: runErr } = await supabase
      .from("report_runs")
      .insert({
        user_id: gate.userId,
        report_type: reportType,
        parameters,
        status: "running",
        title: `${template.label}: ${scopeLabel}`,
      })
      .select("id")
      .single();
    if (runErr) throw new Error(`Failed to create report run: ${runErr.message}`);
    const reportRunId = runRow.id as string;

    await updateTask({ step: "loading", report_run_id: reportRunId, message: "Loading platform intelligence..." });

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let projectsQuery = supabase
      .from("projects")
      .select("id, name, country, region, sector, stage, status, confidence, risk_score, value_usd, value_label, source_url, last_updated, description, key_risks, funding_sources, political_context")
      .eq("approved", true)
      .order("value_usd", { ascending: false })
      .limit(depth.projects);
    if (effCountry) projectsQuery = projectsQuery.ilike("country", effCountry);
    if (effRegion) projectsQuery = projectsQuery.eq("region", effRegion);
    if (effSector) projectsQuery = projectsQuery.eq("sector", effSector);
    if (effStage) projectsQuery = projectsQuery.eq("stage", effStage);
    if (trackedOnly) projectsQuery = projectsQuery.in("id", trackedIds.length ? trackedIds : ["00000000-0000-0000-0000-000000000000"]);

    let alertsQuery = supabase
      .from("alerts")
      .select("message, severity, category, project_id, project_name, source_url, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(depth.alerts);
    if (trackedOnly && trackedIds.length) alertsQuery = alertsQuery.in("project_id", trackedIds);
    else if (effCountry) alertsQuery = alertsQuery.ilike("project_name", `%${effCountry}%`);
    if (effSector && reportType === "tender_awards_outlook") alertsQuery = alertsQuery.in("category", ["construction", "market", "financial", "regulatory"]);


    const [{ data: projects }, { data: alerts }, { data: updates }, { data: insights }] = await Promise.all([
      projectsQuery,
      alertsQuery,
      supabase
        .from("project_updates")
        .select("field_changed, old_value, new_value, source, created_at, projects ( id, name, country, region, sector, stage, status, source_url )")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(150),
      supabase
        .from("insights")
        .select("id, title, slug, excerpt, tag, source_url, sources, published, created_at")
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    const projectRows = (projects ?? []) as Array<Record<string, unknown> & { value_usd?: number | string | null; source_url?: string | null; name?: string }>;
    const alertRows = (alerts ?? []) as Array<Record<string, unknown> & { source_url?: string | null; project_name?: string; severity?: string; category?: string }>;
    const insightRows = (insights ?? []) as Array<Record<string, unknown> & { source_url?: string | null; title?: string }>;
    const updateRows = (updates ?? []) as Array<Record<string, unknown>>;

    const metrics = {
      scope: scopeLabel,
      report_type: reportType,
      report_label: template.label,
      days,
      project_count: projectRows.length,
      total_value_usd: sumValues(projectRows),
      total_value_label: formatUsd(sumValues(projectRows)),
      avg_confidence: projectRows.length ? Math.round(projectRows.reduce((s, p) => s + Number(p.confidence ?? 0), 0) / projectRows.length) : 0,
      avg_risk: projectRows.length ? Math.round(projectRows.reduce((s, p) => s + Number(p.risk_score ?? 0), 0) / projectRows.length) : 0,
      high_risk_projects: projectRows.filter((p) => Number(p.risk_score ?? 0) >= 70).length,
      critical_alerts: alertRows.filter((a) => a.severity === "critical").length,
      stage_distribution: countBy(projectRows, "stage"),
      sector_distribution: countBy(projectRows, "sector"),
      alert_distribution: countBy(alertRows, "category"),
      top_projects: projectRows.slice(0, 20).map((p) => ({
        name: p.name,
        country: p.country,
        sector: p.sector,
        stage: p.stage,
        status: p.status,
        value_label: p.value_label,
        confidence: p.confidence,
        risk_score: p.risk_score,
        source_url: p.source_url,
      })),
    };

    const seedCitations = uniqueCitations([
      ...projectRows.map((p) => ({ label: p.name, url: p.source_url })),
      ...alertRows.map((a) => ({ label: a.project_name ?? a.message as string, url: a.source_url })),
      ...insightRows.map((i) => ({ label: i.title, url: i.source_url })),
    ]);

    await updateTask({ step: "synthesizing", message: "Generating decision-grade report with AI...", metrics });

    const aiRes = await chatCompletions({
      messages: [
        {
          role: "system",
          content:
            "You are InfraRadarAI's senior infrastructure intelligence editor. Produce original, decision-grade market reports using only the supplied platform data. Do not imitate or mention competitors. Use concise Markdown with clear H2/H3 sections, tables where useful, and bullet recommendations. Be explicit about uncertainty, confidence, and source limitations. Every report must include: Executive summary, market/pipeline overview, sector or stage breakdown, key projects/stakeholders, tender or award outlook if relevant, risk and alert signals, recommended actions, data quality/confidence notes, and source citations. For a custom brief, answer the user's question first and organize the report around the decision it supports. Never invent facts, contacts, citations, or project details. If data is sparse, say so and explain what can still be inferred.",
        },
        {
          role: "user",
          content:
            `Report template: ${template.label}\nFocus: ${template.focus}\nScope: ${scopeLabel}\nWindow: last ${days} days\nDepth: ${depth.label} (${depth.words})\nTracked only: ${trackedOnly}\nSaved search: ${savedSearchId ?? "none"}\nUser question: ${question ?? "none"}\n\n` +
            `Aggregate metrics:\n${JSON.stringify(metrics)}\n\n` +
            `Recent alerts:\n${JSON.stringify(alertRows.slice(0, 120))}\n\n` +
            `Project updates:\n${JSON.stringify(updateRows.slice(0, 120))}\n\n` +
            `Matching projects:\n${JSON.stringify(projectRows.slice(0, 80))}\n\n` +
            `Recent internal insights:\n${JSON.stringify(insightRows)}\n\n` +
            `Known citations (use only these URLs):\n${JSON.stringify(seedCitations)}\n`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "create_report",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                summary: { type: "string" },
                markdown: { type: "string" },
                citations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { label: { type: "string" }, url: { type: "string" } },
                    required: ["label", "url"],
                  },
                },
              },
              required: ["title", "summary", "markdown"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "create_report" } },
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      await supabase.from("report_runs").update({ status: "failed", error: errText, completed_at: new Date().toISOString() }).eq("id", reportRunId);
      await supabase.from("research_tasks").update({ status: "failed", error: errText, completed_at: new Date().toISOString() }).eq("id", taskId);
      await finishAgentRun(supabase, "report-agent", "failed", runStartedAt);
      return new Response(JSON.stringify({ success: false, error: "AI report generation failed" }), { status: 500, headers: corsHeaders });
    }

    const aiData = await aiRes.json();
    let report: { title?: string; summary?: string; markdown?: string; citations?: Array<{ label: string; url: string }> } = {};
    try {
      const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (tc?.function?.arguments) report = JSON.parse(tc.function.arguments);
    } catch {
      report = {};
    }

    const title = report.title ?? `${template.label}: ${scopeLabel}`;
    const summary = report.summary ?? `${metrics.project_count} projects, ${metrics.total_value_label} pipeline value, ${metrics.critical_alerts} critical alerts.`;
    const markdown = report.markdown ?? "";
    const citations = uniqueCitations([...(report.citations ?? []), ...seedCitations]);

    await supabase
      .from("report_runs")
      .update({
        status: "completed",
        title,
        markdown,
        citations,
        parameters: { ...parameters, metrics, summary, citation_count: citations.length },
        completed_at: new Date().toISOString(),
      })
      .eq("id", reportRunId);

    await supabase
      .from("research_tasks")
      .update({
        status: "completed",
        result: { step: "completed", report_run_id: reportRunId, title, metrics },
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    await finishAgentRun(supabase, "report-agent", "completed", runStartedAt);
    return new Response(JSON.stringify({ success: true, reportRunId: reportRunId, taskId, metrics }), { headers: corsHeaders });
  } catch (e) {
    console.error("report-agent error:", e);
    await failAgentTask(supabase, "report-agent", taskId, runStartedAt, e);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), { status: 500, headers: corsHeaders });
  }
});
