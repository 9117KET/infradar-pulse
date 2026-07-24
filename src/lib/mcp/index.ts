import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listProjectsTool from "./tools/list-projects";
import getProjectTool from "./tools/get-project";
import listAlertsTool from "./tools/list-alerts";
import listTrackedProjectsTool from "./tools/list-tracked-projects";

// OAuth issuer must be the direct Supabase host (never the .lovable.cloud proxy).
// VITE_SUPABASE_PROJECT_ID is inlined by Vite at build time, so this stays
// import-safe (no runtime env read at module top level).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "infradarai-mcp",
  title: "InfraRadarAI",
  version: "0.1.0",
  instructions:
    "Read-only tools for the InfraRadarAI infrastructure intelligence platform. Use list_projects to discover global infrastructure projects (filter by country/region/sector/stage or free-text), get_project for the full record on a single project, list_alerts for recent risk/tender/market/ESG signals, and list_tracked_projects for the signed-in user's watchlist. All calls act as the authenticated user and respect row-level security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listProjectsTool, getProjectTool, listAlertsTool, listTrackedProjectsTool],
});
