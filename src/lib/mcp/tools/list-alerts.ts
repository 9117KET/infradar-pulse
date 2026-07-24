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
  name: "list_alerts",
  title: "List recent alerts",
  description:
    "Return the most recent InfraRadar alerts (risk, tender, market, ESG signals). Optional filters for severity and category.",
  inputSchema: {
    severity: z.enum(["low", "medium", "high", "critical"]).optional(),
    category: z.string().trim().optional().describe("Alert category, e.g. 'risk', 'tender', 'market', 'esg'."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ severity, category, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("alerts")
      .select("id,project_id,project_name,severity,category,message,source_url,origin,created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (severity) q = q.eq("severity", severity);
    if (category) q = q.eq("category", category);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { alerts: data ?? [] },
    };
  },
});
