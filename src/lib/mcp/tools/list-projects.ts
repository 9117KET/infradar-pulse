import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_projects",
  title: "List infrastructure projects",
  description:
    "List infrastructure projects tracked in InfraRadar. Supports optional filters for country, region, sector, and stage, plus a text query on project name/description. Returns id, name, country, region, sector, stage, value_usd, health_score, and last_updated.",
  inputSchema: {
    query: z.string().trim().optional().describe("Free-text match against project name/description."),
    country: z.string().trim().optional().describe("ISO country name or code, e.g. 'Germany'."),
    region: z.string().trim().optional().describe("Region label used by InfraRadar, e.g. 'Europe'."),
    sector: z.string().trim().optional().describe("Sector, e.g. 'Energy', 'Transport'."),
    stage: z.string().trim().optional().describe("Project stage, e.g. 'planning', 'construction'."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows to return (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const limit = input.limit ?? 25;
    let q = supabaseForUser(ctx)
      .from("projects")
      .select("id,name,country,region,sector,stage,value_usd,health_score,last_updated")
      .order("last_updated", { ascending: false })
      .limit(limit);

    if (input.country) q = q.ilike("country", `%${input.country}%`);
    if (input.region) q = q.eq("region", input.region as never);
    if (input.sector) q = q.ilike("sector", `%${input.sector}%`);
    if (input.stage) q = q.ilike("stage", `%${input.stage}%`);
    if (input.query) q = q.or(`name.ilike.%${input.query}%,description.ilike.%${input.query}%`);

    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { projects: data ?? [] },
    };
  },
});
