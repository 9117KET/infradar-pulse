import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Insight {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  tag: string;
  cover_image_url: string | null;
  author: string;
  published: boolean;
  ai_generated: boolean;
  related_project_ids: string[];
  reading_time_min: number;
  created_at: string;
  updated_at: string;
}

export function useInsights(publishedOnly = true) {
  return useQuery({
    queryKey: ['insights', publishedOnly],
    queryFn: async () => {
      let query = supabase.from('insights' as any).select('*').order('created_at', { ascending: false });
      if (publishedOnly) {
        query = query.eq('published', true);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as Insight[];
    },
  });
}

export function useInsight(slug: string) {
  return useQuery({
    queryKey: ['insight', slug],
    queryFn: async () => {
      const { data, error } = await (supabase.from('insights' as any).select('*').eq('slug', slug).single() as any);
      if (error) throw error;
      return data as unknown as Insight;
    },
    enabled: !!slug,
  });
}
