/**
 * Single source of truth for project sectors on the edge-function side.
 * Must stay in sync with the `public.project_sector` enum and `src/data/projects.ts`.
 */
export const PROJECT_SECTORS = [
  "AI Infrastructure",
  "Battery & Storage",
  "Building Construction",
  "Chemical",
  "Data Centers",
  "Defence & Security",
  "Digital Infrastructure",
  "Energy",
  "Hydrogen",
  "Industrial",
  "Infrastructure",
  "Mining",
  "Nuclear",
  "Oil & Gas",
  "Renewable Energy",
  "Semiconductors",
  "Space & Satellite",
  "Transport",
  "Urban Development",
  "Water",
] as const;

export type ProjectSector = (typeof PROJECT_SECTORS)[number];

/** Newer, fast-growing sectors the frontier agent hunts for. */
export const FRONTIER_SECTORS: ProjectSector[] = [
  "AI Infrastructure",
  "Data Centers",
  "Semiconductors",
  "Battery & Storage",
  "Nuclear",
  "Hydrogen",
  "Space & Satellite",
];

/**
 * Detect a frontier sector from free text (project name, description, source
 * sector label). Returns null when nothing matches, so callers can fall back to
 * their own mapping.
 */
export function detectFrontierSector(text: string): ProjectSector | null {
  const s = (text || "").toLowerCase();
  if (/semiconductor|chip fab|wafer|foundry|advanced packaging|fabrication plant/.test(s)) return "Semiconductors";
  if (/gigafactory|battery|bess|energy storage|storage facility/.test(s)) return "Battery & Storage";
  if (/nuclear|reactor|\bsmr\b|uranium enrich/.test(s)) return "Nuclear";
  if (/hydrogen|ammonia|electrolys/.test(s)) return "Hydrogen";
  if (/satellite|spaceport|launch site|ground station|space port/.test(s)) return "Space & Satellite";
  if (/defence|defense|military base|naval base|air base/.test(s)) return "Defence & Security";
  if (/data cent|hyperscale|colocation/.test(s)) return "Data Centers";
  if (/artificial intelligence|\bai\b|gpu|compute campus|ai campus/.test(s)) return "AI Infrastructure";
  return null;
}

const YEAR = new Date().getFullYear();

/** Themed frontier research queries, grouped by theme. */
export const FRONTIER_QUERIES: { theme: string; query: string }[] = [
  { theme: "ai-compute", query: `AI data center campus GPU cluster announced under construction ${YEAR} investment billion location developer` },
  { theme: "ai-compute", query: `hyperscale AI compute campus ${YEAR} OpenAI Microsoft Google Amazon xAI Nvidia site construction megawatt` },
  { theme: "ai-power", query: `power generation for data centers ${YEAR} gas turbines nuclear PPA grid connection AI campus energy supply project` },
  { theme: "semiconductors", query: `semiconductor fab construction ${YEAR} TSMC Samsung Intel Micron SK Hynix new plant investment location timeline` },
  { theme: "semiconductors", query: `chip packaging plant wafer fab India Japan Europe Middle East ${YEAR} announced groundbreaking billion` },
  { theme: "battery", query: `battery gigafactory construction ${YEAR} cathode anode plant investment location capacity GWh` },
  { theme: "battery", query: `grid scale battery energy storage project ${YEAR} BESS awarded financing MW MWh developer` },
  { theme: "nuclear", query: `nuclear power plant small modular reactor SMR project ${YEAR} construction approval site developer` },
  { theme: "hydrogen", query: `green hydrogen ammonia project ${YEAR} final investment decision electrolyser GW export terminal` },
  { theme: "space", query: `spaceport satellite manufacturing ground station construction ${YEAR} investment country operator` },
  { theme: "subsea-digital", query: `subsea cable landing station fiber backbone project ${YEAR} announced consortium route investment` },
  { theme: "critical-minerals", query: `lithium refinery rare earth processing plant critical minerals ${YEAR} construction awarded investment` },
  { theme: "defence", query: `defence industrial infrastructure munitions plant shipyard expansion ${YEAR} contract awarded investment` },
];

/** Regional slants used to spread frontier coverage beyond the US/EU. */
export const FRONTIER_REGION_SLANTS = [
  "United States and Canada",
  "Gulf states Saudi Arabia UAE Qatar",
  "India and South Asia",
  "Southeast Asia and Japan Korea",
  "Europe and United Kingdom",
  "Africa",
  "Latin America",
];
