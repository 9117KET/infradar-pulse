import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface TrackedProject {
  id: string;
  user_id: string;
  project_id: string;
  notes: string;
  created_at: string;
}

export function useTrackedProjects() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: trackedProjects = [], isLoading } = useQuery({
    queryKey: ['tracked-projects', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('tracked_projects' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as TrackedProject[];
    },
    enabled: !!user,
  });

  const trackedIds = new Set(trackedProjects.map(t => t.project_id));

  const trackProject = useMutation({
    mutationFn: async (projectId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('tracked_projects' as any).insert({
        user_id: user.id,
        project_id: projectId,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tracked-projects'] }),
  });

  const untrackProject = useMutation({
    mutationFn: async (projectId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('tracked_projects' as any)
        .delete()
        .eq('user_id', user.id)
        .eq('project_id', projectId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tracked-projects'] }),
  });

  const isTracked = (projectId: string) => trackedIds.has(projectId);

  const toggleTrack = async (projectId: string) => {
    if (isTracked(projectId)) {
      await untrackProject.mutateAsync(projectId);
    } else {
      await trackProject.mutateAsync(projectId);
    }
  };

  return { trackedProjects, isLoading, isTracked, toggleTrack, trackProject, untrackProject };
}
