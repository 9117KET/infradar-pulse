

# Alert Categories & Intelligence Derivation

## Summary

Add a `category` column to the alerts table so each alert is classified into a domain (Political, Financial, Regulatory, Supply Chain, etc.). Rebuild the Alerts page with category filters, summary stats per category, and an AI-powered "Intelligence Brief" section that analyzes alert patterns to surface trends and actionable intelligence.

---

## Database Migration

**Alter `alerts` table** — add a `category` column:

```sql
CREATE TYPE alert_category AS ENUM (
  'political', 'financial', 'regulatory', 'supply_chain',
  'environmental', 'construction', 'stakeholder', 'market', 'security'
);
ALTER TABLE alerts ADD COLUMN category alert_category NOT NULL DEFAULT 'market';
```

No RLS changes needed — existing policies cover SELECT/UPDATE.

---

## Edge Function: `alert-intelligence`

New function `supabase/functions/alert-intelligence/index.ts` that:

1. Fetches recent alerts (last 30 days) grouped by category
2. Sends them to Lovable AI (Gemini) with a prompt asking for:
   - Top 3 emerging risk patterns across categories
   - Regional hotspots (which regions have most critical/high alerts)
   - Recommended actions for each pattern
3. Returns structured JSON with intelligence briefing
4. Optionally stores the brief in `research_tasks` with task_type `alert-intelligence`

Uses tool calling for structured output (patterns, hotspots, recommendations).

---

## Update Existing Agents

Modify all agents that create alerts (research-agent, update-checker, risk-scorer, regulatory-monitor, sentiment-analyzer, supply-chain-monitor, funding-tracker, contact-finder) to include the appropriate `category` value when inserting alerts. Each agent maps naturally to a category:

| Agent | Default Category |
|-------|-----------------|
| research-agent | `market` |
| risk-scorer | `financial` or `security` |
| regulatory-monitor | `regulatory` |
| supply-chain-monitor | `supply_chain` |
| funding-tracker | `financial` |
| sentiment-analyzer | `political` |
| contact-finder | `stakeholder` |
| update-checker | `construction` |

---

## Frontend: Rebuilt Alerts Page

### Layout
- **Header**: Title + "Generate Intelligence Brief" button + "Mark all read" button
- **Category filter bar**: Horizontal pill/tab filters for each category (with counts)
- **Summary cards row** (4 cards):
  - Total alerts (unread count)
  - Most active category (with count)
  - Critical alerts count
  - Trend indicator (alerts this week vs last week)
- **Intelligence Brief panel** (collapsible card):
  - AI-generated patterns, hotspots, recommendations
  - Timestamp of last analysis
  - Loading state while generating
- **Alert list**: Filtered by selected category, each alert now shows category badge alongside severity badge

### Data Layer
- Update `Alert` interface in `src/data/alerts.ts` to include `category` field
- Update `use-alerts.ts` to map `category` from DB and expose filter/stats helpers

---

## Files Changed

| Action | File |
|--------|------|
| Migration | Add `alert_category` enum + `category` column to `alerts` |
| Create | `supabase/functions/alert-intelligence/index.ts` |
| Modify | `src/data/alerts.ts` — add `category` to interface |
| Modify | `src/hooks/use-alerts.ts` — map category, add stats |
| Modify | `src/pages/dashboard/Alerts.tsx` — full rebuild with categories, filters, intelligence brief |
| Modify | All agent edge functions — add `category` to alert inserts |

