import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useProjects } from '@/hooks/use-projects';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { GitCompare, Search, X } from 'lucide-react';

function formatValue(v: number) {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return v > 0 ? `$${v.toLocaleString()}` : '-';
}

function RiskBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-red-500' : score >= 40 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold ${score >= 70 ? 'text-red-400' : score >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>{score}</span>
    </div>
  );
}

function ConfBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-foreground">{pct}%</span>
    </div>
  );
}

const MAX_COMPARE = 5;

export default function Compare() {
  const { allProjects, loading } = useProjects();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() =>
    allProjects.filter(p =>
      !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.country.toLowerCase().includes(search.toLowerCase())
    ).slice(0, 50),
    [allProjects, search]
  );

  const selectedProjects = useMemo(() =>
    selected.map(id => allProjects.find(p => p.id === id)).filter(Boolean) as typeof allProjects,
    [selected, allProjects]
  );

  const toggle = (id: string) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < MAX_COMPARE ? [...prev, id] : prev
    );
  };

  const ROWS = [
    { label: 'Country', render: (p: typeof allProjects[0]) => p.country },
    { label: 'Region', render: (p: typeof allProjects[0]) => p.region },
    { label: 'Sector', render: (p: typeof allProjects[0]) => <Badge variant="outline" className="text-xs">{p.sector}</Badge> },
    { label: 'Stage', render: (p: typeof allProjects[0]) => <Badge variant="outline" className="text-xs">{p.stage}</Badge> },
    { label: 'Status', render: (p: typeof allProjects[0]) => p.status },
    { label: 'Value', render: (p: typeof allProjects[0]) => formatValue(p.value || 0) },
    { label: 'Risk Score', render: (p: typeof allProjects[0]) => <RiskBar score={p.riskScore} /> },
    { label: 'Confidence', render: (p: typeof allProjects[0]) => <ConfBar pct={p.confidence} /> },
    { label: 'Evidence', render: (p: typeof allProjects[0]) => p.evidence?.length ?? 0 },
    { label: 'Contacts', render: (p: typeof allProjects[0]) => p.contacts?.length ?? 0 },
    { label: 'Last Updated', render: (p: typeof allProjects[0]) => p.lastUpdated ? new Date(p.lastUpdated).toLocaleDateString() : '-' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <GitCompare className="h-5 w-5 text-primary" /> Compare Projects
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Select up to {MAX_COMPARE} projects to compare side by side.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Picker */}
        <div className="lg:col-span-1 glass-panel rounded-xl p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search projects…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 text-sm" />
          </div>
          <p className="text-xs text-muted-foreground">{selected.length}/{MAX_COMPARE} selected</p>
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : filtered.map(p => (
              <label key={p.id} className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-colors hover:bg-muted/20 ${selected.includes(p.id) ? 'bg-primary/5 border border-primary/20' : ''}`}>
                <Checkbox
                  checked={selected.includes(p.id)}
                  onCheckedChange={() => toggle(p.id)}
                  disabled={!selected.includes(p.id) && selected.length >= MAX_COMPARE}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-snug">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">{p.country} · {p.sector}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Comparison grid */}
        <div className="lg:col-span-2">
          {selectedProjects.length === 0 ? (
            <div className="glass-panel rounded-xl p-12 text-center">
              <GitCompare className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Select at least 2 projects to compare</p>
            </div>
          ) : (
            <div className="glass-panel rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/30 bg-muted/20">
                      <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium w-28">Metric</th>
                      {selectedProjects.map(p => (
                        <th key={p.id} className="text-left py-3 px-4 min-w-[160px]">
                          <div className="flex items-start gap-1">
                            <Link to={`/dashboard/projects/${p.id}`} className="text-xs font-medium text-primary hover:underline line-clamp-2 leading-snug flex-1">{p.name}</Link>
                            <button onClick={() => toggle(p.id)} className="shrink-0 p-0.5 rounded hover:bg-muted/40">
                              <X className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map(row => (
                      <tr key={row.label} className="border-b border-border/10 hover:bg-muted/10">
                        <td className="py-2.5 px-4 text-xs text-muted-foreground font-medium">{row.label}</td>
                        {selectedProjects.map(p => (
                          <td key={p.id} className="py-2.5 px-4 text-xs text-foreground">{row.render(p)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
