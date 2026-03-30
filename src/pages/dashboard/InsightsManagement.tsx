import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useInsights,
  type Insight,
  type InsightSource,
  getDisplaySources,
} from '@/hooks/use-insights';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sparkles,
  Eye,
  EyeOff,
  Trash2,
  Loader2,
  BookOpen,
  PenLine,
  FileText,
  Pencil,
  Plus,
  Link2,
  Bot,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { agentApi } from '@/lib/api/agents';
import { runClientInsightSourcesBackfill } from '@/lib/insight-sources-backfill';
import { useEntitlements } from '@/hooks/useEntitlements';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';
import { isEntitlementOrQuotaError } from '@/lib/billing/functionsErrors';

type EditForm = {
  title: string;
  excerpt: string;
  content: string;
  tag: string;
  reading_time_min: number;
  sources: InsightSource[];
};

function emptySource(): InsightSource {
  return { label: '', url: '' };
}

function insightToEditForm(insight: Insight): EditForm {
  const refs = getDisplaySources(insight);
  return {
    title: insight.title,
    excerpt: insight.excerpt,
    content: insight.content,
    tag: insight.tag,
    reading_time_min: insight.reading_time_min,
    sources: refs.length ? refs : [emptySource()],
  };
}

/** Same lightweight Markdown-ish rendering as the public insight page. */
function InsightBodyPreview({ content }: { content: string }) {
  return (
    <div
      className="prose prose-invert prose-sm max-w-none
      prose-headings:font-serif prose-headings:text-foreground
      prose-p:text-muted-foreground prose-p:leading-relaxed
      prose-strong:text-foreground
      prose-li:text-muted-foreground
      prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
    >
      {content.split('\n').map((line, i) => {
        if (line.startsWith('## ')) return <h2 key={i}>{line.slice(3)}</h2>;
        if (line.startsWith('### ')) return <h3 key={i}>{line.slice(4)}</h3>;
        if (line.startsWith('- **')) {
          const match = line.match(/^- \*\*(.+?)\*\*:?\s*(.*)/);
          if (match)
            return (
              <li key={i}>
                <strong>{match[1]}</strong>
                {match[2] ? `: ${match[2]}` : ''}
              </li>
            );
        }
        if (line.startsWith('- ')) return <li key={i}>{line.slice(2)}</li>;
        if (line.match(/^\d+\.\s/)) return <li key={i}>{line.replace(/^\d+\.\s/, '')}</li>;
        if (line.trim() === '') return <br key={i} />;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

function SourcesList({ sources }: { sources: InsightSource[] }) {
  if (!sources.length) {
    return (
      <p className="text-sm text-muted-foreground/70 italic">
        No references attached to this article.
      </p>
    );
  }
  return (
    <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
      {sources.map((s, idx) => (
        <li key={`${s.url}-${idx}`} className="break-all pl-1">
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {s.label || s.url}
          </a>
        </li>
      ))}
    </ol>
  );
}

export default function InsightsManagement() {
  const { data: insights = [], isLoading } = useInsights(false);
  const [generating, setGenerating] = useState(false);
  const [topic, setTopic] = useState('');
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canGenerate = hasRole('admin') || hasRole('researcher');
  const canReview = canGenerate;
  const canPublish = canGenerate;
  const canDeleteInsight = hasRole('admin');

  const { canUseAi, refresh: refreshEntitlements } = useEntitlements();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const [viewing, setViewing] = useState<Insight | null>(null);
  const [viewingLoading, setViewingLoading] = useState(false);
  const [editing, setEditing] = useState<{ id: string; form: EditForm } | null>(null);
  const [saving, setSaving] = useState(false);
  const [backfillMode, setBackfillMode] = useState<'missing' | 'all' | null>(null);

  const openView = async (insight: Insight) => {
    if (insight.content) { setViewing(insight); return; }
    setViewingLoading(true);
    setViewing(insight); // open dialog immediately with metadata
    const { data } = await supabase.from('insights').select('*').eq('id', insight.id).single();
    if (data) setViewing(data as Insight);
    setViewingLoading(false);
  };

  const openEdit = async (insight: Insight) => {
    if (insight.content) { setEditing({ id: insight.id, form: insightToEditForm(insight) }); return; }
    const { data } = await supabase.from('insights').select('*').eq('id', insight.id).single();
    if (data) setEditing({ id: insight.id, form: insightToEditForm(data as Insight) });
  };

  const generateInsight = async () => {
    if (!canUseAi) {
      setUpgradeOpen(true);
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-insight', {
        body: { topic: topic.trim() || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Insight generated! Review it below and publish when ready.');
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      void refreshEntitlements();
      setTopic('');
    } catch (e: unknown) {
      if (isEntitlementOrQuotaError(e)) {
        setUpgradeOpen(true);
        return;
      }
      const msg = e instanceof Error ? e.message : 'Failed to generate insight';
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const togglePublish = async (insight: Insight) => {
    const { error } = await supabase
      .from('insights')
      .update({ published: !insight.published })
      .eq('id', insight.id);
    if (error) {
      toast.error('Failed to update');
      return;
    }
    toast.success(insight.published ? 'Unpublished' : 'Published');
    queryClient.invalidateQueries({ queryKey: ['insights'] });
  };

  const deleteInsight = async (id: string) => {
    const { error } = await supabase.from('insights').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete');
      return;
    }
    toast.success('Deleted');
    queryClient.invalidateQueries({ queryKey: ['insights'] });
  };

  const saveDraft = async () => {
    if (!editing) return;
    const { id, form } = editing;
    const sources = form.sources
      .map((s) => ({
        label: s.label.trim() || 'Reference',
        url: s.url.trim(),
      }))
      .filter((s) => s.url.startsWith('http'));

    setSaving(true);
    try {
      const { error } = await supabase
        .from('insights')
        .update({
          title: form.title.trim(),
          excerpt: form.excerpt.trim(),
          content: form.content,
          tag: form.tag.trim(),
          reading_time_min: Math.max(1, Math.round(form.reading_time_min) || 1),
          sources,
        })
        .eq('id', id);
      if (error) throw error;
      toast.success('Insight saved');
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      setEditing(null);
    } catch (e: unknown) {
      const err = e as { message?: string };
      let msg = err.message || (e instanceof Error ? e.message : 'Failed to save');
      if (/column|sources/i.test(msg)) {
        msg += ' — Apply the `insights.sources` migration on Supabase if you have not yet.';
      }
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const runSourcesAgent = async (scope: 'missing' | 'all') => {
    if (!canUseAi) {
      setUpgradeOpen(true);
      return;
    }
    setBackfillMode(scope);
    try {
      const data = (await agentApi.runInsightSourcesAgent({
        scope,
        use_ai: true,
      })) as {
        error?: string;
        processed?: number;
        updated?: number;
        would_update?: number;
        skipped?: number;
        truncated?: boolean;
      };
      if (data?.error) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      const updatedCount = data.would_update ?? data.updated ?? 0;
      toast.success(
        `Reference agent: processed ${data.processed ?? 0}, updated ${updatedCount}, skipped ${data.skipped ?? 0}${
          data.truncated ? ' — more rows remain; run again to continue.' : ''
        }`
      );
    } catch (e: unknown) {
      // Edge function failed for any reason — fall back to client-side extraction (no AI, but reliable)
      try {
        const summary = await runClientInsightSourcesBackfill(scope);
        queryClient.invalidateQueries({ queryKey: ['insights'] });
        toast.success(
          `References updated (client fallback): processed ${summary.processed}, updated ${summary.updated}, skipped ${summary.skipped}${
            summary.truncated ? ' — run again for more rows.' : ''
          }`
        );
      } catch (inner: unknown) {
        const outerMsg = e instanceof Error ? e.message : String(e);
        const innerMsg = inner instanceof Error ? inner.message : 'Reference backfill failed';
        toast.error(`${innerMsg} (agent error: ${outerMsg})`);
      }
    } finally {
      setBackfillMode(null);
    }
  };

  const published = insights.filter((i) => i.published).length;
  const drafts = insights.filter((i) => !i.published).length;

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-bold">Insights Management</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Total
            </div>
            <CardTitle className="text-2xl">{insights.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              Published
            </div>
            <CardTitle className="text-2xl">{published}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <PenLine className="h-3.5 w-3.5" />
              Drafts
            </div>
            <CardTitle className="text-2xl">{drafts}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="glass-panel border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Generate AI Insight
            </CardTitle>
            <p className="text-xs text-muted-foreground font-normal">
              Uses your plan&apos;s daily AI allowance. Need more? Start a trial or upgrade — only researchers can publish to the public site.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="text"
              placeholder="Optional topic (leave blank for AI to choose based on latest data)…"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <Button onClick={() => void generateInsight()} disabled={generating} size="sm" className="teal-glow">
              {generating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Generate Insight
                </>
              )}
            </Button>
          </CardContent>
        </Card>

      {canGenerate && (
        <Card className="glass-panel border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              Reference backfill agent
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Runs on <strong className="text-foreground">drafts and published</strong> insights: merges legacy{' '}
              <code className="text-xs">source_url</code>, extracts <code className="text-xs">https</code> links from
              the article body, then calls AI only when still empty. Processes up to 35 rows per run — repeat if
              truncated.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!!backfillMode}
                onClick={() => runSourcesAgent('missing')}
              >
                {backfillMode === 'missing' ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Running…
                  </>
                ) : (
                  <>
                    <Link2 className="h-3.5 w-3.5 mr-1.5" />
                    Fill missing references
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!!backfillMode}
                onClick={() => runSourcesAgent('all')}
              >
                {backfillMode === 'all' ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Running…
                  </>
                ) : (
                  <>
                    <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                    Re-scan all for new links
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} reason="ai" />

      <Card className="glass-panel border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
          ) : insights.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No insights yet. Generate one above — or check the public Insights page once the team publishes.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Title</TableHead>
                  <TableHead>Tag</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {insights.map((i) => (
                  <TableRow key={i.id} className="border-border/50">
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm truncate max-w-[300px]">{i.title}</p>
                        {i.ai_generated && (
                          <span className="text-[10px] text-amber-500">AI Generated</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {i.tag}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={i.published ? 'default' : 'outline'}
                        className={`text-xs ${i.published ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : ''}`}
                      >
                        {i.published ? 'Published' : 'Draft'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {format(new Date(i.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {i.published && i.slug && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" asChild title="View on site">
                            <Link to={`/insights/${i.slug}`} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        )}
                        {canReview && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openView(i)}
                              title="View draft / article"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openEdit(i)}
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {canPublish && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => togglePublish(i)}
                            title={i.published ? 'Unpublish' : 'Publish'}
                          >
                            {i.published ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                        {canDeleteInsight && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => deleteInsight(i.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0 sm:max-w-3xl">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle className="font-serif text-left pr-8">{viewing?.title}</DialogTitle>
            {/* asChild: Radix Description is a <p> by default — block badges must live in a <div> */}
            <DialogDescription asChild>
              <div className="text-left space-y-2 text-sm text-muted-foreground">
                {viewing && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {viewing.tag}
                    </Badge>
                    <Badge
                      variant={viewing.published ? 'default' : 'outline'}
                      className={`text-xs ${viewing.published ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : ''}`}
                    >
                      {viewing.published ? 'Published' : 'Draft'}
                    </Badge>
                    {viewing.ai_generated && (
                      <Badge variant="outline" className="border-amber-500/30 text-amber-500 text-xs">
                        AI Generated
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 max-h-[min(70vh,560px)] px-6">
            <div className="space-y-6 pb-6">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                  <Link2 className="h-4 w-4" />
                  Sources &amp; references
                </div>
                {viewing && <SourcesList sources={getDisplaySources(viewing)} />}
              </div>
              {viewingLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading article…
                </div>
              ) : viewing?.content ? (
                <InsightBodyPreview content={viewing.content} />
              ) : null}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && !saving && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col gap-0 p-0 sm:max-w-3xl">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle className="text-left">Edit insight</DialogTitle>
            <DialogDescription className="text-left">
              Update copy, tag, and references. Researchers and admins can publish at any time.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 max-h-[min(72vh,520px)] px-6">
            {editing && (
              <div className="space-y-4 pb-4">
                <div className="grid gap-2">
                  <Label htmlFor="ins-title">Title</Label>
                  <Input
                    id="ins-title"
                    value={editing.form.title}
                    onChange={(e) =>
                      setEditing((prev) =>
                        prev ? { ...prev, form: { ...prev.form, title: e.target.value } } : null
                      )
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ins-excerpt">Excerpt</Label>
                  <Textarea
                    id="ins-excerpt"
                    rows={2}
                    value={editing.form.excerpt}
                    onChange={(e) =>
                      setEditing((prev) =>
                        prev ? { ...prev, form: { ...prev.form, excerpt: e.target.value } } : null
                      )
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="ins-tag">Tag</Label>
                    <Input
                      id="ins-tag"
                      value={editing.form.tag}
                      onChange={(e) =>
                        setEditing((prev) =>
                          prev ? { ...prev, form: { ...prev.form, tag: e.target.value } } : null
                        )
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ins-read">Reading time (min)</Label>
                    <Input
                      id="ins-read"
                      type="number"
                      min={1}
                      value={editing.form.reading_time_min}
                      onChange={(e) =>
                        setEditing((prev) =>
                          prev
                            ? {
                                ...prev,
                                form: {
                                  ...prev.form,
                                  reading_time_min: Number(e.target.value) || 1,
                                },
                              }
                            : null
                        )
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ins-content">Content (Markdown)</Label>
                  <Textarea
                    id="ins-content"
                    rows={12}
                    className="font-mono text-xs"
                    value={editing.form.content}
                    onChange={(e) =>
                      setEditing((prev) =>
                        prev ? { ...prev, form: { ...prev.form, content: e.target.value } } : null
                      )
                    }
                  />
                </div>
                <div className="space-y-3 rounded-lg border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-foreground">Sources (ordered)</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() =>
                        setEditing((prev) =>
                          prev
                            ? {
                                ...prev,
                                form: {
                                  ...prev.form,
                                  sources: [...prev.form.sources, emptySource()],
                                },
                              }
                            : null
                        )
                      }
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Each row is a verifiable link (https). Used on the public article and for publish checks.
                  </p>
                  {editing.form.sources.map((row, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
                      <div className="flex-1 grid gap-1">
                        <span className="text-[10px] text-muted-foreground">Label</span>
                        <Input
                          placeholder="e.g. Ministry press release"
                          value={row.label}
                          onChange={(e) => {
                            const v = e.target.value;
                            setEditing((prev) => {
                              if (!prev) return null;
                              const next = [...prev.form.sources];
                              next[idx] = { ...next[idx], label: v };
                              return { ...prev, form: { ...prev.form, sources: next } };
                            });
                          }}
                        />
                      </div>
                      <div className="flex-[2] grid gap-1">
                        <span className="text-[10px] text-muted-foreground">URL</span>
                        <Input
                          placeholder="https://…"
                          value={row.url}
                          onChange={(e) => {
                            const v = e.target.value;
                            setEditing((prev) => {
                              if (!prev) return null;
                              const next = [...prev.form.sources];
                              next[idx] = { ...next[idx], url: v };
                              return { ...prev, form: { ...prev.form, sources: next } };
                            });
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-destructive"
                        title="Remove row"
                        onClick={() =>
                          setEditing((prev) => {
                            if (!prev) return null;
                            const next = prev.form.sources.filter((_, i) => i !== idx);
                            return {
                              ...prev,
                              form: {
                                ...prev.form,
                                sources: next.length ? next : [emptySource()],
                              },
                            };
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
          <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveDraft} disabled={saving} className="teal-glow">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
