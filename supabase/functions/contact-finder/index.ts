import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: task } = await supabase
      .from("research_tasks")
      .insert({ task_type: "contact-finder", query: "Auto contact & contractor discovery", status: "running" })
      .select()
      .single();

    // Find projects with fewer than 2 contacts
    const { data: allProjects } = await supabase
      .from("projects")
      .select("id, name, country, region, sector")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!allProjects?.length) {
      if (task) await supabase.from("research_tasks").update({ status: "completed", result: { message: "No projects found" }, completed_at: new Date().toISOString() }).eq("id", task.id);
      return new Response(JSON.stringify({ success: true, message: "No projects" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: existingContacts } = await supabase
      .from("project_contacts")
      .select("project_id");

    const contactCounts: Record<string, number> = {};
    (existingContacts || []).forEach((c: any) => {
      contactCounts[c.project_id] = (contactCounts[c.project_id] || 0) + 1;
    });

    const needsContacts = allProjects.filter(p => (contactCounts[p.id] || 0) < 2).slice(0, 10);

    if (needsContacts.length === 0) {
      if (task) await supabase.from("research_tasks").update({ status: "completed", result: { message: "All projects have sufficient contacts" }, completed_at: new Date().toISOString() }).eq("id", task.id);
      return new Response(JSON.stringify({ success: true, message: "All projects covered" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const projectIds = needsContacts.map(p => p.id);
    const { data: stakeholders } = await supabase
      .from("project_stakeholders")
      .select("project_id, name")
      .in("project_id", projectIds);

    const stakeholderMap: Record<string, string[]> = {};
    (stakeholders || []).forEach((s: any) => {
      if (!stakeholderMap[s.project_id]) stakeholderMap[s.project_id] = [];
      stakeholderMap[s.project_id].push(s.name);
    });

    let totalInserted = 0;

    for (const project of needsContacts) {
      const rawContent: string[] = [];
      const projectStakeholders = stakeholderMap[project.id] || [];

      // Search with Perplexity — prioritize contractor/procurement contacts
      if (PERPLEXITY_API_KEY) {
        try {
          const searchQuery = `"${project.name}" ${project.country} main contractor EPC procurement officer project manager email phone contact site engineer ${projectStakeholders.slice(0, 3).join(" ")}`;
          const pxResponse = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "sonar",
              messages: [
                { role: "system", content: "Find contact information for people involved in this infrastructure project. Prioritize main contractor contacts (project managers, procurement officers, site managers, CEOs). Also find government officials, project owners, financiers, and consultants. Include names, phone numbers, emails, job titles, and organizations." },
                { role: "user", content: searchQuery },
              ],
              search_recency_filter: "year",
            }),
          });
          const pxData = await pxResponse.json();
          if (pxData?.choices?.[0]?.message?.content) {
            rawContent.push(`Perplexity: ${pxData.choices[0].message.content}`);
            if (pxData.citations) rawContent.push(`Sources: ${pxData.citations.join(", ")}`);
          }
        } catch (e) {
          console.error("Perplexity error for", project.name, e);
        }
      }

      // Scrape stakeholder websites with Firecrawl
      if (FIRECRAWL_API_KEY && projectStakeholders.length > 0) {
        try {
          const searchResponse = await fetch("https://api.firecrawl.dev/v1/search", {
            method: "POST",
            headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              query: `${projectStakeholders[0]} ${project.country} contact team leadership email procurement`,
              limit: 3,
              scrapeOptions: { formats: ["markdown"] },
            }),
          });
          const searchData = await searchResponse.json();
          if (searchData?.data) {
            for (const result of searchData.data.slice(0, 2)) {
              if (result.markdown) {
                rawContent.push(`Firecrawl (${result.url}): ${result.markdown.slice(0, 2000)}`);
              }
            }
          }
        } catch (e) {
          console.error("Firecrawl error for", project.name, e);
        }
      }

      if (rawContent.length === 0) continue;

      // Extract contacts with AI — enhanced for contractor classification
      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "Extract contact information for people involved in infrastructure projects. Classify each contact into a contact_type: 'contractor' (EPC firms, construction companies, site managers, procurement), 'government' (ministry officials, regulators), 'financier' (banks, DFIs, investors), 'consultant' (advisors, engineers, lawyers), 'owner' (project owner, developer), or 'general'. Prioritize finding main contractor emails and phone numbers. Only include contacts where you have at least a name and one of: phone number or email. Be precise — do not fabricate information." },
              { role: "user", content: `Extract contacts for project "${project.name}" in ${project.country}.\n\nRaw data:\n${rawContent.join("\n\n")}` },
            ],
            tools: [{
              type: "function",
              function: {
                name: "extract_contacts",
                description: "Extract contact details for project stakeholders with type classification",
                parameters: {
                  type: "object",
                  properties: {
                    contacts: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          role: { type: "string", description: "Job title or role" },
                          organization: { type: "string" },
                          phone: { type: "string", description: "Phone number if available" },
                          email: { type: "string", description: "Email if available" },
                          contact_type: { type: "string", enum: ["contractor", "government", "financier", "consultant", "owner", "general"], description: "Category of this contact" },
                          source: { type: "string", description: "Where this contact info was found" },
                        },
                        required: ["name", "contact_type"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["contacts"],
                  additionalProperties: false,
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "extract_contacts" } },
          }),
        });

        if (!aiResponse.ok) {
          console.error("AI error:", aiResponse.status);
          continue;
        }

        const aiData = await aiResponse.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall?.function?.arguments) continue;

        const parsed = JSON.parse(toolCall.function.arguments);
        const contacts = parsed.contacts || [];

        // Dedup against existing contacts
        const { data: existingForProject } = await supabase
          .from("project_contacts")
          .select("name, organization")
          .eq("project_id", project.id);

        const existingKeys = new Set(
          (existingForProject || []).map((c: any) => `${c.name.toLowerCase()}|${(c.organization || '').toLowerCase()}`)
        );

        const newContacts = contacts.filter((c: any) => {
          const key = `${c.name.toLowerCase()}|${(c.organization || '').toLowerCase()}`;
          return !existingKeys.has(key) && (c.phone || c.email);
        });

        if (newContacts.length > 0) {
          const sourceUrl = rawContent.find(r => r.startsWith("Sources:"))?.replace("Sources: ", "").split(", ")[0] || null;

          await supabase.from("project_contacts").insert(
            newContacts.map((c: any) => ({
              project_id: project.id,
              name: c.name,
              role: c.role || '',
              organization: c.organization || '',
              phone: c.phone || null,
              email: c.email || null,
              contact_type: c.contact_type || 'general',
              source: c.source || 'AI Research',
              source_url: sourceUrl,
              added_by: 'ai',
            }))
          );

          const contractorCount = newContacts.filter((c: any) => c.contact_type === 'contractor').length;
          const alertMsg = contractorCount > 0
            ? `${newContacts.length} new contact(s) found for ${project.name} (${contractorCount} contractor)`
            : `${newContacts.length} new contact(s) found for ${project.name}`;

          await supabase.from("alerts").insert({
            project_id: project.id,
            project_name: project.name,
            severity: "low",
            message: alertMsg,
            category: "stakeholder",
            source_url: sourceUrl,
          });

          totalInserted += newContacts.length;
        }
      } catch (e) {
        console.error("AI extraction error for", project.name, e);
      }
    }

    if (task) {
      await supabase.from("research_tasks").update({
        status: "completed",
        result: { projects_scanned: needsContacts.length, contacts_added: totalInserted },
        completed_at: new Date().toISOString(),
      }).eq("id", task.id);
    }

    console.log(`Contact finder complete: ${needsContacts.length} projects scanned, ${totalInserted} contacts added`);

    return new Response(
      JSON.stringify({ success: true, projects_scanned: needsContacts.length, contacts_added: totalInserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Contact finder error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
