## Remove uppercase eyebrow labels ("AI dev patterns") from page headers

Remove the small `uppercase tracking-widest` eyebrow labels that sit above page headings on public and dashboard pages. These read as placeholder/dev-pattern text.

### Files to edit

1. **`src/components/home/HeroSection.tsx`** (line ~48-54)
   - Remove the live-dot + `Global infrastructure intelligence` label above the h1.
   - Keep the heading, subtext, CTA buttons and live stats row unchanged.

2. **`src/pages/Explore.tsx`** (line ~108)
   - Remove `Live dataset preview` eyebrow label above the h1.
   - Keep the heading, description, live stats, filters and table unchanged.

3. **`src/pages/AskDemo.tsx`** (line ~108)
   - Remove `Live AI demo` eyebrow label above the h1.
   - Keep the heading, description and demo form unchanged.

4. **`src/components/home/SectorSnapshotSection.tsx`** (line ~71)
   - Remove `Live data` eyebrow label above the h2.
   - Keep the chart, table and "Browse all projects" CTA unchanged.

5. **`src/components/home/ProblemSection.tsx`** (line ~48)
   - Remove `What incumbents get wrong` eyebrow label above the flaws list.
   - Keep the stats grid and list content unchanged.

6. **`src/pages/Pricing.tsx`** (line ~179)
   - Remove `Pricing` eyebrow label above the h1.
   - Keep the "Pilot access now open" pill and everything below unchanged.

7. **`src/pages/dashboard/Ask.tsx`** (line ~99)
   - Remove `AI-powered search` eyebrow label above the h1.
   - Keep the "Try one of these" and "How I understood your question" functional labels unchanged.

### What stays
- Dashboard section labels (e.g., "Top regions by project count", "Quality flags", "Emerging Patterns") — these are functional data headers, not page eyebrow labels.
- Footer column headers ("Product", "Legal", "Get Started").
- Widget labels inside `HeroLiveTracker` ("Sector Breakdown", "Live Feed", etc.).
- Dynamic labels in `UseCaseSection` and `CapabilitiesSection` that describe the card content.