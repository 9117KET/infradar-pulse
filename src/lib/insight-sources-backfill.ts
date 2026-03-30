/**
 * Client-side backfill when the insight-sources-agent Edge Function is unreachable
 * (not deployed, CORS, network). Mirrors extract + merge logic from the edge function — no AI.
 */
import { supabase } from '@/integrations/supabase/client';
import { getDisplaySources, type Insight, type InsightSource } from '@/hooks/use-insights';

const MAX_PER_RUN = 35;

function mergeDedupe(sources: InsightSource[]): InsightSource[] {
  const seen = new Set<string>();
  const out: InsightSource[] = [];
  for (const s of sources) {
    const u = s.url.replace(/[.,;]+$/, '');
    if (!u.startsWith('http')) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push({ ...s, url: u });
  }
  return out;
}

/** Pull https links from Markdown and plain text (deduped). Matches edge function. */
export function extractUrlsFromText(text: string): InsightSource[] {
  const out: InsightSource[] = [];
  const seen = new Set<string>();
  const push = (label: string, url: string) => {
    const u = url.replace(/[.,;]+$/, '');
    if (!u.startsWith('http')) return;
    if (seen.has(u)) return;
    seen.add(u);
    out.push({ label: label.trim() || 'Reference', url: u });
  };

  const md = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = md.exec(text)) !== null) {
    push(m[1] || 'Reference', m[2]);
  }

  const bare = /https?:\/\/[^\s\])"'<>]+/g;
  while ((m = bare.exec(text)) !== null) {
    push('Source', m[0]);
  }

  return out;
}

export type ClientBackfillSummary = {
  processed: number;
  updated: number;
  skipped: number;
  truncated: boolean;
  clientFallback: true;
};

export async function runClientInsightSourcesBackfill(
  scope: 'missing' | 'all',
): Promise<ClientBackfillSummary> {
  const { data: rows, error } = await supabase
    .from('insights' as never)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(250);

  if (error) throw error;

  let list = (rows || []) as Insight[];
  if (scope === 'missing') {
    list = list.filter((r) => getDisplaySources(r).length === 0);
  }

  const batch = list.slice(0, MAX_PER_RUN);
  let updated = 0;
  let skipped = 0;

  for (const row of batch) {
    const prevSources = getDisplaySources(row);
    const before = prevSources.length;
    const extracted = extractUrlsFromText(`${row.excerpt}\n\n${row.content}`);
    const merged = mergeDedupe([...prevSources, ...extracted]);

    if (merged.length === 0) {
      skipped++;
      continue;
    }

    const prevUrls = new Set(prevSources.map((s) => s.url));
    const mergedUrls = new Set(merged.map((s) => s.url));
    const sameUrls =
      prevUrls.size === mergedUrls.size && [...prevUrls].every((u) => mergedUrls.has(u));
    if (scope === 'all' && before > 0 && sameUrls) {
      skipped++;
      continue;
    }

    const { error: upErr } = await supabase
      .from('insights' as never)
      .update({ sources: merged } as never)
      .eq('id', row.id);

    if (upErr) {
      skipped++;
      continue;
    }
    updated++;
  }

  return {
    processed: batch.length,
    updated,
    skipped,
    truncated: list.length > MAX_PER_RUN,
    clientFallback: true,
  };
}
