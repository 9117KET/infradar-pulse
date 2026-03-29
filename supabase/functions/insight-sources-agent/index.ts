/**
 * Backfills `insights.sources` for draft and published rows: merges legacy `source_url`,
 * URLs extracted from Markdown/body text, and (only when still empty) AI-suggested links.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recordAiUsage, requireAiEntitlementOrRespond } from "../_shared/requireAi.ts";

/** Match other edge functions so Supabase client preflight (OPTIONS) succeeds. */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Source = { label: string; url: string };

function normalizeSources(raw: unknown): Source[] {
  if (!Array.isArray(raw)) return [];
  const out: Source[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const url = typeof o.url === "string" ? o.url.trim() : "";
    if (!url.startsWith("http")) continue;
    const label = typeof o.label === "string" && o.label.trim() ? o.label.trim() : "Reference";
    out.push({ label, url });
  }
  return out;
}

function mergeDedupe(sources: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of sources) {
    const u = s.url.replace(/[.,;]+$/, "");
    if (seen.has(u)) continue;
    seen.add(u);
    out.push({ ...s, url: u });
  }
  return out;
}

function displaySources(row: {
  sources?: unknown;
  source_url?: string | null;
}): Source[] {
  const fromJson = normalizeSources(row.sources);
  const legacy =
    row.source_url && String(row.source_url).trim().startsWith("http")
      ? [{ label: "Primary source", url: String(row.source_url).trim() }]
      : [];
  return mergeDedupe([...fromJson, ...legacy]);
}

/** Pull https links from Markdown and plain text (deduped). */
function extractUrlsFromText(text: string): Source[] {
  const out: Source[] = [];
  const seen = new Set<string>();
  const push = (label: string, url: string) => {
    const u = url.replace(/[.,;]+$/, "");
    if (!u.startsWith("http")) return;
    if (seen.has(u)) return;
    seen.add(u);
    out.push({ label: label.trim() || "Reference", url: u });
  };

  const md = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = md.exec(text)) !== null) {
    push(m[1] || "Reference", m[2]);
  }

  const bare = /https?:\/\/[^\s\])"'<>]+/g;
  while ((m = bare.exec(text)) !== null) {
    push("Source", m[0]);
  }

  return out;
}

const CONTENT_SLICE = 12000;

async function aiSuggestSources(
  LOVABLE_API_KEY: string,
  title: string,
  excerpt: string,
  content: string,
): Promise<Source[]> {
  const slice = content.slice(0, CONTENT_SLICE);
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            `You help attach verifiable public references to infrastructure intelligence articles. ` +
            `Output only real https URLs (news, government, multilateral banks, company filings). ` +
            `Do not invent URLs. If the text implies a region or sector but has no link, you may suggest 1–2 well-known reputable sources for that context (e.g. World Bank, IMF, UN, official ministry sites) only if you are confident the URL is correct.`,
        },
        {
          role: "user",
          content: `Suggest sources for this article.\n\nTitle: ${title}\n\nExcerpt: ${excerpt}\n\nContent:\n${slice}`,
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "attach_sources",
          description: "Verifiable references",
          parameters: {
            type: "object",
            properties: {
              sources: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    url: { type: "string", description: "https URL only" },
                  },
                  required: ["label", "url"],
                  additionalProperties: false,
                },
              },
            },
            required: ["sources"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "attach_sources" } },
    }),
  });

  if (!response.ok) {
    const t = await response.text();
    console.error("insight-sources-agent AI error:", response.status, t);
    return [];
  }

  const aiData = await response.json();
  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) return [];

  try {
    const parsed = JSON.parse(toolCall.function.arguments) as { sources?: Source[] };
    const arr = Array.isArray(parsed.sources) ? parsed.sources : [];
    return arr
      .filter((s) => typeof s?.url === "string" && s.url.startsWith("http"))
      .map((s) => ({
        label: String(s.label || "Reference").slice(0, 200),
        url: String(s.url).trim(),
      }));
  } catch {
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const gate = await requireAiEntitlementOrRespond(req);
  if (gate instanceof Response) return gate;

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      /* empty body */
    }

    const insightId = typeof body.insight_id === "string" ? body.insight_id : undefined;
    const scope = body.scope === "all" ? "all" : "missing";
    const dryRun = body.dry_run === true;
    const useAi = body.use_ai !== false;

    const { data: task, error: taskErr } = await supabase
      .from("research_tasks")
      .insert({
        task_type: "insight_sources",
        query: insightId ? `single:${insightId}` : `scope:${scope}`,
        status: "running",
        result: { step: "loading", scope, dry_run: dryRun },
      })
      .select("id")
      .single();

    if (taskErr) console.error("research_tasks insert:", taskErr);

    const { data: rows, error: fetchErr } = await supabase
      .from("insights")
      .select("id, title, excerpt, content, source_url, sources, published")
      .order("created_at", { ascending: false })
      .limit(250);

    if (fetchErr) throw fetchErr;

    let list = (rows || []) as Array<{
      id: string;
      title: string;
      excerpt: string;
      content: string;
      source_url: string | null;
      sources: unknown;
      published: boolean;
    }>;

    if (insightId) {
      list = list.filter((r) => r.id === insightId);
      if (list.length === 0) {
        const one = await supabase.from("insights").select("*").eq("id", insightId).maybeSingle();
        if (one.data) list = [one.data as (typeof list)[0]];
      }
    } else if (scope === "missing") {
      list = list.filter((r) => displaySources(r).length === 0);
    }

    const MAX_PER_RUN = 35;
    const batch = list.slice(0, MAX_PER_RUN);

    const details: Array<{
      id: string;
      title: string;
      published: boolean;
      before: number;
      after: number;
      methods: string[];
      dry_run: boolean;
    }> = [];

    let updated = 0;
    let skipped = 0;

    for (const row of batch) {
      const prevSources = displaySources(row);
      const before = prevSources.length;
      const extracted = extractUrlsFromText(`${row.excerpt}\n\n${row.content}`);
      let merged = mergeDedupe([...prevSources, ...extracted]);

      const methods: string[] = [];
      if (extracted.some((e) => !prevSources.some((p) => p.url === e.url))) {
        methods.push("extract");
      }

      if (merged.length === 0 && useAi && LOVABLE_API_KEY) {
        const ai = await aiSuggestSources(LOVABLE_API_KEY, row.title, row.excerpt, row.content);
        if (ai.length) {
          merged = mergeDedupe([...merged, ...ai]);
          methods.push("ai");
        }
      }

      if (merged.length === 0) {
        skipped++;
        details.push({
          id: row.id,
          title: row.title,
          published: row.published,
          before,
          after: 0,
          methods: [],
          dry_run: dryRun,
        });
        continue;
      }

      const prevUrls = new Set(prevSources.map((s) => s.url));
      const mergedUrls = new Set(merged.map((s) => s.url));
      const sameUrls =
        prevUrls.size === mergedUrls.size && [...prevUrls].every((u) => mergedUrls.has(u));
      if (scope === "all" && before > 0 && sameUrls) {
        skipped++;
        details.push({
          id: row.id,
          title: row.title,
          published: row.published,
          before,
          after: before,
          methods: [],
          dry_run: dryRun,
        });
        continue;
      }

      if (!dryRun) {
        const { error: upErr } = await supabase
          .from("insights")
          .update({ sources: merged })
          .eq("id", row.id);
        if (upErr) {
          console.error("update insight", row.id, upErr);
          skipped++;
          details.push({
            id: row.id,
            title: row.title,
            published: row.published,
            before,
            after: before,
            methods: [...methods, "error"],
            dry_run: dryRun,
          });
          continue;
        }
      }

      updated++;
      details.push({
        id: row.id,
        title: row.title,
        published: row.published,
        before,
        after: merged.length,
        methods,
        dry_run: dryRun,
      });
    }

    const summary = {
      scope: insightId ? "single" : scope,
      processed: batch.length,
      updated: dryRun ? 0 : updated,
      would_update: dryRun ? updated : undefined,
      skipped,
      truncated: list.length > MAX_PER_RUN,
      details,
    };

    if (task?.id) {
      await supabase
        .from("research_tasks")
        .update({
          status: "completed",
          result: summary,
          completed_at: new Date().toISOString(),
        })
        .eq("id", task.id);
    }

    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(
      JSON.stringify({ success: true, task_id: task?.id ?? null, ...summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("insight-sources-agent:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
