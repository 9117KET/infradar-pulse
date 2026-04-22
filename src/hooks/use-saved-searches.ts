import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface SavedSearch {
  id: string;
  user_id: string;
  name: string;
  filters: Record<string, unknown>;
  notify_email: boolean;
  created_at: string;
}

export function useSavedSearches() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: savedSearches = [], isLoading } = useQuery<SavedSearch[]>({
    queryKey: ['saved-searches', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('saved_searches')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SavedSearch[];
    },
    enabled: !!user,
  });

  const saveSearch = useMutation({
    mutationFn: async ({ name, filters, notifyEmail = false }: { name: string; filters: Record<string, unknown>; notifyEmail?: boolean }) => {
      const { error } = await supabase.from('saved_searches').insert([{
        user_id: user!.id,
        name,
        filters: filters as any,
        notify_email: notifyEmail,
      }]);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-searches'] }),
  });

  const deleteSearch = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('saved_searches').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-searches'] }),
  });

  const updateNotify = useMutation({
    mutationFn: async ({ id, notifyEmail }: { id: string; notifyEmail: boolean }) => {
      const { error } = await supabase.from('saved_searches').update({ notify_email: notifyEmail }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-searches'] }),
  });

  return { savedSearches, isLoading, saveSearch, deleteSearch, updateNotify };
}
