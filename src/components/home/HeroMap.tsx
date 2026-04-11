import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PublicProjectLocation } from '@/hooks/use-public-project-locations';

const RISK_COLORS: Record<string, string> = {
  low: '#6bd8cb',
  medium: '#22c55e',
  high: '#f59e0b',
  critical: '#dc2626',
};

function getRiskLevel(score: number) {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

function getMarkerRadius(zoom: number) {
  if (zoom >= 8) return 8;
  if (zoom >= 5) return 5;
  return 3;
}

export function HeroMap({ projects, className }: { projects: PublicProjectLocation[]; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const [ready, setReady] = useState(false);
  const zoomRef = useRef(2); // use ref so the markers effect always sees latest zoom
  const [zoomDisplay, setZoomDisplay] = useState(2); // drives re-render

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      const map = L.map(containerRef.current, {
        center: [20, 0],
        zoom: 2,
        zoomControl: true,       // show +/- buttons
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: true,   // allow scroll-to-zoom on desktop
        doubleClickZoom: true,
        touchZoom: true,
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
      map.on('zoomend', () => {
        zoomRef.current = map.getZoom();
        setZoomDisplay(map.getZoom());
      });
      mapRef.current = map;
      setReady(true);
      setTimeout(() => map.invalidateSize(), 100);
    }, 100);
    return () => {
      clearTimeout(timer);
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; setReady(false); }
    };
  }, []);

  // Re-render markers when projects or zoom level crosses a threshold
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const zoom = zoomRef.current;
    const radius = getMarkerRadius(zoom);
    const showName = zoom >= 8;

    projects.forEach(p => {
      const color = RISK_COLORS[getRiskLevel(p.risk_score)];
      const marker = L.circleMarker([p.lat, p.lng], {
        radius,
        fillColor: color,
        fillOpacity: 0.9,
        color,
        weight: 0.5,
        opacity: 1,
        interactive: showName, // only interactive when name would be shown
      });

      if (showName) {
        // Tooltip (hover) shows name only — no other project details on the public site
        marker.bindTooltip(`<span style="font-size:12px;font-weight:600">${p.name}</span>`, {
          permanent: false,
          sticky: true,
          direction: 'top',
          offset: [0, -6],
          className: 'leaflet-infradar-tooltip',
        });
      }

      marker.addTo(map);
      markersRef.current.push(marker);
    });
  }, [projects, ready, zoomDisplay]);

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
      {zoomDisplay < 5 && (
        <div className="pointer-events-none absolute bottom-3 right-16 z-[1000] text-[10px] text-muted-foreground bg-background/60 backdrop-blur-sm rounded px-2 py-1 font-mono">
          Scroll or pinch to zoom in
        </div>
      )}
      {/* Minimal tooltip styling to match the dark theme */}
      <style>{`
        .leaflet-infradar-tooltip {
          background: rgba(10,15,20,0.95);
          border: 1px solid rgba(107,216,203,0.25);
          border-radius: 6px;
          color: #fff;
          padding: 5px 9px;
          box-shadow: 0 0 12px rgba(107,216,203,0.1);
        }
        .leaflet-infradar-tooltip::before { display: none; }
      `}</style>
    </div>
  );
}
