import { useEffect, useMemo, useRef, useState } from 'react';
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

function getMarkerRadius(zoom: number, level: string) {
  const base = zoom >= 8 ? 9 : zoom >= 5 ? 6 : 4;
  // Critical/high get a slight bump for emphasis
  if (level === 'critical') return base + 2;
  if (level === 'high') return base + 1;
  return base;
}

export function HeroMap({
  projects,
  className,
  onProjectClick,
}: {
  projects: PublicProjectLocation[];
  className?: string;
  onProjectClick?: (project: PublicProjectLocation) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const pulseLayerRef = useRef<L.LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const zoomRef = useRef(2);
  const [zoomDisplay, setZoomDisplay] = useState(2);

  const projectsKey = useMemo(
    () => projects.map(p => p.id).join(','),
    [projects]
  );

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      const map = L.map(containerRef.current, {
        center: [20, 0],
        zoom: 2,
        minZoom: 2,
        maxZoom: 12,
        zoomControl: true,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        touchZoom: true,
        worldCopyJump: true,
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 12,
      }).addTo(map);

      layerRef.current = L.layerGroup().addTo(map);
      pulseLayerRef.current = L.layerGroup().addTo(map);

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
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
        pulseLayerRef.current = null;
        setReady(false);
      }
    };
  }, []);

  // Render markers
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    const pulseLayer = pulseLayerRef.current;
    if (!map || !layer || !pulseLayer || !ready) return;

    layer.clearLayers();
    pulseLayer.clearLayers();

    const zoom = zoomRef.current;

    // Sort so critical/high render on top
    const sorted = [...projects].sort((a, b) => a.risk_score - b.risk_score);

    sorted.forEach(p => {
      const level = getRiskLevel(p.risk_score);
      const color = RISK_COLORS[level];
      const radius = getMarkerRadius(zoom, level);

      // Pulse halo for critical risk projects
      if (level === 'critical') {
        const pulse = L.divIcon({
          className: 'infradar-pulse-icon',
          html: `<span class="infradar-pulse" style="--pulse-color:${color}"></span>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker([p.lat, p.lng], { icon: pulse, interactive: false, keyboard: false })
          .addTo(pulseLayer);
      }

      const marker = L.circleMarker([p.lat, p.lng], {
        radius,
        fillColor: color,
        fillOpacity: 0.9,
        color: '#0a0f14',
        weight: 1.2,
        opacity: 1,
        interactive: true,
      });

      marker.bindTooltip(
        `<div style="font-size:11px;line-height:1.4">
          <div style="font-weight:600;color:#fff">${p.name}</div>
          <div style="color:#9ca3af;text-transform:capitalize">${p.sector} · ${p.country}</div>
          <div style="margin-top:2px"><span style="display:inline-block;height:6px;width:6px;border-radius:50%;background:${color};margin-right:4px"></span><span style="color:#fff;text-transform:capitalize">${level} risk</span></div>
        </div>`,
        {
          permanent: false,
          sticky: true,
          direction: 'top',
          offset: [0, -6],
          className: 'leaflet-infradar-tooltip',
        }
      );

      if (onProjectClick) {
        marker.on('click', () => onProjectClick(p));
      }

      marker.addTo(layer);
    });
  }, [projectsKey, ready, zoomDisplay, onProjectClick]);

  return (
    <div className={className} style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: '1rem', background: '#0a0f14' }} />
      {/* Edge fade for blending */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl" style={{
        background: 'linear-gradient(to right, hsl(var(--background)) 0%, transparent 12%, transparent 88%, hsl(var(--background)) 100%)',
      }} />
      <div className="pointer-events-none absolute inset-0 rounded-2xl" style={{
        background: 'linear-gradient(to bottom, hsl(var(--background) / 0.6) 0%, transparent 8%, transparent 92%, hsl(var(--background) / 0.6) 100%)',
      }} />
      {zoomDisplay < 4 && (
        <div className="pointer-events-none absolute bottom-3 right-16 z-[400] text-[10px] text-muted-foreground bg-background/70 backdrop-blur-sm rounded px-2 py-1 font-mono border border-border/50">
          Scroll or pinch to zoom in
        </div>
      )}
      <style>{`
        .leaflet-infradar-tooltip {
          background: rgba(10,15,20,0.95);
          border: 1px solid rgba(107,216,203,0.25);
          border-radius: 6px;
          padding: 6px 9px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }
        .leaflet-infradar-tooltip::before { display: none; }
        .leaflet-container { background: #0a0f14 !important; font-family: inherit; }
        .leaflet-control-zoom a {
          background: rgba(10,15,20,0.85) !important;
          color: #fff !important;
          border: 1px solid rgba(107,216,203,0.2) !important;
          backdrop-filter: blur(8px);
        }
        .leaflet-control-zoom a:hover {
          background: rgba(107,216,203,0.15) !important;
        }
        .infradar-pulse-icon { background: transparent; border: none; }
        .infradar-pulse {
          display: block;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--pulse-color);
          opacity: 0.5;
          animation: infradar-pulse 2s ease-out infinite;
        }
        @keyframes infradar-pulse {
          0%   { transform: scale(0.4); opacity: 0.6; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
