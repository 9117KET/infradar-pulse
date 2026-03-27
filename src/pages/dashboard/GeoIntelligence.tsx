import { useState, useMemo, useRef, useEffect } from 'react';
import L from 'leaflet';
import { useProjects } from '@/hooks/use-projects';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Layers, Filter } from 'lucide-react';
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

export default function GeoIntelligence() {
  const { projects, loading } = useProjects();
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [overlay, setOverlay] = useState<'risk' | 'confidence' | 'value'>('risk');
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);

  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (regionFilter !== 'all' && p.region !== regionFilter) return false;
      if (sectorFilter !== 'all' && p.sector !== sectorFilter) return false;
      return true;
    });
  }, [projects, regionFilter, sectorFilter]);

  const regions = [...new Set(projects.map(p => p.region))];
  const sectors = [...new Set(projects.map(p => p.sector))];

  const getColor = (p: typeof projects[0]) => {
    if (overlay === 'risk') return RISK_COLORS[getRiskLevel(p.riskScore)];
    if (overlay === 'confidence') {
      if (p.confidence >= 80) return '#22c55e';
      if (p.confidence >= 60) return '#f59e0b';
      return '#ef4444';
    }
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

  // Initialize map after loading completes
  useEffect(() => {
    if (loading || !mapContainerRef.current || mapRef.current) return;
    
    // Small delay to ensure container has dimensions
    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return;
      const map = L.map(mapContainerRef.current, {
        center: [15, 35],
        zoom: 4,
        zoomControl: true,
        attributionControl: false,
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
      mapRef.current = map;
      
      // Force resize after init
      setTimeout(() => map.invalidateSize(), 100);
    }, 50);

    return () => {
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [loading]);

  // Update markers when data/overlay/filters change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Add new markers
    filtered.forEach(p => {
      const color = getColor(p);
      const radius = getRadius(p);
      const marker = L.circleMarker([p.lat, p.lng], {
        radius,
        fillColor: color,
        fillOpacity: 0.7,
        color,
        weight: 1.5,
        opacity: 0.9,
      });

      const popupHtml = `
        <div style="font-size:12px;min-width:180px">
          <div style="font-weight:600;font-size:13px;margin-bottom:4px">${p.name}</div>
          <div style="color:#888">${p.country} · ${p.region}</div>
          <div style="display:flex;gap:6px;margin-top:4px">
            <span style="border:1px solid #555;border-radius:4px;padding:1px 6px;font-size:10px">${p.sector}</span>
            <span style="border:1px solid #555;border-radius:4px;padding:1px 6px;font-size:10px">${p.stage}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-top:8px;text-align:center">
            <div><div style="font-weight:700">${p.riskScore}</div><div style="font-size:9px;color:#888">Risk</div></div>
            <div><div style="font-weight:700">${p.confidence}%</div><div style="font-size:9px;color:#888">Confidence</div></div>
            <div><div style="font-weight:700;font-size:11px">${p.valueLabel}</div><div style="font-size:9px;color:#888">Value</div></div>
          </div>
          <a href="/dashboard/projects/${p.id}" style="display:block;text-align:center;color:#6bd8cb;font-size:10px;margin-top:8px;text-decoration:none">View details →</a>
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.addTo(map);
      markersRef.current.push(marker);
    });

    // Fit bounds
    if (filtered.length > 0) {
      const bounds = L.latLngBounds(filtered.map(p => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 6 });
    }
  }, [filtered, overlay]);

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
      <div className="glass-panel rounded-xl overflow-hidden relative" style={{ height: 'calc(100vh - 300px)', minHeight: '400px' }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground animate-pulse z-10">Loading map…</div>
        )}
        <div ref={mapContainerRef} style={{ height: '100%', width: '100%', background: '#0a0f14' }} />
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
