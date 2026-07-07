/**
 * Shared country → centroid resolution for all ingest agents.
 *
 * Replaces the four divergent per-agent COUNTRY_CENTROIDS tables. Rules:
 *  - Unknown countries resolve to null coordinates (never [0,0] "null island");
 *    rows with null coords stay listable but are excluded from maps by the
 *    `lat IS NOT NULL` filters in the public location queries.
 *  - Centroid-derived coordinates get a small deterministic jitter (seeded by
 *    the project slug) so same-country projects don't stack on a single pixel.
 *  - `precision` distinguishes real per-project coordinates ("exact") from
 *    country-level approximations ("country") so the UI can render them
 *    differently.
 */

export type CoordPrecision = "exact" | "country";

export interface ResolvedCoords {
  lat: number | null;
  lng: number | null;
  precision: CoordPrecision | null;
}

// Approximate geographic centroids, keyed by lowercase common name.
// Aliases for MDB naming conventions ("Egypt, Arab Republic of", "Viet Nam",
// "Kyrgyz Republic", ...) are handled by normalizeCountryName below plus the
// explicit alias entries at the bottom.
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  "afghanistan": [33.94, 67.71], "albania": [41.15, 20.17], "algeria": [28.03, 1.66],
  "angola": [-11.20, 17.87], "antigua and barbuda": [17.06, -61.80], "argentina": [-38.42, -63.62],
  "armenia": [40.07, 45.04], "australia": [-25.27, 133.78], "austria": [47.52, 14.55],
  "azerbaijan": [40.14, 47.58], "bahamas": [25.03, -77.40], "bahrain": [26.07, 50.56],
  "bangladesh": [23.68, 90.36], "barbados": [13.19, -59.54], "belarus": [53.71, 27.95],
  "belgium": [50.50, 4.47], "belize": [17.19, -88.50], "benin": [9.31, 2.32],
  "bhutan": [27.51, 90.43], "bolivia": [-16.29, -63.59], "bosnia and herzegovina": [43.92, 17.68],
  "botswana": [-22.33, 24.68], "brazil": [-14.24, -51.93], "brunei": [4.54, 114.73],
  "bulgaria": [42.73, 25.49], "burkina faso": [12.36, -1.56], "burundi": [-3.37, 29.92],
  "cabo verde": [16.00, -24.01], "cambodia": [12.57, 104.99], "cameroon": [7.37, 12.35],
  "canada": [56.13, -106.35], "central african republic": [6.61, 20.94], "chad": [15.45, 18.73],
  "chile": [-35.68, -71.54], "china": [35.86, 104.20], "colombia": [4.57, -74.30],
  "comoros": [-11.65, 43.33], "costa rica": [9.75, -83.75], "croatia": [45.10, 15.20],
  "cuba": [21.52, -77.78], "cyprus": [35.13, 33.43], "czech republic": [49.82, 15.47],
  "czechia": [49.82, 15.47], "denmark": [56.26, 9.50], "djibouti": [11.83, 42.59],
  "dominica": [15.41, -61.37], "dominican republic": [18.74, -70.16], "ecuador": [-1.83, -78.18],
  "egypt": [26.82, 30.80], "el salvador": [13.79, -88.90], "equatorial guinea": [1.65, 10.27],
  "eritrea": [15.18, 39.78], "estonia": [58.60, 25.01], "eswatini": [-26.52, 31.47],
  "ethiopia": [9.14, 40.49], "fiji": [-17.71, 178.07], "finland": [61.92, 25.75],
  "france": [46.23, 2.21], "gabon": [-0.80, 11.61], "gambia": [13.44, -15.31],
  "georgia": [42.32, 43.36], "germany": [51.17, 10.45], "ghana": [7.95, -1.02],
  "greece": [39.07, 21.82], "grenada": [12.12, -61.68], "guatemala": [15.78, -90.23],
  "guinea": [11.80, -10.94], "guinea-bissau": [11.80, -15.18], "guyana": [4.86, -58.93],
  "haiti": [18.97, -72.29], "honduras": [15.20, -86.24], "hungary": [47.16, 19.50],
  "iceland": [64.96, -19.02], "india": [20.59, 78.96], "indonesia": [-0.79, 113.92],
  "iran": [32.43, 53.69], "iraq": [33.22, 43.68], "ireland": [53.41, -8.24],
  "israel": [31.05, 34.85], "italy": [41.87, 12.57], "jamaica": [18.11, -77.30],
  "japan": [36.20, 138.25], "jordan": [30.59, 36.24], "kazakhstan": [48.02, 66.92],
  "kenya": [-0.02, 37.91], "kiribati": [1.87, -157.36], "kosovo": [42.60, 20.90],
  "kuwait": [29.31, 47.48], "kyrgyzstan": [41.20, 74.77], "laos": [19.86, 102.50],
  "latvia": [56.88, 24.60], "lebanon": [33.85, 35.86], "lesotho": [-29.61, 28.23],
  "liberia": [6.43, -9.43], "libya": [26.34, 17.23], "lithuania": [55.17, 23.88],
  "luxembourg": [49.82, 6.13], "madagascar": [-18.77, 46.87], "malawi": [-13.25, 34.30],
  "malaysia": [4.21, 101.98], "maldives": [3.20, 73.22], "mali": [17.57, -4.00],
  "malta": [35.94, 14.38], "marshall islands": [7.13, 171.18], "mauritania": [21.01, -10.94],
  "mauritius": [-20.35, 57.55], "mexico": [23.63, -102.55], "micronesia": [7.43, 150.55],
  "moldova": [47.41, 28.37], "mongolia": [46.86, 103.85], "montenegro": [42.71, 19.37],
  "morocco": [31.79, -7.09], "mozambique": [-18.67, 35.53], "myanmar": [21.91, 95.96],
  "namibia": [-22.96, 18.49], "nauru": [-0.52, 166.93], "nepal": [28.39, 84.12],
  "netherlands": [52.13, 5.29], "new zealand": [-40.90, 174.89], "nicaragua": [12.87, -85.21],
  "niger": [17.61, 8.08], "nigeria": [9.08, 8.68], "north korea": [40.34, 127.51],
  "north macedonia": [41.61, 21.75], "norway": [60.47, 8.47], "oman": [21.51, 55.92],
  "pakistan": [30.38, 69.35], "palau": [7.51, 134.58], "palestine": [31.95, 35.23],
  "panama": [8.54, -80.78], "papua new guinea": [-6.31, 143.96], "paraguay": [-23.44, -58.44],
  "peru": [-9.19, -75.02], "philippines": [12.88, 121.77], "poland": [51.92, 19.15],
  "portugal": [39.40, -8.22], "qatar": [25.35, 51.18], "romania": [45.94, 24.97],
  "russia": [61.52, 105.32], "rwanda": [-1.94, 29.87], "saint lucia": [13.91, -60.98],
  "samoa": [-13.76, -172.10], "sao tome and principe": [0.19, 6.61], "saudi arabia": [23.89, 45.08],
  "senegal": [14.50, -14.45], "serbia": [44.02, 21.01], "seychelles": [-4.68, 55.49],
  "sierra leone": [8.46, -11.78], "singapore": [1.35, 103.82], "slovakia": [48.67, 19.70],
  "slovenia": [46.15, 14.99], "solomon islands": [-9.65, 160.16], "somalia": [5.15, 46.20],
  "south africa": [-30.56, 22.94], "south korea": [35.91, 127.77], "south sudan": [6.88, 31.31],
  "spain": [40.46, -3.75], "sri lanka": [7.87, 80.77], "sudan": [12.86, 30.22],
  "suriname": [3.92, -56.03], "sweden": [60.13, 18.64], "switzerland": [46.82, 8.23],
  "syria": [34.80, 38.99], "taiwan": [23.70, 120.96], "tajikistan": [38.86, 71.28],
  "tanzania": [-6.37, 34.89], "thailand": [15.87, 100.99], "timor-leste": [-8.87, 125.73],
  "togo": [8.62, 0.82], "tonga": [-21.18, -175.20], "trinidad and tobago": [10.69, -61.22],
  "tunisia": [33.89, 9.54], "turkey": [38.96, 35.24], "turkmenistan": [38.97, 59.56],
  "tuvalu": [-7.11, 177.65], "uganda": [1.37, 32.29], "ukraine": [48.38, 31.17],
  "united arab emirates": [23.42, 53.85], "united kingdom": [55.38, -3.44],
  "united states": [37.09, -95.71], "uruguay": [-32.52, -55.77], "uzbekistan": [41.38, 64.59],
  "vanuatu": [-15.38, 166.96], "venezuela": [6.42, -66.59], "vietnam": [14.06, 108.28],
  "yemen": [15.55, 48.52], "zambia": [-13.13, 27.85], "zimbabwe": [-19.02, 29.15],
  // Aliases / MDB naming variants
  "cote d'ivoire": [7.54, -5.55], "côte d'ivoire": [7.54, -5.55], "ivory coast": [7.54, -5.55],
  "dr congo": [-4.04, 21.76], "democratic republic of the congo": [-4.04, 21.76],
  "democratic republic of congo": [-4.04, 21.76], "congo, democratic republic of": [-4.04, 21.76],
  "congo dr": [-4.04, 21.76], "congo, dem. rep.": [-4.04, 21.76],
  "congo": [-0.23, 15.83], "republic of congo": [-0.23, 15.83], "congo, republic of": [-0.23, 15.83],
  "kyrgyz republic": [41.20, 74.77], "viet nam": [14.06, 108.28], "lao pdr": [19.86, 102.50],
  "lao people's democratic republic": [19.86, 102.50], "uae": [23.42, 53.85],
  "usa": [37.09, -95.71], "united states of america": [37.09, -95.71],
  "russian federation": [61.52, 105.32], "turkiye": [38.96, 35.24], "türkiye": [38.96, 35.24],
  "swaziland": [-26.52, 31.47], "burma": [21.91, 95.96], "cape verde": [16.00, -24.01],
  "east timor": [-8.87, 125.73], "west bank and gaza": [31.95, 35.23],
  "hong kong": [22.32, 114.17], "macao": [22.20, 113.54], "brunei darussalam": [4.54, 114.73],
  "slovak republic": [48.67, 19.70], "st. lucia": [13.91, -60.98],
  "st. vincent and the grenadines": [12.98, -61.29], "st. kitts and nevis": [17.36, -62.78],
  "micronesia, federated states of": [7.43, 150.55], "gambia, the": [13.44, -15.31],
  "bahamas, the": [25.03, -77.40], "egypt, arab republic of": [26.82, 30.80],
  "iran, islamic republic of": [32.43, 53.69], "korea, republic of": [35.91, 127.77],
  "korea, democratic people's republic of": [40.34, 127.51], "yemen, republic of": [15.55, 48.52],
  "venezuela, rb": [6.42, -66.59], "syrian arab republic": [34.80, 38.99],
  "moldova, republic of": [47.41, 28.37], "tanzania, united republic of": [-6.37, 34.89],
  "north macedonia, republic of": [41.61, 21.75], "china, people's republic of": [35.86, 104.20],
  "sao tome and principe, democratic republic of": [0.19, 6.61],
};

function normalizeCountryName(country: string): string {
  return country.toLowerCase().replace(/\s+/g, " ").trim();
}

// Official-style prefixes used by MDB APIs ("Republic of Rwanda",
// "Kingdom of Morocco", "People's Republic of Bangladesh", ...).
const POLITICAL_PREFIX =
  /^(the |republic of |kingdom of |state of |union of |sultanate of |commonwealth of |principality of |grand duchy of |federation of |federal republic of |federative republic of |federal democratic republic of |islamic republic of |islamic emirate of |people's republic of |people's democratic republic of |lao people's democratic republic of |democratic socialist republic of |socialist republic of |plurinational state of |bolivarian republic of |arab republic of |united republic of |democratic republic of |co-?operative republic of |independent state of |federated states of )+/;

/**
 * Look up a country centroid. Returns null for unknown countries — callers
 * must not substitute [0,0].
 */
export function getCountryCentroid(country: string): [number, number] | null {
  const key = normalizeCountryName(country);
  if (!key) return null;
  if (COUNTRY_CENTROIDS[key]) return COUNTRY_CENTROIDS[key];
  // MDB variants like "Egypt, Arab Republic of" → try the part before the comma
  const beforeComma = key.split(",")[0].trim();
  if (beforeComma && COUNTRY_CENTROIDS[beforeComma]) return COUNTRY_CENTROIDS[beforeComma];
  // "Republic of Rwanda" → "rwanda" (full-name keys like "democratic republic
  // of the congo" were already matched above)
  const stripped = beforeComma.replace(POLITICAL_PREFIX, "").trim();
  if (stripped && COUNTRY_CENTROIDS[stripped]) return COUNTRY_CENTROIDS[stripped];
  // Multi-country rows like "India; Bangladesh" or "Kenya / Uganda" → first entry
  const first = key.split(/[;/]/)[0].trim();
  if (first && first !== key && COUNTRY_CENTROIDS[first]) return COUNTRY_CENTROIDS[first];
  return null;
}

/** Deterministic hash → float in [0, 1). */
function seededFraction(seed: string, salt: string): number {
  let h = 2166136261;
  const input = `${salt}:${seed}`;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Apply a small deterministic jitter (±0.3°) to a country centroid so
 * same-country projects don't render on the exact same pixel. Seed with the
 * project slug/external id so re-ingests are stable.
 */
export function jitterCentroid(lat: number, lng: number, seed: string): [number, number] {
  const dLat = (seededFraction(seed, "lat") - 0.5) * 0.6;
  const dLng = (seededFraction(seed, "lng") - 0.5) * 0.6;
  return [Math.round((lat + dLat) * 10000) / 10000, Math.round((lng + dLng) * 10000) / 10000];
}

/**
 * Resolve coordinates for a project that only has a country. Returns jittered
 * country-precision coords, or nulls when the country is unknown.
 */
export function resolveCountryCoords(country: string, seed: string): ResolvedCoords {
  const centroid = getCountryCentroid(country);
  if (!centroid) return { lat: null, lng: null, precision: null };
  const [lat, lng] = jitterCentroid(centroid[0], centroid[1], seed);
  return { lat, lng, precision: "country" };
}
