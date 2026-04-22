import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useInsight, getDisplaySources } from '@/hooks/use-insights';
import { useAuth } from '@/contexts/AuthContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { trackUsage } from '@/lib/billing/trackUsage';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Clock, User, Calendar, Link2 } from 'lucide-react';
import { format } from 'date-fns';

export default function InsightDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: insight, isLoading, error } = useInsight(slug || '');
  const { user } = useAuth();
  const { staffBypass, canReadInsightFull, loading: entLoading, refresh } = useEntitlements();
  const countedRef = useRef(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => {
    countedRef.current = false;
  }, [slug]);

  // Don't reveal content while entitlements are still loading — avoids flash
  const showFullContent =
    !user || staffBypass || (!entLoading && canReadInsightFull);

  // Auto-open upgrade prompt when user is signed-in and over the limit
  useEffect(() => {
    if (user && !entLoading && !staffBypass && !canReadInsightFull) {
      setUpgradeOpen(true);
    }
  }, [user, entLoading, staffBypass, canReadInsightFull]);

  useEffect(() => {
    if (!user || entLoading || !insight || !canReadInsightFull || staffBypass) return;
    if (countedRef.current) return;
    countedRef.current = true;
    void (async () => {
      const result = await trackUsage('insight_read');
      if (result.ok) {
        await refresh();
      } else if (result.emailUnverified) {
        toast({
          title: 'Confirm your email',
          description: result.message,
          variant: 'destructive',
        });
      } else if (result.overLimit) {
        setUpgradeOpen(true);
      }
    })();
  }, [user, entLoading, insight?.id, canReadInsightFull, staffBypass, refresh]);

  if (isLoading) {
    return (
      <div className="py-20 text-center">
        <div className="animate-pulse text-muted-foreground">Loading article…</div>
      </div>
    );
  }

  if (error || !insight) {
    return (
      <div className="py-20 text-center">
        <h1 className="font-serif text-2xl font-bold mb-4">Article not found</h1>
        <Link to="/insights" className="text-primary hover:underline">← Back to Insights</Link>
      </div>
    );
  }

  const references = getDisplaySources(insight);

  return (
    <div className="py-20">
      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} reason="insight" />
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Link to="/insights" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" /> Back to Insights
        </Link>

        <div className="flex items-center gap-3 mb-4">
          <Badge variant="outline" className="border-primary/30 text-primary text-xs">{insight.tag}</Badge>
          {insight.ai_generated && <Badge variant="outline" className="border-amber-500/30 text-amber-500 text-xs">AI Generated</Badge>}
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl font-bold mb-4 leading-tight">{insight.title}</h1>

        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-8 pb-8 border-b border-border">
          <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> {insight.author}</span>
          <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {format(new Date(insight.created_at), 'MMM d, yyyy')}</span>
          <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {insight.reading_time_min} min read</span>
        </div>

        {!showFullContent && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 mb-8 space-y-3">
            <p className="text-sm text-muted-foreground">
              You&apos;ve reached your daily limit for full insight reads on your current plan. Upgrade to keep reading with AI-assisted analysis and higher limits.
            </p>
            <p className="text-sm text-muted-foreground line-clamp-4">{insight.excerpt}</p>
            <div className="flex flex-wrap gap-2">
              <Button className="teal-glow" onClick={() => setUpgradeOpen(true)}>
                See upgrade options
              </Button>
              <Button variant="outline" asChild>
                <Link to="/pricing">View plans &amp; pricing</Link>
              </Button>
            </div>
          </div>
        )}

        {(showFullContent || (user && entLoading)) && (
          <div className="prose prose-invert prose-sm max-w-none
            prose-headings:font-serif prose-headings:text-foreground
            prose-p:text-muted-foreground prose-p:leading-relaxed
            prose-strong:text-foreground
            prose-li:text-muted-foreground
            prose-a:text-primary prose-a:no-underline hover:prose-a:underline
          ">
            {user && entLoading ? (
              <p className="text-muted-foreground animate-pulse">Loading article…</p>
            ) : (
            insight.content.split('\n').map((line, i) => {
              if (line.startsWith('## ')) return <h2 key={i}>{line.slice(3)}</h2>;
              if (line.startsWith('### ')) return <h3 key={i}>{line.slice(4)}</h3>;
              if (line.startsWith('- **')) {
                const match = line.match(/^- \*\*(.+?)\*\*:?\s*(.*)/);
                if (match) return <li key={i}><strong>{match[1]}</strong>{match[2] ? `: ${match[2]}` : ''}</li>;
              }
              if (line.startsWith('- ')) return <li key={i}>{line.slice(2)}</li>;
              if (line.match(/^\d+\.\s/)) return <li key={i}>{line.replace(/^\d+\.\s/, '')}</li>;
              if (line.trim() === '') return <br key={i} />;
              return <p key={i}>{line}</p>;
            })
            )}
          </div>
        )}

        {showFullContent && !entLoading && references.length > 0 && (
          <section className="mt-12 pt-8 border-t border-border">
            <h2 className="font-serif text-lg font-semibold mb-4 flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary shrink-0" />
              Sources &amp; references
            </h2>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              {references.map((s, idx) => (
                <li key={`${s.url}-${idx}`} className="break-all pl-1">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
