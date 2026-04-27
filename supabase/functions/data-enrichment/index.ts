import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { recordAiUsage } from "../_shared/requireAi.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { beginAgentTask, alreadyRunningResponse, setTaskStep, finishAgentRun } from "../_shared/agentGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function isHttpUrl(s: string | null | undefined): boolean {
  return typeof s === "string" && s.trim().startsWith("http");
}

/** Name + (email or phone) + http source — same bar as contact-finder / HITL */
function isReachableContactRow(
  c: { name?: string; email?: string | null; phone?: string | null },
  sourceUrl: string | null,
): boolean {
  const name = (c.name || "").trim();
  if (!name) return false;
  const hasEmail = !!(c.email && String(c.email).trim());
  const hasPhone = !!(c.phone && String(c.phone).trim());
  if (!hasEmail && !hasPhone) return false;
  return isHttpUrl(sourceUrl);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Supabase not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const lock = await beginAgentTask(supabase, "data-enrichment", "Scanning projects for missing data and enriching gaps", gate.userId);
  if (lock.alreadyRunning) return alreadyRunningResponse("data-enrichment");
  const taskId = lock.taskId;
  const runStartedAt = new Date();
  await setTaskStep(supabase, taskId, "Searching");

  try {
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (!PERPLEXITY_API_KEY) throw new Error("PERPLEXITY_API_KEY not configured");

    // Get ALL projects (approved AND pending); pending projects especially need source URLs
    const { data: projects } = await supabase.from("projects").select("*");
    if (!projects?.length) {
      if (taskId) await supabase.from("research_tasks").update({ status: "completed", completed_at: new Date().toISOString(), result: { message: "No projects" } }).eq("id", taskId);
      await recordAiUsage(gate.supabaseAdmin, gate.userId);
      return new Response(JSON.stringify({ success: true, message: "No projects" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: allContacts } = await supabase.from("project_contacts").select("project_id");
    const contactCounts: Record<string, number> = {};
    (allContacts || []).forEach((c: { project_id: string }) => {
      contactCounts[c.project_id] = (contactCounts[c.project_id] || 0) + 1;
    });

    const { data: allEvidence } = await supabase.from("evidence_sources").select("project_id");
    const evidenceCounts: Record<string, number> = {};
    (allEvidence || []).forEach((e: { project_id: string }) => {
      evidenceCounts[e.project_id] = (evidenceCounts[e.project_id] || 0) + 1;
    });

    type ProjectRow = {
      id: string;
      name?: string;
      country?: string | null;
      sector?: string | null;
      source_url?: string | null;
      detailed_analysis?: string | null;
      key_risks?: string | null;
      funding_sources?: string | null;
      environmental_impact?: string | null;
      political_context?: string | null;
      description?: string | null;
      approved?: boolean | null;
    };

    // Score projects; source_url gaps are now highest priority
    const scoredProjects = (projects as ProjectRow[]).map((p) => {
      let gaps = 0;
      if (!p.source_url || p.source_url === '' || p.source_url === '#') gaps += 5; // Highest priority
      if (!p.detailed_analysis || p.detailed_analysis === '') gaps += 2;
      if (!p.key_risks || p.key_risks === '') gaps += 1;
      if (!p.funding_sources || p.funding_sources === '') gaps += 1;
      if (!p.environmental_impact || p.environmental_impact === '') gaps += 1;
      if (!p.political_context || p.political_context === '') gaps += 1;
      if (!p.description || p.description === '') gaps += 2;
      if (!contactCounts[p.id]) gaps += 3;
      if (!evidenceCounts[p.id]) gaps += 1;
      // Pending projects get a bonus so they're enriched first
      if (!p.approved) gaps += 3;
      return { ...p, gapScore: gaps, hasContacts: !!contactCounts[p.id], hasEvidence: !!evidenceCounts[p.id] };
    });

    const toEnrich = scoredProjects.filter(p => p.gapScore > 2).sort((a, b) => b.gapScore - a.gapScore).slice(0, 15);

    if (!toEnrich.length) {
      const result = { success: true, message: "All projects have good data coverage", enriched: 0 };
      if (taskId) await supabase.from("research_tasks").update({ status: "completed", completed_at: new Date().toISOString(), result }).eq("id", taskId);
      await recordAiUsage(gate.supabaseAdmin, gate.userId);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await setTaskStep(supabase, taskId, "Extracting");
    let enriched = 0;
    let contactsAdded = 0;
    let sourcesBackfilled = 0;

    for (const project of toEnrich) {
      try {
        const missingFields: string[] = [];
        const missingSourceUrl = !project.source_url || project.source_url === '' || project.source_url === '#';
        if (missingSourceUrl) missingFields.push("official website URL, news article URL, or government filing URL where this project is documented (THIS IS THE MOST IMPORTANT FIELD)");
        if (!project.detailed_analysis || project.detailed_analysis === '') missingFields.push("detailed project analysis and current status");
        if (!project.key_risks || project.key_risks === '') missingFields.push("key risks and challenges");
        if (!project.funding_sources || project.funding_sources === '') missingFields.push("funding sources and financial backing");
        if (!project.environmental_impact || project.environmental_impact === '') missingFields.push("environmental impact assessment");
        if (!project.political_context || project.political_context === '') missingFields.push("political context and government involvement");
        if (!project.hasContacts) missingFields.push("main contractor names, emails, and contact information");

        const pxResponse = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              { role: "system", content: "You are an infrastructure project research analyst. Find detailed, factual information about the given project. CRITICAL: You MUST include direct, clickable source URLs for all information. Provide the most authoritative URL you can find (government website, major news outlet, official project page)." },
              { role: "user", content: `Research the "${project.name}" infrastructure project in ${project.country} (${project.sector} sector). I need the following information:\n${missingFields.map(f => `- ${f}`).join("\n")}\n\nProvide specific, verified details with source URLs. The source URL is the most critical piece of information needed.` },
            ],
          }),
        });
        const pxData = await pxResponse.json();
        const researchContent = pxData?.choices?.[0]?.message?.content;
        const citations = pxData?.citations || [];

        if (!researchContent) continue;

        const aiResponse = await chatCompletions({
            messages: [
              { role: "system", content: "You extract structured project data from research text. The source_url field is the MOST IMPORTANT: it must be a real, verifiable URL (not a placeholder). Use citations provided when available." },
              { role: "user", content: `Extract data for "${project.name}" from this research:\n${researchContent}\n\nCitations: ${JSON.stringify(citations)}\n\nExtract all available fields. source_url MUST be a real URL from the citations or content. For contacts, include name, role, organization, email if found.` },
            ],
            tools: [{
              type: "function",
              function: {
                name: "enrich_project",
                description: "Fill missing project data",
                parameters: {
                  type: "object",
                  properties: {
                    source_url: { type: "string", description: "REQUIRED: Best verifiable source URL for the project (news article, gov filing, or official page)" },
                    detailed_analysis: { type: "string" },
                    key_risks: { type: "string" },
                    funding_sources: { type: "string" },
                    environmental_impact: { type: "string" },
                    political_context: { type: "string" },
                    evidence_sources: {
                      type: "array",
                      description: "Additional evidence source URLs found during research",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          url: { type: "string" },
                          source: { type: "string" },
                          type: { type: "string", enum: ["News", "Filing", "Registry", "Partner"] },
                        },
                        required: ["url", "source"],
                        additionalProperties: false,
                      },
                    },
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
                          contact_type: { type: "string", enum: ["contractor", "government", "consultant", "financier", "general"] },
                          source_url: { type: "string", description: "URL where this contact info was found" },
                        },
                        required: ["name", "organization"],
                        additionalProperties: false,
                      },
                    },
                  },
                  additionalProperties: false,
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "enrich_project" } },
        });

        if (!aiResponse.ok) continue;

        const aiData = await aiResponse.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall?.function?.arguments) continue;

        const extracted = JSON.parse(toolCall.function.arguments);
        const updates: Record<string, unknown> = { last_updated: new Date().toISOString() };
        const fieldsUpdated: string[] = [];

        // Source URL is highest priority
        if (extracted.source_url && extracted.source_url.startsWith("http") && missingSourceUrl) {
          updates.source_url = extracted.source_url;
          fieldsUpdated.push("source_url");
          sourcesBackfilled++;
        }
        if (extracted.detailed_analysis && (!project.detailed_analysis || project.detailed_analysis === '')) {
          updates.detailed_analysis = extracted.detailed_analysis;
          fieldsUpdated.push("detailed_analysis");
        }
        if (extracted.key_risks && (!project.key_risks || project.key_risks === '')) {
          updates.key_risks = extracted.key_risks;
          fieldsUpdated.push("key_risks");
        }
        if (extracted.funding_sources && (!project.funding_sources || project.funding_sources === '')) {
          updates.funding_sources = extracted.funding_sources;
          fieldsUpdated.push("funding_sources");
        }
        if (extracted.environmental_impact && (!project.environmental_impact || project.environmental_impact === '')) {
          updates.environmental_impact = extracted.environmental_impact;
          fieldsUpdated.push("environmental_impact");
        }
        if (extracted.political_context && (!project.political_context || project.political_context === '')) {
          updates.political_context = extracted.political_context;
          fieldsUpdated.push("political_context");
        }

        if (fieldsUpdated.length > 0) {
          await supabase.from("projects").update(updates).eq("id", project.id);
          for (const field of fieldsUpdated) {
            await supabase.from("project_updates").insert({
              project_id: project.id,
              field_changed: field,
              old_value: "",
              new_value: String(updates[field]).substring(0, 200),
              source: "Data Enrichment Agent",
            });
          }
          enriched++;
        }

        // Add additional evidence sources
        if (extracted.evidence_sources?.length) {
          for (const ev of extracted.evidence_sources) {
            if (ev.url && ev.url.startsWith("http")) {
              await supabase.from("evidence_sources").insert({
                project_id: project.id,
                source: ev.source || "AI Research",
                url: ev.url,
                type: ev.type || "News",
                verified: false,
                date: new Date().toISOString().split("T")[0],
                title: ev.title || "",
                description: "",
                added_by: "ai",
              });
            }
          }
        }

        // Add contacts only when reachable (name + email|phone + http source)
        if (extracted.contacts?.length && !project.hasContacts) {
          const projectFallback = extracted.source_url && isHttpUrl(extracted.source_url) ? extracted.source_url : null;
          for (const contact of extracted.contacts.slice(0, 5)) {
            const perContactUrl = contact.source_url && isHttpUrl(contact.source_url) ? contact.source_url : projectFallback;
            if (!isReachableContactRow(contact, perContactUrl)) continue;
            await supabase.from("project_contacts").insert({
              project_id: project.id,
              name: contact.name,
              role: contact.role || "",
              organization: contact.organization || "",
              phone: contact.phone || null,
              email: contact.email || null,
              contact_type: contact.contact_type || "general",
              source: "Data Enrichment Agent",
              source_url: perContactUrl,
              added_by: "ai",
            });
            contactsAdded++;
          }
        }
      } catch (e) {
        console.error(`Error enriching ${project.name}:`, e);
      }
    }

    await setTaskStep(supabase, taskId, "Saving");
    const result = { success: true, projects_scanned: toEnrich.length, enriched, contacts_added: contactsAdded, sources_backfilled: sourcesBackfilled };
    if (taskId) await supabase.from("research_tasks").update({ status: "completed", completed_at: new Date().toISOString(), result }).eq("id", taskId);
    await finishAgentRun(supabase, "data-enrichment", "completed", runStartedAt);

    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Data enrichment error:", e);
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    if (taskId) await supabase.from("research_tasks").update({ status: "failed", completed_at: new Date().toISOString(), error: errMsg }).eq("id", taskId);
    await finishAgentRun(supabase, "data-enrichment", "failed", runStartedAt);
    return new Response(JSON.stringify({ error: errMsg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
