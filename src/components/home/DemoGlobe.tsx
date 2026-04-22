import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { geoEquirectangular, geoGraticule10, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import * as THREE from 'three';
import { Globe as GlobeIcon } from 'lucide-react';
import { isWebGLAvailable } from '@/lib/webgl';
import landData from 'world-atlas/land-110m.json';

interface GlobeProject {
  lat: number;
  lng: number;
  risk_score: number;
  name: string;
  sector?: string;
  country?: string;
}

function riskColor(score: number): string {
  if (score >= 75) return 'hsl(var(--destructive))';
  if (score >= 50) return 'hsl(38 92% 50%)';
  if (score >= 25) return 'hsl(142 71% 45%)';
  return 'hsl(var(--primary))';
}

function resolveCssHsl(variableName: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value ? `hsl(${value})` : fallback;
}

function createGlobeTexture(colors: { ocean: string; land: string; border: string; grid: string }) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = colors.ocean;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const topology = landData as any;
  const land = feature(topology, topology.objects.land as any) as any;
  const borders = mesh(topology, topology.objects.countries as any, (a: any, b: any) => a !== b) as any;
  const projection = geoEquirectangular().fitExtent(
    [[10, 10], [canvas.width - 10, canvas.height - 10]],
    land
  );
  const path = geoPath(projection, ctx);

  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.4;
  path(geoGraticule10() as any);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.fillStyle = colors.land;
  path(land);
  ctx.fill();

  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1.25;
  path(borders);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function latLngToVector(lat: number, lng: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);

  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

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

function StaticGlobeFallback({ projectCount }: { projectCount: number }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 gap-3">
      <GlobeIcon className="h-10 w-10 text-primary/70" />
      <p className="text-sm font-medium text-foreground">Global pipeline coverage across 14 regions</p>
      <p className="text-xs text-muted-foreground max-w-sm">
        {projectCount > 0
          ? `${projectCount.toLocaleString()} verified infrastructure projects tracked.`
          : 'Verified infrastructure projects across emerging and OECD markets.'}{' '}
        Switch to Map view for a detailed 2D exploration.
      </p>
    </div>
  );
}

function CameraRig() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 0.5, 3.8);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 0.08;
    camera.position.x = Math.sin(t) * 0.35;
    camera.position.z = 3.8 + Math.cos(t) * 0.1;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

function GlobeScene({
  projects,
  colors,
}: {
  projects: GlobeProject[];
  colors: {
    ocean: string;
    land: string;
    border: string;
    glow: string;
    muted: string;
    grid: string;
  };
}) {
  const groupRef = useRef<THREE.Group>(null);
  const pulseRefs = useRef<Array<THREE.Mesh | null>>([]);
  const globeTexture = useMemo(
    () => createGlobeTexture({
      ocean: colors.ocean,
      land: colors.land,
      border: colors.border,
      grid: colors.grid,
    }),
    [colors.border, colors.grid, colors.land, colors.ocean]
  );

  useEffect(() => () => globeTexture?.dispose(), [globeTexture]);

  const markers = useMemo(
    () =>
      projects.slice(0, 300).map((project) => {
        const position = latLngToVector(project.lat, project.lng, 1.03);
        const normal = position.clone().normalize();
        return {
          ...project,
          position,
          normal,
          color: riskColor(project.risk_score),
        };
      }),
    [projects]
  );

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = clock.getElapsedTime() * 0.08;
    }

    pulseRefs.current.forEach((mesh, index) => {
      if (!mesh) return;
      const t = clock.getElapsedTime() * 1.8 + index * 0.35;
      const scale = 1 + ((Math.sin(t) + 1) / 2) * 1.6;
      mesh.scale.setScalar(scale);
      const material = mesh.material;
      if (material instanceof THREE.MeshBasicMaterial) {
        material.opacity = 0.12 + ((Math.sin(t) + 1) / 2) * 0.18;
      }
    });
  });

  return (
    <group ref={groupRef}>
      <ambientLight intensity={1.2} />
      <directionalLight position={[3, 2, 4]} intensity={1.8} color={colors.glow} />
      <directionalLight position={[-4, -2, -3]} intensity={0.6} color={colors.muted} />

      <mesh>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial
          map={globeTexture ?? undefined}
          color={colors.land}
          emissive={colors.glow}
          emissiveIntensity={0.03}
          roughness={0.88}
          metalness={0.08}
        />
      </mesh>

      <mesh scale={1.025}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshBasicMaterial color={colors.glow} transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>

      {markers.map((marker, index) => {
        const rotation = new THREE.Euler().setFromQuaternion(
          new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            marker.normal.clone().normalize()
          )
        );

        return (
          <group key={`${marker.name}-${index}`} position={marker.position} rotation={rotation}>
            <mesh>
              <cylinderGeometry args={[0.006, 0.006, 0.12, 8]} />
              <meshStandardMaterial color={marker.color} emissive={marker.color} emissiveIntensity={0.45} />
            </mesh>
            <mesh position={[0, 0.075, 0]}>
              <sphereGeometry args={[0.018, 12, 12]} />
              <meshStandardMaterial color={marker.color} emissive={marker.color} emissiveIntensity={0.6} />
            </mesh>
            <mesh ref={(node) => (pulseRefs.current[index] = node)} position={[0, 0.075, 0]}>
              <sphereGeometry args={[0.028, 16, 16]} />
              <meshBasicMaterial color={marker.color} transparent opacity={0.18} />
            </mesh>
          </group>
        );
      })}

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        minPolarAngle={Math.PI * 0.28}
        maxPolarAngle={Math.PI * 0.72}
        rotateSpeed={0.45}
        autoRotate={false}
      />
    </group>
  );
}

export function DemoGlobe({
  projects,
  className,
}: {
  projects: GlobeProject[];
  className?: string;
}) {
  const [webglOk] = useState<boolean>(() => isWebGLAvailable());
  const colors = useMemo(
    () => ({
      background: resolveCssHsl('--background', 'hsl(210 15% 6%)'),
      card: resolveCssHsl('--card', 'hsl(210 12% 9%)'),
      primary: resolveCssHsl('--primary', 'hsl(170 55% 63%)'),
      foreground: resolveCssHsl('--foreground', 'hsl(180 10% 92%)'),
      muted: resolveCssHsl('--muted-foreground', 'hsl(210 8% 55%)'),
    }),
    []
  );

  if (!webglOk) {
    return (
      <div
        className={className}
        style={{ position: 'relative', overflow: 'hidden', background: colors.background }}
      >
        <StaticGlobeFallback projectCount={projects.length} />
        <div
          className="pointer-events-none absolute inset-0 rounded-xl"
          style={{
            background:
              `radial-gradient(ellipse at center, transparent 55%, ${colors.background} 100%)`,
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background:
          `radial-gradient(circle at 50% 45%, ${colors.card} 0%, ${colors.background} 72%)`,
      }}
    >
      <Suspense fallback={<GlobeFallback />}>
        <Canvas dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }} camera={{ fov: 34, near: 0.1, far: 100 }}>
          <fog attach="fog" args={[colors.background, 3.6, 6.6]} />
          <CameraRig />
          <GlobeScene
            projects={projects}
            colors={{
              ocean: colors.background,
              land: colors.foreground,
              border: colors.card,
              glow: colors.primary,
              muted: colors.muted,
              grid: colors.muted,
            }}
          />
        </Canvas>
      </Suspense>

      <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
        <div className="rounded-md border border-border/50 bg-background/60 px-3 py-1.5 text-[10px] font-mono text-muted-foreground backdrop-blur-sm">
          Drag to rotate · risk signals pulse by severity
        </div>
      </div>

      <div
        className="pointer-events-none absolute inset-0 rounded-xl"
        style={{
          background:
            `radial-gradient(ellipse at center, transparent 52%, ${colors.background} 100%)`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at center, ${colors.primary}1A 0%, transparent 45%)`,
        }}
      />
    </div>
  );
}