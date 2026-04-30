/**
 * dataset-refresh-agent
 *
 * Generates dataset snapshots for premium “interactive datasets”.
 * v1: projects_v1 snapshot with counts and a compact top list.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { beginAgentTask, alreadyRunningResponse, finishAgentRun, failAgentTask } from "../_shared/agentGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let taskId: string | undefined;
  let runStartedAt = new Date();
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const datasetKey = typeof body?.dataset_key === "string" ? body.dataset_key : "projects_v1";

    const lock = await beginAgentTask(supabase, "dataset-refresh", datasetKey, gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("dataset-refresh");
    taskId = lock.taskId;
    runStartedAt = new Date();

    const updateTask = async (patch: Record<string, unknown>) => {
      await supabase.from("research_tasks").update({ result: patch }).eq("id", taskId);
    };

    await updateTask({ step: "loading", message: `Refreshing dataset ${datasetKey}...` });

    if (datasetKey !== "projects_v1") {
      await supabase.from("research_tasks").update({ status: "failed", error: "Unknown dataset_key", completed_at: new Date().toISOString() }).eq("id", taskId);
      await finishAgentRun(supabase, "dataset-refresh", "failed", runStartedAt);
      return new Response(JSON.stringify({ success: false, error: "Unknown dataset_key" }), { status: 400, headers: corsHeaders });
    }

    const [{ count: total }, { data: latest }, { data: risky }] = await Promise.all([
      supabase.from("projects").select("id", { count: "exact", head: true }).eq("approved", true),
      supabase
        .from("projects")
        .select("id, name, country, sector, stage, status, confidence, risk_score, value_label, source_url, last_updated")
        .eq("approved", true)
        .order("last_updated", { ascending: false })
        .limit(25),
      supabase
        .from("projects")
        .select("id, name, country, sector, stage, status, confidence, risk_score, value_label, source_url, last_updated")
        .eq("approved", true)
        .order("risk_score", { ascending: false })
        .limit(25),
    ]);

    const payload = {
      dataset_key: "projects_v1",
      generated_at: new Date().toISOString(),
      totals: { projects_approved: total ?? 0 },
      latest_projects: latest ?? [],
      highest_risk: risky ?? [],
    };

    await updateTask({ step: "writing", message: "Writing snapshot..." });

    const { data: snap, error: snapErr } = await supabase
      .from("dataset_snapshots")
      .insert({ dataset_key: "projects_v1", generated_by: "agent", payload })
      .select("id")
      .single();
    if (snapErr) throw new Error(`Failed to write snapshot: ${snapErr.message}`);

    await supabase
      .from("research_tasks")
      .update({ status: "completed", result: { step: "completed", snapshot_id: snap.id }, completed_at: new Date().toISOString() })
      .eq("id", taskId);
    await finishAgentRun(supabase, "dataset-refresh", "completed", runStartedAt);

    return new Response(JSON.stringify({ success: true, snapshotId: snap.id, taskId }), { headers: corsHeaders });
  } catch (e) {
    console.error("dataset-refresh-agent error:", e);
    await failAgentTask(supabase, "dataset-refresh", taskId, runStartedAt, e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: corsHeaders });
  }
});

