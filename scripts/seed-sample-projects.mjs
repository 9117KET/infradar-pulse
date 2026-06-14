/**
 * Seeds a handful of realistic sample projects into the LOCAL Supabase stack so
 * the landing page (hero card, map, stats) has data during local development.
 * The hosted DB already has real projects — this is local-only.
 *
 * Env: LOCAL_SUPABASE_URL + LOCAL_SUPABASE_SERVICE_ROLE_KEY (from `supabase status`).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL || "http://127.0.0.1:54321";
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error("Set LOCAL_SUPABASE_SERVICE_ROLE_KEY (from `supabase status`).");
  process.exit(1);
}
const admin = createClient(url, serviceKey);

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const label = (v) => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`);

// Only base enum values guaranteed to exist:
//   region: MENA | East Africa | West Africa
//   sector: Urban Development | Digital Infrastructure | Renewable Energy | Transport | Water | Energy
const samples = [
  { name: "NEOM Oxagon Port", country: "Saudi Arabia", region: "MENA", sector: "Urban Development", stage: "Construction", value_usd: 8_200_000_000, risk_score: 41, confidence: 88, lat: 28.0, lng: 35.2 },
  { name: "Lagos–Calabar Coastal Rail", country: "Nigeria", region: "West Africa", sector: "Transport", stage: "Tender", value_usd: 11_000_000_000, risk_score: 58, confidence: 74, lat: 6.45, lng: 3.4 },
  { name: "Grand Inga Hydropower Expansion", country: "Egypt", region: "MENA", sector: "Energy", stage: "Financing", value_usd: 4_600_000_000, risk_score: 63, confidence: 71, lat: 30.0, lng: 31.7 },
  { name: "Lake Turkana Wind Expansion", country: "Kenya", region: "East Africa", sector: "Renewable Energy", stage: "Awarded", value_usd: 900_000_000, risk_score: 32, confidence: 90, lat: 2.4, lng: 36.8 },
  { name: "Cairo New Capital Smart District", country: "Egypt", region: "MENA", sector: "Digital Infrastructure", stage: "Construction", value_usd: 3_100_000_000, risk_score: 47, confidence: 82, lat: 30.0, lng: 31.8 },
  { name: "Dakar Desalination Plant", country: "Senegal", region: "West Africa", sector: "Water", stage: "Planned", value_usd: 620_000_000, risk_score: 28, confidence: 79, lat: 14.7, lng: -17.4 },
];

const rows = samples.map((p) => ({
  ...p,
  slug: slug(p.name),
  status: "Verified",
  value_label: label(p.value_usd),
  description: `${p.sector} project in ${p.country}.`,
  approved: true,
}));

const { error } = await admin.from("projects").upsert(rows, { onConflict: "slug" });
if (error) { console.error("Seed failed:", error.message); process.exit(1); }
console.log(`Seeded ${rows.length} sample projects into local DB.`);
