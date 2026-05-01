# InfraRadarAI — Persona Playbooks

> Field-ready playbooks per ICP. Each playbook = who they are, what they buy today, what we sell them, the message, the demo path, and the close.
> Source-of-truth for messaging is `MESSAGING.md`. Pricing is `src/pages/Pricing.tsx`.
> Last updated: May 2026.

---

## Persona priority

| # | Persona | Primary use | Revenue priority | LOI / credibility priority |
|---|---|---|---|---|
| 1 | Infrastructure PE / Infra Funds | Deal sourcing + portfolio monitoring | **High** | Medium |
| 2 | EPC Contractors (BD) | Pre-tender pipeline + contractor intel | **High** | Medium |
| 3 | Strategy & Infra Consultants | Country/sector reports + client decks | **High** | Medium |
| 4 | Project Finance Banks | Pipeline syndication + risk monitoring | Medium | Medium |
| 5 | DFI Analysts (WB, IFC, ADB, AfDB, EBRD, AIIB, IADB) | Cross-MDB visibility + portfolio | Medium (long cycle) | **High** |

---

## 1. Infrastructure PE / Infra Funds

**Who they are.** Mid-market and large infra PE — AIIM, Actis, I Squared, Macquarie Asset Management, DPI, Brookfield, Pembani Remgro. Investment Directors, VPs Origination, Portfolio Monitoring leads.

**What they buy today.** $30K–$150K/yr stack: Wood Mackenzie / GlobalData + IJGlobal + bespoke consultants + manual MDB scraping.

**What we sell them.** Pro $199/mo per seat, with Enterprise upgrade for SSO + API once 5+ seats. Founders Lifetime as a hook for the first deal-team champion.

**Message (cold).**
> {FirstName} — building a verified pipeline view for infra PE that aggregates all 7 MDBs (WB, IFC, ADB, AfDB, EBRD, AIIB, IADB) plus 20+ procurement portals into one ranked feed, with delay-risk and contractor-distress signals on every project. ~1,600 projects, $246B+ pipeline indexed. Replaces ~$50K of incumbent stack at $199/mo. 5-min demo?

**Demo path (15 min).**
1. **Geospatial map + filters** — show their target region/sector in 2 clicks.
2. **Project Detail** — show source URLs, confidence score, 30% cap on unverified.
3. **Delay prediction + early warning** — pick a portfolio asset, show signals.
4. **AI Market Report Builder** — generate a country/sector report live.
5. **Portfolio Chat** — ask "which of my tracked assets has worsening contractor signals this quarter?".

**Close.** "$199/mo per seat, card-free trial, 14-day refund. Three deal-team seats covers your whole origination team. Want me to set up the trial now or send a Lifetime link first?"

**Objection map.**
- "We already have IJGlobal." → IJGlobal records deals at financial close. We surface 6–18 months earlier from MDB pipeline + procurement.
- "Not enough African coverage." → Show AfDB ingest agent + Mission 300 projects + Standard Bank/Absa adjacency.

---

## 2. EPC Contractors (BD)

**Who they are.** BD Directors and Country Managers at L&T PT&D, CCC, Samsung C&T, POSCO, Bouygues, Vinci, Bechtel, Fluor.

**What they buy today.** $30K–$80K MEED + tender aggregators + a paid country consultant. Mostly reactive.

**What we sell them.** Pro $199/mo per BD seat, Enterprise once a country team adopts. Founders Lifetime for the first regional champion.

**Message (cold).**
> {FirstName} — we surface MDB tenders 6–18 months before public RFP across WB, IFC, ADB, AfDB, EBRD, AIIB, IADB plus 20+ procurement portals — with contractor intelligence and delay scores attached. {Region} pipeline is {N} active projects worth ${X}B in our index right now. 10-min walkthrough?

**Demo path.**
1. **Country dashboard** for their priority country.
2. **Pre-tender pipeline filter** — projects in financing/preparation stage.
3. **Contractor Intelligence** — competitor positioning on adjacent tenders.
4. **Alert rules** — "alert me when any {sector} project in {country} moves to RFP".
5. **Tender / Awards page** — past awards, who won, average value.

**Close.** "$199/mo per BD seat. Pilot one country team for a quarter; if you don't surface a winnable tender 60 days early, we refund."

---

## 3. Strategy & Infra Consultants

**Who they are.** McKinsey GII, Arup, KPMG Infra, PwC Capital Projects, Mott MacDonald, Castalia, Hatch. Engagement Managers, Senior Associates.

**What they buy today.** Per-project research budget — analyst time + ad-hoc MEED / GlobalData seats + freelance research.

**What we sell them.** Pro $199/mo per team seat (charged to engagement). AI Market Report Builder is the killer feature.

**Message (cold).**
> {FirstName} — for your {country/sector} engagements: we generate verified, source-linked country and sector reports on demand — across 7 MDBs and 20+ procurement portals, ~1,600 projects indexed. Cuts the 2-week analyst cycle to 20 minutes. $199/mo per seat, charge it to the engagement. Want a sample report on {country}?

**Demo path.**
1. Generate a **country report PDF** live.
2. Show **source-linked evidence** behind every claim.
3. **Compare projects** side-by-side for a strategy deck.
4. **Ask in plain English** — "list every >$500M energy project in WAEMU with WB or AfDB financing in 2024–2026".

**Close.** Offer a Founders Lifetime as a personal hook to the EM, then upsell the team.

---

## 4. Project Finance Banks

**Who they are.** Standard Bank CIB, Absa CIB, Nedbank CIB, Standard Chartered Africa, SocGen, Sumitomo Mitsui, MUFG project finance.

**What they buy today.** IJGlobal + Refinitiv + sector specialists.

**What we sell them.** Pro $199/mo per origination seat → Enterprise for syndication desk (API + SSO).

**Message (cold).**
> {FirstName} — building cross-MDB pipeline visibility for project finance: all 7 MDBs and 20+ procurement portals in one ranked feed, with co-financing and contractor signals attached. Useful for syndication origination 6–18 months before financial close. 10-min walkthrough?

**Demo path.**
1. **Country / sector pipeline** filtered to deals >$100M in financing stage.
2. **Co-financing graph** — who else is in.
3. **Risk signal trends** — 30-day movement on political / regulatory / financial.
4. **Saved searches + alert rules** for the origination team.

**Close.** Pilot 5 seats for a quarter on Pro; convert to Enterprise (API + SSO) on success.

---

## 5. DFI Analysts (WB, IFC, ADB, AfDB, EBRD, AIIB, IADB)

**Who they are.** Task Team Leaders, Senior Investment Officers, Sector Economists. Publicly identifiable from MDB project documents (50–100 reachable from 2024–2026 press releases alone).

**Why they matter.** Long revenue cycle (institutional procurement) but **highest credibility / LOI value**. Use for testimonials, conference panels, Series A materials.

**What we sell them.** Free / Starter $29 personal, Founders Lifetime as a personal tool — convert to institutional Enterprise later.

**Message (cold).**
> {FirstName} — we built a cross-MDB project intelligence platform that aggregates WB, IFC, ADB, AfDB, EBRD, AIIB, IADB into one verified, source-linked feed with confidence scoring and a human review queue. Useful for cross-institution co-financing and pipeline visibility. Free tier, no card. Would you take a 10-min look and share whether it would be useful in your role?

**Ask.** Not money — **a written LOI** ("If InfraRadarAI provided cross-MDB visibility at institutional pricing, my team would evaluate it for procurement.").

**Use the LOI for** YC / a16z / EF applications + Series A.

---

## Cross-persona rules

- **Always lead with verification.** Source URLs + 30% unverified cap is the moat — open every demo with it.
- **Always show the price**. Anchoring against $50K incumbents is the wedge; never hide $199.
- **Always offer Founders Lifetime to the personal champion** before pitching the team.
- **Card-free trial first**, demo second, when the prospect prefers self-serve.
