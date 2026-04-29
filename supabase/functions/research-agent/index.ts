import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { recordAiUsage } from "../_shared/requireAi.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { isAgentEnabled, pausedResponse, beginAgentTask, alreadyRunningResponse, setTaskStep, finishAgentRun, recordAgentEvent } from "../_shared/agentGate.ts";
import { registerPipelineSource, stagePipelineProject } from "../_shared/pipelineIngest.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CURRENT_YEAR = new Date().getFullYear();

const NEWS_SOURCES = [
  `global infrastructure projects ${CURRENT_YEAR}`,
  "IJGlobal infrastructure projects worldwide",
  `World Bank new infrastructure projects ${CURRENT_YEAR}`,
  "Construction Week global megaprojects",
  `infrastructure mega projects worldwide ${CURRENT_YEAR}`,
  `Asian Development Bank infrastructure ${CURRENT_YEAR}`,
  `European Investment Bank infrastructure ${CURRENT_YEAR}`,
  `Inter-American Development Bank infrastructure ${CURRENT_YEAR}`,
];

/** Must match public.project_sector (additive; legacy + coverage sectors). */
const PROJECT_SECTORS = [
  "AI Infrastructure",
  "Building Construction",
  "Chemical",
  "Data Centers",
  "Digital Infrastructure",
  "Energy",
  "Industrial",
  "Infrastructure",
  "Mining",
  "Oil & Gas",
  "Renewable Energy",
  "Transport",
  "Urban Development",
  "Water",
] as const;

const RESEARCH_QUERIES: { query: string; group: string }[] = [
  // --- core: current year new announcements ---
  { group: "core", query: `infrastructure megaprojects worldwide ${CURRENT_YEAR} construction awarded financing` },
  { group: "core", query: `major transport rail port airport projects global ${CURRENT_YEAR} tender awarded` },
  { group: "core", query: `water sanitation dam irrigation projects worldwide ${CURRENT_YEAR} construction` },
  { group: "core", query: `energy power grid transmission projects global ${CURRENT_YEAR} awarded` },

  // --- ongoing: multi-year active construction (no single-year restriction) ---
  { group: "ongoing", query: `major infrastructure megaproject currently under construction worldwide multi-year active status 2020 2021 2022 2023 2024 completion 2026 2027 2028` },
  { group: "ongoing", query: `infrastructure megaproject construction phase ongoing active 5 billion 10 billion worldwide dam railway highway port` },
  { group: "ongoing", query: `metro subway LRT airport expansion under construction ongoing worldwide active project commissioning` },
  { group: "ongoing", query: `Belt and Road Initiative BRI project under construction ongoing status update Africa Asia 2022 2023 2024 2025` },

  // --- historical: completed projects for intelligence, benchmarks & contacts ---
  { group: "historical", query: `infrastructure megaproject completed commissioned 2022 2023 2024 Africa Asia Middle East Latin America lessons` },
  { group: "historical", query: `major infrastructure project delivered finished 2021 2022 2023 transport energy water stakeholders contractor` },
  { group: "historical", query: `World Bank AfDB ADB infrastructure project completed 2020 2021 2022 2023 final report evaluation` },

  // --- renewables ---
  { group: "renewables", query: `renewable energy solar wind offshore projects worldwide ${CURRENT_YEAR} awarded financing` },
  { group: "renewables", query: `green hydrogen infrastructure projects ${CURRENT_YEAR} MENA Africa Asia announced` },
  { group: "renewables", query: `solar farm wind park under construction ongoing commissioning 2023 2024 2025 2026 Africa Asia` },

  // --- digital / data centers ---
  { group: "digital", query: `data center hyperscale AI GPU cluster infrastructure construction ${CURRENT_YEAR} awarded billion` },
  { group: "digital", query: `subsea cable digital infrastructure projects ${CURRENT_YEAR} Africa Asia Pacific announced` },
  { group: "digital", query: `data center construction project ongoing 2022 2023 2024 2025 hyperscale colocation Africa Asia Middle East` },

  // --- mining ---
  { group: "mining", query: `mining infrastructure projects ${CURRENT_YEAR} Africa Central Asia awarded copper lithium cobalt` },
  { group: "mining", query: `mineral processing plant smelter construction ${CURRENT_YEAR} awarded financing billion` },
  { group: "mining", query: `copper gold lithium mine construction ongoing 2021 2022 2023 2024 2025 production ramp-up Africa South America` },

  // --- oil & gas / chemical ---
  { group: "oilgas", query: `LNG terminal pipeline oil gas infrastructure ${CURRENT_YEAR} awarded construction MENA Africa` },
  { group: "oilgas", query: `petrochemical refinery industrial complex ${CURRENT_YEAR} construction awarded billion` },
  { group: "oilgas", query: `LNG facility refinery under construction ongoing 2021 2022 2023 2024 2025 MENA Africa Asia` },

  // --- urban development ---
  { group: "urban", query: `smart city urban development megaproject ${CURRENT_YEAR} construction awarded Middle East Africa Asia` },
  { group: "urban", query: `new city giga-project urban district construction ongoing 2020 2021 2022 2023 2024 NEOM Lusail Diamniadio` },

  // --- MENA ---
  { group: "mena", query: `Saudi Arabia UAE Qatar infrastructure megaprojects ${CURRENT_YEAR} awarded construction` },
  { group: "mena", query: `Egypt Iraq Kuwait Oman infrastructure projects ${CURRENT_YEAR} tender awarded financing` },
  { group: "mena", query: `Saudi Vision 2030 UAE giga-project infrastructure under construction ongoing progress update 2024 2025` },

  // --- Africa ---
  { group: "africa", query: `Sub-Saharan Africa infrastructure projects ${CURRENT_YEAR} awarded construction energy transport` },
  { group: "africa", query: `Nigeria Kenya Ethiopia Tanzania infrastructure ${CURRENT_YEAR} construction awarded billion` },
  { group: "africa", query: `Africa infrastructure under construction ongoing 2021 2022 2023 2024 World Bank AfDB funded transport energy water` },

  // --- Asia ---
  { group: "asia", query: `Southeast Asia infrastructure projects ${CURRENT_YEAR} Vietnam Indonesia Philippines Thailand awarded construction` },
  { group: "asia", query: `South Asia India Bangladesh Pakistan Sri Lanka infrastructure ${CURRENT_YEAR} awarded construction` },
  { group: "asia", query: `Central Asia Kazakhstan Uzbekistan Tajikistan infrastructure ${CURRENT_YEAR} construction awarded` },
  { group: "asia", query: `Asia infrastructure megaproject under construction ongoing 2022 2023 2024 2025 ADB AIIB funded` },

  // --- Americas ---
  { group: "americas", query: `Latin America Brazil Mexico Colombia Chile Peru infrastructure ${CURRENT_YEAR} construction awarded` },
  { group: "americas", query: `North America Canada US infrastructure megaprojects ${CURRENT_YEAR} awarded construction IDB` },
  { group: "americas", query: `Latin America infrastructure under construction ongoing 2021 2022 2023 2024 IDB funded transport energy` },
];

interface ExtractedProject {
  name: string;
  country: string;
  region: "MENA" | "East Africa" | "West Africa" | "Southern Africa" | "Central Africa" | "North America" | "South America" | "Europe" | "Central Asia" | "South Asia" | "East Asia" | "Southeast Asia" | "Oceania" | "Caribbean";
  sector: string;
  stage: string;
  status: string;
  value_usd: number;
  value_label: string;
  confidence: number;
  risk_score: number;
  lat: number;
  lng: number;
  description: string;
  timeline: string;
  stakeholders: string[];
  evidence_source: string;
  evidence_url: string;
  evidence_type: string;
  source_url: string;
  contacts?: { name: string; role?: string; organization?: string; phone?: string; email?: string; contact_type?: string; source_url?: string }[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  // Hoist taskId and supabase so the outer catch can update task status on crash
  let taskId: string | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!await isAgentEnabled(supabase, "discovery")) return pausedResponse("discovery");
    const lock = await beginAgentTask(supabase, "discovery", "Full pipeline run", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("discovery");
    taskId = lock.taskId;
    const runStartedAt = new Date();
    await setTaskStep(supabase, taskId, "Searching");

    const rawContent: string[] = [];

    // Step 1: External crawlers are intentionally not required for the MVP.

    // Step 2: Deep research with Lovable AI, cycling through groups
    {
      if (taskId) await setTaskStep(supabase, taskId, "Searching");
      console.log("Researching with Lovable AI...");

      const groupNames = [...new Set(RESEARCH_QUERIES.map((q) => q.group))];
      // Cycle offset based on current time so successive runs hit different groups
      const cycleOffset = Math.floor(Date.now() / 1000) % groupNames.length;
      const selectedGroups = Array.from({ length: 6 }, (_, i) =>
        groupNames[(cycleOffset + i) % groupNames.length]
      );

      for (const group of selectedGroups) {
        const queriesInGroup = RESEARCH_QUERIES.filter((q) => q.group === group);
        const chosen = queriesInGroup[Math.floor(Math.random() * queriesInGroup.length)];
        try {
          const aiResearch = await chatCompletions({
            messages: [
              { role: "system", content: "You are an infrastructure intelligence analyst. Provide detailed information about current infrastructure megaprojects worldwide. IMPORTANT: Always include direct URLs to your sources for each project mentioned." },
              { role: "user", content: chosen.query },
            ],
          });
          if (aiResearch.ok) {
            const aiData = await aiResearch.json();
            const content = aiData?.choices?.[0]?.message?.content;
            if (content) rawContent.push(`Lovable AI Research [${group}]:\n${content}`);
          }
        } catch (e) {
          console.error(`Lovable AI research error for group ${group}:`, e);
        }
      }
    }

    if (rawContent.length === 0) {
      if (taskId) {
        await supabase.from("research_tasks").update({ status: "failed", error: "No data sources available", completed_at: new Date().toISOString() }).eq("id", taskId);
      }
      return new Response(
        JSON.stringify({ success: false, error: "No data collected from sources" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: AI extraction (source_url is now REQUIRED)
    if (taskId) await setTaskStep(supabase, taskId, "Extracting");
    console.log("Extracting structured data with AI...");
    const extractionPrompt = `Analyze the following infrastructure news and research content. Extract any NEW infrastructure projects you can identify.

CRITICAL: Every project MUST have a "source_url" field containing a real, verifiable URL where the project information can be confirmed. Do NOT use placeholder URLs. If you cannot find a verifiable source URL for a project, set confidence to 30 or below and still include the best available URL.

For each project, extract:
- name: project name
- country: country where project is located
- region: must be one of "MENA", "East Africa", "West Africa", "Southern Africa", "Central Africa", "North America", "South America", "Europe", "Central Asia", "South Asia", "East Asia", "Southeast Asia", "Oceania", "Caribbean"
- sector: one of ${PROJECT_SECTORS.map((s) => `"${s}"`).join(", ")}
- stage: one of "Planned", "Tender", "Awarded", "Financing", "Construction", "Completed", "Cancelled", "Stopped"
- status: one of "Verified", "Stable", "Pending", "At Risk"
- value_usd: estimated value in USD (number)
- value_label: human readable value like "$2.5B"
- confidence: 0-100 based on evidence quality (MUST be ≤30 if no real source URL)
- risk_score: 0-100 based on risk factors
- lat: latitude coordinate
- lng: longitude coordinate
- description: 1-2 sentence description
- timeline: e.g. "2024-2030"
- stakeholders: array of key stakeholder names
- evidence_source: name of the source
- evidence_url: URL of the source (MUST be a real, clickable URL)
- evidence_type: one of "Satellite", "Filing", "News", "Registry", "Partner"
- source_url: PRIMARY verifiable URL for this project (REQUIRED: real news article, government filing, or official project page)

Content to analyze:
${rawContent.join("\n\n---\n\n")}`;

    const aiResponse = await chatCompletions({
        messages: [
          { role: "system", content: "You are an infrastructure data extraction engine. Return valid JSON only. Every extracted project MUST include a verifiable source_url." },
          { role: "user", content: extractionPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_projects",
              description: "Extract infrastructure projects from content",
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
                        region: { type: "string", enum: ["MENA", "East Africa", "West Africa", "Southern Africa", "Central Africa", "North America", "South America", "Europe", "Central Asia", "South Asia", "East Asia", "Southeast Asia", "Oceania", "Caribbean"] },
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
                        evidence_url: { type: "string", description: "Direct URL to the source article or page" },
                        evidence_type: { type: "string", enum: ["Satellite", "Filing", "News", "Registry", "Partner"] },
                        source_url: { type: "string", description: "REQUIRED: Primary verifiable URL for this project" },
                        contacts: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string" },
                              role: { type: "string" },
                              organization: { type: "string" },
                              phone: { type: "string" },
                              email: { type: "string" },
                              contact_type: { type: "string", enum: ["contractor", "government", "financier", "consultant", "owner", "general"] },
                            },
                            required: ["name"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["name", "country", "region", "sector", "stage", "value_usd", "lat", "lng", "description", "source_url"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["projects"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_projects" } },
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      if (taskId) {
        await supabase.from("research_tasks").update({ status: "failed", error: `AI error: ${aiResponse.status}`, completed_at: new Date().toISOString() }).eq("id", taskId);
      }
      return new Response(
        JSON.stringify({ success: false, error: `AI extraction failed: ${aiResponse.status}` }),
        { status: aiResponse.status === 429 ? 429 : aiResponse.status === 402 ? 402 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    let extractedProjects: ExtractedProject[] = [];

    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        extractedProjects = parsed.projects || [];
      }
    } catch (e) {
      console.error("Failed to parse AI response:", e);
    }

    // Guard: treat zero extractions as a failure, not silent success
    if (extractedProjects.length === 0) {
      if (taskId) {
        await supabase.from("research_tasks").update({
          status: "failed",
          error: "AI returned 0 projects — possible tool_call parse failure or genuinely empty result",
          completed_at: new Date().toISOString(),
        }).eq("id", taskId);
      }
      return new Response(
        JSON.stringify({ success: false, error: "AI extracted 0 projects", raw_content_length: rawContent.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 4: Upsert into database
    if (taskId) await setTaskStep(supabase, taskId, "Saving");
    const sourceRow = await registerPipelineSource(supabase, {
      sourceKey: "web-research-agent",
      name: "AI Web Research Agent",
      kind: "news",
      baseUrl: "https://infradarai.com/research-agent",
      reliabilityScore: 55,
      supportsApi: false,
    });

    let candidatesCreated = 0;
    let candidatesUpdated = 0;
    let updateProposalsCreated = 0;
    let skippedNoSource = 0;

    for (const ep of extractedProjects) {
      // Determine the best source URL available
      const bestSourceUrl = ep.source_url || ep.evidence_url || "";
      const isValidSource = bestSourceUrl && bestSourceUrl.startsWith("http");

      // If no valid source and confidence is high, cap it
      if (!isValidSource && (ep.confidence || 50) > 30) {
        ep.confidence = 30;
      }

      const staged = await stagePipelineProject(supabase, {
        sourceId: sourceRow?.id ?? null,
        sourceKey: "web-research-agent",
        sourceName: ep.evidence_source || "AI Web Research Agent",
        discoveredBy: "discovery",
        externalId: null,
        apiUrl: bestSourceUrl || null,
        name: ep.name,
        country: ep.country,
        region: ep.region,
        sector: ep.sector,
        stage: ep.stage,
        status: ep.status || "Pending",
        valueUsd: ep.value_usd || 0,
        valueLabel: ep.value_label || "$0",
        confidence: ep.confidence || 50,
        riskScore: ep.risk_score || 50,
        lat: ep.lat,
        lng: ep.lng,
        description: ep.description,
        timeline: ep.timeline || "",
        sourceUrl: isValidSource ? bestSourceUrl : "",
        rawPayload: ep,
        extractedClaims: { evidence_source: ep.evidence_source ?? null, contacts: ep.contacts ?? [], stakeholders: ep.stakeholders ?? [] },
        stakeholder: Array.isArray(ep.stakeholders) ? ep.stakeholders[0] : null,
      });
      if (staged.outcome === "candidate_created") candidatesCreated++;
      else if (staged.outcome === "candidate_updated") candidatesUpdated++;
      else if (staged.outcome === "update_proposed") updateProposalsCreated++;
      if (!isValidSource) skippedNoSource++;
    }

    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed",
        result: { extracted: extractedProjects.length, candidates_created: candidatesCreated, candidates_updated: candidatesUpdated, update_proposals_created: updateProposalsCreated, sources: rawContent.length, missing_source: skippedNoSource },
        completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }

    const result = { extracted: extractedProjects.length, candidates_created: candidatesCreated, candidates_updated: candidatesUpdated, update_proposals_created: updateProposalsCreated, sources: rawContent.length, missing_source: skippedNoSource };
    await recordAgentEvent(supabase, "discovery", "completed", "Research agent staged source-first candidates", taskId, result);
    console.log(`Research complete: ${extractedProjects.length} extracted, ${candidatesCreated} candidates, ${updateProposalsCreated} proposals, ${skippedNoSource} missing source`);

    await recordAiUsage(gate.supabaseAdmin, gate.userId);
    await finishAgentRun(supabase, "discovery", "completed", runStartedAt);

    return new Response(
      JSON.stringify({
        success: true,
        extracted: extractedProjects.length,
        inserted,
        updated,
        sources_processed: rawContent.length,
        missing_source: skippedNoSource,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Research agent error:", e);
    if (taskId && supabase) {
      try {
        await supabase.from("research_tasks").update({
          status: "failed",
          error: e instanceof Error ? e.message : "Unknown error",
          completed_at: new Date().toISOString(),
        }).eq("id", taskId);
        await finishAgentRun(supabase, "discovery", "failed", runStartedAt ?? new Date());
      } catch { /* best-effort */ }
    }
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
