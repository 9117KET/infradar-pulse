/**
 * sanitizeProjectFacts
 *
 * Central guards for the two numeric fields LLM/scraper agents most often get
 * wrong before they reach the `projects` table. Called once at the top of
 * stagePipelineProject, so every ingest agent (World Bank, IFC, ADB, IADB,
 * AIIB, AfDB, EBRD, EIB, GEM, research-agent) is protected by one code path.
 *
 * Two real production defects motivated this:
 *   1. value_usd stored 1000x too large (e.g. $100,000,000,000,000 for a
 *      project whose own value_label says "$100B"), which made the public
 *      pipeline headline read ~3.5x world GDP.
 *   2. confidence written as a 0-1 probability into a 0-100 integer column, so
 *      98 EBRD projects displayed "1% confidence".
 *
 * These are pure functions with no I/O so they can be unit-tested directly.
 */

/** Larger than any plausible single infrastructure project. Only used as a cap
 * when there is no parseable label to reconcile against. */
export const MAX_PLAUSIBLE_VALUE_USD = 5e12; // $5T

/**
 * Parse a human-readable value label ("$100B", "$13.8T", "$500 million",
 * "$28.6 billion (2025 commitments)") into a USD number. Returns null when the
 * label has no explicit magnitude unit — a bare "$500,000,000" or "Undisclosed"
 * is treated as unknown rather than guessed at.
 */
export function parseValueLabelUsd(label: string | null | undefined): number | null {
  if (!label) return null;
  const s = String(label).toLowerCase();
  const m = s.match(/([0-9][0-9,]*\.?[0-9]*)\s*(trillion|tn|t\b|billion|bn|b\b|million|mn|m\b|thousand|k\b)/);
  if (!m) return null;
  const num = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(num) || num <= 0) return null;
  const unit = m[2];
  let mult: number;
  if (unit === "trillion" || unit === "tn" || unit === "t") mult = 1e12;
  else if (unit === "billion" || unit === "bn" || unit === "b") mult = 1e9;
  else if (unit === "million" || unit === "mn" || unit === "m") mult = 1e6;
  else if (unit === "thousand" || unit === "k") mult = 1e3;
  else return null;
  return num * mult;
}

/**
 * Clamp a confidence value into the DB's integer 0-100 scale, rescaling a 0-1
 * probability to a percentage. `raw <= 1` is treated as a probability (0.98 ->
 * 98); values in (1,100] are assumed already a percentage; anything unusable
 * falls back.
 */
export function sanitizeConfidence(raw: unknown, fallback = 50): number {
  let c = Number(raw);
  if (!Number.isFinite(c) || c <= 0) return fallback;
  if (c <= 1) c = c * 100; // 0-1 probability -> percent
  return Math.round(Math.max(1, Math.min(100, c)));
}

/**
 * Reconcile a numeric value_usd against its human-readable label. When the
 * label parses and the numeric value is off by >=10x in either direction (the
 * signature of a units slip such as billions written as trillions), the
 * label — the figure a human is most likely to have vetted — wins. With no
 * parseable label, only absurd magnitudes are capped.
 */
export function sanitizeValueUsd(rawValueUsd: unknown, valueLabel: string | null | undefined): number {
  let v = Number(rawValueUsd);
  if (!Number.isFinite(v) || v < 0) v = 0;

  const labelUsd = parseValueLabelUsd(valueLabel);
  if (labelUsd != null && labelUsd > 0) {
    if (v === 0) return Math.round(labelUsd);
    const ratio = v / labelUsd;
    if (ratio >= 10 || ratio <= 0.1) return Math.round(labelUsd);
    return Math.round(v);
  }

  if (v > MAX_PLAUSIBLE_VALUE_USD) return MAX_PLAUSIBLE_VALUE_USD;
  return Math.round(v);
}
