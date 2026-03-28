import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Supabase not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: task } = await supabase.from("research_tasks").insert({
    task_type: "data-enrichment",
    query: "Scanning projects for missing data and enriching gaps",
    status: "running",
  }).select().single();
  const taskId = task?.id;

  try {
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!PERPLEXITY_API_KEY) throw new Error("PERPLEXITY_API_KEY not configured");

    // Get all approved projects
    const { data: projects } = await supabase.from("projects").select("*").eq("approved", true);
    if (!projects?.length) {
      if (taskId) await supabase.from("research_tasks").update({ status: "completed", completed_at: new Date().toISOString(), result: { message: "No projects" } }).eq("id", taskId);
      return new Response(JSON.stringify({ success: true, message: "No projects" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get contacts count per project
    const { data: allContacts } = await supabase.from("project_contacts").select("project_id");
    const contactCounts: Record<string, number> = {};
    (allContacts || []).forEach((c: any) => { contactCounts[c.project_id] = (contactCounts[c.project_id] || 0) + 1; });

    // Get evidence count per project
    const { data: allEvidence } = await supabase.from("evidence_sources").select("project_id");
    const evidenceCounts: Record<string, number> = {};
    (allEvidence || []).forEach((e: any) => { evidenceCounts[e.project_id] = (evidenceCounts[e.project_id] || 0) + 1; });

    // Score projects by data gaps (higher = more gaps)
    const scoredProjects = projects.map((p: any) => {
      let gaps = 0;
      if (!p.source_url || p.source_url === '') gaps += 2;
      if (!p.detailed_analysis || p.detailed_analysis === '') gaps += 2;
      if (!p.key_risks || p.key_risks === '') gaps += 1;
      if (!p.funding_sources || p.funding_sources === '') gaps += 1;
      if (!p.environmental_impact || p.environmental_impact === '') gaps += 1;
      if (!p.political_context || p.political_context === '') gaps += 1;
      if (!p.description || p.description === '') gaps += 2;
      if (!contactCounts[p.id]) gaps += 3;
      if (!evidenceCounts[p.id]) gaps += 1;
      return { ...p, gapScore: gaps, hasContacts: !!contactCounts[p.id], hasEvidence: !!evidenceCounts[p.id] };
    });

    // Process top 5 projects with most gaps
    const toEnrich = scoredProjects.filter(p => p.gapScore > 2).sort((a, b) => b.gapScore - a.gapScore).slice(0, 5);

    if (!toEnrich.length) {
      const result = { success: true, message: "All projects have good data coverage", enriched: 0 };
      if (taskId) await supabase.from("research_tasks").update({ status: "completed", completed_at: new Date().toISOString(), result }).eq("id", taskId);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let enriched = 0;
    let contactsAdded = 0;

    for (const project of toEnrich) {
      try {
        // Build specific search query based on what's missing
        const missingFields: string[] = [];
        if (!project.source_url || project.source_url === '') missingFields.push("official website or news article URL");
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
              { role: "system", content: "You are an infrastructure project research analyst. Find detailed, factual information about the given project. Include source URLs for all information." },
              { role: "user", content: `Research the "${project.name}" infrastructure project in ${project.country} (${project.sector} sector). I need the following information:\n${missingFields.map(f => `- ${f}`).join("\n")}\n\nProvide specific, verified details with source URLs.` },
            ],
          }),
        });
        const pxData = await pxResponse.json();
        const researchContent = pxData?.choices?.[0]?.message?.content;
        const citations = pxData?.citations || [];

        if (!researchContent) continue;

        // Use AI to extract structured data
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: "You extract structured project data from research text." },
              { role: "user", content: `Extract data for "${project.name}" from this research:\n${researchContent}\n\nCitations: ${JSON.stringify(citations)}\n\nExtract all available fields. For contacts, include name, role, organization, email if found.` },
            ],
            tools: [{
              type: "function",
              function: {
                name: "enrich_project",
                description: "Fill missing project data",
                parameters: {
                  type: "object",
                  properties: {
                    source_url: { type: "string", description: "Best source URL for the project" },
                    detailed_analysis: { type: "string", description: "Detailed analysis paragraph" },
                    key_risks: { type: "string", description: "Key risks paragraph" },
                    funding_sources: { type: "string", description: "Funding sources info" },
                    environmental_impact: { type: "string", description: "Environmental impact info" },
                    political_context: { type: "string", description: "Political context info" },
                    contacts: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          role: { type: "string" },
                          organization: { type: "string" },
                          email: { type: "string" },
                          contact_type: { type: "string", enum: ["contractor", "government", "consultant", "financier", "general"] },
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
          }),
        });

        if (!aiResponse.ok) continue;

        const aiData = await aiResponse.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall?.function?.arguments) continue;

        const extracted = JSON.parse(toolCall.function.arguments);
        const updates: Record<string, unknown> = { last_updated: new Date().toISOString() };
        const fieldsUpdated: string[] = [];

        if (extracted.source_url && (!project.source_url || project.source_url === '')) {
          updates.source_url = extracted.source_url;
          fieldsUpdated.push("source_url");
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

        // Add contacts
        if (extracted.contacts?.length && !project.hasContacts) {
          for (const contact of extracted.contacts.slice(0, 5)) {
            await supabase.from("project_contacts").insert({
              project_id: project.id,
              name: contact.name,
              role: contact.role || "",
              organization: contact.organization || "",
              email: contact.email || null,
              contact_type: contact.contact_type || "general",
              source: "Data Enrichment Agent",
              source_url: extracted.source_url || null,
              added_by: "ai",
            });
            contactsAdded++;
          }
        }
      } catch (e) {
        console.error(`Error enriching ${project.name}:`, e);
      }
    }

    const result = { success: true, projects_scanned: toEnrich.length, enriched, contacts_added: contactsAdded };
    if (taskId) await supabase.from("research_tasks").update({ status: "completed", completed_at: new Date().toISOString(), result }).eq("id", taskId);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Data enrichment error:", e);
    const errMsg = e instanceof Error ? e.message : "Unknown error";
    if (taskId) await supabase.from("research_tasks").update({ status: "failed", completed_at: new Date().toISOString(), error: errMsg }).eq("id", taskId);
    return new Response(JSON.stringify({ error: errMsg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
