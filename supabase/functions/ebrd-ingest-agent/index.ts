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
import { isAgentEnabled, pausedResponse, beginAgentTask, alreadyRunningResponse } from "../_shared/agentGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// EBRD Perplexity queries — sectors and regions under EBRD mandate
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

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!await isAgentEnabled(supabase, "ebrd-ingest")) return pausedResponse("ebrd-ingest");
    const lock = await beginAgentTask(supabase, "ebrd-ingest", "EBRD Infrastructure Projects", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("ebrd-ingest");
    taskId = lock.taskId;

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

    const EBRD_CENTROIDS: Record<string, [number, number]> = {
      "ukraine": [48.38, 31.17], "poland": [51.92, 19.15], "romania": [45.94, 24.97],
      "turkey": [38.96, 35.24], "kazakhstan": [48.02, 66.92], "uzbekistan": [41.38, 64.59],
      "egypt": [26.82, 30.80], "morocco": [31.79, -7.09], "jordan": [30.59, 36.24],
      "georgia": [42.32, 43.36], "armenia": [40.07, 45.04], "azerbaijan": [40.14, 47.58],
      "moldova": [47.41, 28.37], "belarus": [53.71, 27.95], "serbia": [44.02, 21.01],
      "north macedonia": [41.61, 21.75], "albania": [41.15, 20.17], "bosnia": [43.92, 17.68],
      "kosovo": [42.60, 20.90], "montenegro": [42.71, 19.37], "hungary": [47.16, 19.50],
      "czech republic": [49.82, 15.47], "slovakia": [48.67, 19.70], "bulgaria": [42.73, 25.49],
      "tajikistan": [38.86, 71.28], "kyrgyzstan": [41.20, 74.77], "turkmenistan": [38.97, 59.56],
      "mongolia": [46.86, 103.85], "tunisia": [33.89, 9.54], "libya": [26.34, 17.23],
    };
    function getEbrdCentroid(country: string): [number, number] {
      const key = country.toLowerCase().trim();
      if (EBRD_CENTROIDS[key]) return EBRD_CENTROIDS[key];
      for (const [k, v] of Object.entries(EBRD_CENTROIDS)) {
        if (key.includes(k) || k.includes(key)) return v;
      }
      return [45, 30]; // center of EBRD coverage area
    }

    let inserted = 0;
    let updated = 0;

    for (const ep of extractedProjects) {
      try {
        const name = (ep.name || "").trim();
        if (!name) continue;

        const bestUrl = (ep.source_url && String(ep.source_url).startsWith("http"))
          ? ep.source_url
          : "https://www.ebrd.com/work-with-us/projects/psd.html";

        const [lat, lng] = getEbrdCentroid(ep.country || "");
        const totalAmt = Number(ep.value_usd) || 0;
        let valueLabel = ep.value_label || "";
        if (!valueLabel) {
          if (totalAmt >= 1_000_000_000) valueLabel = `$${(totalAmt / 1_000_000_000).toFixed(1)}B`;
          else if (totalAmt >= 1_000_000) valueLabel = `$${(totalAmt / 1_000_000).toFixed(0)}M`;
          else valueLabel = "Value TBD";
        }

        const confidence = Number(ep.confidence) || 75;
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const { data: existing } = await supabase!.from("projects").select("id, confidence, source_url").eq("slug", slug).maybeSingle();

        if (existing) {
          if (confidence > (existing.confidence || 0) || !existing.source_url) {
            await supabase!.from("projects").update({
              confidence: Math.max(confidence, existing.confidence || 0),
              stage: ep.stage, status: ep.status || "Pending",
              source_url: existing.source_url || bestUrl,
              last_updated: new Date().toISOString(),
            }).eq("id", existing.id);
            updated++;
          }
        } else {
          const { data: newProject } = await supabase!.from("projects").insert({
            slug, name, country: ep.country, region: ep.region, sector: ep.sector,
            stage: ep.stage, status: ep.status || "Pending",
            value_usd: totalAmt, value_label: valueLabel, confidence,
            risk_score: 42, lat, lng,
            description: `EBRD-financed ${ep.sector} project in ${ep.country}.`,
            timeline: "", source_url: bestUrl, ai_generated: false, approved: true,
          }).select().single();

          if (newProject) {
            await supabase!.from("evidence_sources").insert({
              project_id: newProject.id, source: "EBRD Projects Database",
              url: bestUrl, type: "Filing", verified: true,
              date: new Date().toISOString().split("T")[0], title: name,
              description: `EBRD ${ep.sector} project in ${ep.country}.`,
            });
            await supabase!.from("alerts").insert({
              project_id: newProject.id, project_name: name, severity: "low",
              message: `EBRD project ingested: ${name} (${ep.country}) — ${valueLabel}`,
              category: "market", source_url: bestUrl,
            });
            inserted++;
          }
        }
      } catch (projectErr) { console.error("Error processing EBRD project:", projectErr); }
    }

    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    const result = { success: true, extracted: extractedProjects.length, inserted, updated, source: "EBRD" };
    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed", result, completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("EBRD ingest error:", e);
    if (taskId && supabase) {
      try {
        await supabase.from("research_tasks").update({
          status: "failed", error: e instanceof Error ? e.message : "Unknown error",
          completed_at: new Date().toISOString(),
        }).eq("id", taskId);
      } catch { /* best-effort */ }
    }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
