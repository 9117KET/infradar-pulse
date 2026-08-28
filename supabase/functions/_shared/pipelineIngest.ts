import { calculateIntelligenceQuality } from "./intelligenceQuality.ts";
import { sanitizeConfidence, sanitizeValueUsd } from "./sanitizeProjectFacts.ts";

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
  /** Null when the location is unknown — never substitute [0,0]. */
  lat: number | null;
  lng: number | null;
  /** "exact" for real per-project coordinates, "country" for centroid approximations. */
  coordPrecision?: "exact" | "country" | null;
  description: string;
  timeline?: string | null;
  sourceUrl: string;
  publishedAt?: string | null;
  rawPayload: unknown;
  extractedClaims?: Record<string, unknown>;
  stakeholder?: string | null;
  supportsFields?: string[];
  /**
   * Deterministic official-registry sources (World Bank, IFC, ADB, IADB,
   * AIIB, ...) may auto-publish: the candidate is promoted to a live project
   * with provenance='official_registry' when its quality score clears
   * AUTO_PUBLISH_MIN_QUALITY. LLM-extracted candidates must NOT set this —
   * they keep the human review gate.
   */
  autoPublish?: boolean;
}

/**
 * Minimum intelligence-quality total score for machine promotion.
 *
 * This is DELIBERATELY below the 85 that calculateIntelligenceQuality needs to
 * return recommendation: 'approve'. The two are not in conflict; they answer
 * different questions:
 *
 *   'approve' at >= 85   "would a reviewer accept this on the evidence alone?"
 *                        - a general-purpose bar, applied to any candidate
 *                          including LLM-extracted ones.
 *   this constant at 60  "is this good enough to skip review, GIVEN that it
 *                        came from a deterministic official registry?"
 *                        - provenance is already guaranteed by the caller, so
 *                          the score only has to clear a completeness floor.
 *
 * Only official-registry ingests may set `autoPublish`, so nothing without that
 * guarantee ever reaches this branch. Previously the divergence was undocumented
 * and read as a bug.
 */
const AUTO_PUBLISH_MIN_QUALITY = 60;

/**
 * Quality flags that block machine promotion regardless of total score.
 *
 * These are the freshness faults the scorer can now actually raise. The line is
 * "block what we know is bad, allow what we merely do not know":
 *
 *   stale_record              the record is provably old - promoting it would
 *                             publish a figure we already know is out of date.
 *   unparseable_last_updated  the upstream date did not parse - a parser or
 *                             feed fault worth a human look.
 *   future_last_updated       the source claims a date that has not happened.
 *
 * `unknown_freshness` is deliberately NOT here. A missing published date is a
 * limitation of some upstream feeds, not a defect in the record, and blocking on
 * it would divert a large share of legitimate official-registry rows into the
 * review queue. Such records still lose freshness points via the scorer.
 *
 * This also gives the flags their first consumer: before this, the scorer raised
 * them and nothing anywhere acted on them.
 */
export const AUTO_PUBLISH_BLOCKING_FLAGS = [
  "stale_record",
  "unparseable_last_updated",
  "future_last_updated",
] as const;

export function normalizeProjectName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function slugifyProjectName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function isHttpUrl(value?: string | null) {
  return typeof value === "string" && value.trim().startsWith("http");
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
  // Normalize LLM/scraper-supplied numerics ONCE, before any downstream use or
  // write. Prevents the two recurring data-integrity defects centrally for
  // every ingest agent: value_usd stored 1000x too large, and confidence
  // written as a 0-1 probability into the 0-100 integer column.
  input.valueUsd = sanitizeValueUsd(input.valueUsd, input.valueLabel);
  input.confidence = sanitizeConfidence(input.confidence);

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
  const evidenceUrl = isHttpUrl(input.sourceUrl) ? input.sourceUrl : `pipeline://${input.sourceKey}/${contentHash}`;
  const { data: evidence, error: evidenceError } = await supabase.from("raw_evidence").upsert({
    source_id: input.sourceId ?? null,
    source_key: input.sourceKey,
    url: evidenceUrl,
    canonical_url: isHttpUrl(input.sourceUrl) ? input.sourceUrl : null,
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
    // The upstream record's own published date - NOT ingest time. Passing
    // new Date() here pinned freshness_score at 100 for every candidate ever
    // staged, which made the ageDays tiers unreachable and stale_record
    // impossible to raise. A source with no published date is scored as
    // unknown-age, which is the honest answer.
    lastUpdated: input.publishedAt ?? null,
  });

  // Fast-path: skip insert entirely if this name+country was previously rejected.
  // The DB trigger trg_suppress_rejected_candidates is the durable enforcement,
  // but checking here saves a write and keeps the queue clean.
  const { data: rejected } = await supabase
    .from("candidate_rejection_signatures")
    .select("id, reason")
    .eq("normalized_name", normalizedName)
    .eq("country", input.country ?? "")
    .maybeSingle();
  if (rejected?.id) {
    return { skipped: true, reason: "previously_rejected", signature_id: rejected.id } as any;
  }

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
    coord_precision: input.coordPrecision ?? null,
    description: input.description,
    timeline: input.timeline ?? "",
    source_url: isHttpUrl(input.sourceUrl) ? input.sourceUrl : "",
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

  // Machine promotion for deterministic official registries. On any failure
  // the candidate simply stays in the human review queue.
  const blockingFlags = quality.flags.filter((f) =>
    (AUTO_PUBLISH_BLOCKING_FLAGS as readonly string[]).includes(f)
  );

  // Say why, so a record diverted to review is traceable rather than silently
  // absent from the auto-published set.
  if (input.autoPublish && blockingFlags.length > 0) {
    console.log(
      `auto-publish blocked for ${input.name} (${input.sourceKey}): ${blockingFlags.join(", ")}`,
    );
  }

  if (
    input.autoPublish && candidate?.id &&
    quality.total_score >= AUTO_PUBLISH_MIN_QUALITY &&
    isHttpUrl(input.sourceUrl) &&
    blockingFlags.length === 0
  ) {
    const { data: promoted, error: promoteError } = await supabase.rpc("auto_promote_official_candidate", {
      p_candidate_id: candidate.id,
      p_reason: `Auto-published from ${input.sourceName} (quality ${quality.total_score})`,
    });
    if (promoteError) {
      console.error(`auto_promote_official_candidate failed for ${input.name}:`, promoteError.message ?? promoteError);
    } else if (promoted?.project_id) {
      return { outcome: "auto_published" as const, projectId: promoted.project_id as string };
    }
  }

  return { outcome: existingCandidate?.id ? "candidate_updated" as const : "candidate_created" as const };
}
