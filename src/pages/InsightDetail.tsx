import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  useInsightMeta,
  useInsightContent,
  getDisplaySources,
  type Insight,
} from '@/hooks/use-insights';
import { useAuth } from '@/contexts/AuthContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useCopyProtection } from '@/hooks/useCopyProtection';
import { trackUsage } from '@/lib/billing/trackUsage';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Clock, User, Calendar, Link2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

export default function InsightDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const { staffBypass, canReadInsightFull, isFreeTier, plan, loading: entLoading, refresh } = useEntitlements();
  const countedRef = useRef(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const { toast } = useToast();

  // Phase 1: Always fetch metadata - never contains the article body.
  // This is safe to call unconditionally and for all users.
  const { data: insight, isLoading, error } = useInsightMeta(slug || '');

  // Entitlement decision:
  // - Anonymous users (not logged in): always see full content (public marketing page)
  // - Staff (admin/researcher): always bypass
  // - Signed-in users with quota remaining: see full content
  // - Signed-in users over daily limit: see excerpt + upgrade prompt only
  // We wait until entitlements have loaded before showing content to avoid
  // a flash where content renders then disappears.
  const showFullContent = !user || staffBypass || (!entLoading && canReadInsightFull);

  // Phase 2: Fetch the article body ONLY when the user is entitled.
  // Content is never sent to the browser when showFullContent is false.
  const { data: contentData, isLoading: contentLoading } = useInsightContent(
    insight?.id,
    // Enable the content query only when we know the user can read it.
    // entLoading guard prevents a brief flash where content fetches then
    // entitlements arrive and block it.
    showFullContent && !entLoading,
  );

  // For staff editing their own articles (InsightsManagement sends full Insight
  // via slug), merge content from Phase 2 into the metadata shape.
  const fullInsight: Insight | null = insight && contentData
    ? { ...insight, content: contentData.content, source_url: contentData.source_url, sources: contentData.sources }
    : insight
      ? { ...insight, content: '' }
      : null;

  // Throttle copy/paste for free + trial users so the article body can't be
  // bulk-lifted into a doc. Paid plans get a normal experience.
  const protectContent = !!user && !staffBypass && (isFreeTier || plan === 'trialing');
  const copyProps = useCopyProtection(
    protectContent,
    `Excerpted from InfraRadar — full article: ${typeof window !== 'undefined' ? window.location.href : 'infraradar.app'} · Subscribe for unlimited access.`,
  );

  useEffect(() => {
    countedRef.current = false;
  }, [slug]);

  // Auto-open upgrade prompt when a signed-in user has hit their daily limit.
  useEffect(() => {
    if (user && !entLoading && !staffBypass && !canReadInsightFull) {
      setUpgradeOpen(true);
    }
  }, [user, entLoading, staffBypass, canReadInsightFull]);

  // Track insight read once per page load, after content is confirmed accessible.
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

  // References: merge from content phase when available, else metadata-level sources.
  const references = getDisplaySources(
    fullInsight && contentData ? { ...insight, source_url: contentData.source_url, sources: contentData.sources } : insight
  );

  return (
    <div className="py-20">
      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} reason="insight" />
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Link to="/insights" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" /> Back to Insights
        </Link>

        <div className="flex items-center gap-3 mb-4">
          <Badge variant="outline" className="border-primary/30 text-primary text-xs">{insight.tag}</Badge>
          {insight.ai_generated && (
            <Badge variant="outline" className="border-amber-500/30 text-amber-500 text-xs">AI Generated</Badge>
          )}
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl font-bold mb-4 leading-tight">{insight.title}</h1>

        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-8 pb-8 border-b border-border">
          <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> {insight.author}</span>
          <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {format(new Date(insight.created_at), 'MMM d, yyyy')}</span>
          <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {insight.reading_time_min} min read</span>
        </div>

        {/* Gate: user is signed in but over their daily limit */}
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

        {/* Content: only renders when showFullContent is true AND content has been fetched */}
        {showFullContent && (
          <div
            {...copyProps}
            className={`prose prose-invert prose-sm max-w-none
              prose-headings:font-serif prose-headings:text-foreground
              prose-p:text-muted-foreground prose-p:leading-relaxed
              prose-strong:text-foreground
              prose-li:text-muted-foreground
              prose-a:text-primary prose-a:no-underline hover:prose-a:underline
              ${copyProps.className}
            `}
          >
            {/* Show loading state while entitlements are resolving or content is fetching */}
            {entLoading || contentLoading ? (
              <p className="text-muted-foreground animate-pulse">Loading article…</p>
            ) : contentData?.content ? (
              contentData.content.split('\n').map((line, i) => {
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
            ) : null}
          </div>
        )}

        {showFullContent && !entLoading && !contentLoading && references.length > 0 && (
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
