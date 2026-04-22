import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface AlertRuleFilters {
  severity?: string[];
  categories?: string[];
  regions?: string[];
  sectors?: string[];
}

export interface AlertRule {
  id: string;
  user_id: string;
  name: string;
  filters: AlertRuleFilters;
  enabled: boolean;
  created_at: string;
}

export function useAlertRules() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['alert-rules', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('alert_rules')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as AlertRule[];
    },
    enabled: !!user,
  });

  const createRule = useMutation({
    mutationFn: async (input: { name: string; filters: AlertRuleFilters }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('alert_rules').insert([{
        user_id: user.id,
        name: input.name,
        filters: input.filters as any,
        enabled: true,
      }]);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-rules'] }),
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from('alert_rules').update({ enabled }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-rules'] }),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('alert_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-rules'] }),
  });

  return { rules, isLoading, createRule, toggleRule, deleteRule };
}
