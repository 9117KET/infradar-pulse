import { calculateIntelligenceQuality } from "./intelligenceQuality.ts";

type SupabaseAdmin = any;

export interface PipelineSourceConfig {
  sourceKey: string;
  name: string;
  kind?: string;
  baseUrl: string;
  reliabilityScore?: number;
  crawlFrequencyMinutes?: number;
  supportsApi?: boolean;
}

export interface StageProjectInput {
  sourceId?: string | null;
  sourceKey: string;
  sourceName: string;
  discoveredBy: string;
  externalId?: string | null;
  apiUrl?: string | null;
  name: string;
  country: string;
  region: string;
  sector: string;
  stage: string;
  status: string;
  valueUsd: number;
  valueLabel: string;
  confidence: number;
  riskScore?: number;
  lat: number;
  lng: number;
  description: string;
  timeline?: string | null;
  sourceUrl: string;
  publishedAt?: string | null;
  rawPayload: unknown;
  extractedClaims?: Record<string, unknown>;
  stakeholder?: string | null;
  supportsFields?: string[];
}

export function normalizeProjectName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function slugifyProjectName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function registerPipelineSource(supabase: SupabaseAdmin, config: PipelineSourceConfig) {
  const { data, error } = await supabase.from("source_registry").upsert({
    source_key: config.sourceKey,
    name: config.name,
    kind: config.kind ?? "mdb",
    base_url: config.baseUrl,
    reliability_score: config.reliabilityScore ?? 85,
    crawl_frequency_minutes: config.crawlFrequencyMinutes ?? 1440,
    supports_api: config.supportsApi ?? false,
    status: "active",
    last_success_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "source_key" }).select("id").single();

  if (error) throw error;
  return data as { id: string } | null;
}

export async function stagePipelineProject(supabase: SupabaseAdmin, input: StageProjectInput) {
  const slug = slugifyProjectName(input.name);
  const normalizedName = normalizeProjectName(input.name);
  const { data: existingProject } = await supabase
    .from("projects")
    .select("id, confidence, source_url")
    .eq("slug", slug)
    .maybeSingle();

  if (existingProject) {
    const missingSource = !existingProject.source_url;
    if (input.confidence > (existingProject.confidence || 0) || missingSource) {
      await supabase.from("update_proposals").insert({
        project_id: existingProject.id,
        proposed_by_agent: input.discoveredBy,
        field_changes: {
          confidence: Math.max(input.confidence, existingProject.confidence || 0),
          stage: input.stage,
          status: input.status,
          source_url: existingProject.source_url || input.sourceUrl,
        },
        source_url: input.sourceUrl,
        confidence: input.confidence,
        impact: `${input.sourceName} found a fresher or stronger project record.`,
      });
      return { outcome: "update_proposed" as const };
    }
    return { outcome: "skipped_existing" as const };
  }

  const rawPayload = JSON.stringify(input.rawPayload);
  const contentHash = await sha256(`${input.sourceKey}:${input.externalId ?? input.sourceUrl}:${rawPayload}`);
  const { data: evidence, error: evidenceError } = await supabase.from("raw_evidence").upsert({
    source_id: input.sourceId ?? null,
    source_key: input.sourceKey,
    url: input.sourceUrl,
    canonical_url: input.sourceUrl,
    title: input.name,
    published_at: input.publishedAt ? new Date(input.publishedAt).toISOString() : null,
    content_hash: contentHash,
    extracted_text: rawPayload,
    summary: input.description,
    kind: "mdb",
    fetch_status: "fetched",
    extraction_confidence: input.confidence,
    metadata: { external_id: input.externalId ?? null, api_url: input.apiUrl ?? null, source: input.sourceKey },
  }, { onConflict: "url" }).select("id").single();
  if (evidenceError) throw evidenceError;

  const quality = calculateIntelligenceQuality({
    sourceUrl: input.sourceUrl,
    confidence: input.confidence,
    description: input.description,
    valueUsd: input.valueUsd,
    lat: input.lat,
    lng: input.lng,
    evidenceCount: evidence?.id ? 1 : 0,
    officialSourceCount: 1,
    contactCount: input.stakeholder ? 1 : 0,
    lastUpdated: new Date().toISOString(),
  });

  const { data: existingCandidate } = await supabase
    .from("project_candidates")
    .select("id, confidence")
    .eq("normalized_name", normalizedName)
    .eq("country", input.country)
    .eq("discovered_by", input.discoveredBy)
    .maybeSingle();

  const candidatePayload = {
    normalized_name: normalizedName,
    name: input.name,
    country: input.country,
    region: input.region,
    sector: input.sector,
    stage: input.stage,
    status: input.status,
    value_usd: input.valueUsd,
    value_label: input.valueLabel,
    confidence: input.confidence,
    risk_score: input.riskScore ?? 40,
    lat: input.lat,
    lng: input.lng,
    description: input.description,
    timeline: input.timeline ?? "",
    source_url: input.sourceUrl,
    extracted_claims: { ...(input.extractedClaims ?? {}), stakeholder: input.stakeholder ?? null },
    pipeline_status: quality.recommendation === "approve" ? "ready_for_review" : "needs_research",
    review_status: quality.recommendation === "approve" ? "ready_for_review" : "needs_research",
    discovered_by: input.discoveredBy,
    updated_at: new Date().toISOString(),
  };

  const candidateResult = existingCandidate?.id
    ? await supabase.from("project_candidates").update(candidatePayload).eq("id", existingCandidate.id).select("id").single()
    : await supabase.from("project_candidates").insert(candidatePayload).select("id").single();

  if (candidateResult.error) throw candidateResult.error;
  const candidate = candidateResult.data as { id: string } | null;

  if (candidate?.id && evidence?.id) {
    await supabase.from("candidate_evidence_links").upsert({
      candidate_id: candidate.id,
      evidence_id: evidence.id,
      supports_fields: input.supportsFields ?? ["name", "country", "sector", "stage", "value_usd", "source_url"],
      relevance_score: 95,
      quote: input.description.substring(0, 500),
    }, { onConflict: "candidate_id,evidence_id" });

    const claims = [
      ["stage", input.stage],
      ["status", input.status],
      ["value_usd", String(input.valueUsd)],
      ["timeline", input.timeline ?? ""],
      ["source_url", input.sourceUrl],
    ];
    for (const [field, value] of claims) {
      if (!value) continue;
      await supabase.from("project_claims").insert({
        candidate_id: candidate.id,
        evidence_id: evidence.id,
        field_name: field,
        field_value: value,
        confidence: input.confidence,
        quote: input.description.substring(0, 300),
      });
    }

    await supabase.from("quality_scores").insert({
      candidate_id: candidate.id,
      total_score: quality.total_score,
      source_score: quality.source_score,
      evidence_score: quality.evidence_score,
      completeness_score: quality.completeness_score,
      freshness_score: quality.freshness_score,
      confidence_score: quality.confidence_score,
      missing_fields: quality.missing_fields,
      flags: quality.flags,
      recommendation: quality.recommendation,
      details: { source: input.discoveredBy, external_id: input.externalId ?? null },
    });
  }

  return { outcome: existingCandidate?.id ? "candidate_updated" as const : "candidate_created" as const };
}
