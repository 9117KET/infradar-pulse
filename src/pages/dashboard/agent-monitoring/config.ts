import { supabase } from '@/integrations/supabase/client';
import { Bot, CheckCircle, XCircle, Clock, RefreshCw, Search, ShieldAlert, Users, DollarSign, Scale, MessageSquare, Package, TrendingUp, Loader2, Radio, Phone, AlertTriangle, Database, Zap, GitMerge, Building2, Leaf, Shield, Gavel, ScrollText, Mail, FileText, Globe, Pause, Play, AlertCircle, Heart, HardHat, Cpu, Newspaper } from 'lucide-react';
import { agentApi } from '@/lib/api/agents';
import type { TaskRow } from '@/lib/agents/agentUtils';

export const AGENTS = [
  { type: 'discovery', name: 'Research Agent', icon: Search, schedule: 'Every 30 min', scheduleMinutes: 30, fn: agentApi.runResearchAgent },
  { type: 'frontier-intel', name: 'Frontier Sectors', icon: Cpu, schedule: 'Every 4 hours', scheduleMinutes: 240, fn: () => agentApi.runFrontierIntelAgent({ themes: 4 }) },
  { type: 'world-bank-ingest', name: 'World Bank Ingest', icon: Globe, schedule: 'Daily', scheduleMinutes: 1440, fn: () => agentApi.runWorldBankIngest({ status: 'Active,Pipeline', limit: 200 }) },
  { type: 'ifc-ingest', name: 'IFC Ingest', icon: Globe, schedule: 'Daily', scheduleMinutes: 1440, fn: () => agentApi.runIfcIngest({ status: 'Active,Pipeline', limit: 200 }) },
  { type: 'adb-ingest', name: 'ADB Ingest', icon: Globe, schedule: 'Daily', scheduleMinutes: 1440, fn: () => agentApi.runAdbIngest({ limit: 300 }) },
  { type: 'afdb-ingest', name: 'AfDB Ingest', icon: Globe, schedule: 'Daily', scheduleMinutes: 1440, fn: agentApi.runAfdbIngest },
  { type: 'ebrd-ingest', name: 'EBRD Ingest', icon: Globe, schedule: 'Daily', scheduleMinutes: 1440, fn: agentApi.runEbrdIngest },
  { type: 'iadb-ingest', name: 'IADB Ingest', icon: Globe, schedule: 'Daily', scheduleMinutes: 1440, fn: () => agentApi.runIadbIngest({ status: 'Active,Implementation', limit: 300 }) },
  { type: 'aiib-ingest', name: 'AIIB Ingest', icon: Globe, schedule: 'Daily', scheduleMinutes: 1440, fn: agentApi.runAiibIngest },
  { type: 'gem-ingest', name: 'GEM Power Tracker', icon: Globe, schedule: 'Hourly (backfill)', scheduleMinutes: 60, fn: () => agentApi.runGemIngest({ mode: 'backfill' }) },
  { type: 'eib-ingest', name: 'EIB Ingest', icon: Globe, schedule: 'Hourly (backfill)', scheduleMinutes: 60, fn: () => agentApi.runEibIngest({ mode: 'backfill' }) },
  { type: 'ted-ingest', name: 'TED Tenders', icon: Gavel, schedule: 'Daily', scheduleMinutes: 1440, fn: () => agentApi.runTedIngest({ days: 3 }) },
  { type: 'uk-fts-ingest', name: 'UK Find a Tender', icon: Gavel, schedule: 'Daily', scheduleMinutes: 1440, fn: () => agentApi.runUkFtsIngest({ days: 2 }) },
  { type: 'wb-procurement-ingest', name: 'World Bank Procurement', icon: Gavel, schedule: 'Every 6h', scheduleMinutes: 360, fn: () => agentApi.runWbProcurementIngest({ days: 2 }) },
  { type: 'za-etenders-ingest', name: 'South Africa eTenders', icon: Gavel, schedule: 'Daily', scheduleMinutes: 1440, fn: () => agentApi.runZaEtendersIngest({ days: 3 }) },
  { type: 'project-news-monitor', name: 'Project News (GDELT)', icon: Newspaper, schedule: 'Hourly', scheduleMinutes: 60, fn: () => agentApi.runProjectNewsMonitor({ limit: 10 }) },
  { type: 'update-check', name: 'Update Checker', icon: RefreshCw, schedule: 'Every 2 hours', scheduleMinutes: 120, fn: agentApi.runUpdateChecker },
  { type: 'risk-scoring', name: 'Risk Scorer', icon: ShieldAlert, schedule: 'Every 4 hours', scheduleMinutes: 240, fn: agentApi.runRiskScorer },
  { type: 'health-scoring', name: 'Health Score', icon: Heart, schedule: 'Every 6 hours', scheduleMinutes: 360, fn: agentApi.runHealthScoreAgent },
  { type: 'contractor-intel', name: 'Contractor Intel', icon: HardHat, schedule: 'Every 6 hours', scheduleMinutes: 360, fn: agentApi.runContractorIntelAgent },
  { type: 'stakeholder-intel', name: 'Stakeholder Intel', icon: Users, schedule: 'Every 6 hours', scheduleMinutes: 360, fn: agentApi.runStakeholderIntel },
  { type: 'funding-tracker', name: 'Funding Tracker', icon: DollarSign, schedule: 'Every 4 hours', scheduleMinutes: 240, fn: agentApi.runFundingTracker },
  { type: 'regulatory-monitor', name: 'Regulatory Monitor', icon: Scale, schedule: 'Every 3 hours', scheduleMinutes: 180, fn: agentApi.runRegulatoryMonitor },
  { type: 'sentiment-analyzer', name: 'Sentiment Analyzer', icon: MessageSquare, schedule: 'Every 2 hours', scheduleMinutes: 120, fn: agentApi.runSentimentAnalyzer },
  { type: 'supply-chain-monitor', name: 'Supply Chain', icon: Package, schedule: 'Every 4 hours', scheduleMinutes: 240, fn: agentApi.runSupplyChainMonitor },
  { type: 'market-intel', name: 'Market Intel', icon: TrendingUp, schedule: 'Every 6 hours', scheduleMinutes: 360, fn: agentApi.runMarketIntel },
  { type: 'contact-finder', name: 'Contact Finder', icon: Phone, schedule: 'Every 3 hours', scheduleMinutes: 180, fn: agentApi.runContactFinder },
  { type: 'alert-intelligence', name: 'Alert Intelligence', icon: AlertTriangle, schedule: 'Every 4 hours', scheduleMinutes: 240, fn: agentApi.runAlertIntelligence },
  { type: 'data-enrichment', name: 'Data Enrichment', icon: Database, schedule: 'Every 2 hours', scheduleMinutes: 120, fn: agentApi.runDataEnrichment },
  { type: 'digest-agent', name: 'Digest Agent', icon: Mail, schedule: 'Daily', scheduleMinutes: 1440, fn: () => agentApi.runDigestAgent() },
  { type: 'dataset-refresh', name: 'Dataset Refresh', icon: Database, schedule: 'Hourly', scheduleMinutes: 60, fn: () => agentApi.runDatasetRefresh({ dataset_key: 'projects_v1' }) },
  { type: 'report-agent', name: 'Report Agent', icon: FileText, schedule: 'Weekly', scheduleMinutes: 10080, fn: () => agentApi.runReportAgent({ report_type: 'weekly_market_snapshot', days: 7 }) },
  { type: 'entity-dedup', name: 'Entity Dedup', icon: GitMerge, schedule: 'Daily', scheduleMinutes: 1440, fn: agentApi.runEntityDedup },
  { type: 'corporate-ma-monitor', name: 'Corporate / M&A', icon: Building2, schedule: 'Every 6 hours', scheduleMinutes: 360, fn: agentApi.runCorporateMaMonitor },
  { type: 'esg-social-monitor', name: 'ESG & Social', icon: Leaf, schedule: 'Every 4 hours', scheduleMinutes: 240, fn: agentApi.runEsgSocialMonitor },
  { type: 'security-resilience', name: 'Security & Resilience', icon: Shield, schedule: 'Every 4 hours', scheduleMinutes: 240, fn: agentApi.runSecurityResilience },
  { type: 'tender-award-monitor', name: 'Tender / Award', icon: Gavel, schedule: 'Every 4 hours', scheduleMinutes: 240, fn: agentApi.runTenderAwardMonitor },
  { type: 'executive-briefing', name: 'Executive Briefing', icon: ScrollText, schedule: 'Daily', scheduleMinutes: 1440, fn: agentApi.runExecutiveBriefing },
  { type: 'source-ingest', name: 'Source Ingest', icon: Globe, schedule: 'On demand', scheduleMinutes: 0, fn: () => {
    const url = window.prompt('Enter the source URL to ingest (e.g. https://example.com/projects):');
    if (!url) return Promise.resolve();
    const source_key = window.prompt('Optional source key (leave blank to auto-detect):') || undefined;
    return agentApi.runSourceIngest({ url, source_key });
  } },
  { type: 'user-research', name: 'User Research', icon: Search, schedule: 'On demand', scheduleMinutes: 0, fn: () => {
    const query = window.prompt('Enter a research query (e.g. "Solar projects in Vietnam 2025"):');
    if (!query) return Promise.resolve();
    return agentApi.runUserResearch(query);
  } },
  { type: 'insight-sources', name: 'Insight Sources', icon: Zap, schedule: 'On demand', scheduleMinutes: 0, fn: () => agentApi.runInsightSourcesAgent() },
];

export interface LogEntry {
  id: string;
  task_type: string;
  status: string;
  query: string;
  error: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

export interface SchedulerActivity {
  task_type: string;
  last_scheduler_run: string | null;
  scheduler_runs: number;
  scheduler_failures: number;
}

export interface AgentConfigRow {
  agent_type: string;
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  success_count: number;
  failure_count: number;
  last_duration_ms: number | null;
}

export interface AgentMonitoringSummary {
  agent_configs: AgentConfigRow[];
  recent_tasks: TaskRow[];
  latest_tasks: TaskRow[];
  totals: {
    total_runs: number;
    completed: number;
    failed: number;
    running: number;
  };
}

export interface PipelineSummary {
  candidate_counts?: Record<string, number>;
  source_health?: { total_sources?: number; active_sources?: number; failing_sources?: number; stale_sources?: number };
  quality?: { avg_score?: number; approve_ready?: number; needs_research?: number; missing_source?: number };
  review?: { pending_candidates?: number; high_confidence_pending?: number; update_proposals?: number };
  agent_events?: { events_24h?: number; errors_24h?: number };
}

export const PAGE_SIZE = 1000;

export async function fetchRecentResearchTasks(): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from('research_tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .range(0, PAGE_SIZE - 1);
  if (error) throw error;
  return (data ?? []) as unknown as TaskRow[];
}

export const WORKFLOW_STEPS = ['Searching', 'Extracting', 'Analyzing', 'Saving'];
