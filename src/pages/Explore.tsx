import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Lock, ArrowRight, Globe, MapPin, TrendingUp } from 'lucide-react';
import { CoverageSection } from '@/components/home/CoverageSection';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePublicProjectLocations } from '@/hooks/use-public-project-locations';
import { PublicProjectDrawer } from '@/components/home/PublicProjectDrawer';
import type { PublicProjectLocation } from '@/hooks/use-public-project-locations';

const PREVIEW_LIMIT = 20;

const SECTORS = [
  'AI Infrastructure', 'Building Construction', 'Chemical', 'Data Centers',
  'Digital Infrastructure', 'Energy', 'Industrial', 'Infrastructure',
  'Mining', 'Oil & Gas', 'Renewable Energy', 'Transport', 'Urban Development', 'Water',
];

function riskBadge(score: number) {
  if (score >= 75) return { label: 'Critical', cls: 'bg-red-500/15 text-red-400 border-red-500/30' };
  if (score >= 50) return { label: 'High', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
  if (score >= 25) return { label: 'Medium', cls: 'bg-green-500/15 text-green-400 border-green-500/30' };
  return { label: 'Low', cls: 'bg-teal-500/15 text-teal-400 border-teal-500/30' };
}

function GatedRow() {
  return (
    <tr className="border-b border-border/10 opacity-30 select-none pointer-events-none">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <Lock className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          <span className="text-sm blur-sm">██████████████████</span>
        </div>
      </td>
      <td className="py-3 px-4"><span className="text-sm blur-sm">███████</span></td>
      <td className="py-3 px-4"><span className="text-sm blur-sm">████████████</span></td>
      <td className="py-3 px-4 text-right"><span className="text-sm blur-sm">██</span></td>
    </tr>
  );
}

export default function Explore() {
  const [searchParams] = useSearchParams();
  const { locations, loading } = usePublicProjectLocations();
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState(searchParams.get('sector') ?? 'all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [selectedProject, setSelectedProject] = useState<PublicProjectLocation | null>(null);

  const filtered = useMemo(() => {
    return locations.filter(p => {
      const matchSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.country.toLowerCase().includes(search.toLowerCase());
      const matchSector = sector === 'all' || p.sector === sector;
      const matchRisk =
        riskFilter === 'all' ||
        (riskFilter === 'low' && p.risk_score < 25) ||
        (riskFilter === 'medium' && p.risk_score >= 25 && p.risk_score < 50) ||
        (riskFilter === 'high' && p.risk_score >= 50 && p.risk_score < 75) ||
        (riskFilter === 'critical' && p.risk_score >= 75);
      return matchSearch && matchSector && matchRisk;
    });
  }, [locations, search, sector, riskFilter]);

  const visible = filtered.slice(0, PREVIEW_LIMIT);
  const gatedCount = Math.max(0, filtered.length - PREVIEW_LIMIT);

  const stats = useMemo(() => ({
    total: locations.length,
    countries: new Set(locations.map(p => p.country)).size,
    topSector: (() => {
      const map: Record<string, number> = {};
      locations.forEach(p => { map[p.sector] = (map[p.sector] || 0) + 1; });
      return Object.entries(map).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    })(),
  }), [locations]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <section className="relative py-16 border-b border-border/30">
        <div className="pointer-events-none absolute inset-0" style={{
          background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(107,216,203,0.07) 0%, transparent 70%)',
        }} />
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">
              Live dataset preview
            </div>
            <h1 className="font-serif text-3xl font-bold sm:text-4xl mb-4">
              Explore the global infrastructure pipeline
            </h1>
            <p className="text-muted-foreground max-w-2xl leading-relaxed mb-8">
              Browse approved projects from our live database. Sign up free to access financial data,
              evidence sources, stakeholder contacts, and AI-generated intelligence briefs.
            </p>

            {/* Live stats */}
            {!loading && (
              <div className="flex flex-wrap gap-6 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-4 w-4 text-primary" />
                  <strong className="text-foreground">{stats.total.toLocaleString()}</strong> approved projects
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 text-primary" />
                  <strong className="text-foreground">{stats.countries}</strong> countries
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Top sector: <strong className="text-foreground">{stats.topSector}</strong>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </section>

      <CoverageSection />

      {/* Filters + Table */}
      <section className="py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-6">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by project name or country…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={sector} onValueChange={setSector}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All sectors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sectors</SelectItem>
                {SECTORS.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All risk levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All risk levels</SelectItem>
                <SelectItem value="low">Low (0–24)</SelectItem>
                <SelectItem value="medium">Medium (25–49)</SelectItem>
                <SelectItem value="high">High (50–74)</SelectItem>
                <SelectItem value="critical">Critical (75+)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Results summary */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {loading ? 'Loading…' : (
                <>
                  Showing <strong className="text-foreground">{visible.length}</strong> of{' '}
                  <strong className="text-foreground">{filtered.length.toLocaleString()}</strong> projects
                  {filtered.length !== locations.length && ` (filtered from ${locations.length.toLocaleString()} total)`}
                </>
              )}
            </p>
            <Link to="/login">
              <Button size="sm" className="teal-glow gap-1.5 text-xs">
                Sign up free <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-border/30 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30 bg-muted/20">
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Project</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Country</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Sector</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    [...Array(8)].map((_, i) => (
                      <tr key={i} className="border-b border-border/10 animate-pulse">
                        <td className="py-3 px-4"><div className="h-4 bg-muted/40 rounded w-48" /></td>
                        <td className="py-3 px-4"><div className="h-4 bg-muted/40 rounded w-20" /></td>
                        <td className="py-3 px-4"><div className="h-4 bg-muted/40 rounded w-28" /></td>
                        <td className="py-3 px-4 text-right"><div className="h-4 bg-muted/40 rounded w-16 ml-auto" /></td>
                      </tr>
                    ))
                  )}
                  {!loading && visible.map(p => {
                    const risk = riskBadge(p.risk_score);
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-border/10 hover:bg-muted/20 cursor-pointer transition-colors"
                        onClick={() => setSelectedProject(p)}
                      >
                        <td className="py-3 px-4 font-medium max-w-xs">
                          <span className="truncate block">{p.name}</span>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{p.country}</td>
                        <td className="py-3 px-4">
                          <Badge variant="outline" className="text-xs font-normal">
                            {p.sector}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Badge variant="outline" className={`text-xs ${risk.cls}`}>
                            {risk.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && gatedCount > 0 && (
                    [...Array(Math.min(5, gatedCount))].map((_, i) => <GatedRow key={i} />)
                  )}
                </tbody>
              </table>
            </div>

            {/* Gate banner */}
            {!loading && gatedCount > 0 && (
              <div className="border-t border-border/30 bg-muted/10 px-6 py-5 text-center">
                <p className="text-sm text-muted-foreground mb-3">
                  <Lock className="h-4 w-4 inline mr-1.5 mb-0.5" />
                  <strong className="text-foreground">{gatedCount.toLocaleString()} more projects</strong> available with a free account,
                  including pipeline value, evidence sources, stakeholder contacts, and AI briefs.
                </p>
                <Link to="/login">
                  <Button className="teal-glow gap-2">
                    Get free access in 60 seconds <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <PublicProjectDrawer
        project={selectedProject}
        onClose={() => setSelectedProject(null)}
      />
    </div>
  );
}
