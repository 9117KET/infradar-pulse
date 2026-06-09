import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { agentApi } from '@/lib/api/agents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  HardHat, TrendingDown, AlertTriangle, RefreshCw, ExternalLink, Building2, Award, Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

type Contractor = {
  id: string;
  name: string;
  country: string | null;
  sectors: string[] | null;
  total_awards: number;
  total_award_value_usd: number;
  last_award_at: string | null;
  distress_score: number;
  distress_signals: string[];
  distress_updated_at: string | null;
  updated_at: string;
};

type ContractorAward = {
  id: string;
  project_name: string;
  award_value_usd: number | null;
  contract_type: string | null;
  award_date: string | null;
  source_url: string | null;
};

function distressColor(score: number) {
  if (score >= 70) return 'text-red-400 border-red-400/30 bg-red-400/10';
  if (score >= 40) return 'text-amber-400 border-amber-400/30 bg-amber-400/10';
  return 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10';
}

function distressLabel(score: number) {
  if (score >= 70) return 'High Risk';
  if (score >= 40) return 'Watch';
  return 'Stable';
}

function formatUsd(val: number | null) {
  if (!val) return '—';
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(0)}M`;
  return `$${(val / 1_000).toFixed(0)}K`;
}

export default function Contractors() {
  const { hasRole } = useAuth();
  const canTrigger = hasRole('researcher') || hasRole('admin');
  const [running, setRunning] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Contractor | null>(null);

  const { data: contractors = [], isLoading, refetch } = useQuery({
    queryKey: ['contractors'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('contractors')
        .select('*')
        .order('total_awards', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Contractor[];
    },
    refetchInterval: 60_000,
  });

  const { data: awards = [], isLoading: awardsLoading } = useQuery({
    queryKey: ['contractor-awards', selected?.id],
    queryFn: async () => {
      if (!selected) return [];
      const { data, error } = await (supabase as any)
        .from('contractor_awards')
        .select('id, project_name, award_value_usd, contract_type, award_date, source_url')
        .eq('contractor_id', selected.id)
        .order('award_date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ContractorAward[];
    },
    enabled: !!selected,
  });

  const runAgent = async () => {
    setRunning(true);
    try {
      await agentApi.runContractorIntelAgent();
      toast.success('Contractor intel agent triggered');
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to run agent');
    } finally {
      setRunning(false);
    }
  };

  const filtered = contractors.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.country ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const highRisk = contractors.filter(c => c.distress_score >= 60).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-serif font-bold flex items-center gap-2">
            <HardHat className="h-6 w-6 text-primary" />
            Contractor Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track firms winning infrastructure bids and monitor for financial distress signals.
          </p>
        </div>
        {canTrigger && (
          <Button onClick={runAgent} disabled={running} size="sm" className="shrink-0">
            <RefreshCw className={`h-4 w-4 mr-2 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Running…' : 'Run Agent'}
          </Button>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="glass-panel">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Building2 className="h-4 w-4" /><span className="text-xs">Firms Tracked</span>
            </div>
            <div className="text-2xl font-bold">{contractors.length}</div>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Award className="h-4 w-4" /><span className="text-xs">Total Awards</span>
            </div>
            <div className="text-2xl font-bold">
              {contractors.reduce((s, c) => s + (c.total_awards ?? 0), 0)}
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingDown className="h-4 w-4 text-amber-400" /><span className="text-xs">Under Watch</span>
            </div>
            <div className="text-2xl font-bold text-amber-400">{highRisk}</div>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Award className="h-4 w-4" /><span className="text-xs">Total Value</span>
            </div>
            <div className="text-lg font-bold">
              {formatUsd(contractors.reduce((s, c) => s + (c.total_award_value_usd ?? 0), 0))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contractors…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Contractor list */}
        <div className="lg:col-span-3 glass-panel rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Firm</TableHead>
                <TableHead className="text-right">Awards</TableHead>
                <TableHead className="text-right">Total Value</TableHead>
                <TableHead>Distress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                </TableRow>
              ))}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-12">
                    {contractors.length === 0
                      ? 'No contractors yet. Run the agent to extract from tender awards.'
                      : 'No matches for your search.'}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map(c => (
                <TableRow
                  key={c.id}
                  className={`cursor-pointer transition-colors ${selected?.id === c.id ? 'bg-primary/10' : 'hover:bg-white/5'}`}
                  onClick={() => setSelected(selected?.id === c.id ? null : c)}
                >
                  <TableCell>
                    <div className="font-medium text-sm">{c.name}</div>
                    {c.country && <div className="text-xs text-muted-foreground">{c.country}</div>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{c.total_awards ?? 0}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatUsd(c.total_award_value_usd)}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[11px] ${distressColor(c.distress_score ?? 0)}`}
                    >
                      {c.distress_score >= 60 && <AlertTriangle className="h-3 w-3 mr-1" />}
                      {distressLabel(c.distress_score ?? 0)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Award history panel */}
        <div className="lg:col-span-2">
          {selected ? (
            <div className="glass-panel rounded-xl p-5 space-y-4">
              <div>
                <h3 className="font-serif font-semibold text-lg">{selected.name}</h3>
                {selected.country && <p className="text-xs text-muted-foreground">{selected.country}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs mb-0.5">Total Awards</div>
                  <div className="font-bold">{selected.total_awards}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-0.5">Total Value</div>
                  <div className="font-bold">{formatUsd(selected.total_award_value_usd)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-0.5">Last Award</div>
                  <div className="font-bold text-xs">
                    {selected.last_award_at
                      ? formatDistanceToNow(new Date(selected.last_award_at), { addSuffix: true })
                      : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-0.5">Distress Score</div>
                  <Badge variant="outline" className={`text-[11px] ${distressColor(selected.distress_score ?? 0)}`}>
                    {selected.distress_score ?? 0}/100
                  </Badge>
                </div>
              </div>
              {selected.distress_signals?.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Distress Signals</div>
                  <ul className="space-y-1">
                    {selected.distress_signals.map((s, i) => (
                      <li key={i} className="text-xs flex gap-2">
                        <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <div className="text-sm font-semibold mb-2">Award History</div>
                {awardsLoading ? (
                  <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                ) : awards.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No award records yet.</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {awards.map(a => (
                      <div key={a.id} className="rounded-lg bg-white/5 p-3 text-xs space-y-1">
                        <div className="font-medium">{a.project_name}</div>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          {a.award_value_usd && <span>{formatUsd(a.award_value_usd)}</span>}
                          {a.contract_type && <span className="capitalize">{a.contract_type}</span>}
                          {a.award_date && <span>{a.award_date}</span>}
                        </div>
                        {a.source_url && (
                          <a href={a.source_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline">
                            <ExternalLink className="h-3 w-3" />Source
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="glass-panel rounded-xl p-8 flex flex-col items-center justify-center text-center h-full min-h-[300px]">
              <HardHat className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Select a contractor to view award history and distress signals.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
