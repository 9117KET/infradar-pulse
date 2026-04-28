Plan to make all agent functions work properly and make the monitoring dashboard accurate:

1. Fix the current build blockers
   - Repair the TypeScript errors currently preventing a clean build, including:
     - Agent monitoring task typing for `current_step`.
     - Test fixture typing in `agentMonitoring.test.ts`.
     - Profile UTM update typing in `AuthContext`.
     - Referral code table typing in Settings.
     - Traction stats RPC typing.
   - Do not manually edit generated backend client/type files.

2. Repair missing database pieces for monitoring
   - Add/repair the missing `research_tasks.current_step` column.
   - Add/repair the missing `agent_config` stats columns:
     - `last_run_at`
     - `last_run_status`
     - `success_count`
     - `failure_count`
     - `last_duration_ms`
   - Add/repair `begin_agent_task` and `finish_agent_run` RPCs so agents can consistently create task rows and update summary stats.
   - Fix `get_agent_scheduler_activity` execution permissions so the dashboard can read scheduler activity for admin/researcher accounts.

3. Standardize all deployed/scheduled agents
   - Ensure every function shown in `/dashboard/agents` is registered in `agent_config`.
   - Ensure all scheduled agents use the service-role cron auth helper and `timeout_milliseconds := 120000`.
   - Add or repair schedules for agents that appear in the dashboard but are not currently scheduled, including ingest/expanded intelligence agents where appropriate.
   - Keep existing working schedules intact and remove duplicate/broken schedules only if found.

4. Deploy all agent edge functions
   - Deploy every agent backend function used by the app, including the core intelligence agents, ingest agents, and dashboard-triggered agents:
     - `research-agent`, `update-checker`, `risk-scorer`, `stakeholder-intel`, `funding-tracker`, `regulatory-monitor`, `sentiment-analyzer`, `supply-chain-monitor`, `market-intel`, `contact-finder`, `alert-intelligence`, `data-enrichment`
     - `world-bank-ingest-agent`, `ifc-ingest-agent`, `adb-ingest-agent`, `afdb-ingest-agent`, `ebrd-ingest-agent`, `iadb-ingest-agent`, `aiib-ingest-agent`
     - `dataset-refresh-agent`, `digest-agent`, `report-agent`, `entity-dedup`, `corporate-ma-monitor`, `esg-social-monitor`, `security-resilience`, `tender-award-monitor`, `executive-briefing`
     - related on-demand agents: `user-research`, `nl-search`, `insight-sources-agent`, `source-ingest-agent`, `generate-insight`

5. Verify data correctness after deployment
   - Query `research_tasks` without the 1,000-row cap and confirm total runs by task type.
   - Query scheduler activity and confirm last run timestamps are recent for scheduled agents.
   - Check recent backend function logs for failures.
   - Manually invoke representative agent functions where safe to confirm they return successfully and write tracking rows.

6. Validate the frontend
   - Run TypeScript/build checks and the existing agent monitoring tests.
   - Confirm the dashboard uses paginated reads and scheduler fallback data so it no longer shows false `5d ago`, stale statuses, or capped total runs.

Technical notes:
- The database already shows many agent rows are running recently, but several migrations appear not to have fully applied: `agent_config` stats columns and `research_tasks.current_step` are missing in the live schema.
- The current backend scheduler query is blocked by permission errors in direct inspection, so the permission/grant path needs to be corrected.
- I will keep the existing Lovable Cloud architecture and won’t ask you for API keys because the required secrets/connectors are already configured.