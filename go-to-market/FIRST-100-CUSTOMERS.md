# First 100 Customers — Execution Playbook

> One executable plan that chains the existing GTM assets into a weekly motion.
> **Goal:** 100 free pilot users → testimonials / LOIs / case studies → *then* paid conversion.
> This is the "validate before charging" path. Don't reinvent the assets below — operate them.

## Inherited assets (read once, then execute)

- **[MESSAGING.md](MESSAGING.md)** — canonical pitch, one-liners, objection framings. All copy inherits from here.
- **[PERSONA-PLAYBOOKS.md](PERSONA-PLAYBOOKS.md)** — per-persona pain, trigger, channel, hook, ROI math.
- **[OUTBOUND-SEQUENCES.md](OUTBOUND-SEQUENCES.md)** — 5-touch LinkedIn + email sequences.
- **[OBJECTION-HANDLING.md](OBJECTION-HANDLING.md)** — objection → rebuttal → proof artifact.
- **[PROOF-PACK.md](PROOF-PACK.md)** — 5-min and 15-min demo scripts + screenshots to capture.
- **[loi-letters/](loi-letters/)** — ready cold/warm letter templates per persona.
- **[LOI-TARGETS.md](LOI-TARGETS.md)** + **`private/customer-research.md`** (gitignored) — the named-prospect
  database (~70 publicly-listed contacts, ranked) + tool stack + mining queries. **Source of names.**
- **[../CUSTOMER_DISCOVERY.md](../CUSTOMER_DISCOVERY.md)** — the Mom-Test discovery + 30-day pilot structure.

> **Privacy:** named prospects and the lead tracker live in `private/` (gitignored). Keep PII out of this file.

---

## The 100, broken down

We are not chasing 100 random signups. The target is **100 qualified pilot users in the ICP**, sequenced by
credibility-per-effort, converting a subset to paid after the pilot proves value.

| Wave | Who (persona) | Why first | Target pilots |
|---|---|---|---|
| 1 | **Emerging-markets infra PE** (Actis, I Squared, NIIF, NSIA) | Already track the exact projects we index; reachable; high credibility | 15 |
| 1 | **DFI / MDB analysts & TTLs** (IFC, World Bank, BII, DEG) | Users *and* referrers; named on public project docs | 20 |
| 2 | **EPC BD teams** (Bechtel, Fluor, Vinci, L&T, Samsung C&T) | Clear ROI (pre-tender visibility); BD directors are public on LinkedIn | 25 |
| 2 | **Strategy / infra consultants** (Arup, Mott MacDonald, KPMG, PwC) | Resell intelligence; warm via conference speakers | 20 |
| 3 | **Project-finance & PRI desks** (StanChart, SocGen, Allianz, Marsh) | Highest ACV later; hardest to reach — warm only | 20 |

Wave 1 first because those names are the strongest logos for the case studies that unlock Waves 2–3 and the
accelerator applications.

---

## Channels — easiest-first for this ICP

1. **Warm LinkedIn DMs** to named contacts from `private/customer-research.md` + LOI-TARGETS. Use the
   OUTBOUND-SEQUENCES Day-0/3/7/14 cadence. Best signal-to-effort for this audience.
2. **Cold email** to public addresses mined via the queries in `private/customer-research.md`
   (`site:worldbank.org "task team leader" 2025`, etc.) using the [loi-letters/](loi-letters/) templates.
   Stack already chosen: Apollo (find/sequence) → Instantly (deliverability) → Clay (enrichment).
3. **Communities** — Infrastructure & Project Finance LinkedIn groups, MDB alumni networks, r/projectfinance,
   relevant Slacks/mailing lists. Be a contributor, not a billboard.
4. **Content-led inbound** — weekly LinkedIn post: "3 infrastructure projects most investors are missing in
   [Region] this month," sourced from live InfraRadar signals. Goal: inbound DMs.
5. **The gated "Weekly Infrastructure Signal" email** — 3 curated projects, signup-gated → nurture → pilot.
6. **Conferences** — speaker-list scraping (Firecrawl) for Infrastructure Investor Summit / InfraAmericas /
   MEED; warm follow-ups, not booth spray.

---

## Weekly cadence (per founder, ~repeatable)

- **40** new personalized LinkedIn connects/DMs (8/workday) to ranked prospects.
- **50** personalized cold emails/day max (quality > volume) once domain is warmed.
- **2** LinkedIn content posts.
- **10** active sequence follow-ups (Day 3/7/14 touches).
- **Every reply → 15-min demo** (PROOF-PACK 5-min script); every demo → offer a 30-day pilot.

### Funnel targets (tune after week 2 with real numbers)

```
1,000 touches  →  ~8% reply (80)  →  ~30% demo (24)  →  ~50% pilot (12)  →  repeat ~8 weeks → ~100 pilots
Pilot → paid: target 20–30% after the 30-day pilot proves value.
```

These ratios are starting assumptions — instrument them (see tracker) and adjust the channel mix toward
whatever converts fastest.

---

## The pilot (the actual conversion mechanism)

Use the 30-day structure in [../CUSTOMER_DISCOVERY.md](../CUSTOMER_DISCOVERY.md):
1. **Kickoff** — set one success metric the pilot user cares about (e.g. "surface 3 relevant pre-tender
   projects in West Africa I didn't already know").
2. **Mid-point check-in (day 15)** — confirm value, fix friction, ask for the metric.
3. **Debrief (day 30)** — if value confirmed: ask for a testimonial / LOI, then present paid conversion.
4. **Extract** — turn every successful pilot into a one-paragraph case study (logo + metric + quote).

Pilot access is already live in-product (card-free pilot counter on the pricing page) — point pilots straight
at signup; the platform grants the pilot window automatically.

---

## Lead tracker

Keep the live tracker (with names) at **`private/first-100-tracker.csv`** (gitignored). Template — no PII —
so the schema is version-controlled here:

```csv
date_added,name,org,persona,wave,channel,source,stage,last_touch,next_action,pilot_start,pilot_metric,outcome,notes
# stage: prospect | contacted | replied | demo | pilot | paid | lost
# channel: linkedin | email | community | inbound | conference | referral
```

Weekly review ritual (from HARD_THINGS.md): 3 things that moved, 1 decision, 1 risk, and **1 real customer
conversation logged** — every week, non-negotiable.

---

## Blockers to clear before scaling outbound

- [ ] **`[FOUNDERS]` credibility** — fill founder names/roles/story in the application docs and outreach
      signatures (now known: Kinlo Tangiri + Nfor Glen, 50/50 — see `private/legal/`). Cold outreach from a
      faceless sender converts poorly.
- [ ] **Email domain warmup** before any cold-email volume (Instantly) — protect deliverability.
- [ ] **Live URL verified** — do not send traffic until the go/no-go smoke passes (see Phase-1 testing:
      `e2e/live-smoke.spec.ts`) and the quota migration is deployed to prod.
- [ ] **PROOF-PACK screenshots** captured from the live app for the demo + LinkedIn content.

---

## What "done" looks like

100 ICP pilot users, ≥10 written testimonials/LOIs, ≥3 named-logo case studies, and a measured pilot→paid
conversion rate — enough to (a) start charging with proof and (b) strengthen the accelerator applications in
[applications/](applications/).
