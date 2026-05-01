# InfraRadarAI — Objection Handling

> Field responses to the most common objections, by source. Answers are short on purpose — say them, don't read them.
> Last updated: May 2026.

---

## Pricing & ROI

**"$199/mo seems cheap — is the data any good?"**
> The data is public — every MDB and procurement portal we ingest publishes under open-data mandates. The work is in aggregation, verification and ranking, which is why incumbents charge $5K–$200K. We do it AI-native on the Lovable AI gateway, which is why we can sell it at $199. Every claim is source-linked and unverified records are capped at 30% confidence — open any project and you see the URLs.

**"Why would I pay you when MDB sites are free?"**
> Because pulling 7 MDBs + 20+ procurement portals into one ranked, verified, deduplicated, alert-able feed is what costs you 10 hours/week today. We index 1,671 projects across 140 countries and classify 5,657 alerts. Try the card-free trial — if it doesn't save you 5 hours in week one, don't continue.

**"We already pay $30K to MEED."**
> Keep them for what they're good at — narrative. Use us for the operational layer: pre-tender pipeline, contractor intel, delay risk, alerts. Most customers run both initially, then drop the incumbent at renewal.

---

## Trust & verification

**"How do I know the AI isn't hallucinating?"**
> Three things. (1) Every record has a source URL — click it. (2) Anything we can't corroborate from multiple sources is capped at 30% confidence and marked as such. (3) Low-confidence and conflicting records hit a human review queue with a mandatory verification reason and full audit trail before they become "verified".

**"Who verifies the records?"**
> Internal researchers under our 3-tier RBAC (User / Researcher / Admin). Researchers approve, reject or escalate; every decision logs the reviewer, the reason and the timestamp.

**"Where does the data come from?"**
> 7 MDBs (World Bank, IFC, ADB, AfDB, EBRD, AIIB, IADB) plus 20+ national/regional procurement portals plus regulatory feeds, contractor filings and tender awards. Each project page shows the exact source records it was built from.

---

## Coverage & scope

**"Do you cover {country}?"**
> 140 countries indexed today. Open `/dashboard/geo` and filter — we'll show you live in 10 seconds.

**"You don't have KfW / IsDB / JICA / NDB."**
> Correct — those are on the roadmap for the next two quarters. Our current 7 MDBs cover the institutions that finance ~80% of MDB-tracked global infrastructure. KfW/IsDB/JICA/NDB will compound that.

**"What about private-sector / commercial deals?"**
> We cover MDB and MDB-co-financed deals plus 20+ procurement portals — which captures most large infrastructure pipelines globally. Pure private commercial M&A isn't our focus.

---

## Product & competition

**"How is this different from IJGlobal?"**
> IJGlobal records deals at financial close. We surface them 6–18 months earlier — at MDB pipeline / procurement / pre-tender stage. Different point in the deal lifecycle. Several customers run both.

**"Wood Mackenzie does this."**
> WoodMac sells market-level intelligence for $50–200K/seat. We sell project-level intelligence for $199/mo. Different shape; different price point; different buyer.

**"GlobalData has more analysts."**
> Yes — and that's their cost ceiling. We replace analyst headcount with 30+ AI agents on the Lovable AI gateway. The marginal cost of adding coverage is near-zero for us; for them it's another $80–150K analyst hire.

**"Can't OpenAI / Perplexity / Gemini just do this?"**
> They're general-purpose. We're vertical: 30+ specialised agents tuned to MDB document structures, source-link verification, 9-category risk scoring, human review queues and 14-region/14-sector ontology. That domain layer is the product.

---

## Buying & procurement

**"We need SSO / SAML / DPA."**
> All available on Enterprise — typical pilot path is start 5 seats on Pro at $199, convert to Enterprise on rollout. Custom contract, SLA, white-label optional.

**"We need an API."**
> Enterprise tier includes API + webhooks. Pro tier is dashboard + PDF/CSV exports.

**"We need data residency in {region}."**
> Enterprise. We can deploy redundant inference paths via Azure OpenAI (UAE North / South Africa North / UK South) or Google Vertex (regional) on top of our default gateway.

**"We need a pilot before we can buy."**
> Card-free 3-day trial covers the entire Pro feature set. 14-day refund window after that. For team pilots (5+ seats), we'll do a 30-day paid pilot with a money-back option if you don't see ROI.

---

## Founder / team

**"You're only two founders. Can you support enterprise?"**
> The platform is fully built and running 30+ agents in production today on a Lovable AI / Supabase / Vercel stack — that's the whole point of an AI-native build. Enterprise support is structured per contract; SLA tier scales with the deal.

**"Are you raising?"**
> Bootstrapped today. Live revenue. Raising on the back of pilot conversion + LOIs from named DFIs, infra funds and EPCs.

---

## "Why now?"

> Two things converged in 2026. Frontier models (Gemini 3 / GPT-5 class) finally make multi-source verification, plain-English search and AI report generation tractable for regulated B2B data. And global infrastructure spend is at a multi-decade peak — World Bank $117B in 2024, AfDB Mission 300 at $300B by 2030. The $5K–$200K analyst-PDF stack was always going to be replaced; we built the AI-native, verified replacement.
