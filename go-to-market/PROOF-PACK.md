# InfraRadarAI — Proof Pack

> Defensible, source-able numbers and screenshots to drop into outbound, decks and applications.
> Re-verify all live-platform numbers against the `public-stats` RPC the day you ship them.
> Last updated: May 2026.

---

## Live platform numbers (May 2026)

| Metric | Value | Source |
|---|---|---|
| Verified projects indexed | **1,671** | `public-stats` RPC `[VERIFY]` |
| Countries covered | **140** | `public-stats` RPC `[VERIFY]` |
| Classified alerts | **5,657** | `alerts` table classification view `[VERIFY]` |
| Pipeline value indexed | **$246B+** | sum of `project.value_usd` `[VERIFY]` |
| MDB ingest agents live | **7** (WB, IFC, ADB, AfDB, EBRD, AIIB, IADB) | `agent_config` table |
| Procurement portals monitored | **20+** | `agent_config` + ingest configs |
| Specialised agents (all families) | **30+** | edge function manifest |
| Risk signal categories | **9** | Political, Financial, Regulatory, Supply Chain, Environmental, Construction, Stakeholder, Market, Security |
| Live product modules | **10** | `CapabilitiesSection.tsx` |
| Verification confidence cap (unverified) | **30%** | platform rule |
| Pricing tiers | Free / Starter $29 / Pro $199 / Enterprise / Lifetime $1,499 | `src/pages/Pricing.tsx` |
| Founders Lifetime cap | **100 seats** | pricing page |
| Trial | Card-free 3 days + 14-day refund | pricing page |

---

## Market size anchors (defensible, citable)

| Anchor | Value | Source / framing |
|---|---|---|
| World Bank annual commitments | **$117B** in 2024 | World Bank annual report 2024 |
| AfDB Mission 300 | **$300B** by 2030 to electrify 300M Africans | AfDB Mission 300 program |
| MEED revenue est. | **$50M+/yr** at $5–15K/seat | public market data |
| GlobalData infrastructure segment | **$200M+/yr** | GlobalData public filings |
| Total infra intelligence TAM | **$2–4B/yr** globally | bottom-up across 6 incumbent categories |
| Incumbent seat price range | **$3K–$200K/yr** | public price sheets |

---

## Cost-moat proof

- MVP agent fleet runs on the **Lovable AI gateway** (Gemini 3 / GPT-5 class).
- **No required spend** on Perplexity, OpenAI direct, or Firecrawl for MVP agents.
- Marginal cost per agent query = a fraction of a competitor stacking direct LLM + scraping vendors.
- This is what lets us sell **Pro at $199/mo profitably** while incumbents are structurally trapped at $5K–$200K because their cost line is human analysts.

---

## Verification-moat proof

Every record carries:
- **Source URL** (mandatory).
- **Confidence score** (0–100).
- **30% confidence cap** for any record without multi-source corroboration.
- **Human review queue** with mandatory verification reason and full audit trail.
- **Role-based access control** (User / Researcher / Admin) controlling who can verify.

This is the structural answer to "how do we trust an AI-generated record?" — and the reason we can sell into DFIs, banks and large EPCs.

---

## Screenshots / demo URLs to attach

> Update these with your latest production captures before sending.

- `/dashboard` — Command Center overview with Overall Data Quality score.
- `/dashboard/geo` — Geospatial map (native Leaflet, region overlays).
- `/dashboard/ask` — Ask in plain English / NL search.
- `/dashboard/projects/{id}` — Project Detail with source URLs + confidence score.
- `/dashboard/agents` — Agent Monitoring (proves 30+ agents live + pause/resume).
- `/dashboard/review` — Human-in-the-loop verification queue (researcher+).
- `/pricing` — live tiers + lifetime + pilot counter.

---

## Quotes / testimonials

[FOUNDERS: Drop in any LOIs, quotes from DFI Task Team Leaders, EPC BD heads, infra fund analysts as they come in. Use this section to bank social proof for YC / a16z / EF applications.]

```
> "____________________________________"
>
> — {Title}, {Institution}
```

---

## Competitor positioning grid (anonymised public framing)

| Incumbent category | Example | Typical seat price | What InfraRadarAI does better |
|---|---|---|---|
| Regional publisher | MEED Premium | $5–15K/yr | Real-time vs quarterly; verified; 50–500x cheaper |
| Global market research | GlobalData Construction | $10–50K/yr | Cross-MDB integration; AI-native; ~50x cheaper |
| Energy/commodity research | Wood Mackenzie | $50–200K/yr | Project-level vs market-level; ~250–1000x cheaper |
| Project finance terminal | IJGlobal | $20–100K/yr | Pre-tender (6–18 mo earlier), not just close-of-deal records |
| MENA / Africa intel boutique | Various | $5–30K/yr | 7-MDB graph + verification at fraction of price |
| Tender aggregator | Various | $1–5K/yr | Adds risk scoring, verification, AI reports |

---

## What we will NOT claim

- We will not claim revenue numbers we have not verified that day.
- We will not claim "40+ agents" — current truthful claim is **30+ across 7 families**.
- We will not claim "5 MDBs" — current truthful claim is **7 MDBs**.
- We will not claim "free for 12 months" — that offer is retired; current trial is **card-free 3 days + 14-day refund + pilot-access counter** on the pricing page.
- We will not name competitors in public marketing copy where the site uses anonymised category framing — we name them only in private LOIs / accelerator apps where competitor specificity strengthens the pitch.
