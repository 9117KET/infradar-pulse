import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '@/integrations/supabase/client';
import { InfradarLogo } from '@/components/InfradarLogo';
import { Button } from '@/components/ui/button';
import { ExternalLink, Loader2 } from 'lucide-react';

type SharedReport = {
  title: string | null;
  markdown: string | null;
  report_type: string;
  citations: { label: string; url: string }[] | null;
  created_at: string;
};

/**
 * Public, read-only view of a shared AI report (no auth required).
 * Resolves the token via the get_shared_report RPC, which only returns a single
 * valid, non-revoked, completed report — no other data is reachable from here.
 */
export default function SharedReport() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<'loading' | 'found' | 'missing'>('loading');
  const [report, setReport] = useState<SharedReport | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!token) { setState('missing'); return; }
      const { data, error } = await (supabase.rpc as any)('get_shared_report', { p_token: token });
      const row = Array.isArray(data) ? data[0] : data;
      if (!active) return;
      if (error || !row) { setState('missing'); return; }
      setReport(row as SharedReport);
      setState('found');
    })();
    return () => { active = false; };
  }, [token]);

  const citations = report?.citations ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <InfradarLogo size={28} />
            <span className="font-serif text-base font-semibold tracking-wide">INFRADARAI</span>
          </Link>
          <Button asChild size="sm" className="teal-glow">
            <Link to="/">Start free</Link>
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        {state === 'loading' && (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading report…
          </div>
        )}

        {state === 'missing' && (
          <div className="text-center py-24">
            <h1 className="font-serif text-xl font-semibold">Report not available</h1>
            <p className="text-sm text-muted-foreground mt-2">
              This link is invalid, expired, or has been revoked by its owner.
            </p>
            <Button asChild className="mt-6 teal-glow"><Link to="/">Explore InfraRadarAI</Link></Button>
          </div>
        )}

        {state === 'found' && report && (
          <article>
            <p className="text-[11px] uppercase tracking-wide text-primary">Shared infrastructure intelligence report</p>
            <h1 className="font-serif text-2xl font-semibold mt-1">{report.title || report.report_type}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Generated {new Date(report.created_at).toLocaleDateString()}
            </p>

            <div className="prose prose-invert prose-sm max-w-none mt-6 prose-headings:font-serif prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground prose-a:text-primary rounded-md border border-border/40 bg-muted/10 p-5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.markdown ?? ''}</ReactMarkdown>
            </div>

            {citations.length > 0 && (
              <div className="mt-6 space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Sources</p>
                <div className="flex flex-wrap gap-2">
                  {citations.slice(0, 20).map((c, i) => (
                    <a key={i} href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
                      <ExternalLink className="h-2.5 w-2.5" /> {c.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-10 rounded-lg border border-primary/20 bg-primary/5 p-5 text-center">
              <p className="text-sm font-medium">Verified, real-time infrastructure intelligence — from $29/mo.</p>
              <p className="text-xs text-muted-foreground mt-1">
                30+ AI agents track 1,600+ projects across 7 MDBs and 140 countries.
              </p>
              <Button asChild className="mt-4 teal-glow"><Link to="/">Start free — no card required</Link></Button>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
