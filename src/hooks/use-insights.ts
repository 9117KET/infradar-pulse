import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Verifiable references shown on articles and in the management UI. */
export interface InsightSource {
  label: string;
  url: string;
}

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
  source_url: string | null;
  /** JSON array from DB — use `normalizeInsightSources` */
  sources?: unknown;
}

export function normalizeInsightSources(raw: unknown): InsightSource[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object')
    .map((x) => ({
      label: typeof x.label === 'string' && x.label.trim() ? x.label.trim() : 'Reference',
      url: typeof x.url === 'string' ? x.url.trim() : '',
    }))
    .filter((s) => s.url.length > 0);
}

/** Merges JSON `sources` with legacy `source_url`, deduped by URL (JSON order first). */
export function getDisplaySources(insight: Insight): InsightSource[] {
  const fromJson = normalizeInsightSources(insight.sources);
  const legacy =
    insight.source_url && String(insight.source_url).trim().startsWith('http')
      ? [{ label: 'Primary source', url: String(insight.source_url).trim() }]
      : [];
  const seen = new Set<string>();
  const out: InsightSource[] = [];
  for (const s of [...fromJson, ...legacy]) {
    const u = s.url;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(s);
  }
  return out;
}

export function useInsights(publishedOnly = true) {
  return useQuery({
    queryKey: ['insights', publishedOnly],
    queryFn: async () => {
      let query = supabase.from('insights').select('*').order('created_at', { ascending: false });
      if (publishedOnly) {
        query = query.eq('published', true);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Insight[];
    },
  });
}

export function useInsight(slug: string) {
  return useQuery({
    queryKey: ['insight', slug],
    queryFn: async () => {
      const { data, error } = await supabase.from('insights').select('*').eq('slug', slug).single();
      if (error) throw error;
      return data as Insight;
    },
    enabled: !!slug,
  });
}
