import { useState, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { useProjects } from '@/hooks/use-projects';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link } from 'react-router-dom';
import { Layers, Filter, MapPin } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

const RISK_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#dc2626',
};

function getRiskLevel(score: number) {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

function MapBoundsUpdater({ bounds }: { bounds: [number, number][] }) {
  const map = useMap();
  useMemo(() => {
    if (bounds.length > 0) {
      map.fitBounds(bounds as any, { padding: [50, 50], maxZoom: 6 });
    }
  }, [bounds, map]);
  return null;
}

export default function GeoIntelligence() {
  const { projects, loading } = useProjects();
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [overlay, setOverlay] = useState<'risk' | 'confidence' | 'value'>('risk');

  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (regionFilter !== 'all' && p.region !== regionFilter) return false;
      if (sectorFilter !== 'all' && p.sector !== sectorFilter) return false;
      return true;
    });
  }, [projects, regionFilter, sectorFilter]);

  const bounds = useMemo(() => {
    if (filtered.length === 0) return [[20, 30]] as [number, number][];
    return filtered.map(p => [p.lat, p.lng] as [number, number]);
  }, [filtered]);

  const regions = [...new Set(projects.map(p => p.region))];
  const sectors = [...new Set(projects.map(p => p.sector))];

  const getColor = (p: typeof projects[0]) => {
    if (overlay === 'risk') return RISK_COLORS[getRiskLevel(p.riskScore)];
    if (overlay === 'confidence') {
      if (p.confidence >= 80) return '#22c55e';
      if (p.confidence >= 60) return '#f59e0b';
      return '#ef4444';
    }
    // value
    if (p.valueUsd >= 5_000_000_000) return '#22c55e';
    if (p.valueUsd >= 1_000_000_000) return '#3b82f6';
    return '#8b5cf6';
  };

  const getRadius = (p: typeof projects[0]) => {
    if (overlay === 'value') {
      if (p.valueUsd >= 10_000_000_000) return 14;
      if (p.valueUsd >= 5_000_000_000) return 11;
      if (p.valueUsd >= 1_000_000_000) return 8;
      return 6;
    }
    return 8;
  };

  // Stats
  const avgRisk = filtered.length ? Math.round(filtered.reduce((s, p) => s + p.riskScore, 0) / filtered.length) : 0;
  const avgConf = filtered.length ? Math.round(filtered.reduce((s, p) => s + p.confidence, 0) / filtered.length) : 0;
  const totalValue = filtered.reduce((s, p) => s + p.valueUsd, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" /> Geospatial Intelligence
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={regionFilter} onValueChange={setRegionFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><Filter className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              {regions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sectorFilter} onValueChange={setSectorFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sectors</SelectItem>
              {sectors.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['risk', 'confidence', 'value'] as const).map(o => (
              <button key={o} onClick={() => setOverlay(o)}
                className={`px-3 py-1.5 text-xs capitalize transition-colors ${overlay === o ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                {o}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        <div className="glass-panel rounded-lg p-3 text-center">
          <div className="text-lg font-bold">{filtered.length}</div>
          <div className="text-[10px] text-muted-foreground">Projects</div>
        </div>
        <div className="glass-panel rounded-lg p-3 text-center">
          <div className="text-lg font-bold">{avgRisk}</div>
          <div className="text-[10px] text-muted-foreground">Avg Risk</div>
        </div>
        <div className="glass-panel rounded-lg p-3 text-center">
          <div className="text-lg font-bold">{avgConf}%</div>
          <div className="text-[10px] text-muted-foreground">Avg Confidence</div>
        </div>
        <div className="glass-panel rounded-lg p-3 text-center">
          <div className="text-lg font-bold">${(totalValue / 1e9).toFixed(1)}B</div>
          <div className="text-[10px] text-muted-foreground">Total Value</div>
        </div>
      </div>

      {/* Map */}
      <div className="glass-panel rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 300px)', minHeight: '400px' }}>
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground animate-pulse">Loading map…</div>
        ) : (
          <MapContainer center={[15, 35]} zoom={4} style={{ height: '100%', width: '100%', background: '#0a0f14' }}
            zoomControl={true} attributionControl={false}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution=""
            />
            <MapBoundsUpdater bounds={bounds} />
            {filtered.map(p => (
              <CircleMarker
                key={p.id}
                center={[p.lat, p.lng]}
                radius={getRadius(p)}
                pathOptions={{
                  fillColor: getColor(p),
                  fillOpacity: 0.7,
                  color: getColor(p),
                  weight: 1.5,
                  opacity: 0.9,
                }}
              >
                <Popup className="dark-popup">
                  <div className="text-xs space-y-1 min-w-[180px]">
                    <div className="font-semibold text-sm">{p.name}</div>
                    <div className="text-muted-foreground">{p.country} · {p.region}</div>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px]">{p.sector}</Badge>
                      <Badge variant="outline" className="text-[10px]">{p.stage}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-1 mt-2 text-center">
                      <div><div className="font-bold">{p.riskScore}</div><div className="text-[9px] text-muted-foreground">Risk</div></div>
                      <div><div className="font-bold">{p.confidence}%</div><div className="text-[9px] text-muted-foreground">Confidence</div></div>
                      <div><div className="font-bold text-[11px]">{p.valueLabel}</div><div className="text-[9px] text-muted-foreground">Value</div></div>
                    </div>
                    <Link to={`/dashboard/projects/${p.id}`} className="block text-center text-primary text-[10px] mt-2 hover:underline">
                      View details →
                    </Link>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="font-medium">Legend:</span>
        {overlay === 'risk' && <>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Low (&lt;25)</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Medium (25-49)</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />High (50-74)</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-600" />Critical (75+)</span>
        </>}
        {overlay === 'confidence' && <>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />&lt;60%</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />60-79%</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />80%+</span>
        </>}
        {overlay === 'value' && <>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" />&lt;$1B</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />$1-5B</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />$5B+</span>
        </>}
      </div>
    </div>
  );
}
