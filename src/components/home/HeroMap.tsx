import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface HeroProject {
  lat: number;
  lng: number;
  name: string;
  country: string;
  sector: string;
  riskScore: number;
  valueLabel: string;
  id: string;
}

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

export function HeroMap({ projects, className }: { projects: HeroProject[]; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const [ready, setReady] = useState(false);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      const map = L.map(containerRef.current, {
        center: [20, 0],
        zoom: 2,
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: true,
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
      mapRef.current = map;
      setReady(true);
      setTimeout(() => map.invalidateSize(), 100);
    }, 100);
    return () => {
      clearTimeout(timer);
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; setReady(false); }
    };
  }, []);

  // Update markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    projects.forEach(p => {
      const color = RISK_COLORS[getRiskLevel(p.riskScore)];
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 0.5,
        fillColor: color,
        fillOpacity: 0.9,
        color,
        weight: 0.5,
        opacity: 1,
      });

      marker.bindPopup(`
        <div style="font-size:12px;min-width:160px">
          <div style="font-weight:600;font-size:13px;margin-bottom:2px">${p.name}</div>
          <div style="color:#888;font-size:11px">${p.country} · ${p.sector}</div>
          <div style="display:flex;gap:8px;margin-top:6px">
            <span style="font-size:10px">Risk: <b>${p.riskScore}</b></span>
            <span style="font-size:10px">Value: <b>${p.valueLabel}</b></span>
          </div>
        </div>
      `);

      marker.addTo(map);
      markersRef.current.push(marker);
    });

    if (projects.length > 0) {
      const bounds = L.latLngBounds(projects.map(p => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 8 });
    }
  }, [projects, ready]);

  return (
    <div className={className} style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: '1rem', background: '#0a0f14' }} />
      {/* Gradient overlay for blending into background */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl" style={{
        background: 'linear-gradient(to right, hsl(var(--background)) 0%, transparent 15%, transparent 85%, hsl(var(--background)) 100%)',
      }} />
      <div className="pointer-events-none absolute inset-0 rounded-2xl" style={{
        background: 'linear-gradient(to bottom, hsl(var(--background)) 0%, transparent 10%, transparent 90%, hsl(var(--background)) 100%)',
      }} />
    </div>
  );
}
