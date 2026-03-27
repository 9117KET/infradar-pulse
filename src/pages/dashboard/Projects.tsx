import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { REGIONS, SECTORS, STAGES, type Region, type Sector, type ProjectStage } from '@/data/projects';
import { useProjects } from '@/hooks/use-projects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Download, Bookmark } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

export default function Projects() {
  const { toast } = useToast();
  const { projects, loading } = useProjects();
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<string>('all');
  const [sector, setSector] = useState<string>('all');
  const [confFilter, setConfFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.country.toLowerCase().includes(search.toLowerCase())) return false;
      if (stage !== 'all' && p.stage !== stage) return false;
      if (sector !== 'all' && p.sector !== sector) return false;
      if (confFilter === 'high' && p.confidence < 90) return false;
      if (confFilter === 'medium' && (p.confidence < 70 || p.confidence >= 90)) return false;
      if (confFilter === 'low' && p.confidence >= 70) return false;
      return true;
    });
  }, [projects, search, stage, sector, confFilter]);

  const exportCSV = () => {
    const headers = ['Name', 'Country', 'Region', 'Sector', 'Stage', 'Value', 'Confidence', 'Status', 'Last Updated'];
    const rows = filtered.map(p => [p.name, p.country, p.region, p.sector, p.stage, p.valueLabel, `${p.confidence}%`, p.status, p.lastUpdated]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'infradar_projects.csv'; a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exported', description: `${filtered.length} projects exported to CSV.` });
  };

  const saveSearch = () => {
    const saved = JSON.parse(localStorage.getItem('infradar_saved_searches') || '[]');
    saved.push({ search, stage, sector, confFilter, ts: new Date().toISOString() });
    localStorage.setItem('infradar_saved_searches', JSON.stringify(saved));
    toast({ title: 'Search saved', description: 'Filters saved to your profile.' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="font-serif text-2xl font-bold">Project discovery & profiling</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={saveSearch}><Bookmark className="h-3 w-3 mr-1" />Save search</Button>
          <Button size="sm" variant="outline" onClick={exportCSV}><Download className="h-3 w-3 mr-1" />Export CSV</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects or countries..." className="pl-9 bg-black/20" />
        </div>
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="w-[140px] bg-black/20"><SelectValue placeholder="Stage" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All stages</SelectItem>{STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={sector} onValueChange={setSector}>
          <SelectTrigger className="w-[160px] bg-black/20"><SelectValue placeholder="Sector" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All sectors</SelectItem>{SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={confFilter} onValueChange={setConfFilter}>
          <SelectTrigger className="w-[150px] bg-black/20"><SelectValue placeholder="Confidence" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All confidence</SelectItem>
            <SelectItem value="high">High (≥90%)</SelectItem>
            <SelectItem value="medium">Medium (70–89%)</SelectItem>
            <SelectItem value="low">Low (&lt;70%)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left bg-black/20">
                <th className="p-3 font-medium text-muted-foreground">Project</th>
                <th className="p-3 font-medium text-muted-foreground">Country</th>
                <th className="p-3 font-medium text-muted-foreground">Sector</th>
                <th className="p-3 font-medium text-muted-foreground">Stage</th>
                <th className="p-3 font-medium text-muted-foreground">Value</th>
                <th className="p-3 font-medium text-muted-foreground">Confidence</th>
                <th className="p-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={7} className="p-3"><Skeleton className="h-6 w-full" /></td></tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No projects match your filters.</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                  <td className="p-3"><Link to={`/dashboard/projects/${p.id}`} className="text-primary hover:underline font-medium">{p.name}</Link></td>
                  <td className="p-3 text-muted-foreground">{p.country}</td>
                  <td className="p-3 text-muted-foreground">{p.sector}</td>
                  <td className="p-3"><Badge variant="outline" className="text-xs">{p.stage}</Badge></td>
                  <td className="p-3 font-medium">{p.valueLabel}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1.5 rounded bg-black/20 overflow-hidden"><div className="h-full rounded bg-primary" style={{ width: `${p.confidence}%` }} /></div>
                      <span className="text-xs">{p.confidence}%</span>
                    </div>
                  </td>
                  <td className="p-3"><Badge variant="outline" className="text-xs">{p.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
