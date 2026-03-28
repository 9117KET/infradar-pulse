import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapProject {
  lat: number;
  lng: number;
  riskScore: number;
  name: string;
}

function getRiskColor(score: number) {
  if (score >= 75) return '#dc2626';
  if (score >= 50) return '#ef4444';
  if (score >= 25) return '#f59e0b';
  return '#22c55e';
}

export default function OverviewMap({ projects }: { projects: MapProject[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      const map = L.map(containerRef.current, {
        center: [15, 35],
        zoom: 3,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
      mapRef.current = map;
      setReady(true);
      setTimeout(() => map.invalidateSize(), 100);
    }, 50);
    return () => {
      clearTimeout(timer);
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; setReady(false); }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !ready) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    projects.forEach(p => {
      const color = getRiskColor(p.riskScore);
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 6,
        fillColor: color,
        fillOpacity: 0.7,
        color,
        weight: 1.5,
        opacity: 0.9,
      });
      marker.addTo(mapRef.current!);
      markersRef.current.push(marker);
    });
  }, [projects, ready]);

  return (
    <div className="glass-panel rounded-xl p-5">
      <h3 className="font-serif text-lg font-semibold mb-3">Project locations — risk heatmap</h3>
      <div ref={containerRef} className="w-full h-[280px] rounded-lg overflow-hidden" />
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#22c55e]" />Low</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]" />Medium</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]" />High</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#dc2626]" />Critical</span>
      </div>
    </div>
  );
}
