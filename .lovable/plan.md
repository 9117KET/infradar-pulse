## Plan: Fix alert counts and alert-dependent intelligence

The current issue is caused by the default 1,000-row read ceiling when the app fetches `alerts` without pagination. The `useAlerts` hook gets the true total count, but its actual alert list only loads the first 1,000 rows for uncapped users/staff. Any page that calculates stats from that list can therefore show capped totals, unread counts, category counts, country/project alert counts, and risk signals.

### What I will change

1. **Fix the shared alerts data hook**
   - Update `src/hooks/use-alerts.ts` so unlimited users/staff load alerts in pages using `.range()` instead of a single uncapped query.
   - Keep plan-based row caps intact for capped users.
   - Wait for entitlement loading before fetching, matching the pattern already used by `useProjects`, so users do not briefly see incorrect/capped states.
   - Ensure loading is cleared safely on errors and unmounts.

2. **Return accurate alert stats**
   - Extend the hook so `stats.total` uses the true database count when available instead of `alerts.length` only.
   - Add accurate server-side counts for unread, critical, and category breakdowns where possible, so summary cards are not limited by the fetched page set.
   - Keep the loaded alert list for feed rendering/pagination, but make the KPI cards reflect the actual alert universe.

3. **Make alert pages use the right source of truth**
   - Update `src/pages/dashboard/Alerts.tsx` so:
     - Total/unread/critical cards show true counts.
     - Category filter chips use accurate category counts.
     - The alert feed still paginates the loaded rows cleanly.
     - The truncation banner only appears for actual plan caps, not the backend’s 1,000-row default.
   - Review and adjust alert-dependent pages that currently derive counts from `useAlerts()`:
     - Dashboard overview
     - Real-time monitoring
     - Projects risk tab
     - Risk & Anomaly Signals
     - Countries and Country Detail

4. **Fix direct alert queries outside the hook**
   - Review direct `.from('alerts')` calls, especially `src/pages/dashboard/Tenders.tsx`.
   - For pages that intentionally show recent activity, keep a clear finite limit.
   - For pages that claim totals/counts, use count queries or paginated reads so numbers are not silently capped.

5. **Backend alert intelligence check**
   - Review `supabase/functions/alert-intelligence/index.ts` because it fetches 30-day alerts with no explicit pagination. If the last 30 days can exceed 1,000 rows, update it to page through alerts or use a deliberate capped sample plus accurate total count in the prompt/result.

### Technical details

- Use a reusable pagination pattern similar to `useProjects`:

```text
if rowCap > 0:
  fetch latest alerts with .limit(rowCap)
else:
  fetch alerts in 1,000-row pages with .range(from, to)
```

- Add lightweight count queries such as:

```text
all alerts count
unread alerts count
critical alerts count
category-specific counts
```

- Keep existing RLS policies unchanged; this is a read/query correctness fix, not a schema/security change.

### Expected result

- Admin/staff and unlimited users no longer see alert totals capped at 1,000.
- Alert cards, category chips, overview KPIs, monitoring KPIs, country/project risk views, and alert intelligence use consistent counts.
- Plan-capped users still see the intended capped feed with a clear upgrade/truncation banner.