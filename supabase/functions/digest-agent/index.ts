/**
 * digest-agent
 *
 * Generates AI-powered intelligence digests for a user based on alert_rules + tracked_projects.
 * Stores results in public.digests (in-app inbox). Optional email delivery can be added later.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { requireAiEntitlementOrRespond, recordAiUsage } from "../_shared/requireAi.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

type DigestSection = { title: string; bullets: string[] };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireAiEntitlementOrRespond(req);
  if (gate instanceof Response) return gate;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const ruleId = typeof body?.rule_id === "string" ? body.rule_id : null;

    // Create a research task for observability (keeps existing monitoring patterns).
    const { data: task, error: taskErr } = await supabase
      .from("research_tasks")
      .insert({
        task_type: "digest-agent",
        query: ruleId ? `rule:${ruleId}` : "default",
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

    await updateTask({ step: "loading", message: "Loading alert rules and tracked projects..." });

    const rulesQuery = supabase.from("alert_rules").select("*").eq("user_id", gate.userId).eq("enabled", true);
    const { data: rules } = ruleId ? await rulesQuery.eq("id", ruleId).limit(1) : await rulesQuery;
    const activeRule = rules?.[0] ?? null;

    const [{ data: tracked }, { data: alerts }, { data: updates }] = await Promise.all([
      supabase
        .from("tracked_projects")
        .select("project_id, notes, created_at, projects ( id, name, country, sector, stage, status, risk_score, source_url, last_updated )")
        .eq("user_id", gate.userId)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("alerts")
        .select("message, severity, category, project_id, project_name, source_url, created_at")
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("project_updates")
        .select("field_changed, old_value, new_value, source, created_at, projects ( id, name, country, sector, stage, status, source_url )")
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    await updateTask({ step: "synthesizing", message: "Synthesizing digest..." });

    const prompt = {
      rule: activeRule
        ? { name: activeRule.name, cadence: activeRule.cadence, channels: activeRule.channels, filters: activeRule.filters }
        : null,
      tracked_projects: (tracked ?? []).map((t: any) => ({
        project_id: t.project_id,
        notes: t.notes,
        project: t.projects,
      })),
      recent_alerts: alerts ?? [],
      recent_updates: updates ?? [],
    };

    const aiRes = await chatCompletions({
      messages: [
        {
          role: "system",
          content:
            "You are an infrastructure intelligence analyst. Produce a concise daily/weekly digest for the user. Prioritize signal: notable new alerts, material project changes, and watchlist items. Always include verifiable URLs when possible.",
        },
        {
          role: "user",
          content: `Create an in-app digest.\n\nInput JSON:\n${JSON.stringify(prompt)}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "create_digest",
            description: "Create a structured digest for the user",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                summary: { type: "string" },
                markdown: { type: "string" },
                sections: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      bullets: { type: "array", items: { type: "string" } },
                    },
                    required: ["title", "bullets"],
                  },
                },
                citations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { label: { type: "string" }, url: { type: "string" } },
                    required: ["label", "url"],
                  },
                },
              },
              required: ["title", "summary", "markdown", "sections"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "create_digest" } },
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      await supabase.from("research_tasks").update({ status: "failed", error: errText, completed_at: new Date().toISOString() }).eq("id", taskId);
      return new Response(JSON.stringify({ success: false, error: "AI digest generation failed" }), { status: 500, headers: corsHeaders });
    }

    const aiData = await aiRes.json();
    let digest: { title: string; summary: string; markdown: string; sections: DigestSection[]; citations?: Array<{ label: string; url: string }> } | null =
      null;
    try {
      const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (tc?.function?.arguments) digest = JSON.parse(tc.function.arguments);
    } catch {
      digest = null;
    }

    if (!digest) {
      await supabase.from("research_tasks").update({ status: "failed", error: "Could not parse digest", completed_at: new Date().toISOString() }).eq("id", taskId);
      return new Response(JSON.stringify({ success: false, error: "Could not parse digest" }), { status: 500, headers: corsHeaders });
    }

    const { data: inserted, error: insErr } = await supabase
      .from("digests")
      .insert({
        user_id: gate.userId,
        rule_id: activeRule?.id ?? null,
        title: digest.title,
        summary: digest.summary,
        markdown: digest.markdown,
        payload: { sections: digest.sections, citations: digest.citations ?? [] },
        status: "ready",
      })
      .select("id")
      .single();
    if (insErr) throw new Error(`Failed to store digest: ${insErr.message}`);

    await supabase
      .from("research_tasks")
      .update({ status: "completed", result: { step: "completed", digest_id: inserted.id }, completed_at: new Date().toISOString() })
      .eq("id", taskId);

    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(JSON.stringify({ success: true, digestId: inserted.id, taskId }), { headers: corsHeaders });
  } catch (e) {
    console.error("digest-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});

