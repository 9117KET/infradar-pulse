import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEntitlements } from '@/hooks/useEntitlements';
import { getReadRowCap } from '@/lib/billing/readCaps';

/** Verifiable references shown on articles and in the management UI. */
export interface InsightSource {
  label: string;
  url: string;
}

/**
 * Metadata-only shape returned by list queries and the detail metadata phase.
 * `content` is deliberately absent so it is never sent to the browser until
 * the user's entitlement is confirmed.
 */
export interface InsightMeta {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
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
  /** JSON array from DB - use `normalizeInsightSources` */
  sources?: unknown;
}

/**
 * Full insight including body content. Only used when the user's entitlement
 * has been verified client-side so content is not sent to unentitled browsers.
 */
export interface Insight extends InsightMeta {
  content: string;
}

// Columns fetched for list views - content excluded to save bandwidth and
// avoid delivering article bodies to users who only see a card list.
const LIST_COLUMNS =
  'id,title,slug,excerpt,tag,cover_image_url,author,published,ai_generated,related_project_ids,reading_time_min,created_at,updated_at,source_url,sources';

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
export function getDisplaySources(insight: InsightMeta): InsightSource[] {
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

/**
 * Fetches the insight list (metadata only, no content field).
 * Subscribes to Supabase realtime so the list updates live when researchers
 * publish or update articles.
 */
export function useInsights(publishedOnly = true) {
  const queryClient = useQueryClient();
  const { plan, staffBypass, isAnonymous, loading: entLoading } = useEntitlements();
  // Anonymous visitors bypass per-user caps (marketing page).
  // Signed-in free/trial users are capped to prevent scraping.
  const rowCap = isAnonymous ? 0 : getReadRowCap(plan, staffBypass);
  const queryKey = ['insights', publishedOnly, rowCap];

  const result = useQuery({
    queryKey,
    staleTime: 30_000,
    enabled: !entLoading,
    queryFn: async () => {
      let query = supabase
        .from('insights')
        .select(LIST_COLUMNS)
        .order('created_at', { ascending: false });
      if (publishedOnly) query = query.eq('published', true);
      if (rowCap > 0) query = query.limit(rowCap);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as InsightMeta[];
    },
  });

  // Real-time: invalidate whenever insights are inserted, updated, or deleted.
  // The insights table is already in the supabase_realtime publication.
  useEffect(() => {
    const channel = supabase
      .channel('insights-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'insights' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['insights'] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return result;
}

/**
 * Fetches insight METADATA only (no content field) by slug.
 * Safe to call unconditionally - never delivers article body to the browser.
 */
export function useInsightMeta(slug: string) {
  return useQuery({
    queryKey: ['insight-meta', slug],
    staleTime: 60_000,
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('insights')
        .select(LIST_COLUMNS)
        .eq('slug', slug)
        .single();
      if (error) throw error;
      return data as InsightMeta;
    },
  });
}

/**
 * Fetches ONLY the content field for a known insight id.
 * The `enabled` flag must be set to true only after entitlement is confirmed,
 * so the article body is never sent to browsers of users over their daily limit.
 */
export function useInsightContent(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['insight-content', id],
    staleTime: 120_000,
    enabled: !!id && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('insights')
        .select('id,content,source_url,sources')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as Pick<Insight, 'id' | 'content' | 'source_url' | 'sources'>;
    },
  });
}

/**
 * @deprecated Use `useInsightMeta` + `useInsightContent` instead.
 * Kept for backward compatibility with InsightsManagement which needs full
 * content for the editor - staff-only page so entitlement bypass applies.
 */
export function useInsight(slug: string) {
  return useQuery({
    queryKey: ['insight', slug],
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('insights')
        .select('*')
        .eq('slug', slug)
        .single();
      if (error) throw error;
      return data as Insight;
    },
    enabled: !!slug,
  });
}
