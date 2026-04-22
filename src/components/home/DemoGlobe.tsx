import { useEffect, useRef, useState, lazy, Suspense, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { isWebGLAvailable } from '@/lib/webgl';
import { Globe as GlobeIcon } from 'lucide-react';

// Lazy-load react-globe.gl so it doesn't block initial paint
const GlobeGL = lazy(() => import('react-globe.gl'));

interface GlobeProject {
  lat: number;
  lng: number;
  risk_score: number;
  name: string;
  sector?: string;
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
  if (score >= 75) return '#dc2626'; // red   – critical
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
  // Detect WebGL once on mount. If unavailable, render a static fallback so
  // the homepage stays usable for headless reviewers, locked-down browsers,
  // and bots that can't initialize a WebGL context.
  const [webglOk] = useState<boolean>(() => isWebGLAvailable());

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

      // Defensive: react-globe.gl's internal cleanup calls
      // `state.renderObjs._destructor()` on unmount, but in some Three.js
      // version combos `renderObjs` is a function (not an object with a
      // _destructor method). That throws inside React's passive unmount
      // phase — which ErrorBoundaries CANNOT catch — and blanks the whole
      // page when navigating away from the homepage. Patching it to a
      // no-op makes unmount safe across versions.
      try {
        const inst: any = globeRef.current;
        const state = inst.__state || inst._state || inst.state || inst;
        const ro = state?.renderObjs;
        if (ro && typeof ro._destructor !== 'function') {
          ro._destructor = () => {};
        }
        // Also patch the instance itself in case the lib reads it directly.
        if (inst && typeof inst._destructor !== 'function') {
          inst._destructor = () => {};
        }
      } catch {
        // best-effort only
      }
    }
  }, []);

  // Deep ocean material — matches the CartoDB dark map water color
  const oceanMaterial = useMemo(
    () =>
      new THREE.MeshPhongMaterial({
        color: new THREE.Color('#0a0f14'),   // near-black, matches map bg
        emissive: new THREE.Color('#0d131a'),
        emissiveIntensity: 0.3,
        shininess: 6,
        specular: new THREE.Color('#1a2030'),
      }),
    []
  );

  const pointsData: PointDatum[] = projects.map(p => ({
    lat: p.lat,
    lng: p.lng,
    color: riskColor(p.risk_score),
    size: 0.45,
    label: `
      <div style="
        background:rgba(10,15,20,0.95);
        border:1px solid rgba(107,216,203,0.25);
        border-radius:6px;
        padding:7px 10px;
        font-family:system-ui,sans-serif;
        box-shadow:0 0 16px rgba(107,216,203,0.1);
      ">
        <div style="font-size:12px;font-weight:600;color:#fff">${p.name}</div>
      </div>
    `,
  }));

  // Static fallback when the browser can't initialize WebGL — keeps the
  // homepage looking intentional rather than broken.
  if (!webglOk) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{ position: 'relative', overflow: 'hidden', background: '#0a0f14' }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 gap-3">
          <GlobeIcon className="h-10 w-10 text-primary/70" />
          <p className="text-sm font-medium text-foreground">
            Global pipeline coverage across 14 regions
          </p>
          <p className="text-xs text-muted-foreground max-w-sm">
            {projects.length > 0
              ? `${projects.length.toLocaleString()} verified infrastructure projects tracked.`
              : 'Verified infrastructure projects across emerging and OECD markets.'}
            {' '}Switch to Map view for an interactive 2D version.
          </p>
        </div>
        <div
          className="pointer-events-none absolute inset-0 rounded-xl"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 60%, hsl(var(--background)) 100%)',
          }}
        />
      </div>
    );
  }

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
          polygonCapColor={() => '#1a1f24'}      // dark charcoal continent fill — matches CartoDB land
          polygonSideColor={() => '#141820'}
          polygonStrokeColor={() => '#252b35'}   // subtle gray border lines
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
        style={{ background: '#0a0f14' }}
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
