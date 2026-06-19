import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Search, Loader2, Info, MapPin, TrendingUp, AlertTriangle, ArrowRight, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Seo } from '@/components/Seo';

type ChipExample = {
  prompt: string;
  filters: Record<string, unknown>;
};

// Shown instantly on first paint and as a fallback if the data-driven fetch
// fails. These pairs are broad enough to almost always have matching projects.
const FALLBACK_EXAMPLES: ChipExample[] = [
  { prompt: 'Energy projects in MENA', filters: { sectors: ['Energy'], regions: ['MENA'] } },
  { prompt: 'Transport projects in East Africa', filters: { sectors: ['Transport'], regions: ['East Africa'] } },
  { prompt: 'Renewable Energy projects in West Africa', filters: { sectors: ['Renewable Energy'], regions: ['West Africa'] } },
];

const QUERIES_LIMIT = 3;

type DemoProject = {
  id: string;
  slug: string;
  name: string;
  country: string;
  region: string;
  sector: string;
  stage: string;
  status: string;
  value_usd: number;
  value_label: string;
  confidence: number;
  risk_score: number;
  description: string;
};

type DemoResult = {
  projects: DemoProject[];
  interpretation: string;
  relaxed?: boolean;
  queries_used: number;
  queries_remaining: number;
};

function statusColor(s: string) {
  const map: Record<string, string> = {
    Verified: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    Stable: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    Pending: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    'At Risk': 'bg-destructive/10 text-destructive border-destructive/30',
  };
  return map[s] ?? 'bg-muted text-muted-foreground border-border';
}

// Signed visitor token issued by the server (a "cookie" we keep in localStorage
// because cross-origin Set-Cookie won't survive supabase.functions.invoke). We
// resend it so the server can rate-limit by token as well as by IP.
const VISITOR_TOKEN_KEY = 'infradar_demo_token';
function readVisitorToken(): string | undefined {
  try { return localStorage.getItem(VISITOR_TOKEN_KEY) ?? undefined; } catch { return undefined; }
}
function writeVisitorToken(token: unknown) {
  if (typeof token === 'string' && token) {
    try { localStorage.setItem(VISITOR_TOKEN_KEY, token); } catch { /* ignore */ }
  }
}

// supabase.functions.invoke reports a generic "Edge Function returned a non-2xx
// status code" on any error. The function itself returns a structured { error }
// body (e.g. "AI gateway not configured"); read it so the user sees the real cause.
async function describeFunctionError(fnError: unknown): Promise<Error> {
  const ctx = (fnError as { context?: Response })?.context;
  if (ctx && typeof ctx.clone === 'function') {
    try {
      const body = await ctx.clone().json();
      if (body?.error) return new Error(String(body.error));
    } catch { /* fall through to the generic message */ }
  }
  return fnError instanceof Error ? fnError : new Error('Search failed');
}

export default function AskDemo() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [queriesUsed, setQueriesUsed] = useState(0);
  const [examples, setExamples] = useState<ChipExample[]>(FALLBACK_EXAMPLES);

  // On mount, fetch data-driven example chips AND the caller's current usage.
  // The examples map to (sector, region) pairs that actually have projects, so
  // every chip returns results. The usage figures come straight from the server
  // (per-IP), so a refresh shows the real remaining count and the signup wall
  // survives a reload — the client never owns the limit. This call consumes
  // no free query.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('nl-search-public', {
          body: { mode: 'examples', visitor_token: readVisitorToken() },
        });
        if (!active || fnError) return;
        writeVisitorToken(data?.visitor_token);
        const fetched = (data?.examples as ChipExample[] | undefined)?.filter((e) => e?.prompt && e?.filters);
        if (fetched && fetched.length > 0) setExamples(fetched);
        if (typeof data?.queries_used === 'number') {
          setQueriesUsed(data.queries_used);
          if (data.queries_remaining === 0) setRateLimited(true);
        }
      } catch {
        // keep FALLBACK_EXAMPLES and the optimistic 3-remaining counter
      }
    })();
    return () => { active = false; };
  }, []);

  // A chip click passes `filters` (LLM-bypassed, guaranteed results); a typed
  // query passes `query`. `label` is what we show in the input box.
  const submit = async (opts: { query?: string; filters?: Record<string, unknown>; label?: string }) => {
    const typed = opts.query?.trim() ?? '';
    const usePreset = !!opts.filters;
    if (loading) return;
    if (!usePreset && typed.length < 3) return;
    if (rateLimited || queriesUsed >= QUERIES_LIMIT) {
      setRateLimited(true);
      return;
    }

    setQuery(opts.label ?? typed);
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('nl-search-public', {
        body: {
          ...(usePreset ? { filters: opts.filters } : { query: typed }),
          visitor_token: readVisitorToken(),
        },
      });

      if (fnError) throw await describeFunctionError(fnError);

      writeVisitorToken(data?.visitor_token);

      if (data?.error === 'rate_limited') {
        setRateLimited(true);
        setQueriesUsed(QUERIES_LIMIT);
        return;
      }
      if (data?.error) throw new Error(data.error);

      setResult(data as DemoResult);
      setQueriesUsed(data.queries_used ?? queriesUsed);
      if (data.queries_remaining === 0) setRateLimited(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Search failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const remaining = QUERIES_LIMIT - queriesUsed;

  return (
    <div className="py-20 min-h-screen">
      <Seo
        title="Try Ask AI Free | InfradarAI Demo"
        description="Ask plain-English questions about 1,600+ verified global infrastructure projects. No account needed - try 3 free queries."
        path="/ask-demo"
      />

      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="font-serif text-4xl font-bold mb-4">Ask InfradarAI</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Ask anything about our database of 1,600+ verified global infrastructure projects in plain English.
            No filters, no account needed.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {remaining > 0
              ? `${remaining} free ${remaining === 1 ? 'query' : 'queries'} remaining today`
              : 'Free queries used up for today'}
            {' '}·{' '}
            <Link to="/login" className="text-primary hover:underline">Sign up free for 5 queries/day</Link>
            {' '}·{' '}
            <Link to="/pricing" className="text-primary hover:underline">Starter gets 20/day</Link>
          </p>
        </div>

        {/* Rate limited wall */}
        {rateLimited ? (
          <Card className="p-8 glass-panel text-center border-primary/20">
            <Lock className="h-8 w-8 text-primary mx-auto mb-3" />
            <h2 className="font-serif text-xl font-semibold mb-2">You've used all {QUERIES_LIMIT} free demo queries</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              Sign up for a free account to get 5 AI queries per day — then earn +3/day for every
              colleague you refer (up to +30). Or upgrade to Starter for 20/day with alert rules,
              portfolio tracking, and CSV exports.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button className="teal-glow" asChild>
                <Link to="/login">Create free account</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/pricing">View plans</Link>
              </Button>
            </div>
          </Card>
        ) : (
          <>
            {/* Search box */}
            <Card className="p-4 glass-panel mb-6">
              <form
                onSubmit={(e) => { e.preventDefault(); void submit({ query }); }}
                className="flex flex-col sm:flex-row gap-2"
              >
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. Power projects in East Africa above $200M in tender stage"
                    maxLength={300}
                    className="w-full h-11 pl-10 pr-3 rounded-lg bg-background border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    disabled={loading}
                  />
                </div>
                <Button type="submit" disabled={loading || query.trim().length < 3} size="lg" className="sm:w-auto teal-glow">
                  {loading
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Thinking…</>
                    : <><Sparkles className="mr-2 h-4 w-4" /> Ask</>}
                </Button>
              </form>

              {!result && !loading && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Try one of these</p>
                  <div className="flex flex-wrap gap-1.5">
                    {examples.map((ex) => (
                      <button
                        key={ex.prompt}
                        type="button"
                        onClick={() => void submit({ filters: ex.filters, label: ex.prompt })}
                        className="text-xs px-2.5 py-1 rounded-md bg-muted/50 hover:bg-primary/10 hover:text-primary border border-transparent hover:border-primary/30 transition-colors"
                      >
                        {ex.prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Error */}
            {error && (
              <Card className="p-4 glass-panel border-destructive/30 mb-4">
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                </div>
              </Card>
            )}

            {/* Loading */}
            {loading && (
              <Card className="p-6 glass-panel">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Translating your question into filters and searching the database…
                </div>
              </Card>
            )}

            {/* Results */}
            {result && !loading && (
              <div className="space-y-4">
                <Card className="p-4 glass-panel border-primary/20">
                  <div className="flex gap-3">
                    <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <p className="text-sm">{result.interpretation || 'Searching across all projects.'}</p>
                  </div>
                </Card>

                {result.relaxed && result.projects.length > 0 && (
                  <Card className="p-3 glass-panel border-amber-500/30">
                    <div className="flex items-center gap-2 text-xs text-amber-500">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      No exact match — showing the closest projects we found.
                    </div>
                  </Card>
                )}

                {result.projects.length === 0 ? (
                  <Card className="p-8 glass-panel text-center">
                    <AlertTriangle className="h-6 w-6 text-amber-500 mx-auto mb-2" />
                    <p className="text-sm font-medium mb-1">No projects matched</p>
                    <p className="text-xs text-muted-foreground">Try broadening your query - drop a filter or expand the region.</p>
                  </Card>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Showing <span className="text-foreground font-medium">{result.projects.length}</span> of 1,600+ projects
                        {' '}· <span className="text-foreground font-medium">{result.queries_remaining}</span> free {result.queries_remaining === 1 ? 'query' : 'queries'} left today
                      </span>
                      <Link to="/login" className="text-primary hover:underline flex items-center gap-1">
                        Sign up to see all <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {result.projects.map((p) => (
                        <Card key={p.id} className="p-4 glass-panel">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className="font-semibold text-sm leading-snug line-clamp-2">{p.name}</h3>
                            <Badge variant="outline" className={`text-[10px] shrink-0 ${statusColor(p.status)}`}>{p.status}</Badge>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
                            <MapPin className="h-3 w-3" /> {p.country} · {p.region}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{p.description}</p>
                          <div className="flex items-center justify-between gap-2 text-[11px] pt-2 border-t border-border/50">
                            <span className="text-primary font-semibold shrink-0">{p.value_label}</span>
                            <span className="text-muted-foreground truncate">{p.sector} · {p.stage}</span>
                            <span className="flex items-center gap-1 text-muted-foreground shrink-0">
                              <TrendingUp className="h-3 w-3" /> {p.confidence}%
                            </span>
                          </div>
                        </Card>
                      ))}
                    </div>

                    {/* Signup nudge after results */}
                    <Card className="p-5 glass-panel border-primary/20 text-center">
                      <p className="text-sm font-medium mb-1">
                        Want to see all {result.projects.length === MAX_RESULTS ? '1,600+' : result.projects.length} results, set alerts, and export?
                      </p>
                      <p className="text-xs text-muted-foreground mb-4">Free account gives 5 AI queries/day (earn +3/day per referral). Starter ($29/mo) gives 20/day + alert rules + exports.</p>
                      <div className="flex flex-col sm:flex-row gap-2 justify-center">
                        <Button className="teal-glow" asChild>
                          <Link to="/login">Create free account</Link>
                        </Button>
                        <Button variant="outline" asChild>
                          <Link to="/pricing">See all plans</Link>
                        </Button>
                      </div>
                    </Card>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const MAX_RESULTS = 6;
