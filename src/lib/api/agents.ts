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
  runContactFinder: () => invokeAgent('contact-finder'),
  runAlertIntelligence: () => invokeAgent('alert-intelligence'),
  runDataEnrichment: () => invokeAgent('data-enrichment'),
};
