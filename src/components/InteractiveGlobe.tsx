import { useRef, useMemo, useState, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, Html, Line } from '@react-three/drei';
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

function GlobeScene() {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useFrame((_state, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.06;
  });

  const gridLines = useMemo(() => {
    const lines: [number, number, number][][] = [];
    // Latitude
    for (let lat = -60; lat <= 60; lat += 20) {
      const pts: [number, number, number][] = [];
      for (let lng = 0; lng <= 360; lng += 2) pts.push(latLngToVector3(lat, lng, 1.005));
      lines.push(pts);
    }
    // Longitude
    for (let lng = 0; lng < 360; lng += 20) {
      const pts: [number, number, number][] = [];
      for (let lat = -90; lat <= 90; lat += 2) pts.push(latLngToVector3(lat, lng, 1.005));
      lines.push(pts);
    }
    return lines;
  }, []);

  // Simplified continent outlines — Africa, Middle East, Europe edges
  const continents = useMemo(() => {
    const africa: [number, number][] = [
      [35.9, -5.3], [37, 10], [32, 13], [31.5, 25], [30, 31], [27, 34], [23, 36],
      [18, 38], [15, 42], [12, 44], [11, 49], [8, 48], [5, 44], [4, 40],
      [1, 42], [-1, 41], [-5, 39], [-10, 40], [-15, 40], [-20, 35],
      [-26, 33], [-29, 30], [-34, 25], [-34, 18], [-31, 17], [-28, 16],
      [-23, 14], [-17, 12], [-12, 14], [-8, 13], [-5, 12], [-4, 10],
      [-5, 5], [-4, 1], [0, -1], [4, 1], [5, 5], [6, 10], [5, -2],
      [6, -10], [10, -15], [15, -17], [20, -17], [25, -14], [28, -10],
      [30, -4], [33, 0], [35.9, -5.3],
    ];
    const middleEast: [number, number][] = [
      [30, 31], [29, 33], [28, 34], [25, 37], [22, 39], [20, 40],
      [18, 42], [15, 44], [13, 45], [12, 51], [15, 52], [22, 55],
      [24, 56], [26, 56], [25, 52], [28, 50], [30, 48],
      [32, 48], [33, 44], [36, 41], [37, 36], [33, 35], [31, 34], [30, 31],
    ];
    const europe: [number, number][] = [
      [36, -9], [37, -7], [43, -9], [43, -2], [46, 1], [48, -4],
      [48, 2], [51, 2], [54, 5], [56, 8], [58, 6], [60, 5],
      [62, 6], [65, 13], [68, 16], [70, 20], [70, 28],
      [65, 28], [60, 30], [55, 28], [50, 24], [48, 22],
      [46, 15], [44, 12], [42, 14], [40, 18], [38, 24],
      [36, 28], [35, 25], [40, 26], [42, 28], [42, 30],
      [40, 28], [38, 22], [38, 15], [37, 10], [36, -5], [36, -9],
    ];
    return [
      africa.map(([lat, lng]) => latLngToVector3(lat, lng, 1.008)),
      middleEast.map(([lat, lng]) => latLngToVector3(lat, lng, 1.008)),
      europe.map(([lat, lng]) => latLngToVector3(lat, lng, 1.008)),
    ];
  }, []);

  const markers = useMemo(() =>
    PROJECTS.map(p => ({
      id: p.id,
      position: latLngToVector3(p.lat, p.lng, 1.025) as [number, number, number],
      color: statusColor[p.status],
      name: p.name,
      country: p.country,
      valueLabel: p.valueLabel,
      confidence: p.confidence,
      status: p.status,
    }))
  , []);

  return (
    <group ref={groupRef}>
      {/* Core sphere — dark with slight transparency */}
      <Sphere args={[1, 64, 64]}>
        <meshPhongMaterial
          color="#0a1628"
          emissive="#0a1628"
          emissiveIntensity={0.3}
          transparent
          opacity={0.92}
          shininess={10}
        />
      </Sphere>

      {/* Wireframe overlay for texture */}
      <Sphere args={[1.002, 32, 32]}>
        <meshBasicMaterial wireframe color="#1e3a5f" transparent opacity={0.12} />
      </Sphere>

      {/* Grid lines */}
      {gridLines.map((pts, i) => (
        <Line key={`g${i}`} points={pts} color="#1a3a5a" lineWidth={0.6} transparent opacity={0.3} />
      ))}

      {/* Continent outlines */}
      {continents.map((pts, i) => (
        <Line key={`c${i}`} points={pts} color="#6bd8cb" lineWidth={1.5} transparent opacity={0.45} />
      ))}

      {/* Project markers */}
      {markers.map(m => (
        <group key={m.id} position={m.position}>
          {/* Outer glow */}
          <mesh
            onPointerOver={() => setHovered(m.id)}
            onPointerOut={() => setHovered(null)}
          >
            <sphereGeometry args={[0.04, 16, 16]} />
            <meshBasicMaterial color={m.color} transparent opacity={hovered === m.id ? 0.6 : 0.25} />
          </mesh>
          {/* Core pin */}
          <mesh>
            <sphereGeometry args={[0.02, 12, 12]} />
            <meshBasicMaterial color={m.color} />
          </mesh>
          {/* Annotation label */}
          <Html
            position={[0, 0.07, 0]}
            center
            distanceFactor={4}
            occlude={false}
            style={{ pointerEvents: 'none' }}
          >
            <div
              className="whitespace-nowrap select-none"
              style={{
                background: hovered === m.id ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.65)',
                color: '#e0f0ee',
                padding: hovered === m.id ? '6px 10px' : '3px 7px',
                borderRadius: '6px',
                fontSize: hovered === m.id ? '11px' : '9px',
                border: `1px solid ${m.color}40`,
                boxShadow: `0 0 12px ${m.color}20`,
                transition: 'all 0.2s ease',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: hovered === m.id ? 2 : 0 }}>
                {m.name}
              </div>
              {hovered === m.id && (
                <div style={{ fontSize: '9px', color: '#9ca3af' }}>
                  {m.country} · {m.valueLabel} · {m.confidence}% conf
                </div>
              )}
            </div>
          </Html>
        </group>
      ))}

      {/* Atmosphere layers */}
      <Sphere args={[1.05, 48, 48]}>
        <meshBasicMaterial color="#6bd8cb" transparent opacity={0.03} side={THREE.BackSide} />
      </Sphere>
      <Sphere args={[1.1, 48, 48]}>
        <meshBasicMaterial color="#6bd8cb" transparent opacity={0.015} side={THREE.BackSide} />
      </Sphere>
    </group>
  );
}

export function InteractiveGlobe({ className }: { className?: string }) {
  return (
    <div className={className} style={{ width: '100%', height: '100%', minHeight: 480 }}>
      <Canvas
        camera={{ position: [0, 0.4, 2.6], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent', width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 3, 5]} intensity={0.8} color="#aee8df" />
        <directionalLight position={[-3, -2, -4]} intensity={0.3} color="#4a9eab" />
        <pointLight position={[0, 3, 0]} intensity={0.3} color="#6bd8cb" />
        <Suspense fallback={null}>
          <GlobeScene />
        </Suspense>
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate={false}
          minPolarAngle={Math.PI * 0.25}
          maxPolarAngle={Math.PI * 0.75}
          rotateSpeed={0.5}
        />
      </Canvas>
    </div>
  );
}
