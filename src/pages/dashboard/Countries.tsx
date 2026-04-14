import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects } from '@/hooks/use-projects';
import { useAlerts } from '@/hooks/use-alerts';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Flag, Search, AlertTriangle, TrendingUp } from 'lucide-react';

// Simple flag emoji lookup by country name (common ones)
const FLAG_MAP: Record<string, string> = {
  'Saudi Arabia': '🇸🇦', 'UAE': '🇦🇪', 'United Arab Emirates': '🇦🇪', 'Egypt': '🇪🇬',
  'Kenya': '🇰🇪', 'Nigeria': '🇳🇬', 'Ghana': '🇬🇭', 'Ethiopia': '🇪🇹',
  'South Africa': '🇿🇦', 'Tanzania': '🇹🇿', 'Uganda': '🇺🇬', 'Mozambique': '🇲🇿',
  'Morocco': '🇲🇦', 'Algeria': '🇩🇿', 'Tunisia': '🇹🇳', 'Libya': '🇱🇾',
  'India': '🇮🇳', 'Pakistan': '🇵🇰', 'Bangladesh': '🇧🇩', 'Sri Lanka': '🇱🇰',
  'Indonesia': '🇮🇩', 'Vietnam': '🇻🇳', 'Philippines': '🇵🇭', 'Thailand': '🇹🇭',
  'Malaysia': '🇲🇾', 'Myanmar': '🇲🇲', 'Cambodia': '🇰🇭', 'Laos': '🇱🇦',
  'China': '🇨🇳', 'Japan': '🇯🇵', 'South Korea': '🇰🇷', 'Taiwan': '🇹🇼',
  'Kazakhstan': '🇰🇿', 'Uzbekistan': '🇺🇿', 'Turkmenistan': '🇹🇲',
  'Brazil': '🇧🇷', 'Colombia': '🇨🇴', 'Peru': '🇵🇪', 'Chile': '🇨🇱', 'Argentina': '🇦🇷',
  'Mexico': '🇲🇽', 'USA': '🇺🇸', 'United States': '🇺🇸', 'Canada': '🇨🇦',
  'Germany': '🇩🇪', 'France': '🇫🇷', 'UK': '🇬🇧', 'United Kingdom': '🇬🇧',
  'Australia': '🇦🇺', 'New Zealand': '🇳🇿', 'Papua New Guinea': '🇵🇬',
  'Iraq': '🇮🇶', 'Iran': '🇮🇷', 'Jordan': '🇯🇴', 'Lebanon': '🇱🇧', 'Turkey': '🇹🇷',
  'Angola': '🇦🇴', 'DRC': '🇨🇩', 'Congo': '🇨🇬', 'Cameroon': '🇨🇲', 'Zambia': '🇿🇲',
  'Zimbabwe': '🇿🇼', 'Botswana': '🇧🇼', 'Namibia': '🇳🇦', 'Madagascar': '🇲🇬',
  'Senegal': '🇸🇳', 'Côte d\'Ivoire': '🇨🇮', 'Ivory Coast': '🇨🇮', 'Mali': '🇲🇱',
};

function getFlag(country: string): string {
  return FLAG_MAP[country] || '🌍';
}

function slugify(country: string) {
  return country.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function Countries() {
  const { allProjects, loading } = useProjects();
  const { alerts } = useAlerts();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const countries = useMemo(() => {
    const map = new Map<string, {
      name: string;
      count: number;
      totalValue: number;
      avgRisk: number;
      alertCount: number;
      topSector: string;
    }>();

    allProjects.forEach(p => {
      const existing = map.get(p.country);
      if (!existing) {
        map.set(p.country, {
          name: p.country,
          count: 1,
          totalValue: p.value || 0,
          avgRisk: p.riskScore,
          alertCount: 0,
          topSector: p.sector,
        });
      } else {
        existing.count++;
        existing.totalValue += p.value || 0;
        existing.avgRisk = Math.round((existing.avgRisk * (existing.count - 1) + p.riskScore) / existing.count);
      }
    });

    // Count alerts per country (approximate via project names)
    const projectCountries = new Map<string, string>();
    allProjects.forEach(p => projectCountries.set(p.name.trim().toLowerCase(), p.country));
    alerts.forEach(a => {
      const country = projectCountries.get((a.projectName || '').trim().toLowerCase());
      if (country) {
        const entry = map.get(country);
        if (entry) entry.alertCount++;
      }
    });

    // Determine top sector per country
    const sectorCounts = new Map<string, Map<string, number>>();
    allProjects.forEach(p => {
      if (!sectorCounts.has(p.country)) sectorCounts.set(p.country, new Map());
      const sc = sectorCounts.get(p.country)!;
      sc.set(p.sector, (sc.get(p.sector) || 0) + 1);
    });
    sectorCounts.forEach((sc, country) => {
      const entry = map.get(country);
      if (entry) {
        let max = 0;
        sc.forEach((count, sector) => { if (count > max) { max = count; entry.topSector = sector; } });
      }
    });

    return Array.from(map.values())
      .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.count - a.count);
  }, [allProjects, alerts, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Flag className="h-5 w-5 text-primary" /> Country Intelligence
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Infrastructure pipeline and risk overview by country.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search countries…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : countries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No countries found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {countries.map(c => (
            <button
              key={c.name}
              onClick={() => navigate(`/dashboard/countries/${slugify(c.name)}`)}
              className="glass-panel rounded-xl p-4 text-left hover:border-primary/30 hover:bg-white/[0.02] transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getFlag(c.name)}</span>
                  <div>
                    <p className="text-sm font-semibold group-hover:text-primary transition-colors">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground">{c.topSector}</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">{c.count} projects</Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground">Value</p>
                  <p className="text-xs font-medium">
                    {c.totalValue >= 1e9
                      ? `$${(c.totalValue / 1e9).toFixed(1)}B`
                      : c.totalValue >= 1e6
                      ? `$${(c.totalValue / 1e6).toFixed(0)}M`
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                    <TrendingUp className="h-2.5 w-2.5" /> Risk
                  </p>
                  <p className={`text-xs font-bold ${c.avgRisk >= 70 ? 'text-red-400' : c.avgRisk >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {c.avgRisk}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                    <AlertTriangle className="h-2.5 w-2.5" /> Alerts
                  </p>
                  <p className={`text-xs font-medium ${c.alertCount > 5 ? 'text-amber-400' : ''}`}>{c.alertCount}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
