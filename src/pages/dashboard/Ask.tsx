import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Search, Loader2, ArrowRight, Info, AlertTriangle, MapPin, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { agentApi } from '@/lib/api/agents';
import { useEntitlements } from '@/hooks/useEntitlements';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';

type NlProject = {
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

type NlSearchResponse = {
  projects: NlProject[];
  interpretation: string;
  filters: {
    regions: string[];
    sectors: string[];
    stages: string[];
    statuses: string[];
    countries: string[];
    value_min_usd: number | null;
    value_max_usd: number | null;
    keyword: string | null;
    order_by: string;
    limit: number;
  };
};

const EXAMPLES = [
  'Power projects in West Africa above $100M in tender stage',
  'Renewable energy in Saudi Arabia or UAE that broke ground this year',
  'High-risk transport projects across MENA',
  'Data center projects worth more than $500M globally',
  'Water infrastructure in East Africa, sorted by most recent updates',
];

function statusBadge(s: string) {
  const map: Record<string, string> = {
    Verified: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    Stable: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    Pending: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    'At Risk': 'bg-destructive/10 text-destructive border-destructive/30',
  };
  return map[s] ?? 'bg-muted text-muted-foreground border-border';
}

export default function Ask() {
  const { toast } = useToast();
  const { canUseAi, plan, refresh } = useEntitlements();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NlSearchResponse | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const submit = async (q: string) => {
    if (!q.trim()) return;
    if (!canUseAi) {
      setUpgradeOpen(true);
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const data = (await agentApi.runNlSearch(q.trim())) as NlSearchResponse;
      setResult(data);
      refresh();
    } catch (e: any) {
      const msg = e?.message || 'Search failed';
      const lower = msg.toLowerCase();
      if (lower.includes('credits') || lower.includes('rate limit') || lower.includes('entitlement') || lower.includes('quota')) {
        setUpgradeOpen(true);
      }
      toast({ variant: 'destructive', title: 'Search failed', description: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary mb-2">
          <Sparkles className="h-3.5 w-3.5" /> AI-powered search
        </div>
        <h1 className="font-serif text-3xl font-semibold mb-2">Ask InfraRadar</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Describe what you're looking for in plain English. Filter by country, sector, value, stage, or
          risk — no manual filters needed. Each query counts as one AI request against your{' '}
          <span className="text-foreground font-medium capitalize">{plan}</span> plan.
        </p>
      </div>

      {/* Search input */}
      <Card className="p-4 glass-panel mb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(query);
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Renewable energy projects in West Africa above $50M in tender stage"
              maxLength={500}
              className="w-full h-11 pl-10 pr-3 rounded-lg bg-background border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          <Button type="submit" disabled={loading || query.trim().length < 3} size="lg" className="sm:w-auto">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Thinking…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" /> Ask
              </>
            )}
          </Button>
        </form>

        {/* Examples */}
        {!result && !loading && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Try one of these
            </p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setQuery(ex);
                    submit(ex);
                  }}
                  className="text-xs px-2.5 py-1 rounded-md bg-muted/50 hover:bg-primary/10 hover:text-primary border border-transparent hover:border-primary/30 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Loading skeleton */}
      {loading && (
        <Card className="p-6 glass-panel">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Translating your question into filters and searching the project database…
          </div>
        </Card>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-4">
          {/* Interpretation strip */}
          <Card className="p-4 glass-panel border-primary/20">
            <div className="flex gap-3">
              <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
                  How I understood your question
                </p>
                <p className="text-sm">{result.interpretation || 'Searching across all projects.'}</p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {result.filters.countries.map((c) => (
                    <Badge key={`c-${c}`} variant="outline" className="text-[10px]">
                      Country · {c}
                    </Badge>
                  ))}
                  {result.filters.regions.map((r) => (
                    <Badge key={`r-${r}`} variant="outline" className="text-[10px]">
                      Region · {r}
                    </Badge>
                  ))}
                  {result.filters.sectors.map((s) => (
                    <Badge key={`s-${s}`} variant="outline" className="text-[10px]">
                      Sector · {s}
                    </Badge>
                  ))}
                  {result.filters.stages.map((s) => (
                    <Badge key={`st-${s}`} variant="outline" className="text-[10px]">
                      Stage · {s}
                    </Badge>
                  ))}
                  {result.filters.value_min_usd != null && (
                    <Badge variant="outline" className="text-[10px]">
                      ≥ ${(result.filters.value_min_usd / 1_000_000).toFixed(0)}M
                    </Badge>
                  )}
                  {result.filters.value_max_usd != null && (
                    <Badge variant="outline" className="text-[10px]">
                      ≤ ${(result.filters.value_max_usd / 1_000_000).toFixed(0)}M
                    </Badge>
                  )}
                  {result.filters.keyword && (
                    <Badge variant="outline" className="text-[10px]">
                      Keyword · {result.filters.keyword}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Results grid */}
          {result.projects.length === 0 ? (
            <Card className="p-8 glass-panel text-center">
              <AlertTriangle className="h-6 w-6 text-amber-500 mx-auto mb-2" />
              <p className="text-sm font-medium mb-1">No projects matched these filters</p>
              <p className="text-xs text-muted-foreground mb-4">
                Try broadening your query — drop the value floor, expand the region, or use a different stage.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link to="/dashboard/projects">Browse all projects instead</Link>
              </Button>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Found <span className="text-foreground font-medium">{result.projects.length}</span>{' '}
                  matching {result.projects.length === 1 ? 'project' : 'projects'}
                </span>
                <Link to="/dashboard/projects" className="hover:text-primary transition-colors">
                  Open full filter view <ArrowRight className="inline h-3 w-3 ml-1" />
                </Link>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {result.projects.map((p) => (
                  <Link key={p.id} to={`/dashboard/projects/${p.slug}`} className="block group">
                    <Card className="p-4 glass-panel hover:border-primary/30 transition-colors h-full">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-semibold text-sm leading-snug group-hover:text-primary transition-colors line-clamp-2">
                          {p.name}
                        </h3>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${statusBadge(p.status)}`}>
                          {p.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
                        <MapPin className="h-3 w-3" />
                        {p.country} · {p.region}
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
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        feature="ai"
        currentPlan={plan}
      />
    </div>
  );
}
