/**
 * frontier-intel-agent
 *
 * Dedicated discovery agent for emerging / frontier sectors: AI compute campuses,
 * data centres, semiconductor fabs, battery gigafactories, nuclear & SMR, hydrogen,
 * space & satellite, subsea digital, critical-minerals processing and defence
 * industrial infrastructure.
 *
 * Uses the shared research router (Firecrawl by default) for grounded, cited
 * search results, then extracts structured projects with the same rules as the
 * main research agent: a verifiable source_url is REQUIRED, confidence is capped
 * at 30 without one. Results are staged through the standard pipeline so the
 * existing review / auto-approval flow applies.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions, gatewayFailure, GatewayError } from "../_shared/llm.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import {
  isAgentEnabled,
  pausedResponse,
  beginAgentTask,
  alreadyRunningResponse,
  setTaskStep,
  finishAgentRun,
  recordAgentEvent,
} from "../_shared/agentGate.ts";
import { registerPipelineSource, stagePipelineProject } from "../_shared/pipelineIngest.ts";
import { research } from "../_shared/researchRouter.ts";
import {
  PROJECT_SECTORS,
  FRONTIER_QUERIES,
  FRONTIER_REGION_SLANTS,
} from "../_shared/sectors.ts";

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

const AGENT = "frontier-intel";

interface ExtractedProject {
  name: string;
  country: string;
  region: string;
  sector: string;
  stage: string;
  status?: string;
  value_usd?: number;
  value_label?: string;
  confidence?: number;
  risk_score?: number;
  lat: number;
  lng: number;
  description: string;
  timeline?: string;
  stakeholders?: string[];
  evidence_source?: string;
  evidence_url?: string;
  source_url: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  let taskId: string | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;
  let runStartedAt = new Date();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!await isAgentEnabled(supabase, AGENT)) return pausedResponse(AGENT);
    const lock = await beginAgentTask(supabase, AGENT, "Frontier sector discovery", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse(AGENT);
    taskId = lock.taskId;
    runStartedAt = new Date();

    // ---- Step 1: themed, region-slanted grounded research -------------------
    await setTaskStep(supabase, taskId, "Searching");

    const body = await req.json().catch(() => ({}));
    const themeCount = Math.min(Math.max(Number(body?.themes) || 4, 1), 8);

    const themes = [...new Set(FRONTIER_QUERIES.map((q) => q.theme))];
    const offset = Math.floor(Date.now() / 60000) % themes.length;
    const regionOffset = Math.floor(Date.now() / 60000) % FRONTIER_REGION_SLANTS.length;

    const rawContent: string[] = [];
    const citations = new Set<string>();

    for (let i = 0; i < themeCount; i++) {
      const theme = themes[(offset + i) % themes.length];
      const slant = FRONTIER_REGION_SLANTS[(regionOffset + i) % FRONTIER_REGION_SLANTS.length];
      const pool = FRONTIER_QUERIES.filter((q) => q.theme === theme);
      const base = pool[Math.floor(Math.random() * pool.length)].query;
      try {
        const r = await research({
          systemPrompt:
            "You are an infrastructure intelligence analyst tracking frontier-sector capital projects. Report only named, real projects with their sponsor, location, value and timeline, and always cite the source URL.",
          userPrompt: `${base} — focus on ${slant}`,
          mode: "deep",
          recency: "month",
        });
        if (r.text) rawContent.push(`Frontier research [${theme} / ${slant}] (provider=${r.provider}${r.degraded ? ", degraded" : ""}):\n${r.text}`);
        for (const c of r.citations) citations.add(c);
      } catch (e) {
        console.error(`frontier research error (${theme}):`, e);
      }
    }

    if (rawContent.length === 0) {
      await supabase.from("research_tasks").update({
        status: "failed",
        error: "No research results returned for frontier themes",
        completed_at: new Date().toISOString(),
      }).eq("id", taskId);
      await finishAgentRun(supabase, AGENT, "failed", runStartedAt);
      return new Response(JSON.stringify({ success: false, error: "No research results" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Step 2: structured extraction --------------------------------------
    await setTaskStep(supabase, taskId, "Extracting");

    const allowedUrls = [...citations];
    const prompt = `Extract frontier-sector infrastructure projects from the research below.

Only include projects in these sectors: AI Infrastructure, Data Centers, Semiconductors, Battery & Storage, Nuclear, Hydrogen, Space & Satellite, Digital Infrastructure, Renewable Energy, Energy, Mining, Industrial, Defence & Security.

CRITICAL RULES:
- Every project MUST have a real "source_url". Prefer one of these cited URLs when it supports the project:
${allowedUrls.slice(0, 40).map((u) => `  - ${u}`).join("\n") || "  (no citations captured)"}
- Never invent URLs. If you cannot support a project with a real URL, set confidence to 30 or lower.
- Only include named, concrete projects (a specific facility, campus, plant or programme) — no market commentary.
- lat/lng must be the best available coordinates for the project site or its city.

Research content:
${rawContent.join("\n\n---\n\n")}`;

    const aiResponse = await chatCompletions({
      messages: [
        { role: "system", content: "You are an infrastructure data extraction engine. Return valid JSON only via the provided tool. Every project must include a verifiable source_url." },
        { role: "user", content: prompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "extract_projects",
          description: "Extract frontier-sector infrastructure projects",
          parameters: {
            type: "object",
            properties: {
              projects: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    country: { type: "string" },
                    region: { type: "string", enum: REGIONS },
                    sector: { type: "string", enum: [...PROJECT_SECTORS] },
                    stage: { type: "string", enum: ["Planned", "Tender", "Awarded", "Financing", "Construction", "Completed", "Cancelled", "Stopped"] },
                    status: { type: "string", enum: ["Verified", "Stable", "Pending", "At Risk"] },
                    value_usd: { type: "number" },
                    value_label: { type: "string" },
                    confidence: { type: "number" },
                    risk_score: { type: "number" },
                    lat: { type: "number" },
                    lng: { type: "number" },
                    description: { type: "string" },
                    timeline: { type: "string" },
                    stakeholders: { type: "array", items: { type: "string" } },
                    evidence_source: { type: "string" },
                    evidence_url: { type: "string" },
                    source_url: { type: "string", description: "REQUIRED: primary verifiable URL" },
                  },
                  required: ["name", "country", "region", "sector", "stage", "lat", "lng", "description", "source_url"],
                  additionalProperties: false,
                },
              },
            },
            required: ["projects"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_projects" } },
    });

    if (!aiResponse.ok) throw await gatewayFailure(aiResponse, "Frontier extraction failed");

    const aiData = await aiResponse.json();
    let extracted: ExtractedProject[] = [];
    try {
      const args = aiData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (args) extracted = JSON.parse(args).projects ?? [];
    } catch (e) {
      console.error("frontier parse error:", e);
    }

    if (extracted.length === 0) {
      await supabase.from("research_tasks").update({
        status: "completed",
        result: { extracted: 0, sources: rawContent.length, citations: allowedUrls.length },
        completed_at: new Date().toISOString(),
      }).eq("id", taskId);
      await finishAgentRun(supabase, AGENT, "completed", runStartedAt);
      return new Response(JSON.stringify({ success: true, extracted: 0, sources_processed: rawContent.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Step 3: stage through the standard pipeline -------------------------
    await setTaskStep(supabase, taskId, "Saving");

    const sourceRow = await registerPipelineSource(supabase, {
      sourceKey: "frontier-intel-agent",
      name: "Frontier Sector Intelligence Agent",
      kind: "news",
      baseUrl: "https://infradarai.com/frontier-intel-agent",
      reliabilityScore: 55,
      supportsApi: false,
    });

    let created = 0, updated = 0, proposals = 0, missingSource = 0;

    for (const ep of extracted) {
      const best = ep.source_url || ep.evidence_url || "";
      const valid = !!best && best.startsWith("http");
      if (!valid) missingSource++;
      const confidence = valid ? (ep.confidence ?? 55) : Math.min(ep.confidence ?? 30, 30);

      try {
        const staged = await stagePipelineProject(supabase, {
          sourceId: sourceRow?.id ?? null,
          sourceKey: "frontier-intel-agent",
          sourceName: ep.evidence_source || "Frontier Sector Intelligence Agent",
          discoveredBy: AGENT,
          externalId: null,
          apiUrl: valid ? best : null,
          name: ep.name,
          country: ep.country,
          region: ep.region,
          sector: ep.sector,
          stage: ep.stage,
          status: ep.status || "Pending",
          valueUsd: ep.value_usd || 0,
          valueLabel: ep.value_label || "$0",
          confidence,
          riskScore: ep.risk_score ?? 50,
          lat: ep.lat,
          lng: ep.lng,
          description: ep.description,
          timeline: ep.timeline || "",
          sourceUrl: valid ? best : "",
          rawPayload: ep,
          extractedClaims: { evidence_source: ep.evidence_source ?? null, stakeholders: ep.stakeholders ?? [] },
          stakeholder: Array.isArray(ep.stakeholders) ? ep.stakeholders[0] : null,
        });
        if (staged.outcome === "candidate_created") created++;
        else if (staged.outcome === "candidate_updated") updated++;
        else if (staged.outcome === "update_proposed") proposals++;
      } catch (e) {
        console.error(`frontier staging failed for "${ep.name}":`, e);
      }
    }

    const result = {
      extracted: extracted.length,
      candidates_created: created,
      candidates_updated: updated,
      update_proposals_created: proposals,
      sources: rawContent.length,
      citations: allowedUrls.length,
      missing_source: missingSource,
    };

    await supabase.from("research_tasks").update({
      status: "completed", result, completed_at: new Date().toISOString(),
    }).eq("id", taskId);
    await recordAgentEvent(supabase, AGENT, "completed", "Frontier sector discovery run", taskId, result);
    await finishAgentRun(supabase, AGENT, "completed", runStartedAt);

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("frontier-intel-agent error:", e);
    const isGateway = e instanceof GatewayError && e.endRunGracefully;

    if (taskId && supabase) {
      try {
        await supabase.from("research_tasks").update({
          status: "failed",
          error: isGateway ? (e as GatewayError).message : "An internal error occurred. Please try again.",
          completed_at: new Date().toISOString(),
        }).eq("id", taskId);
        await finishAgentRun(supabase, AGENT, "failed", runStartedAt);
      } catch { /* best-effort */ }
    }

    if (isGateway) {
      const ge = e as GatewayError;
      return new Response(
        JSON.stringify({ success: false, code: "ai_unavailable", status: ge.status, error: ge.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
