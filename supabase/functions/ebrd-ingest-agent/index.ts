/**
 * ebrd-ingest-agent
 *
 * Ingests European Bank for Reconstruction and Development (EBRD) projects.
 * EBRD has no public REST API. For the MVP this agent uses Lovable AI to
 * create source-aware research notes for EBRD mandate regions.
 *
 * Coverage: Eastern Europe, Central Asia, MENA (EBRD mandate regions)
 * Portal: https://www.ebrd.com/work-with-us/projects/psd.html
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { recordAiUsage } from "../_shared/requireAi.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { isAgentEnabled, pausedResponse, beginAgentTask, alreadyRunningResponse, finishAgentRun, recordAgentEvent } from "../_shared/agentGate.ts";
import { registerPipelineSource, stagePipelineProject, slugifyProjectName } from "../_shared/pipelineIngest.ts";
import { resolveCountryCoords } from "../_shared/countryCentroids.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// EBRD Lovable AI research prompts — sectors and regions under EBRD mandate
const EBRD_QUERIES = [
  "EBRD European Bank for Reconstruction Development infrastructure project approved 2023 2024 Eastern Europe Central Asia transport energy",
  "EBRD infrastructure project approved ongoing 2023 2024 Ukraine Moldova Georgia Armenia Azerbaijan Kazakhstan Uzbekistan",
  "EBRD renewable energy infrastructure project Eastern Europe 2023 2024 approved construction",
  "EBRD transport infrastructure road rail project approved 2023 2024 Central Asia Balkans",
  "EBRD water urban infrastructure project approved 2023 2024 Eastern Europe MENA",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  let taskId: string | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;
    let runStartedAt: Date | null = null;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!await isAgentEnabled(supabase, "ebrd-ingest")) return pausedResponse("ebrd-ingest");
    const lock = await beginAgentTask(supabase, "ebrd-ingest", "EBRD Infrastructure Projects", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("ebrd-ingest");
    taskId = lock.taskId;
    runStartedAt = new Date();

    const sourceRow = await registerPipelineSource(supabase, {
      sourceKey: "ebrd-projects",
      name: "EBRD Projects Database",
      baseUrl: "https://www.ebrd.com/work-with-us/projects/psd.html",
      reliabilityScore: 86,
      supportsApi: false,
    });

    const rawContent: string[] = [];

    for (const query of EBRD_QUERIES) {
      try {
        const research = await chatCompletions({
          messages: [
            { role: "system", content: "You are an infrastructure analyst specializing in EBRD-financed projects. Provide source-aware project notes with names, countries, values, sectors, mandate regions and official EBRD URLs where known." },
            { role: "user", content: `${query}. Also consider EBRD project portal: https://www.ebrd.com/work-with-us/projects/psd.html` },
          ],
        });
        if (research.ok) {
          const data = await research.json();
          const content = data?.choices?.[0]?.message?.content;
          if (content) rawContent.push(`Lovable AI EBRD research:
${content}`);
        }
      } catch (e) { console.error("Lovable AI EBRD research error:", e); }
    }

    if (rawContent.length === 0) {
      if (taskId) await supabase.from("research_tasks").update({ status: "failed", error: "No content collected", completed_at: new Date().toISOString() }).eq("id", taskId);
      return new Response(JSON.stringify({ success: false, error: "No content collected from EBRD" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // AI extraction
    const aiResponse = await chatCompletions({
      messages: [
        { role: "system", content: "Extract EBRD infrastructure projects. EBRD operates in Eastern Europe, Central Asia, MENA. Focus on transport, energy, renewable energy, water, urban projects." },
        {
          role: "user",
          content: `Extract infrastructure projects from this EBRD content:

${rawContent.join("\n\n---\n\n").slice(0, 12000)}

Return only projects clearly financed or being considered by EBRD. Each must have a country and sector.`,
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "extract_ebrd_projects",
          description: "Extract EBRD infrastructure projects",
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
                    region: { type: "string", enum: ["MENA", "Europe", "Central Asia", "East Africa", "West Africa", "Southern Africa"] },
                    sector: { type: "string", enum: ["Transport", "Energy", "Renewable Energy", "Water", "Urban Development", "Digital Infrastructure", "Industrial", "Oil & Gas", "Infrastructure"] },
                    stage: { type: "string", enum: ["Planned", "Financing", "Construction", "Completed"] },
                    status: { type: "string", enum: ["Verified", "Stable", "Pending"] },
                    value_usd: { type: "number" },
                    value_label: { type: "string" },
                    confidence: { type: "number" },
                    source_url: { type: "string" },
                  },
                  required: ["name", "country", "region", "sector", "stage"],
                  additionalProperties: false,
                },
              },
            },
            required: ["projects"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_ebrd_projects" } },
    });

    let extractedProjects: any[] = [];
    if (aiResponse.ok) {
      const aiData = await aiResponse.json();
      try {
        const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (tc?.function?.arguments) extractedProjects = JSON.parse(tc.function.arguments).projects || [];
      } catch (e) { console.error("Parse error:", e); }
    }

    if (extractedProjects.length === 0) {
      if (taskId) await supabase.from("research_tasks").update({ status: "failed", error: "AI extracted 0 EBRD projects", completed_at: new Date().toISOString() }).eq("id", taskId);
      return new Response(JSON.stringify({ success: false, error: "AI extracted 0 projects" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let candidatesWritten = 0;
    let candidatesUpdated = 0;
    let updatesProposed = 0;
    let skipped = 0;

    for (const ep of extractedProjects) {
      try {
        const name = (ep.name || "").trim();
        if (!name) continue;

        const bestUrl = (ep.source_url && String(ep.source_url).startsWith("http"))
          ? ep.source_url
          : "https://www.ebrd.com/work-with-us/projects/psd.html";

        const coords = resolveCountryCoords(ep.country || "", slugifyProjectName(name));
        const totalAmt = Number(ep.value_usd) || 0;
        let valueLabel = ep.value_label || "";
        if (!valueLabel) {
          if (totalAmt >= 1_000_000_000) valueLabel = `$${(totalAmt / 1_000_000_000).toFixed(1)}B`;
          else if (totalAmt >= 1_000_000) valueLabel = `$${(totalAmt / 1_000_000).toFixed(0)}M`;
          else valueLabel = "Value TBD";
        }

        const confidence = Number(ep.confidence) || 75;
        const description = `EBRD-financed ${ep.sector} project in ${ep.country}.`;
        const staged = await stagePipelineProject(supabase!, {
          sourceId: sourceRow?.id ?? null,
          sourceKey: "ebrd-projects",
          sourceName: "EBRD Projects Database",
          discoveredBy: "ebrd-ingest",
          externalId: null,
          apiUrl: "https://www.ebrd.com/work-with-us/projects/psd.html",
          name,
          country: ep.country,
          region: ep.region,
          sector: ep.sector,
          stage: ep.stage,
          status: ep.status || "Pending",
          valueUsd: totalAmt,
          valueLabel,
          confidence,
          riskScore: 42,
          lat: coords.lat,
          lng: coords.lng,
          coordPrecision: coords.precision,
          description,
          timeline: "",
          sourceUrl: bestUrl,
          rawPayload: ep,
          extractedClaims: { extraction_source: "lovable-ai-ebrd-research" },
        });
        if (staged.outcome === "candidate_created") candidatesWritten++;
        else if (staged.outcome === "candidate_updated") candidatesUpdated++;
        else if (staged.outcome === "update_proposed") updatesProposed++;
        else skipped++;
      } catch (projectErr) { console.error("Error processing EBRD project:", projectErr); skipped++; }
    }

    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    const result = { success: true, extracted: extractedProjects.length, candidates_created: candidatesWritten, candidates_updated: candidatesUpdated, update_proposals_created: updatesProposed, skipped, source: "EBRD" };
    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed", result, completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }

    await recordAgentEvent(supabase, "ebrd-ingest", "completed", "EBRD ingest wrote source-first candidates", taskId, result);
    if (runStartedAt) await finishAgentRun(supabase, "ebrd-ingest", "completed", runStartedAt);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("EBRD ingest error:", e);
    if (taskId && supabase) {
      try {
        await supabase.from("research_tasks").update({
          status: "failed", error: "An internal error occurred. Please try again.",
          completed_at: new Date().toISOString(),
        }).eq("id", taskId);
        await recordAgentEvent(supabase, "ebrd-ingest", "failed", e instanceof Error ? e.message : "Unknown error", taskId);
        if (runStartedAt) await finishAgentRun(supabase, "ebrd-ingest", "failed", runStartedAt);
      } catch { /* best-effort */ }
    }
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
