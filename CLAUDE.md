# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> The parent-directory `CLAUDE.md` (one level up) covers the full tech stack, all npm/supabase commands, environment variables, and deployment. Read that first. This file records things only discoverable by reading multiple files.

---

## Edge Function Shared Utilities

All Edge Functions import from `supabase/functions/_shared/`. The key modules:

| File | Purpose |
|---|---|
| `agentGate.ts` | `isAgentEnabled(supabase, agentType)` — check `agent_config` table before running; return `pausedResponse()` if false |
| `auth.ts` | `getUserFromBearer(req, url, anonKey)` — extract and validate the Supabase JWT from `Authorization: Bearer` |
| `entitlementCheck.ts` | `assertAiAllowed`, `assertExportAllowed`, `assertInsightReadAllowed`, `incrementUsage` — enforce daily usage caps per plan |
| `billing.ts` | `PLAN_LIMITS`, `PlanKey`, `resolvePlanKeyFromPriceId` — source of truth for server-side limits |
| `requireStaff.ts` / `requireAi.ts` | Auth guards that return early with 401/403 for non-staff or unconfigured AI |
| `llm.ts` | `chatCompletions(body)` — wraps OpenAI-compatible `/chat/completions`; reads `OPENAI_API_KEY`/`LLM_API_KEY`, `OPENAI_BASE_URL`, `LLM_MODEL` |

**Critical:** `supabase/functions/_shared/billing.ts` and `src/lib/billing/limits.ts` define the same `PLAN_LIMITS` constants. They must stay in sync manually — there is no shared source.

## Typical Edge Function Pattern

```ts
// 1. Handle CORS preflight
// 2. Build supabaseAdmin client (service role key)
// 3. isAgentEnabled check → pausedResponse()
// 4. getUserFromBearer (if user-facing)
// 5. assertAiAllowed / assertExportAllowed (if consuming quota)
// 6. Business logic
// 7. incrementUsage on success
```

## Client-Side Agent Invocation

All Edge Functions are called through `src/lib/api/agents.ts` via `agentApi.*`. This is the only place that should call `supabase.functions.invoke`. Add new agents here when creating new Edge Functions.

## Auth & Entitlements (Client)

- `useAuth()` from `AuthContext` — provides `user`, `profile`, `roles`, `hasRole(role)`
- `useEntitlements()` from `src/hooks/useEntitlements.ts` — provides `canUseAi`, `canExportCsv`, `canExportPdf`, `canReadInsightFull`, `plan`, `limits`, `staffBypass`
- Staff roles (`admin`, `researcher`) bypass all usage limits on both client and server. The server-side check is in `entitlementCheck.ts:hasStaffBypass`.

## MDB Ingest Agents

Five multilateral development bank ingest agents exist for pulling project data:
- `world-bank-ingest-agent` — supports `status`, `limit`, `offset` params
- `ifc-ingest-agent` — supports `status`, `limit`
- `adb-ingest-agent` — supports `limit`
- `afdb-ingest-agent`
- `ebrd-ingest-agent`

These are triggered from `AgentMonitoring` dashboard (`/dashboard/agents`) and via `agentApi.run*Ingest()`.

## Agent Pause/Resume

Agents read their enabled state from the `agent_config` table (populated by migrations in `20260331000001_agent_config.sql`). The `AgentMonitoring` dashboard page (`src/pages/dashboard/AgentMonitoring.tsx`) controls this state. When adding a new Edge Function that should be pauseable, call `isAgentEnabled` at the top.

## Route Map (non-obvious)

Dashboard routes that require elevated roles via `<RoleGuard>`:
- `/dashboard/users` — `admin` only
- `/dashboard/review` — `researcher`+
- `/dashboard/subscribers` — `admin` only

Old routes that were renamed have redirects in `App.tsx` (`/dashboard/analytics` → `/dashboard/analytics-reports`, `/dashboard/satellite` → `/dashboard/evidence`, etc.).

## Running a Single Test

```bash
npx vitest run src/path/to/file.test.ts
```
