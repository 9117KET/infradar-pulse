import { supabase } from '@/integrations/supabase/client';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function invokeAgent(functionName: string) {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: {},
  });

  if (error) {
    throw new Error(error.message || `Failed to invoke ${functionName}`);
  }

  return data;
}

export const agentApi = {
  runResearchAgent: () => invokeAgent('research-agent'),
  runUpdateChecker: () => invokeAgent('update-checker'),
  runRiskScorer: () => invokeAgent('risk-scorer'),
};
