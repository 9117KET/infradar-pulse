import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Globe as GlobeIcon } from 'lucide-react';
import { isWebGLAvailable } from '@/lib/webgl';

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

function GlobeScene({ projects }: { projects: GlobeProject[] }) {
  const groupRef = useRef<THREE.Group>(null);
  const pulseRefs = useRef<Array<THREE.Mesh | null>>([]);

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
      <directionalLight position={[3, 2, 4]} intensity={1.8} color="hsl(var(--primary))" />
      <directionalLight position={[-4, -2, -3]} intensity={0.6} color="hsl(var(--muted-foreground))" />

      <mesh>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial
          color={'hsl(var(--card))'}
          emissive={'hsl(var(--primary))'}
          emissiveIntensity={0.08}
          roughness={0.92}
          metalness={0.08}
        />
      </mesh>

      <mesh scale={1.025}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshBasicMaterial color={'hsl(var(--primary))'} transparent opacity={0.08} side={THREE.BackSide} />
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

  if (!webglOk) {
    return (
      <div
        className={className}
        style={{ position: 'relative', overflow: 'hidden', background: 'hsl(var(--background))' }}
      >
        <StaticGlobeFallback projectCount={projects.length} />
        <div
          className="pointer-events-none absolute inset-0 rounded-xl"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 55%, hsl(var(--background)) 100%)',
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
          'radial-gradient(circle at 50% 45%, hsl(var(--card)) 0%, hsl(var(--background)) 72%)',
      }}
    >
      <Suspense fallback={<GlobeFallback />}>
        <Canvas dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }} camera={{ fov: 34, near: 0.1, far: 100 }}>
          <color attach="background" args={['#000000']} />
          <fog attach="fog" args={['#05080b', 3.6, 6.6]} />
          <CameraRig />
          <GlobeScene projects={projects} />
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
            'radial-gradient(ellipse at center, transparent 52%, hsl(var(--background)) 100%)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.10),transparent_45%)]" />
      <Html as="div" wrapperClass="hidden" />
    </div>
  );
}