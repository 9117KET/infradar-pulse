/**
 * nl-search-public
 *
 * Public demo version of nl-search - no auth required.
 * Rate limited to 3 queries per IP per day to prevent abuse.
 * Returns at most 6 results (vs 24 for authenticated users).
 *
 * Used by the /ask-demo public page to let prospects experience
 * the AI Q&A before signing up.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_QUERIES_PER_DAY = 3;
const MAX_RESULTS = 6;

const REGIONS = [
  "MENA", "East Africa", "West Africa", "Southern Africa", "Central Africa",
  "North America", "South America", "Europe", "Central Asia", "South Asia",
  "East Asia", "Southeast Asia", "Oceania", "Caribbean",
];
const SECTORS = [
  "AI Infrastructure", "Building Construction", "Chemical", "Data Centers",
  "Digital Infrastructure", "Energy", "Industrial", "Infrastructure", "Mining",
  "Oil & Gas", "Renewable Energy", "Transport", "Urban Development", "Water",
];
const STAGES = [
  "Planned", "Tender", "Awarded", "Financing", "Construction",
  "Completed", "Cancelled", "Stopped",
];
const STATUSES = ["Verified", "Stable", "Pending", "At Risk"];

const SYSTEM_PROMPT = `You translate natural-language questions about global infrastructure projects into structured filters for a Postgres query.
You MUST return your answer by calling the \`apply_filters\` tool — never plain text.
Allowed values:
- regions: ${REGIONS.join(", ")}
- sectors: ${SECTORS.join(", ")}
- stages: ${STAGES.join(", ")}
- statuses: ${STATUSES.join(", ")}
Rules:
- Use empty arrays / null when no constraint was implied.
- value_min_usd / value_max_usd are integers in raw USD (e.g. "$50M" → 50000000).
- countries should be country names exactly as commonly written.
- keyword: only set when the prompt names a specific project or technology.
- order_by: "value" (default), "recent", or "risk".
- limit: always use ${MAX_RESULTS} for the public demo.
- interpretation: a single human sentence summarising what you understood.`;

const FILTER_TOOL = {
  type: "function",
  function: {
    name: "apply_filters",
    description: "Run a filtered project search.",
    parameters: {
      type: "object",
      properties: {
        regions: { type: "array", items: { type: "string" } },
        sectors: { type: "array", items: { type: "string" } },
        stages: { type: "array", items: { type: "string" } },
        statuses: { type: "array", items: { type: "string" } },
        countries: { type: "array", items: { type: "string" } },
        value_min_usd: { type: ["integer", "null"] },
        value_max_usd: { type: ["integer", "null"] },
        keyword: { type: ["string", "null"] },
        order_by: { type: "string", enum: ["value", "recent", "risk"] },
        limit: { type: "integer" },
        interpretation: { type: "string" },
      },
      required: ["interpretation"],
      additionalProperties: false,
    },
  },
};

async function hashIp(ip: string): Promise<string> {
  const salt = Deno.env.get("DEMO_IP_SALT") ?? "infradar-demo-2026";
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

function sanitizeStringArray(arr: unknown, allowed: string[] | null): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  for (const v of arr) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    if (allowed) {
      const match = allowed.find((a) => a.toLowerCase() === trimmed.toLowerCase());
      if (match) out.push(match);
    } else {
      out.push(trimmed);
    }
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // 1. IP-based rate limiting
    const clientIp = getClientIp(req);
    const ipHash = await hashIp(clientIp);
    const today = new Date().toISOString().slice(0, 10);

    const { data: existing } = await supabase
      .from("public_demo_rate_limits")
      .select("count")
      .eq("ip_hash", ipHash)
      .eq("query_date", today)
      .maybeSingle();

    const currentCount = existing?.count ?? 0;

    if (currentCount >= MAX_QUERIES_PER_DAY) {
      return new Response(
        JSON.stringify({
          error: "rate_limited",
          message: `You've used all ${MAX_QUERIES_PER_DAY} free demo queries for today. Sign up for a free account to keep going.`,
          queries_used: currentCount,
          queries_limit: MAX_QUERIES_PER_DAY,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Validate query
    const body = await req.json().catch(() => ({}));
    const prompt = typeof body?.query === "string" ? body.query.trim() : "";
    if (prompt.length < 3) {
      return new Response(
        JSON.stringify({ error: "Query must be at least 3 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (prompt.length > 300) {
      return new Response(
        JSON.stringify({ error: "Query is too long (max 300 chars for demo)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. AI filter translation
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI gateway not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        tools: [FILTER_TOOL],
        tool_choice: { type: "function", function: { name: "apply_filters" } },
      }),
    });

    if (aiResp.status === 429) {
      return new Response(
        JSON.stringify({ error: "AI rate limit hit. Try again in a moment." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!aiResp.ok) {
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiData = await aiResp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(
        JSON.stringify({ error: "Could not interpret your query. Try rephrasing." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(toolCall.function.arguments);
    } catch {
      return new Response(
        JSON.stringify({ error: "AI returned malformed filters" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4. Sanitize
    const filters = {
      regions: sanitizeStringArray(raw.regions, REGIONS),
      sectors: sanitizeStringArray(raw.sectors, SECTORS),
      stages: sanitizeStringArray(raw.stages, STAGES),
      statuses: sanitizeStringArray(raw.statuses, STATUSES),
      countries: sanitizeStringArray(raw.countries, null).slice(0, 10),
      value_min_usd: typeof raw.value_min_usd === "number" && raw.value_min_usd >= 0 ? Math.floor(raw.value_min_usd) : null,
      value_max_usd: typeof raw.value_max_usd === "number" && raw.value_max_usd >= 0 ? Math.floor(raw.value_max_usd) : null,
      keyword: typeof raw.keyword === "string" && raw.keyword.trim().length > 0 ? raw.keyword.trim().slice(0, 80) : null,
      order_by: raw.order_by === "recent" || raw.order_by === "risk" ? raw.order_by as string : "value",
      interpretation: typeof raw.interpretation === "string" ? raw.interpretation.slice(0, 300) : "",
    };

    // 5. Query - hard cap at MAX_RESULTS
    let q = supabase
      .from("projects")
      .select("id, slug, name, country, region, sector, stage, status, value_usd, value_label, confidence, risk_score, description")
      .eq("approved", true);

    if (filters.regions.length) q = q.in("region", filters.regions);
    if (filters.sectors.length) q = q.in("sector", filters.sectors);
    if (filters.stages.length) q = q.in("stage", filters.stages);
    if (filters.statuses.length) q = q.in("status", filters.statuses);
    if (filters.countries.length) q = q.in("country", filters.countries);
    if (filters.value_min_usd != null) q = q.gte("value_usd", filters.value_min_usd);
    if (filters.value_max_usd != null) q = q.lte("value_usd", filters.value_max_usd);
    if (filters.keyword) {
      const safe = filters.keyword.replace(/[%,]/g, " ");
      q = q.or(`name.ilike.%${safe}%,description.ilike.%${safe}%`);
    }
    if (filters.order_by === "recent") q = q.order("last_updated", { ascending: false });
    else if (filters.order_by === "risk") q = q.order("risk_score", { ascending: true });
    else q = q.order("value_usd", { ascending: false });
    q = q.limit(MAX_RESULTS);

    const { data: projects, error: queryErr } = await q;
    if (queryErr) throw queryErr;

    // 6. Increment rate limit counter (upsert)
    await supabase.from("public_demo_rate_limits").upsert(
      { ip_hash: ipHash, query_date: today, count: currentCount + 1 },
      { onConflict: "ip_hash,query_date" },
    );

    const queriesUsed = currentCount + 1;

    return new Response(
      JSON.stringify({
        projects: projects ?? [],
        filters,
        interpretation: filters.interpretation,
        queries_used: queriesUsed,
        queries_limit: MAX_QUERIES_PER_DAY,
        queries_remaining: MAX_QUERIES_PER_DAY - queriesUsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("nl-search-public error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
