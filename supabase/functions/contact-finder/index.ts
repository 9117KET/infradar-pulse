import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletions } from "../_shared/llm.ts";
import { recordAiUsage } from "../_shared/requireAi.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { beginAgentTask, alreadyRunningResponse } from "../_shared/agentGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function isHttpUrl(s: string | null | undefined): boolean {
  return typeof s === "string" && s.trim().startsWith("http");
}

/** HITL: name + (email or phone) + http source for provenance */
function isReachableRow(c: { name?: string; email?: string | null; phone?: string | null; source_url?: string | null }): boolean {
  const name = (c.name || "").trim();
  if (!name) return false;
  const hasEmail = !!(c.email && String(c.email).trim());
  const hasPhone = !!(c.phone && String(c.phone).trim());
  if (!hasEmail && !hasPhone) return false;
  return isHttpUrl(c.source_url);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  try {
    let bodyProjectId: string | undefined;
    if (req.method === "POST") {
      try {
        const j = await req.json();
        if (typeof j?.project_id === "string" && j.project_id.trim()) bodyProjectId = j.project_id.trim();
      } catch {
        /* empty body */
      }
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const lock = await beginAgentTask(supabase, "contact-finder", bodyProjectId ? `Contact finder: ${bodyProjectId}` : "Auto contact & contractor discovery", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("contact-finder");
    const taskId = lock.taskId;

    const { data: existingContacts } = await supabase.from("project_contacts").select("project_id");
    const contactCounts: Record<string, number> = {};
    (existingContacts || []).forEach((c: any) => {
      contactCounts[c.project_id] = (contactCounts[c.project_id] || 0) + 1;
    });

    const selectCols = "id, name, country, region, sector, source_url, approved";

    let needsContacts: { id: string; name: string; country: string; region: string; sector: string; source_url: string | null; approved: boolean | null }[] = [];

    if (bodyProjectId) {
      const { data: one } = await supabase.from("projects").select(selectCols).eq("id", bodyProjectId).maybeSingle();
      needsContacts = one ? [one as any] : [];
    } else {
      const { data: pendingList } = await supabase
        .from("projects")
        .select(selectCols)
        .eq("approved", false)
        .order("created_at", { ascending: false })
        .limit(150);
      const { data: approvedList } = await supabase
        .from("projects")
        .select(selectCols)
        .eq("approved", true)
        .order("created_at", { ascending: false })
        .limit(150);

      const seen = new Set<string>();
      const merged: { id: string; name: string; country: string; region: string; sector: string; source_url: string | null; approved: boolean | null }[] = [];
      for (const p of [...(pendingList || []), ...(approvedList || [])]) {
        if (!p || seen.has(p.id)) continue;
        seen.add(p.id);
        merged.push(p);
      }
      needsContacts = merged.filter((p) => (contactCounts[p.id] || 0) < 2).slice(0, 25);
    }

    if (!needsContacts.length) {
      if (taskId) await supabase.from("research_tasks").update({ status: "completed", result: { message: bodyProjectId ? "Project not found" : "No projects need contacts" }, completed_at: new Date().toISOString() }).eq("id", taskId);
      await recordAiUsage(gate.supabaseAdmin, gate.userId);
      return new Response(JSON.stringify({ success: true, message: "No work" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      const citationUrls: string[] = [];

      try {
        const searchQuery = `"${project.name}" ${project.country} main contractor EPC procurement officer project manager email phone contact site engineer ${projectStakeholders.slice(0, 3).join(" ")}`;
        const researchResponse = await chatCompletions({
          messages: [
            { role: "system", content: "You are an infrastructure contact discovery analyst. Identify likely publicly listed project stakeholders and contact leads. Use only source-aware statements and include source URLs when known. Do not fabricate emails or phone numbers." },
            { role: "user", content: searchQuery },
          ],
        });
        if (researchResponse.ok) {
          const researchData = await researchResponse.json();
          const content = researchData?.choices?.[0]?.message?.content;
          if (content) {
            rawContent.push(`Lovable AI contact research:
${content}`);
            if (project.source_url) citationUrls.push(project.source_url);
          }
        }
      } catch (e) {
        console.error("Lovable AI contact research error for", project.name, e);
      }

      if (rawContent.length === 0) continue;

      try {
        const aiResponse = await chatCompletions({
            messages: [
              { role: "system", content: "Extract contact information for people involved in infrastructure projects. Classify each contact into a contact_type. IMPORTANT: For each contact, include the specific source_url where their information was found. Only include contacts where you have at least a name and one of: phone number or email. Do not fabricate information." },
              { role: "user", content: `Extract contacts for project "${project.name}" in ${project.country}.\n\nAvailable citation URLs: ${JSON.stringify(citationUrls)}\n\nRaw data:\n${rawContent.join("\n\n")}` },
            ],
            tools: [{
              type: "function",
              function: {
                name: "extract_contacts",
                description: "Extract contact details with source URLs",
                parameters: {
                  type: "object",
                  properties: {
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
                          source_url: { type: "string", description: "The specific URL where this contact's information was found" },
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

        const { data: existingForProject } = await supabase
          .from("project_contacts")
          .select("name, organization")
          .eq("project_id", project.id);

        const existingKeys = new Set(
          (existingForProject || []).map((c: any) => `${c.name.toLowerCase()}|${(c.organization || '').toLowerCase()}`)
        );

        const fallbackSourceUrl = citationUrls[0] || (project as any).source_url || null;

        const newContacts = contacts.filter((c: any) => {
          const key = `${c.name.toLowerCase()}|${(c.organization || '').toLowerCase()}`;
          if (existingKeys.has(key)) return false;
          if (!(c.phone || c.email)) return false;
          const resolvedUrl = isHttpUrl(c.source_url) ? String(c.source_url).trim() : (isHttpUrl(fallbackSourceUrl) ? String(fallbackSourceUrl).trim() : null);
          return isReachableRow({ name: c.name, email: c.email, phone: c.phone, source_url: resolvedUrl });
        });

        if (newContacts.length > 0) {
          const rows = newContacts.map((c: any) => {
            const resolvedUrl = isHttpUrl(c.source_url) ? String(c.source_url).trim() : (isHttpUrl(fallbackSourceUrl) ? String(fallbackSourceUrl).trim() : null);
            return {
              project_id: project.id,
              name: c.name,
              role: c.role || '',
              organization: c.organization || '',
              phone: c.phone || null,
              email: c.email || null,
              contact_type: c.contact_type || 'general',
              source: c.organization || 'AI Research',
              source_url: resolvedUrl,
              added_by: 'ai',
            };
          });

          await supabase.from("project_contacts").insert(rows);

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
            source_url: rows[0]?.source_url || null,
          });

          totalInserted += newContacts.length;
        }
      } catch (e) {
        console.error("AI extraction error for", project.name, e);
      }
    }

    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed",
        result: { projects_scanned: needsContacts.length, contacts_added: totalInserted, note: perplexityWarning },
        completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }

    console.log(`Contact finder complete: ${needsContacts.length} projects scanned, ${totalInserted} contacts added`);

    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(
      JSON.stringify({ success: true, projects_scanned: needsContacts.length, contacts_added: totalInserted, note: perplexityWarning }),
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
