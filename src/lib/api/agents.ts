import { supabase } from '@/integrations/supabase/client';

async function invokeAgent(functionName: string) {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: {},
  });

  if (error) {
    throw new Error(error.message || `Failed to invoke ${functionName}`);
  }

  return data;
}

async function invokeAgentWithBody(functionName: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) throw new Error(error.message || `Failed to invoke ${functionName}`);
  return data;
}

export const agentApi = {
  runResearchAgent: () => invokeAgent('research-agent'),
  runUpdateChecker: () => invokeAgent('update-checker'),
  runRiskScorer: () => invokeAgent('risk-scorer'),
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
  /** Natural Language project search — translates a free-text prompt into filters and returns matching projects. */
  runNlSearch: (query: string) => invokeAgentWithBody('nl-search', { query }),
  runDigestAgent: (opts?: { rule_id?: string }) => invokeAgentWithBody('digest-agent', { ...(opts ?? {}) }),
  runDatasetRefresh: (opts?: { dataset_key?: string }) => invokeAgentWithBody('dataset-refresh-agent', { ...(opts ?? {}) }),
  runReportAgent: (opts?: { report_type?: string; days?: number }) => invokeAgentWithBody('report-agent', { ...(opts ?? {}) }),
  runSourceIngest: (opts: { url: string; source_key?: string }) => invokeAgentWithBody('source-ingest-agent', opts),
  /** Backfill `sources` on insights: extract URLs from text, merge legacy `source_url`, AI only if still empty. */
  runInsightSourcesAgent: (opts?: {
    insight_id?: string;
    scope?: 'missing' | 'all';
    dry_run?: boolean;
    use_ai?: boolean;
  }) => invokeAgentWithBody('insight-sources-agent', { ...(opts ?? {}) }),

  runWorldBankIngest: (opts?: { status?: string; limit?: number; offset?: number }) =>
    invokeAgentWithBody('world-bank-ingest-agent', { ...(opts ?? {}) }),
  runIfcIngest: (opts?: { status?: string; limit?: number }) =>
    invokeAgentWithBody('ifc-ingest-agent', { ...(opts ?? {}) }),
  runAdbIngest: (opts?: { limit?: number }) =>
    invokeAgentWithBody('adb-ingest-agent', { ...(opts ?? {}) }),
  runAfdbIngest: () => invokeAgent('afdb-ingest-agent'),
  runEbrdIngest: () => invokeAgent('ebrd-ingest-agent'),
  runEntityDedup: () => invokeAgent('entity-dedup'),
  runCorporateMaMonitor: () => invokeAgent('corporate-ma-monitor'),
  runEsgSocialMonitor: () => invokeAgent('esg-social-monitor'),
  runSecurityResilience: () => invokeAgent('security-resilience'),
  runTenderAwardMonitor: () => invokeAgent('tender-award-monitor'),
  runExecutiveBriefing: () => invokeAgent('executive-briefing'),
};
