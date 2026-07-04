# Germany / DACH — Contacts & Calling Playbook

> Companion to `private/customer-research.md` (named global prospects + mining queries) and
> `OUTBOUND-SEQUENCES.md`. This file covers the **DACH region specifically** — who to reach, how to
> find them, the German cold-contact law you must respect, and the tools to actually run calls.
>
> **Do not put scraped names/emails in this file** (it's committed). Keep the live German contact list
> in `private/first-100-tracker.csv` with the rest.

---

## 1. Why Germany is a strong wedge market

- Germany hosts **two of the world's most relevant DFIs** (KfW/DEG) plus large EPC, reinsurance and
  asset-management buyers — i.e. several of our personas concentrated in one country/timezone.
- German infra/DFI buyers are heavily exposed to exactly what we index: **emerging-market infrastructure,
  MDB co-financing, energy transition** (DEG, KfW, GIZ all fund EM infrastructure).
- English is workable at this seniority, but **German-language first touch + a local +49 number materially
  lifts reply/answer rates** (see §4/§5).

---

## 2. DACH target organisations by persona

Map each to the persona configs in `outreach-draft-agent` (`PERSONAS`) so drafts use the right wedge.

| Persona key | DACH organisations to target | Title to search for |
|---|---|---|
| `dfi_analyst` | **DEG** (Cologne), **KfW Entwicklungsbank**, **KfW IPEX-Bank**, **GIZ**, **DWS Infrastructure** (DFI-adjacent) | Investment Manager, Director Infrastructure & Energy, Project Finance Manager |
| `infra_pe` | **Allianz Capital Partners / AllianzGI Infrastructure**, **MEAG** (Munich Re), **DWS Infrastructure**, **Aquila Capital** (Hamburg), **Palladio Partners**, **Golding Capital** | Managing Director / Investment Director, Infrastructure Equity |
| `epc_bd` | **Hochtief** (Essen), **Bilfinger**, **Max Bögl**, **STRABAG** (AT/DE), **Siemens Energy / Smart Infrastructure**, **Fichtner**, **ILF Consulting Engineers** | Head of Business Development, Tender/Bid Manager, Strategy |
| `consultant` | **Roland Berger** (Infrastructure), **KPMG/PwC/Deloitte DE Infrastructure Advisory**, **Tractebel (ex-Lahmeyer)**, **Fichtner Management Consulting**, **Drees & Sommer** | Partner / Principal, Senior Manager Infrastructure |
| `project_finance` | **Deutsche Bank** (Structured Trade & Commodity / Infra Finance), **Commerzbank**, **LBBW**, **Helaba**, **KfW IPEX-Bank**, **Munich Re / Hannover Re** (PRI) | Project Finance Director, Infrastructure Coverage, PRI Underwriter |
| `political_risk` | **Munich Re**, **Hannover Re**, **Allianz Trade (Euler Hermes)**, **Federal Government Euler Hermes export-credit cover** | Country Risk Analyst, PRI Underwriter |

Already in `private/customer-research.md` for DACH: **DEG — Mariana Bárcena de Paquo (Director, Infrastructure
& Energy)**. Use her as the Wave-1 DACH anchor; mine the rest by the method below.

> **Strongest first 3 to pursue:** DEG (Cologne, DFI, LOI-credibility), Hochtief (Essen, EPC with the
> clearest pre-tender ROI), AllianzGI/MEAG (large infra-equity ACV).

---

## 3. How to find the actual people (zero / low cost)

Reuse the mining approach from `private/customer-research.md`, localised:

1. **LinkedIn Sales Navigator** — filter `Geography: Germany` + the org + the title column above. Best
   single tool for DACH names + warm-path discovery.
2. **Google dorks** (free):
   - `site:deginvest.de "infrastructure" (Director OR Manager)`
   - `site:kfw-ipex-bank.de "project finance"`
   - `site:hochtief.com "business development" press release 2025`
   - `site:linkedin.com/in "DEG" "Infrastructure"`
3. **Dealfront** (formerly Echobot + Leadfeeder) — **German company, GDPR-native, best DACH B2B coverage.**
   Strong for company + contact data and website-visitor de-anonymisation (legal in DE via Dealfront's model).
4. **Cognism** — GDPR-compliant B2B mobile numbers with notification/DNC checking; better EU phone coverage
   than Apollo. Use this when you specifically need **phone numbers for calling** (see §5).
5. **Apollo** — fine for emails/titles, weaker/legally-greyer on German mobiles than Cognism/Dealfront.
6. **Company impressum / press pages** — German sites legally must publish an Impressum; often lists
   department heads + a switchboard number.

Log everything into `private/first-100-tracker.csv` and (for the in-app engine) the `outreach_prospects`
table via `/dashboard/outreach → Prospects → Add prospect` (persona = the key above).

---

## 4. ⚠️ German cold-contact law — read before any call or email volume

Germany is **stricter than the US/UK**. Get this wrong and the downside is real (fines + reputation).

- **Cold CALLS (UWG § 7 Abs. 2 Nr. 1):**
  - To **businesses (B2B):** allowed **only with at least *presumed* consent** ("mutmaßliche Einwilligung")
    — i.e. a concrete factual reason to believe the called business is interested (relevant to their
    actual remit). A blind dial to a random fund is **not** covered.
  - To **consumers (B2C):** requires **prior express** consent. (Not our market, but never call private
    numbers.)
  - Enforced by the **Bundesnetzagentur**; fines up to **€300,000**.
  - **Practical rule:** make the first touch **email or LinkedIn** (relevant, specific). Once they've
    engaged — opened/replied, connected, downloaded the Weekly Signal, met you at a conference — a call is
    defensible as "presumed consent". **Call warm, not cold.**
- **Cold EMAIL (B2B):** UWG + GDPR Art. 6(1)(f) legitimate interest. Defensible if **relevant to their
  job**, identifies the sender (Impressum-style footer), and offers a one-click opt-out. Our
  `outreach-email` template + `suppressed_emails`/`handle-email-unsubscribe` already satisfy this — keep
  using them.
- **GDPR data minimisation:** only store business-context data (name, role, work email/phone, source URL).
  That's exactly the `outreach_prospects` schema. Honour objections immediately (set status
  `unsubscribed`).
- **Caller-ID:** German prospects rarely answer withheld/foreign numbers. Use a **real, displayed +49
  local number** (§5).

> Net: **Germany is an email/LinkedIn-first, call-second market.** The in-app semi-autonomous engine
> (email + LinkedIn drafts) is the compliant top of funnel; calls come after engagement.

---

## 5. Tools to actually make the calls

### Get a German presence first
- **A +49 local DID is the single biggest answer-rate lever.** Providers that issue German numbers:
  **sipgate** (German provider, most "local" trust), **CloudTalk**, **Aircall**, **JustCall**,
  **Zadarma** (cheap EU numbers). Pick a number in the prospect's city where possible
  (Cologne/Frankfurt/Munich/Essen).

### Human dialer / cloud phone (recommended for our high-trust buyers)
| Tool | Why for us |
|---|---|
| **Aircall** | Simple, reliable, +49 DIDs, call recording, CRM/HubSpot integrations, EU data options |
| **CloudTalk** | Strong European coverage, power dialer, good price, German numbers |
| **JustCall** | Cheap, dialer + SMS, integrates with most CRMs |
| **Kixie / Dialpad** | Power-dialer + local presence; Kixie has good "connection-rate" features |
| **sipgate** | German-native softphone; best for sounding genuinely local |
| **Twilio** | Build-your-own (programmable voice) if you want it wired into the app later |

### Enrichment to dial well
- **Cognism** (GDPR-checked mobiles, DNC screening) and **Dealfront** (DACH-native) — get the number AND
  the legal basis. Prefer these over Apollo for German phone data.

### Scheduling (so calls become booked, not cold)
- **Cal.com** (open-source, EU/GDPR-friendly, self-hostable) or **Calendly**. Put the link in every
  email/LinkedIn touch — booked calls sidestep the cold-call problem entirely (that's express consent).

### AI voice agents — use with caution in Germany
- Tools exist (**Vapi**, **Bland.ai**, **Synthflow**, **Retell AI**) and are great for **inbound
  qualification, callback scheduling, and follow-up** — **not** recommended for **cold outbound into
  Germany**: UWG cold-call rules apply to automated calls too, and undisclosed AI calling is a
  reputational and legal risk with DFI/PE buyers. If used at all: **inbound or already-consented contacts
  only, disclose it's an AI assistant, +49 number, easy human handoff.**

---

## 6. DACH calling playbook (compliant sequence)

1. **Touch 1–2 (email + LinkedIn, AI-drafted in `/dashboard/outreach`)** — relevant, specific, German if
   possible. This establishes the "presumed interest" basis.
2. **On any engagement** (reply, connect, Weekly-Signal open, profile view back) → **then call** the +49
   number, referencing the prior touch ("I wrote last week about cross-MDB pipeline for DEG…").
3. **Always offer the Cal.com/Calendly link** as the lower-friction alternative to a live dial.
4. **Conference warm-calls** (per `LOI-TARGETS.md`): meeting someone at an event is the cleanest consent
   basis — prioritise calling those.
5. **Log call outcome** on the prospect (notes / next status). Move `replied → pilot → paid` as it
   progresses; the in-app `bd_partners` deal can mirror the org-level deal.

---

## 7. Quick start (this week)

- [ ] Buy one **+49 number** (sipgate or Aircall) in Cologne or Frankfurt.
- [ ] Spin up **Cal.com**; put the link in the outreach email footer + LinkedIn drafts.
- [ ] Mine **10 DACH prospects** (DEG, Hochtief, AllianzGI/MEAG first) via Sales Navigator + Dealfront →
      add to `/dashboard/outreach` as persona-tagged prospects.
- [ ] Run **Draft next touches** → review the German-market drafts → **Approve** → let the send agent run.
- [ ] Only **call after a prospect engages** — never blind-dial (UWG).
