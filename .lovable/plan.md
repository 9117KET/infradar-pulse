

# Source Links for Projects, Alerts & Insights

## Summary

Add `source_url` to alerts and ensure all agents always include source URLs in their findings. Update the Alerts UI and Insights pages to display clickable source links. Projects already have `source_url` — ensure agents populate it consistently.

---

## Database Migration

Add `source_url` column to the `alerts` table:

```sql
ALTER TABLE alerts ADD COLUMN source_url text DEFAULT NULL;
```

The `insights` table already has no source_url — add one:

```sql
ALTER TABLE insights ADD COLUMN source_url text DEFAULT NULL;
```

No RLS changes needed.

---

## Update All Agent Edge Functions

Modify every agent that creates alerts to include a `source_url` field pointing to the actual news article, filing, or resource. Agents affected:

- `research-agent` — already has `evidence_url`, pass it to alert inserts as `source_url`
- `risk-scorer`, `regulatory-monitor`, `supply-chain-monitor`, `funding-tracker`, `sentiment-analyzer`, `contact-finder`, `update-checker`, `stakeholder-intel`, `market-intel` — add `source_url` from Perplexity citations or Firecrawl results to alert inserts
- `research-agent` — also ensure `source_url` is set on project inserts (already has the field, just ensure it's populated)

For the AI extraction prompts in each agent, add `source_url` as a required field in the structured output so the AI always returns a link to the original source.

---

## Frontend Changes

### Alerts Page (`Alerts.tsx`)
- Update the `Alert` interface in `src/data/alerts.ts` to include `source_url?: string`
- Update `use-alerts.ts` to map `source_url` from DB
- In each alert card, add an `ExternalLink` icon-button that opens `source_url` in a new tab (only shown when URL exists)

### Insights Page
- Where insights are displayed, show a "Source" link if `source_url` is present

### Project Detail
- Already shows `sourceUrl` — no changes needed, just ensure agents populate it

---

## Files Changed

| Action | File |
|--------|------|
| Migration | Add `source_url` to `alerts` and `insights` tables |
| Modify | `src/data/alerts.ts` — add `source_url` to Alert interface |
| Modify | `src/hooks/use-alerts.ts` — map source_url |
| Modify | `src/pages/dashboard/Alerts.tsx` — show source link on each alert |
| Modify | All 10 agent edge functions — include source_url in alert inserts |

