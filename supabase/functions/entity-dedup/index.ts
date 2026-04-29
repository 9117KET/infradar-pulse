/**
 * Entity deduplication for the source-first pipeline.
 *
 * Compares staged project candidates against approved projects and other
 * candidates, then marks likely duplicates for the Verification Workbench
 * instead of mutating production records directly.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recordAiUsage } from "../_shared/requireAi.ts";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { beginAgentTask, alreadyRunningResponse, finishAgentRun, isAgentEnabled, pausedResponse, recordAgentEvent } from "../_shared/agentGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PAGE_SIZE = 1000;

type Candidate = {
  id: string;
  name: string;
  normalized_name: string | null;
  country: string | null;
  sector: string | null;
  stage: string | null;
  value_usd: number | null;
  value_label: string | null;
  confidence: number | null;
  lat: number | null;
  lng: number | null;
  source_url: string | null;
  created_at: string;
  extracted_claims: Record<string, unknown> | null;
};

type Project = {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  sector: string | null;
  stage: string | null;
  value_usd: number | null;
  value_label: string | null;
  confidence: number | null;
  lat: number | null;
  lng: number | null;
  source_url: string | null;
};

async function fetchAll<T>(queryFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, maxRows = 100_000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const { data, error } = await queryFactory(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value: string) {
  return new Set(normalize(value).split(/\s+/).filter((token) => token.length > 2 && !["project", "programme", "program", "phase", "the", "and", "for"].includes(token)));
}

function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function distanceKm(aLat?: number | null, aLng?: number | null, bLat?: number | null, bLng?: number | null) {
  if (typeof aLat !== "number" || typeof aLng !== "number" || typeof bLat !== "number" || typeof bLng !== "number") return null;
  if ((aLat === 0 && aLng === 0) || (bLat === 0 && bLng === 0)) return null;
  const toRad = (d: number) => d * Math.PI / 180;
  const r = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function valueSimilarity(a?: number | null, b?: number | null) {
  const av = Number(a || 0);
  const bv = Number(b || 0);
  if (!av || !bv) return 0.5;
  const ratio = Math.min(av, bv) / Math.max(av, bv);
  return ratio >= 0.8 ? 1 : ratio >= 0.5 ? 0.75 : ratio >= 0.25 ? 0.45 : 0.1;
}

function scorePair(candidate: Candidate, target: Candidate | Project) {
  const countryMatch = normalize(candidate.country) === normalize(target.country);
  if (!countryMatch) return { score: 0, reason: "different country" };

  const nameA = candidate.normalized_name || normalize(candidate.name);
  const nameB = "normalized_name" in target ? (target.normalized_name || normalize(target.name)) : normalize(target.name);
  const exactName = nameA && nameA === nameB;
  const tokenScore = jaccard(tokens(candidate.name), tokens(target.name));
  const sameSector = normalize(candidate.sector) && normalize(candidate.sector) === normalize(target.sector);
  const dist = distanceKm(candidate.lat, candidate.lng, target.lat, target.lng);
  const geoScore = dist === null ? 0.55 : dist <= 25 ? 1 : dist <= 75 ? 0.85 : dist <= 150 ? 0.55 : 0.1;
  const valueScore = valueSimilarity(candidate.value_usd, target.value_usd);

  let score = (exactName ? 0.58 : tokenScore * 0.5) + (sameSector ? 0.15 : 0) + geoScore * 0.2 + valueScore * 0.15;
  if (exactName && sameSector) score = Math.max(score, 0.9);
  if (tokenScore < 0.45 && !exactName) score = Math.min(score, 0.62);
  score = Math.max(0, Math.min(1, score));

  const reason = [
    exactName ? "same normalized name" : `name token overlap ${Math.round(tokenScore * 100)}%`,
    sameSector ? "same sector" : "sector differs or missing",
    dist === null ? "no precise distance" : `~${Math.round(dist)}km apart`,
    `value similarity ${Math.round(valueScore * 100)}%`,
  ].join("; ");

  return { score, reason };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  let taskId: string | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;
  let runStartedAt: Date | null = null;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    if (!await isAgentEnabled(supabase, "entity-dedup")) return pausedResponse("entity-dedup");

    const lock = await beginAgentTask(supabase, "entity-dedup", "Candidate and project duplicate detection", gate.userId);
    if (lock.alreadyRunning) return alreadyRunningResponse("entity-dedup");
    taskId = lock.taskId;
    runStartedAt = new Date();

    const candidates = await fetchAll<Candidate>((from, to) => supabase!
      .from("project_candidates")
      .select("id, name, normalized_name, country, sector, stage, value_usd, value_label, confidence, lat, lng, source_url, created_at, extracted_claims")
      .in("review_status", ["ready_for_review", "needs_research"])
      .is("canonical_project_id", null)
      .is("duplicate_of", null)
      .order("created_at", { ascending: false })
      .range(from, to));

    const projects = await fetchAll<Project>((from, to) => supabase!
      .from("projects")
      .select("id, name, slug, country, sector, stage, value_usd, value_label, confidence, lat, lng, source_url")
      .eq("approved", true)
      .order("last_updated", { ascending: false })
      .range(from, to));

    if (!candidates.length) {
      const result = { message: "No candidates to compare", candidates_reviewed: 0, projects_reviewed: projects.length };
      if (taskId) await supabase.from("research_tasks").update({ status: "completed", result, completed_at: new Date().toISOString() }).eq("id", taskId);
      await recordAgentEvent(supabase, "entity-dedup", "completed", "No candidates available for deduplication", taskId, result);
      if (runStartedAt) await finishAgentRun(supabase, "entity-dedup", "completed", runStartedAt);
      await recordAiUsage(gate.supabaseAdmin, gate.userId);
      return new Response(JSON.stringify({ success: true, ...result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let projectMatches = 0;
    let candidateMatches = 0;
    const reviewedPairs: Array<Record<string, unknown>> = [];

    for (const candidate of candidates) {
      let bestProject: { target: Project; score: number; reason: string } | null = null;
      for (const project of projects) {
        const match = scorePair(candidate, project);
        if (match.score >= 0.78 && (!bestProject || match.score > bestProject.score)) bestProject = { target: project, ...match };
      }

      if (bestProject) {
        await supabase.from("project_candidates").update({
          canonical_project_id: bestProject.target.id,
          duplicate_confidence: Math.round(bestProject.score * 100),
          pipeline_status: "deduping",
          review_status: "ready_for_review",
          extracted_claims: {
            ...(candidate.extracted_claims ?? {}),
            duplicate_match: {
              type: "approved_project",
              project_id: bestProject.target.id,
              project_name: bestProject.target.name,
              confidence: Math.round(bestProject.score * 100),
              reason: bestProject.reason,
            },
          },
          updated_at: new Date().toISOString(),
        }).eq("id", candidate.id);

        await supabase.from("review_actions").insert({
          item_type: "duplicate",
          candidate_id: candidate.id,
          project_id: bestProject.target.id,
          action: "note",
          reason: bestProject.reason,
        });
        projectMatches++;
        reviewedPairs.push({ candidate_id: candidate.id, matched_project_id: bestProject.target.id, confidence: Math.round(bestProject.score * 100), reason: bestProject.reason });
        continue;
      }

      let bestCandidate: { target: Candidate; score: number; reason: string } | null = null;
      for (const other of candidates) {
        if (other.id === candidate.id) continue;
        const match = scorePair(candidate, other);
        if (match.score >= 0.82 && (!bestCandidate || match.score > bestCandidate.score)) bestCandidate = { target: other, ...match };
      }

      if (bestCandidate) {
        const master = (bestCandidate.target.confidence ?? 0) >= (candidate.confidence ?? 0) ? bestCandidate.target : candidate;
        const duplicate = master.id === candidate.id ? bestCandidate.target : candidate;
        await supabase.from("project_candidates").update({
          duplicate_of: master.id,
          duplicate_confidence: Math.round(bestCandidate.score * 100),
          pipeline_status: "deduping",
          review_status: "ready_for_review",
          updated_at: new Date().toISOString(),
        }).eq("id", duplicate.id);

        await supabase.from("review_actions").insert({
          item_type: "duplicate",
          candidate_id: duplicate.id,
          action: "note",
          reason: `Likely duplicate of candidate ${master.name}: ${bestCandidate.reason}`,
        });
        candidateMatches++;
        reviewedPairs.push({ candidate_id: duplicate.id, duplicate_of: master.id, confidence: Math.round(bestCandidate.score * 100), reason: bestCandidate.reason });
      }
    }

    const result = {
      candidates_reviewed: candidates.length,
      projects_reviewed: projects.length,
      project_matches: projectMatches,
      candidate_matches: candidateMatches,
      reviewed: reviewedPairs.slice(0, 50),
    };

    if (taskId) {
      await supabase.from("research_tasks").update({
        status: "completed",
        result,
        completed_at: new Date().toISOString(),
      }).eq("id", taskId);
    }

    await recordAgentEvent(supabase, "entity-dedup", "completed", "Candidate duplicate detection completed", taskId, result);
    if (runStartedAt) await finishAgentRun(supabase, "entity-dedup", "completed", runStartedAt);
    await recordAiUsage(gate.supabaseAdmin, gate.userId);

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("entity-dedup error:", e);
    if (taskId && supabase) {
      try {
        await supabase.from("research_tasks").update({ status: "failed", error: message, completed_at: new Date().toISOString() }).eq("id", taskId);
        await recordAgentEvent(supabase, "entity-dedup", "failed", message, taskId);
        if (runStartedAt) await finishAgentRun(supabase, "entity-dedup", "failed", runStartedAt);
      } catch { /* best effort */ }
    }
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
