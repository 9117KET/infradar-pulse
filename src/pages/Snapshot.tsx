/**
 * /snapshot — Public weekly intelligence snapshot.
 * No auth required. Shows teaser data to drive signups.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InfradarLogo } from '@/components/InfradarLogo';
import { ArrowRight, TrendingUp, AlertTriangle, Globe } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  country: string;
  sector: string;
  stage: string;
  value_label: string;
  risk_score: number | null;
  created_at: string;
}

interface Stats {
  projects_tracked: number;
  regions_covered: number;
  pipeline_value_usd: number;
}

function fmt(usd: number) {
  if (usd >= 1e12) return `$${(usd / 1e12).toFixed(1)}T`;
  if (usd >= 1e9)  return `$${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6)  return `$${(usd / 1e6).toFixed(0)}M`;
  return `$${usd.toLocaleString()}`;
}

const SITE_URL = 'https://infradarai.com';

export default function Snapshot() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [top, setTop] = useState<Project[]>([]);
  const [recent, setRecent] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const week = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  useEffect(() => {
    const load = async () => {
      // Fetch live stats (may be cached by CDN)
      try {
        const res = await fetch(`${SITE_URL}/functions/v1/public-stats`);
        if (res.ok) setStats(await res.json());
      } catch { /* non-fatal */ }

      // Top 3 projects by value (teaser - no full description)
      const { data: topProjects } = await supabase
        .from('projects')
        .select('id, name, country, sector, stage, value_label, risk_score, created_at')
        .eq('status', 'Verified')
        .order('value_usd', { ascending: false, nullsFirst: false })
        .limit(3);
      setTop((topProjects as Project[]) ?? []);

      // 3 most recently added projects
      const { data: recentProjects } = await supabase
        .from('projects')
        .select('id, name, country, sector, stage, value_label, risk_score, created_at')
        .order('created_at', { ascending: false })
        .limit(3);
      setRecent((recentProjects as Project[]) ?? []);

      setLoading(false);
    };
    void load();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <InfradarLogo size={24} />
            <span className="font-serif text-sm font-semibold tracking-wide">InfradarAI</span>
          </Link>
          <Link to="/login">
            <Button size="sm" variant="outline">Sign in</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 space-y-10">
        {/* Headline */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <TrendingUp className="h-3.5 w-3.5" />
            Weekly intelligence snapshot · {week}
          </div>
          <h1 className="font-serif text-3xl font-bold sm:text-4xl leading-tight">
            {stats
              ? `${fmt(stats.pipeline_value_usd)} in tracked infrastructure pipeline across ${stats.regions_covered} regions`
              : 'Global infrastructure intelligence, updated daily'}
          </h1>
          {stats && (
            <p className="text-muted-foreground text-sm">
              {stats.projects_tracked.toLocaleString()} projects tracked · {stats.regions_covered} regions · updated continuously
            </p>
          )}
        </div>

        {/* Top projects by value */}
        <section>
          <h2 className="font-serif text-xl font-semibold mb-4 flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Top projects by pipeline value
          </h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-muted/40 animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {top.map((p, i) => (
                <div key={p.id} className="rounded-xl border border-border p-4 flex items-start gap-4">
                  <span className="text-3xl font-serif font-bold text-muted-foreground/30 leading-none mt-0.5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{p.name}</span>
                      <Badge variant="outline" className="text-xs">{p.sector}</Badge>
                      <Badge variant="outline" className="text-xs">{p.stage}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{p.country} · {p.value_label}</p>
                  </div>
                  {p.risk_score !== null && (
                    <div className={`text-xs font-medium px-2 py-1 rounded-full ${p.risk_score > 60 ? 'bg-red-500/20 text-red-400' : 'bg-muted text-muted-foreground'}`}>
                      Risk {p.risk_score}
                    </div>
                  )}
                </div>
              ))}
              {!top.length && <p className="text-sm text-muted-foreground">No project data available.</p>}
            </div>
          )}
        </section>

        {/* Recently added */}
        <section>
          <h2 className="font-serif text-xl font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            Recently added to the pipeline
          </h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {recent.map(p => (
                <div key={p.id} className="rounded-xl border border-border p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{p.name}</span>
                    <p className="text-xs text-muted-foreground">{p.country} · {p.sector} · {p.stage}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* CTA */}
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-8 text-center space-y-4">
          <h2 className="font-serif text-2xl font-semibold">Get the full briefing</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            {stats?.projects_tracked.toLocaleString() ?? '850'}+ projects updated this week.
            Confidence-scored risk signals, stakeholder contacts, and AI-generated analysis.
            Free to join.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/login?mode=signup">
              <Button className="teal-glow gap-2">
                Start for free <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/pricing">
              <Button variant="outline">See plans</Button>
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">No credit card required · Free tier includes 2 AI queries/day</p>
        </section>

        <footer className="text-center text-xs text-muted-foreground pt-4 border-t border-border">
          <Link to="/" className="hover:text-primary">InfradarAI</Link>
          {' · '}
          <Link to="/privacy" className="hover:text-primary">Privacy</Link>
          {' · '}
          <Link to="/unsubscribe" className="hover:text-primary">Unsubscribe</Link>
        </footer>
      </main>
    </div>
  );
}
