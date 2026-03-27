import { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, extend, type ThreeElements } from '@react-three/fiber';
import { OrbitControls, Sphere, Line } from '@react-three/drei';
import * as THREE from 'three';
import { PROJECTS, statusColor } from '@/data/projects';

function latLngToVector3(lat: number, lng: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

function GlobeWireframe() {
  const ref = useRef<THREE.Group>(null);

  useFrame((_state, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.08;
  });

  const gridLines = useMemo(() => {
    const lines: [number, number, number][][] = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: [number, number, number][] = [];
      for (let lng = 0; lng <= 360; lng += 3) {
        pts.push(latLngToVector3(lat, lng, 1.01));
      }
      lines.push(pts);
    }
    for (let lng = 0; lng < 360; lng += 30) {
      const pts: [number, number, number][] = [];
      for (let lat = -90; lat <= 90; lat += 3) {
        pts.push(latLngToVector3(lat, lng, 1.01));
      }
      lines.push(pts);
    }
    return lines;
  }, []);

  const continentPoints = useMemo(() => {
    const africa: [number, number][] = [
      [37.5, -10], [36, 0], [35, 10], [32, 15], [30, 20], [28, 25], [25, 30],
      [22, 32], [18, 35], [13, 38], [10, 40], [5, 43], [2, 44], [-2, 42],
      [-5, 40], [-10, 38], [-15, 35], [-20, 30], [-25, 28], [-30, 25],
      [-34, 18], [-34, 22], [-30, 30], [-25, 33], [-20, 35], [-15, 38],
      [-10, 42], [-5, 45], [0, 48], [5, 50], [10, 48], [12, 45], [11, 40],
      [10, 35], [8, 20], [5, 10], [5, 3], [6, -5], [10, -15], [15, -17],
      [20, -18], [25, -15], [30, -12], [35, -5], [37.5, -10],
    ];
    return africa.map(([lat, lng]) => latLngToVector3(lat, lng, 1.015));
  }, []);

  const projectMarkers = useMemo(() => {
    return PROJECTS.map(p => ({
      position: latLngToVector3(p.lat, p.lng, 1.03) as [number, number, number],
      color: statusColor[p.status],
      name: p.name,
    }));
  }, []);

  return (
    <group ref={ref}>
      <Sphere args={[1, 48, 48]}>
        <meshStandardMaterial color="#0d1117" transparent opacity={0.85} />
      </Sphere>

      {gridLines.map((pts, i) => (
        <Line key={`grid-${i}`} points={pts} color="#1a2332" lineWidth={0.5} transparent opacity={0.4} />
      ))}

      <Line points={continentPoints} color="#6bd8cb" lineWidth={1} transparent opacity={0.25} />

      {projectMarkers.map((marker, i) => (
        <group key={i} position={marker.position}>
          <mesh>
            <sphereGeometry args={[0.035, 16, 16]} />
            <meshBasicMaterial color={marker.color} transparent opacity={0.35} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.018, 12, 12]} />
            <meshBasicMaterial color={marker.color} />
          </mesh>
        </group>
      ))}

      <mesh>
        <sphereGeometry args={[1.06, 48, 48]} />
        <meshBasicMaterial color="#6bd8cb" transparent opacity={0.04} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

function PulsingRings() {
  const ref1 = useRef<THREE.Mesh>(null);
  const ref2 = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ref1.current) {
      const s1 = 1.08 + Math.sin(t * 0.8) * 0.02;
      ref1.current.scale.setScalar(s1);
      (ref1.current.material as THREE.MeshBasicMaterial).opacity = 0.06 + Math.sin(t * 0.8) * 0.03;
    }
    if (ref2.current) {
      const s2 = 1.12 + Math.sin(t * 0.5 + 1) * 0.02;
      ref2.current.scale.setScalar(s2);
      (ref2.current.material as THREE.MeshBasicMaterial).opacity = 0.03 + Math.sin(t * 0.5 + 1) * 0.02;
    }
  });

  return (
    <>
      <mesh ref={ref1}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshBasicMaterial color="#6bd8cb" transparent opacity={0.06} side={THREE.BackSide} />
      </mesh>
      <mesh ref={ref2}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshBasicMaterial color="#6bd8cb" transparent opacity={0.03} side={THREE.BackSide} />
      </mesh>
    </>
  );
}

export function InteractiveGlobe({ className }: { className?: string }) {
  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <Canvas
        camera={{ position: [0, 0.5, 2.8], fov: 40 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.3} />
        <directionalLight position={[5, 3, 5]} intensity={0.6} color="#6bd8cb" />
        <pointLight position={[-5, -3, -5]} intensity={0.2} color="#6bd8cb" />
        <Suspense fallback={null}>
          <GlobeWireframe />
          <PulsingRings />
        </Suspense>
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate={false}
          minPolarAngle={Math.PI * 0.3}
          maxPolarAngle={Math.PI * 0.7}
        />
      </Canvas>
    </div>
  );
}
