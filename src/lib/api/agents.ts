import { supabase } from '@/integrations/supabase/client';
import { getAppEnvironment } from '@/lib/billing/environment';

async function invokeAgent(functionName: string) {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: { environment: getAppEnvironment() },
  });

  if (error) {
    throw new Error(error.message || `Failed to invoke ${functionName}`);
  }

  return data;
}

async function invokeAgentWithBody(functionName: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: { ...body, environment: getAppEnvironment() },
  });
  // Re-throw the original error to preserve context (HTTP status, etc.) so
  // callers like isEntitlementOrQuotaError can inspect it correctly.
  if (error) throw error;
  return data;
}

export const agentApi = {
  runResearchAgent: () => invokeAgent('research-agent'),
  runUpdateChecker: () => invokeAgent('update-checker'),
  runRiskScorer: () => invokeAgent('risk-scorer'),
  runHealthScoreAgent: () => invokeAgent('health-score-agent'),
  runContractorIntelAgent: () => invokeAgent('contractor-intel-agent'),
  runStakeholderIntel: () => invokeAgent('stakeholder-intel'),
  runFundingTracker: () => invokeAgent('funding-tracker'),
  runRegulatoryMonitor: () => invokeAgent('regulatory-monitor'),
  runSentimentAnalyzer: () => invokeAgent('sentiment-analyzer'),
  runSupplyChainMonitor: () => invokeAgent('supply-chain-monitor'),
  runMarketIntel: () => invokeAgent('market-intel'),
  runContactFinder: (projectId?: string) =>
    projectId
      ? invokeAgentWithBody('contact-finder', { project_id: projectId })
      : invokeAgent('contact-finder'),
  runAlertIntelligence: () => invokeAgent('alert-intelligence'),
  runDataEnrichment: () => invokeAgent('data-enrichment'),
  runUserResearch: (query: string) => invokeAgentWithBody('user-research', { query }),
  runPortfolioChat: (messages: Array<{ role: 'user' | 'assistant'; content: string }>) =>
    invokeAgentWithBody('portfolio-chat', { messages }),
  /** Natural Language project search — translates a free-text prompt into filters and returns matching projects. */
  runNlSearch: (query: string) => invokeAgentWithBody('nl-search', { query }),
  runDigestAgent: (opts?: { rule_id?: string }) => invokeAgentWithBody('digest-agent', { ...(opts ?? {}) }),
  runDatasetRefresh: (opts?: { dataset_key?: string }) => invokeAgentWithBody('dataset-refresh-agent', { ...(opts ?? {}) }),
  runReportAgent: (opts?: {
    report_type?: string;
    days?: number;
    country?: string;
    region?: string;
    sector?: string;
    stage?: string;
    depth?: 'brief' | 'standard' | 'deep';
    question?: string;
    tracked_only?: boolean;
    saved_search_id?: string;
  }) => invokeAgentWithBody('report-agent', { ...(opts ?? {}) }),
  runSourceIngest: (opts: { url: string; source_key?: string }) => invokeAgentWithBody('source-ingest-agent', opts),
  /** Backfill `sources` on insights: extract URLs from text, merge legacy `source_url`, AI only if still empty. */
  runInsightSourcesAgent: (opts?: {
    insight_id?: string;
    scope?: 'missing' | 'all';
    dry_run?: boolean;
    use_ai?: boolean;
  }) => invokeAgentWithBody('insight-sources-agent', { ...(opts ?? {}) }),

  runWorldBankIngest: (opts?: { status?: string; limit?: number; offset?: number; mode?: 'backfill' }) =>
    invokeAgentWithBody('world-bank-ingest-agent', { ...(opts ?? {}) }),
  runIfcIngest: (opts?: { status?: string; limit?: number; offset?: number; mode?: 'backfill' }) =>
    invokeAgentWithBody('ifc-ingest-agent', { ...(opts ?? {}) }),
  runAdbIngest: (opts?: { limit?: number; offset?: number; mode?: 'backfill' }) =>
    invokeAgentWithBody('adb-ingest-agent', { ...(opts ?? {}) }),
  runAfdbIngest: () => invokeAgent('afdb-ingest-agent'),
  runEbrdIngest: () => invokeAgent('ebrd-ingest-agent'),
  runIadbIngest: (opts?: { status?: string; limit?: number; offset?: number; mode?: 'backfill' }) =>
    invokeAgentWithBody('iadb-ingest-agent', { ...(opts ?? {}) }),
  runAiibIngest: () => invokeAgent('aiib-ingest-agent'),
  /** GEM Global Integrated Power Tracker — exact facility coordinates, CC BY 4.0. */
  runGemIngest: (opts?: { mode?: 'backfill'; limit?: number; offset?: number; min_mw?: number; file_url?: string }) =>
    invokeAgentWithBody('gem-ingest-agent', { ...(opts ?? {}) }),
  runEibIngest: (opts?: { statuses?: string; limit?: number; offset?: number; mode?: 'backfill' }) =>
    invokeAgentWithBody('eib-ingest-agent', { ...(opts ?? {}) }),
  /** TED EU procurement notices (CPV 45*) → tender_events. */
  runTedIngest: (opts?: { days?: number; limit?: number; min_value_usd?: number }) =>
    invokeAgentWithBody('ted-ingest-agent', { ...(opts ?? {}) }),
  runEntityDedup: () => invokeAgent('entity-dedup'),
  runCorporateMaMonitor: () => invokeAgent('corporate-ma-monitor'),
  runEsgSocialMonitor: () => invokeAgent('esg-social-monitor'),
  runSecurityResilience: () => invokeAgent('security-resilience'),
  runTenderAwardMonitor: () => invokeAgent('tender-award-monitor'),
  runExecutiveBriefing: () => invokeAgent('executive-briefing'),
  runGenerateInsight: (opts?: { topic?: string }) => invokeAgentWithBody('generate-insight', { ...(opts ?? {}) }),
  runAgentHealthMonitor: () => invokeAgentWithBody('agent-health-monitor', {}),
  runSyncServiceRoleToVault: () => invokeAgentWithBody('sync-service-role-to-vault', {}),
  runAlertIntelligenceAgent: () => invokeAgent('alert-intelligence'),
  runLinkValidator: (opts?: { mode?: 'incremental' | 'full'; batch?: number; concurrency?: number }) =>
    invokeAgentWithBody('link-validator', { ...(opts ?? {}) }),
  runSourceCleanup: (opts?: { dry_run?: boolean }) =>
    invokeAgentWithBody('source-cleanup', { dry_run: opts?.dry_run ?? true }),

  // Semi-autonomous outbound: draft (AI writes), send (delivers approved emails),
  // and the weekly-signal inbound newsletter. See /dashboard/outreach.
  runOutreachDraft: () => invokeAgent('outreach-draft-agent'),
  runOutreachSend: () => invokeAgent('outreach-send-agent'),
  runWeeklySignal: () => invokeAgent('weekly-signal-agent'),
};
