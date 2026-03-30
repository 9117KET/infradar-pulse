/**
 * report-agent
 *
 * Generates scheduled weekly/monthly intelligence briefs and market review artifacts.
 * Stores Markdown + citations in public.report_runs and mirrors progress in research_tasks.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const reportType = typeof body?.report_type === "string" ? body.report_type : "weekly_market_snapshot";
    const days = Number.isFinite(body?.days) ? Number(body.days) : 7;

    const { data: task, error: taskErr } = await supabase
      .from("research_tasks")
      .insert({
        task_type: "report-agent",
        query: `${reportType}:${days}d`,
        status: "running",
        requested_by: gate.userId,
        result: { step: "loading" },
      })
      .select("id")
      .single();
    if (taskErr) throw new Error(`Failed to create task: ${taskErr.message}`);
    const taskId = task.id as string;

    const updateTask = async (patch: Record<string, unknown>) => {
      await supabase.from("research_tasks").update({ result: patch }).eq("id", taskId);
    };

    const { data: runRow, error: runErr } = await supabase
      .from("report_runs")
      .insert({
        user_id: gate.userId,
        report_type: reportType,
        parameters: { days },
        status: "running",
      })
      .select("id")
      .single();
    if (runErr) throw new Error(`Failed to create report run: ${runErr.message}`);
    const reportRunId = runRow.id as string;

    await updateTask({ step: "loading", report_run_id: reportRunId, message: "Loading source data..." });

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: alerts }, { data: updates }, { data: topProjects }, { data: insights }] = await Promise.all([
      supabase
        .from("alerts")
        .select("message, severity, category, project_id, project_name, source_url, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(120),
      supabase
        .from("project_updates")
        .select("field_changed, old_value, new_value, source, created_at, projects ( id, name, country, sector, stage, status, source_url )")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(120),
      supabase
        .from("projects")
        .select("id, name, country, sector, stage, status, confidence, risk_score, value_label, source_url, last_updated")
        .eq("approved", true)
        .order("last_updated", { ascending: false })
        .limit(30),
      supabase
        .from("insights")
        .select("id, title, slug, excerpt, tag, source_url, sources, published, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    await updateTask({ step: "synthesizing", message: "Generating report with AI..." });

    const aiRes = await chatCompletions({
      messages: [
        {
          role: "system",
          content:
            "You are an infrastructure intelligence editor. Produce a concise report with clear sections, bullet points, and a citations list. Return Markdown.",
        },
        {
          role: "user",
          content:
            `Report type: ${reportType}\nWindow: last ${days} days\n\n` +
            `Alerts:\n${JSON.stringify(alerts ?? [])}\n\n` +
            `Project updates:\n${JSON.stringify(updates ?? [])}\n\n` +
            `Top projects:\n${JSON.stringify(topProjects ?? [])}\n\n` +
            `Recent insights (internal):\n${JSON.stringify(insights ?? [])}\n`,
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
              required: ["title", "markdown"],
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
      return new Response(JSON.stringify({ success: false, error: "AI report generation failed" }), { status: 500, headers: corsHeaders });
    }

    const aiData = await aiRes.json();
    let report: { title?: string; markdown?: string; citations?: Array<{ label: string; url: string }> } = {};
    try {
      const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (tc?.function?.arguments) report = JSON.parse(tc.function.arguments);
    } catch {
      report = {};
    }

    const title = report.title ?? "InfraRadar Report";
    const markdown = report.markdown ?? "";
    const citations = report.citations ?? [];

    await supabase
      .from("report_runs")
      .update({
        status: "completed",
        title,
        markdown,
        citations,
        completed_at: new Date().toISOString(),
      })
      .eq("id", reportRunId);

    await supabase
      .from("research_tasks")
      .update({
        status: "completed",
        result: { step: "completed", report_run_id: reportRunId, title },
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    return new Response(JSON.stringify({ success: true, reportRunId: reportRunId, taskId }), { headers: corsHeaders });
  } catch (e) {
    console.error("report-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: corsHeaders });
  }
});

