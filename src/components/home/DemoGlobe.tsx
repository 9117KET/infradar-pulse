import { useEffect, useRef, useState, lazy, Suspense, useCallback, useMemo } from 'react';
import * as THREE from 'three';

// Lazy-load react-globe.gl so it doesn't block initial paint
const GlobeGL = lazy(() => import('react-globe.gl'));

interface GlobeProject {
  lat: number;
  lng: number;
  riskScore: number;
  name: string;
  sector?: string;
  valueLabel?: string;
  country?: string;
}

interface PointDatum {
  lat: number;
  lng: number;
  color: string;
  size: number;
  label: string;
}

function riskColor(score: number): string {
  if (score >= 75) return '#ef4444'; // red   – critical
  if (score >= 50) return '#f59e0b'; // amber – high
  if (score >= 25) return '#22c55e'; // green – medium
  return '#6bd8cb';                  // teal  – low
}

const GEOJSON_SOURCES = [
  'https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson',
  'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json',
];

function GlobeFallback() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <span className="text-xs text-muted-foreground font-mono">Loading globe…</span>
      </div>
    </div>
  );
}

export function DemoGlobe({
  projects,
  className,
}: {
  projects: GlobeProject[];
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 520 });
  const [countries, setCountries] = useState<object[]>([]);
  const [ready, setReady] = useState(false);

  // Track container size
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      if (e) setDimensions({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(containerRef.current);
    const { width, height } = containerRef.current.getBoundingClientRect();
    if (width > 0) setDimensions({ w: width, h: height });
    return () => ro.disconnect();
  }, []);

  // Load GeoJSON country data with fallback
  useEffect(() => {
    let cancelled = false;
    const tryLoad = async (index: number) => {
      if (index >= GEOJSON_SOURCES.length) return;
      try {
        const res = await fetch(GEOJSON_SOURCES[index]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const features = data.features ?? (Array.isArray(data) ? data : []);
        if (features.length > 0) setCountries(features);
        else throw new Error('empty');
      } catch {
        tryLoad(index + 1);
      }
    };
    tryLoad(0);
    return () => { cancelled = true; };
  }, []);

  // Enable auto-rotation once globe is ready
  const handleGlobeReady = useCallback(() => {
    setReady(true);
    if (globeRef.current) {
      const controls = globeRef.current.controls();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.5;
        controls.enableZoom = false;
        controls.minPolarAngle = Math.PI * 0.2;
        controls.maxPolarAngle = Math.PI * 0.8;
      }
      // Tilt the camera slightly for a nicer perspective
      globeRef.current.pointOfView({ lat: 20, lng: 10, altitude: 2.2 }, 0);
    }
  }, []);

  // Deep ocean material — shown wherever no polygon covers the sphere
  const oceanMaterial = useMemo(
    () =>
      new THREE.MeshPhongMaterial({
        color: new THREE.Color('#071525'),   // deep ocean navy
        emissive: new THREE.Color('#0a1e35'),
        emissiveIntensity: 0.4,
        shininess: 8,
        specular: new THREE.Color('#1a4a6a'),
      }),
    []
  );

  const pointsData: PointDatum[] = projects.map(p => ({
    lat: p.lat,
    lng: p.lng,
    color: riskColor(p.riskScore),
    size: 0.45,
    label: `
      <div style="
        background:rgba(5,13,26,0.95);
        border:1px solid rgba(107,216,203,0.3);
        border-radius:8px;
        padding:10px 12px;
        min-width:180px;
        font-family:system-ui,sans-serif;
        box-shadow:0 0 24px rgba(107,216,203,0.15);
      ">
        <div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:4px">${p.name}</div>
        ${p.country ? `<div style="font-size:11px;color:#9ca3af;margin-bottom:2px">${p.country}</div>` : ''}
        ${p.sector ? `<div style="font-size:11px;color:#9ca3af">${p.sector}${p.valueLabel ? ' · ' + p.valueLabel : ''}</div>` : ''}
        <div style="margin-top:6px;font-size:10px;color:${riskColor(p.riskScore)}">
          Risk score: ${p.riskScore}
        </div>
      </div>
    `,
  }));

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', overflow: 'hidden', background: 'transparent' }}
    >
      <Suspense fallback={<GlobeFallback />}>
        <GlobeGL
          ref={globeRef}
          width={dimensions.w}
          height={dimensions.h}
          // Visuals
          backgroundColor="rgba(0,0,0,0)"
          showAtmosphere
          atmosphereColor="#6bd8cb"
          atmosphereAltitude={0.18}
          showGlobe
          globeImageUrl={null as any}
          globeMaterial={oceanMaterial}
          // Country polygons
          polygonsData={countries}
          polygonAltitude={0.01}
          polygonCapColor={() => '#0f2235'}      // dark navy continent fill
          polygonSideColor={() => '#0a1a2e'}
          polygonStrokeColor={() => '#1e4060'}   // teal-tinted border lines
          polygonLabel={(d: any) => d?.properties?.NAME ?? ''}
          // Project markers
          pointsData={pointsData}
          pointLat="lat"
          pointLng="lng"
          pointColor="color"
          pointRadius="size"
          pointAltitude={0.01}
          pointResolution={6}
          pointLabel="label"
          // Interaction
          enablePointerInteraction
          onGlobeReady={handleGlobeReady}
        />
      </Suspense>

      {/* Base ocean fill – rendered behind the WebGL canvas */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 rounded-xl"
        style={{ background: '#050d1a' }}
      />

      {/* Fade edges to blend into the section background */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 60%, hsl(var(--background)) 100%)',
        }}
      />

      {/* Spinner overlay while globe initialises */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <GlobeFallback />
        </div>
      )}
    </div>
  );
}
