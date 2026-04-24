// Natural Language Project Search
// Translates a free-text prompt into structured filters via Lovable AI Gateway,
// then runs them against the public.projects table (RLS-bypassed via the
// service-role client + an explicit `approved=true` filter).
//
// Counts as 1 AI quota unit per call (same metric as other AI features).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlanAndAiOrRespond } from "../_shared/requireAi.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
- countries should be country names exactly as commonly written ("Nigeria", "Saudi Arabia").
- keyword is a free-text fragment to match against project name/description; only set it when the prompt names a specific project, technology, or theme not covered by the structured fields.
- order_by: "value" (default), "recent" (last_updated desc), or "risk" (lowest risk first).
- limit: 1-50, default 24.
- interpretation: a single human sentence summarising what you understood.`;

const FILTER_TOOL = {
  type: "function",
  function: {
    name: "apply_filters",
    description: "Run a filtered project search and return matching projects.",
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
        limit: { type: "integer", minimum: 1, maximum: 50 },
        interpretation: { type: "string" },
      },
      required: ["interpretation"],
      additionalProperties: false,
    },
  },
};

type Filters = {
  regions?: string[];
  sectors?: string[];
  stages?: string[];
  statuses?: string[];
  countries?: string[];
  value_min_usd?: number | null;
  value_max_usd?: number | null;
  keyword?: string | null;
  order_by?: "value" | "recent" | "risk";
  limit?: number;
  interpretation: string;
};

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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requirePlanAndAiOrRespond(req, "starter");
  if (gate instanceof Response) return gate;

  try {
    const body = await req.json().catch(() => ({}));
    const prompt = typeof body?.query === "string" ? body.query.trim() : "";
    if (prompt.length < 3) {
      return new Response(JSON.stringify({ error: "Query must be at least 3 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (prompt.length > 500) {
      return new Response(JSON.stringify({ error: "Query is too long (max 500 chars)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Translate prompt → filters via Lovable AI Gateway (tool-call structured output)
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
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in workspace settings." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("ai gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(
        JSON.stringify({ error: "Could not interpret your query. Try rephrasing with country, sector, or value." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let raw: Filters;
    try {
      raw = JSON.parse(toolCall.function.arguments) as Filters;
    } catch {
      return new Response(JSON.stringify({ error: "AI returned malformed filters" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Sanitize against whitelists
    const filters = {
      regions: sanitizeStringArray(raw.regions, REGIONS),
      sectors: sanitizeStringArray(raw.sectors, SECTORS),
      stages: sanitizeStringArray(raw.stages, STAGES),
      statuses: sanitizeStringArray(raw.statuses, STATUSES),
      countries: sanitizeStringArray(raw.countries, null).slice(0, 20),
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
      order_by:
        raw.order_by === "recent" || raw.order_by === "risk" ? raw.order_by : "value",
      limit: typeof raw.limit === "number" ? Math.min(50, Math.max(1, Math.floor(raw.limit))) : 24,
      interpretation: typeof raw.interpretation === "string" ? raw.interpretation.slice(0, 500) : "",
    };

    // 3) Build query
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(supabaseUrl, serviceKey);

    let q = supabase
      .from("projects")
      .select(
        "id, slug, name, country, region, sector, stage, status, value_usd, value_label, confidence, risk_score, description, last_updated",
      )
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

    q = q.limit(filters.limit);

    const { data: projects, error } = await q;
    if (error) {
      console.error("nl-search query error", error);
      return new Response(JSON.stringify({ error: "Search query failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        projects: projects ?? [],
        filters,
        interpretation: filters.interpretation,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("nl-search error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
