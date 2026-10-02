/**
 * Shared plumbing for procurement-feed agents that write tender_events
 * (uk-fts, za-etenders, wb-procurement, ...): polite fetching, FX, sector
 * mapping, severity/labels and URL-deduplicated inserts.
 */

// deno-lint-ignore no-explicit-any
type Db = any;

/** Several government portals 403 Deno's default User-Agent, which Supabase Edge sends. */
export const FEED_HEADERS = {
  Accept: "application/json",
  "User-Agent": "InfraRadarBot/1.0 (+https://infradarai.com)",
};

/** GET a JSON feed; null on HTTP error or a non-JSON (block/challenge) page. */
export async function fetchFeedJson(url: string, label: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: FEED_HEADERS });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) {
      console.error(`${label} feed error ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error(`${label} feed fetch failed`, e);
    return null;
  }
}

// Rough FX to USD (approximate 2025-26 levels). Good enough for ranking and
// thresholds, not for finance; volatile currencies drift, so refresh yearly.
export const FX_TO_USD: Record<string, number> = {
  USD: 1, EUR: 1.08, GBP: 1.27, CHF: 1.12, AUD: 0.66, CAD: 0.73, JPY: 0.0067, CNY: 0.14,
  // Africa
  ZAR: 0.055, NAD: 0.055, LSL: 0.055, SZL: 0.055, BWP: 0.074, KES: 0.0077, NGN: 0.00065,
  GHS: 0.065, XOF: 0.0017, XAF: 0.0017, ETB: 0.0072, MZN: 0.0157, GMD: 0.014, AOA: 0.0011,
  MWK: 0.00058, TZS: 0.00038, UGX: 0.00027, RWF: 0.0007, ZMW: 0.037, EGP: 0.02, MAD: 0.11,
  TND: 0.33, GNF: 0.000116, SLE: 0.044, LRD: 0.005, CDF: 0.00035, MGA: 0.00022, MUR: 0.022,
  SCR: 0.07, DZD: 0.0075,
  // Asia & Pacific
  INR: 0.012, BDT: 0.0082, PKR: 0.0036, NPR: 0.0074, LKR: 0.0033, PHP: 0.0175, IDR: 0.000061,
  VND: 0.000038, KHR: 0.00025, LAK: 0.000046, MMK: 0.00048, MNT: 0.00029, KGS: 0.0115,
  KZT: 0.002, UZS: 0.000079, TJS: 0.092, GEL: 0.37, AMD: 0.0026, AZN: 0.59, TRY: 0.025,
  JOD: 1.41, IQD: 0.00076, FJD: 0.44, PGK: 0.25, WST: 0.36, TOP: 0.42, SBD: 0.12, VUV: 0.0083,
  // Americas & Europe
  BRL: 0.18, MXN: 0.055, COP: 0.00025, PEN: 0.27, CLP: 0.00105, ARS: 0.0008, BOB: 0.145,
  HNL: 0.038, GTQ: 0.13, NIO: 0.027, DOP: 0.016, HTG: 0.0076, JMD: 0.0064, PYG: 0.00013,
  UYU: 0.025, XCD: 0.37, UAH: 0.024, MDL: 0.056, RSD: 0.0092, ALL: 0.011, MKD: 0.0175,
  BAM: 0.55, RON: 0.22, PLN: 0.25, HUF: 0.0027, CZK: 0.044, SEK: 0.095, NOK: 0.095, DKK: 0.145,
};

export function toUsd(amount: unknown, currency: unknown): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const rate = FX_TO_USD[String(currency ?? "USD").toUpperCase()];
  return rate ? Math.round(n * rate) : 0; // unknown currency → treat as undisclosed rather than guess
}

/** Platform sector from free text (titles, categories, descriptions). */
export function sectorFromText(text: string): string {
  const t = text.toLowerCase();
  if (/\b(road|highway|bridge|rail|railway|metro|airport|port|harbour|transport|tunnel|bus rapid)/.test(t)) return "Transport";
  if (/\b(power|energy|solar|wind|substation|transmission|grid|hydro|electri|generation|battery)/.test(t)) return "Energy";
  if (/\b(water|sanitation|sewer|wastewater|irrigation|dam|drainage|flood)/.test(t)) return "Water";
  if (/\b(fibre|fiber|telecom|broadband|data cent|digital)/.test(t)) return "Digital Infrastructure";
  if (/\b(hospital|clinic|school|university|housing|building)/.test(t)) return "Building Construction";
  return "Infrastructure";
}

/** CPV (EU common procurement vocabulary) works codes → platform sector. */
export function sectorFromCpv(cpvs: string[]): string {
  const joined = cpvs.join(",");
  if (/(^|,)4523/.test(joined)) return "Transport";
  if (/(^|,)4525/.test(joined)) return "Energy";
  if (/(^|,)4524/.test(joined)) return "Water";
  if (/(^|,)4522[34]/.test(joined)) return "Infrastructure";
  return "Building Construction";
}

export function severityFor(valueUsd: number): "critical" | "high" | "medium" {
  return valueUsd >= 1_000_000_000 ? "critical" : valueUsd >= 100_000_000 ? "high" : "medium";
}

export function valueLabel(valueUsd: number, title = ""): string {
  const label = valueUsd >= 1_000_000_000
    ? `$${(valueUsd / 1_000_000_000).toFixed(1)}B`
    : valueUsd >= 1_000_000 ? `$${(valueUsd / 1_000_000).toFixed(0)}M` : "value undisclosed";
  // Framework values are spend ceilings across many call-offs, not one contract.
  return /framework/i.test(title) && valueUsd > 0 ? `${label} framework ceiling` : label;
}

export type TenderEventInsert = {
  project_name: string;
  country: string | null;
  region: string | null;
  sector: string | null;
  event_type: "tender_open" | "award" | "cancellation" | "re_tender";
  severity: string;
  summary: string;
  award_value_usd: number | null;
  contractor_name: string | null;
  deadline: string | null;
  agency: string | null;
  source_url: string;
  project_id?: string | null;
};

/**
 * Insert rows whose source_url is not already stored (and not repeated within
 * the batch). Returns how many were inserted vs skipped as duplicates.
 */
export async function insertNewTenderEvents(
  supabase: Db,
  rows: TenderEventInsert[],
): Promise<{ inserted: number; duplicates: number }> {
  if (rows.length === 0) return { inserted: 0, duplicates: 0 };
  const { data: existing, error } = await supabase
    .from("tender_events")
    .select("source_url")
    .in("source_url", rows.map((r) => r.source_url));
  if (error) throw error;
  const seen = new Set((existing ?? []).map((e: { source_url: string }) => e.source_url));
  const fresh: TenderEventInsert[] = [];
  for (const r of rows) {
    if (seen.has(r.source_url)) continue;
    seen.add(r.source_url);
    fresh.push({
      ...r,
      project_name: r.project_name.slice(0, 300),
      contractor_name: r.contractor_name ? r.contractor_name.slice(0, 200) : null,
      agency: r.agency ? r.agency.slice(0, 200) : null,
    });
  }
  if (fresh.length > 0) {
    const { error: insertError } = await supabase.from("tender_events").insert(fresh);
    if (insertError) throw insertError;
  }
  return { inserted: fresh.length, duplicates: rows.length - fresh.length };
}

const REGION_COUNTRIES: [string, string[]][] = [
  ["MENA", ["egypt", "morocco", "algeria", "tunisia", "libya", "jordan", "lebanon", "iraq", "iran", "syria", "yemen", "saudi", "united arab emirates", "uae", "qatar", "kuwait", "oman", "bahrain", "west bank", "gaza", "djibouti", "israel"]],
  ["East Africa", ["kenya", "ethiopia", "tanzania", "uganda", "rwanda", "burundi", "somalia", "south sudan", "sudan", "eritrea", "madagascar", "mauritius", "seychelles", "comoros"]],
  ["West Africa", ["nigeria", "ghana", "senegal", "côte d'ivoire", "cote d'ivoire", "ivory coast", "mali", "burkina faso", "guinea", "sierra leone", "liberia", "togo", "benin", "niger", "gambia", "mauritania", "cabo verde", "cape verde"]],
  ["Southern Africa", ["south africa", "namibia", "botswana", "angola", "lesotho", "eswatini", "swaziland", "mozambique", "zambia", "malawi", "zimbabwe"]],
  ["Central Africa", ["congo", "central african republic", "chad", "gabon", "equatorial guinea", "cameroon", "são tomé", "sao tome"]],
  ["South Asia", ["india", "pakistan", "bangladesh", "sri lanka", "nepal", "bhutan", "maldives", "afghanistan"]],
  ["Southeast Asia", ["vietnam", "viet nam", "indonesia", "philippines", "thailand", "malaysia", "cambodia", "lao", "myanmar", "singapore", "timor"]],
  ["East Asia", ["china", "mongolia", "korea", "japan", "taiwan"]],
  ["Central Asia", ["kazakhstan", "uzbekistan", "kyrgyz", "tajikistan", "turkmenistan", "georgia", "armenia", "azerbaijan"]],
  ["Oceania", ["papua new guinea", "papua", "fiji", "solomon", "vanuatu", "samoa", "tonga", "kiribati", "tuvalu", "micronesia", "marshall", "australia", "new zealand"]],
  ["Caribbean", ["haiti", "jamaica", "dominican", "trinidad", "barbados", "bahamas", "antigua", "belize", "guyana", "suriname", "grenada", "st. lucia", "saint lucia", "dominica", "st. vincent"]],
  ["South America", ["brazil", "argentina", "chile", "peru", "colombia", "ecuador", "bolivia", "paraguay", "uruguay", "venezuela", "mexico", "guatemala", "honduras", "el salvador", "nicaragua", "costa rica", "panama"]],
  ["North America", ["united states", "canada"]],
  ["Europe", ["türkiye", "turkiye", "turkey", "ukraine", "moldova", "serbia", "albania", "north macedonia", "bosnia", "montenegro", "kosovo", "romania", "bulgaria", "poland", "croatia", "united kingdom", "germany", "france", "italy", "spain"]],
];

// World Bank multi-country / regional project labels.
const REGION_LABELS: [RegExp, string][] = [
  [/^eastern and southern africa/, "East Africa"],
  [/^western and central africa/, "West Africa"],
  [/^middle east|north africa/, "MENA"],
  [/^caribbean/, "Caribbean"],
  [/^pacific/, "Oceania"],
  [/^latin america/, "South America"],
  [/^central asia/, "Central Asia"],
  [/^south asia/, "South Asia"],
];

/** Country name → platform region, or null when not confidently known (never guess). */
export function regionForCountry(country: string | null | undefined): string | null {
  const c = (country ?? "").toLowerCase().trim();
  if (!c) return null;
  for (const [re, region] of REGION_LABELS) if (re.test(c)) return region;
  // Longest match wins, so "equatorial guinea" / "papua new guinea" beat "guinea"
  // and "dominican" beats "dominica".
  let best: { region: string; len: number } | null = null;
  for (const [region, names] of REGION_COUNTRIES) {
    for (const n of names) {
      if (c.includes(n) && (!best || n.length > best.len)) best = { region, len: n.length };
    }
  }
  return best?.region ?? null;
}
