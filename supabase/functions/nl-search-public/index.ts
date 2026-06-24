/**
 * nl-search-public
 *
 * Public demo version of nl-search - no auth required.
 * Rate limited to 3 queries per IP per day to prevent abuse.
 * Returns at most 6 results (vs 24 for authenticated users).
 *
 * Used by the /ask-demo public page to let prospects experience
 * the AI Q&A before signing up.
 *
 * Request modes (POST body):
 *   { mode: "examples" }   -> returns data-driven example prompts that are
 *                             guaranteed to have matching projects. No quota cost.
 *   { filters: {...} }      -> runs a preset search (suggested-chip click). Skips
 *                             the LLM so results are guaranteed. Consumes 1 query.
 *   { query: "free text" }  -> translates text -> filters via the LLM, then searches.
 *                             Consumes 1 query.
 *
 * A query is only consumed when the search actually returns projects, so a
 * dead-end never costs a prospect one of their free queries.
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
const EXAMPLE_COUNT = 3;
const MIN_PROJECTS_PER_EXAMPLE = 1; // a (sector, region) pair must have at least this many approved projects

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

const PROJECT_COLUMNS =
  "id, slug, name, country, region, sector, stage, status, value_usd, value_label, confidence, risk_score, description";

const STATIC_EXAMPLE_FALLBACK = [
  { prompt: "Energy projects in MENA", filters: { sectors: ["Energy"], regions: ["MENA"] } },
  { prompt: "Transport projects in East Africa", filters: { sectors: ["Transport"], regions: ["East Africa"] } },
  { prompt: "Renewable Energy projects in West Africa", filters: { sectors: ["Renewable Energy"], regions: ["West Africa"] } },
];

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

type Filters = {
  regions: string[];
  sectors: string[];
  stages: string[];
  statuses: string[];
  countries: string[];
  value_min_usd: number | null;
  value_max_usd: number | null;
  keyword: string | null;
  order_by: string;
  interpretation: string;
};

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

// ── Signed visitor token: a tamper-evident "cookie" sent in the request body ──
// A real cross-origin Set-Cookie won't flow back through supabase.functions
// .invoke, so the client persists this HMAC-signed token in localStorage and
// resends it. It is a SECOND rate-limit dimension alongside IP: a visitor has to
// change IP *and* drop the token to win a fresh allowance. Forging it requires
// DEMO_COOKIE_SECRET; set a strong one in env (falls back to the IP salt).
const TOKEN_TTL_SEC = 7 * 24 * 60 * 60; // ~matches the table's 7-day cleanup window

function demoSecret(): string {
  return Deno.env.get("DEMO_COOKIE_SECRET") ?? Deno.env.get("DEMO_IP_SALT") ?? "infradar-demo-2026";
}

async function hmacHex(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function mintToken(visitorId: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  const payload = `${visitorId}.${exp}`;
  const sig = await hmacHex(payload, demoSecret());
  return `v1.${payload}.${sig}`;
}

/** Returns the visitorId if the token is well-formed, unexpired and correctly signed; else null. */
async function verifyToken(token: unknown): Promise<string | null> {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [, visitorId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!visitorId || !Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const expected = await hmacHex(`${visitorId}.${expStr}`, demoSecret());
  return timingSafeEqual(expected, sig) ? visitorId : null;
}

/** Atomically increment one rate-limit key, falling back to an upsert if the RPC is unavailable. */
async function incrementKey(
  supabase: SupabaseClient,
  key: string,
  today: string,
  fallbackCurrent: number,
): Promise<number> {
  const { data: newCount, error } = await supabase.rpc("increment_demo_quota", { p_ip_hash: key });
  if (!error && typeof newCount === "number") return newCount;
  if (error) console.error("increment_demo_quota error, upsert fallback", error);
  const next = fallbackCurrent + 1;
  await supabase.from("public_demo_rate_limits").upsert(
    { ip_hash: key, query_date: today, count: next },
    { onConflict: "ip_hash,query_date" },
  );
  return next;
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
      if (match && !out.includes(match)) out.push(match);
    } else if (!out.includes(trimmed)) {
      out.push(trimmed);
    }
  }
  return out;
}

/** Sanitize raw filter input (from the LLM or from a preset chip) against the whitelists. */
function buildFilters(raw: Record<string, unknown>): Filters {
  return {
    regions: sanitizeStringArray(raw.regions, REGIONS),
    sectors: sanitizeStringArray(raw.sectors, SECTORS),
    stages: sanitizeStringArray(raw.stages, STAGES),
    statuses: sanitizeStringArray(raw.statuses, STATUSES),
    countries: sanitizeStringArray(raw.countries, null).slice(0, 10),
    value_min_usd:
      typeof raw.value_min_usd === "number" && raw.value_min_usd >= 0
        ? Math.floor(raw.value_min_usd)
        : null,
    value_max_usd:
      typeof raw.value_max_usd === "number" && raw.value_max_usd >= 0
        ? Math.floor(raw.value_max_usd)
        : null,
    keyword:
      typeof raw.keyword === "string" && raw.keyword.trim().length > 0
        ? raw.keyword.trim().slice(0, 80)
        : null,
    order_by: raw.order_by === "recent" || raw.order_by === "risk" ? (raw.order_by as string) : "value",
    interpretation: typeof raw.interpretation === "string" ? raw.interpretation.slice(0, 300) : "",
  };
}

/** Human sentence describing a preset filter (used when no LLM interpretation is present). */
function describeFilters(f: Filters): string {
  const parts: string[] = [];
  if (f.sectors.length) parts.push(f.sectors.join(" / "));
  parts.push("projects");
  if (f.countries.length) parts.push(`in ${f.countries.join(", ")}`);
  else if (f.regions.length) parts.push(`in ${f.regions.join(", ")}`);
  if (f.stages.length) parts.push(`at ${f.stages.join(" / ")} stage`);
  if (f.value_min_usd != null) parts.push(`above $${Math.round(f.value_min_usd / 1_000_000)}M`);
  return `Showing ${parts.join(" ")}.`;
}

/** Apply the structured filters to a projects query builder. */
function applyFilters(q: SupabaseClient, f: Filters): SupabaseClient {
  if (f.regions.length) q = q.in("region", f.regions);
  if (f.sectors.length) q = q.in("sector", f.sectors);
  if (f.stages.length) q = q.in("stage", f.stages);
  if (f.statuses.length) q = q.in("status", f.statuses);
  if (f.countries.length) q = q.in("country", f.countries);
  if (f.value_min_usd != null) q = q.gte("value_usd", f.value_min_usd);
  if (f.value_max_usd != null) q = q.lte("value_usd", f.value_max_usd);
  if (f.keyword) {
    const safe = f.keyword.replace(/[%,]/g, " ");
    q = q.or(`name.ilike.%${safe}%,description.ilike.%${safe}%`);
  }
  if (f.order_by === "recent") q = q.order("last_updated", { ascending: false });
  else if (f.order_by === "risk") q = q.order("risk_score", { ascending: true });
  else q = q.order("value_usd", { ascending: false });
  return q.limit(MAX_RESULTS);
}

/**
 * Run a filtered search. If it returns 0 rows, progressively relax the most
 * restrictive constraints (value bounds, then stages, then statuses, then
 * keyword) and retry, so a prospect rarely hits a dead end. Returns the rows
 * plus a `relaxed` flag indicating filters were dropped to find matches.
 */
async function runSearch(
  supabase: SupabaseClient,
  filters: Filters,
): Promise<{ projects: unknown[]; relaxed: boolean }> {
  const attempts: Filters[] = [
    filters,
    { ...filters, value_min_usd: null, value_max_usd: null },
    { ...filters, value_min_usd: null, value_max_usd: null, stages: [] },
    { ...filters, value_min_usd: null, value_max_usd: null, stages: [], statuses: [] },
    { ...filters, value_min_usd: null, value_max_usd: null, stages: [], statuses: [], keyword: null },
  ];

  for (let i = 0; i < attempts.length; i++) {
    const base = supabase.from("projects").select(PROJECT_COLUMNS).eq("approved", true);
    const { data, error } = await applyFilters(base, attempts[i]);
    if (error) throw error;
    if (data && data.length > 0) {
      return { projects: data, relaxed: i > 0 };
    }
    // If this attempt is identical to the previous one (nothing left to relax), stop early.
  }
  return { projects: [], relaxed: false };
}

/**
 * Build data-driven example prompts from real data: the (sector, region) pairs
 * that actually have approved projects. Guarantees every suggested chip returns
 * results. Falls back to a small static list if the table is empty/unavailable.
 */
async function buildExamples(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("projects")
    .select("sector, region")
    .eq("approved", true)
    .not("sector", "is", null)
    .not("region", "is", null)
    .limit(5000);

  if (error || !data || data.length === 0) {
    return STATIC_EXAMPLE_FALLBACK.slice(0, EXAMPLE_COUNT);
  }

  const counts = new Map<string, { sector: string; region: string; n: number }>();
  for (const row of data as Array<{ sector: string; region: string }>) {
    const sector = SECTORS.find((s) => s.toLowerCase() === String(row.sector).toLowerCase());
    const region = REGIONS.find((r) => r.toLowerCase() === String(row.region).toLowerCase());
    if (!sector || !region) continue;
    const key = `${sector}|${region}`;
    const cur = counts.get(key);
    if (cur) cur.n++;
    else counts.set(key, { sector, region, n: 1 });
  }

  const ranked = [...counts.values()]
    .filter((c) => c.n >= MIN_PROJECTS_PER_EXAMPLE)
    .sort((a, b) => b.n - a.n);

  // Spread examples across distinct sectors so the chips feel varied.
  const picked: Array<{ sector: string; region: string }> = [];
  const usedSectors = new Set<string>();
  for (const c of ranked) {
    if (usedSectors.has(c.sector)) continue;
    picked.push({ sector: c.sector, region: c.region });
    usedSectors.add(c.sector);
    if (picked.length >= EXAMPLE_COUNT) break;
  }
  // Top up from the ranked list if we couldn't fill on distinct sectors alone.
  for (const c of ranked) {
    if (picked.length >= EXAMPLE_COUNT) break;
    if (picked.some((p) => p.sector === c.sector && p.region === c.region)) continue;
    picked.push({ sector: c.sector, region: c.region });
  }

  if (picked.length === 0) return STATIC_EXAMPLE_FALLBACK.slice(0, EXAMPLE_COUNT);

  return picked.map((p) => ({
    prompt: `${p.sector} projects in ${p.region}`,
    filters: { sectors: [p.sector], regions: [p.region] },
  }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));

    const clientIp = getClientIp(req);
    const ipHash = await hashIp(clientIp);
    const today = new Date().toISOString().slice(0, 10);

    // Signed visitor token = a second rate-limit key alongside the IP. Verify
    // the one the client sent; mint a fresh signed one when it's missing,
    // expired or forged. We always echo `visitor_token` so the client persists it.
    const verifiedId = await verifyToken(body?.visitor_token);
    const visitorId = verifiedId ?? crypto.randomUUID();
    const visitorToken = verifiedId ? (body.visitor_token as string) : await mintToken(visitorId);
    const cookieKey = "cookie_" + (await hashIp(visitorId));

    // A query is counted against BOTH dimensions; effective usage is the higher
    // of the two, so exhausting either the IP or the token hits the wall.
    const keys = [ipHash, cookieKey];

    const readCount = async (key: string): Promise<number> => {
      const { data } = await supabase
        .from("public_demo_rate_limits")
        .select("count")
        .eq("ip_hash", key)
        .eq("query_date", today)
        .maybeSingle();
      return data?.count ?? 0;
    };

    // --- Mode: examples / status (no quota, no LLM) -----------------------
    // Both echo back the caller's CURRENT usage so the page reflects real
    // server state on load. This is what stops a refresh from resetting the
    // counter or unlocking more queries — the client never owns the count.
    if (body?.mode === "examples" || body?.mode === "status") {
      const used = Math.max(...(await Promise.all(keys.map(readCount))));
      const examples = body?.mode === "examples" ? await buildExamples(supabase) : undefined;
      return json({
        ...(examples ? { examples } : {}),
        visitor_token: visitorToken,
        queries_used: used,
        queries_limit: MAX_QUERIES_PER_DAY,
        queries_remaining: Math.max(0, MAX_QUERIES_PER_DAY - used),
      });
    }

    // --- Rate-limit pre-check (read current count across both keys) --------
    const currentCounts = await Promise.all(keys.map(readCount));
    const currentCount = Math.max(...currentCounts);

    if (currentCount >= MAX_QUERIES_PER_DAY) {
      // Returned as 200 (not 429) so supabase-js delivers it as `data` and the
      // client can render the signup wall instead of a generic error toast.
      return json({
        error: "rate_limited",
        message: `You've used all ${MAX_QUERIES_PER_DAY} free demo queries for today. Sign up for a free account to keep going.`,
        visitor_token: visitorToken,
        queries_used: currentCount,
        queries_limit: MAX_QUERIES_PER_DAY,
        queries_remaining: 0,
      });
    }

    // --- Resolve filters: preset chip (no LLM) or free-text (LLM) ----------
    let filters: Filters;

    if (body?.filters && typeof body.filters === "object") {
      // Suggested-chip click: trusted-but-sanitized preset. Skips the LLM so
      // the chip is guaranteed to return the results it advertises.
      filters = buildFilters(body.filters as Record<string, unknown>);
      if (!filters.interpretation) filters.interpretation = describeFilters(filters);
    } else {
      // Free-text query: translate via the LLM.
      const prompt = typeof body?.query === "string" ? body.query.trim() : "";
      // Return validation issues as 200 so the client's global runtime-error
      // logger doesn't flag them — the page already renders `data.error`.
      if (prompt.length < 3) {
        return json({ error: "Query must be at least 3 characters" });
      }
      if (prompt.length > 300) {
        return json({ error: "Query is too long (max 300 chars for demo)" });
      }

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        return json({ error: "AI gateway not configured" }, 500);
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
        return json({ error: "AI rate limit hit. Try again in a moment." }, 429);
      }
      if (!aiResp.ok) {
        return json({ error: "AI gateway error" }, 500);
      }

      const aiData = await aiResp.json();
      const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        return json({ error: "Could not interpret your query. Try rephrasing." }, 422);
      }

      let raw: Record<string, unknown>;
      try {
        raw = JSON.parse(toolCall.function.arguments);
      } catch {
        return json({ error: "AI returned malformed filters" }, 500);
      }

      filters = buildFilters(raw);
    }

    // --- Search with graceful relaxation ----------------------------------
    const { projects, relaxed } = await runSearch(supabase, filters);

    // --- Consume a query ONLY when we actually delivered results ----------
    // A dead end never costs a prospect one of their free queries.
    let queriesUsed = currentCount;
    if (projects.length > 0) {
      // Consume one query from BOTH the IP and the visitor-token buckets so
      // neither dimension can be reset independently. The upsert fallback inside
      // incrementKey keeps enforcement working even if the RPC isn't deployed.
      const newCounts = await Promise.all(
        keys.map((key, i) => incrementKey(supabase, key, today, currentCounts[i])),
      );
      queriesUsed = Math.max(...newCounts);
    }
    const queriesRemaining = Math.max(0, MAX_QUERIES_PER_DAY - queriesUsed);

    return json({
      projects,
      filters,
      interpretation: filters.interpretation || describeFilters(filters),
      relaxed,
      visitor_token: visitorToken,
      queries_used: queriesUsed,
      queries_limit: MAX_QUERIES_PER_DAY,
      queries_remaining: queriesRemaining,
    });
  } catch (e) {
    console.error("nl-search-public error", e);
    return json({ error: "An internal error occurred. Please try again." }, 500);
  }
});
