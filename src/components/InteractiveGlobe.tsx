import { useRef, useMemo, useState, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { geoInterpolate, geoPath, geoOrthographic } from 'd3-geo';
import { feature } from 'topojson-client';
import landData from 'world-atlas/land-110m.json';
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

function buildLandTexture() {
  const size = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const projection = geoOrthographic()
    .translate([size / 2, size / 2])
    .scale(size * 0.47)
    .clipAngle(90)
    .rotate([-15, -10]);

  const path = geoPath(projection, ctx);
  const land = feature(landData as any, (landData as any).objects.land) as any;

  ctx.clearRect(0, 0, size, size);

  const bgGradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.15, size / 2, size / 2, size * 0.5);
  bgGradient.addColorStop(0, 'rgba(14,24,38,0.98)');
  bgGradient.addColorStop(1, 'rgba(7,13,22,0.98)');
  ctx.fillStyle = bgGradient;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.48, 0, Math.PI * 2);
  ctx.fill();

  const graticuleColor = 'rgba(40, 98, 124, 0.28)';
  ctx.strokeStyle = graticuleColor;
  ctx.lineWidth = 1;

  for (let lat = -75; lat <= 75; lat += 15) {
    ctx.beginPath();
    for (let lng = -180; lng <= 180; lng += 2) {
      const p = projection([lng, lat]);
      if (!p) continue;
      if (lng === -180) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
  }

  for (let lng = -180; lng < 180; lng += 15) {
    ctx.beginPath();
    for (let lat = -89; lat <= 89; lat += 2) {
      const p = projection([lng, lat]);
      if (!p) continue;
      if (lat === -89) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
  }

  ctx.beginPath();
  path(land);
  ctx.fillStyle = 'rgba(107,216,203,0.18)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(107,216,203,0.55)';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.48, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(107,216,203,0.28)';
  ctx.lineWidth = 3;
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function GlobeScene() {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useFrame((_state, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.06;
  });

  const landTexture = useMemo(() => buildLandTexture(), []);

  const markers = useMemo(
    () =>
      PROJECTS.map((p) => ({
        id: p.id,
        position: latLngToVector3(p.lat, p.lng, 1.03) as [number, number, number],
        color: statusColor[p.status],
        name: p.name,
        country: p.country,
        valueLabel: p.valueLabel,
        confidence: p.confidence,
      })),
    []
  );

  return (
    <group ref={groupRef}>
      <Sphere args={[1, 96, 96]}>
        <meshPhongMaterial
          map={landTexture ?? undefined}
          color="#0d1726"
          emissive="#0b1522"
          emissiveIntensity={0.35}
          transparent
          opacity={0.98}
          shininess={18}
        />
      </Sphere>

      <Sphere args={[1.004, 96, 96]}>
        <meshBasicMaterial wireframe color="#18405b" transparent opacity={0.08} />
      </Sphere>

      {markers.map((m) => (
        <group key={m.id} position={m.position}>
          <mesh onPointerOver={() => setHovered(m.id)} onPointerOut={() => setHovered(null)}>
            <sphereGeometry args={[0.042, 18, 18]} />
            <meshBasicMaterial color={m.color} transparent opacity={hovered === m.id ? 0.55 : 0.22} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.019, 12, 12]} />
            <meshBasicMaterial color={m.color} />
          </mesh>
          <Line
            points={[[0, 0, 0], [0, 0.08, 0]]}
            color={m.color}
            lineWidth={1}
            transparent
            opacity={0.6}
          />
          <Html position={[0, 0.1, 0]} center distanceFactor={4} occlude={false} style={{ pointerEvents: 'none' }}>
            <div
              className="whitespace-nowrap select-none"
              style={{
                background: hovered === m.id ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0.68)',
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
              <div style={{ fontWeight: 600, marginBottom: hovered === m.id ? 2 : 0 }}>{m.name}</div>
              {hovered === m.id && (
                <div style={{ fontSize: '9px', color: '#9ca3af' }}>
                  {m.country} · {m.valueLabel} · {m.confidence}% conf
                </div>
              )}
            </div>
          </Html>
        </group>
      ))}

      <Sphere args={[1.05, 64, 64]}>
        <meshBasicMaterial color="#6bd8cb" transparent opacity={0.03} side={THREE.BackSide} />
      </Sphere>
      <Sphere args={[1.1, 64, 64]}>
        <meshBasicMaterial color="#6bd8cb" transparent opacity={0.015} side={THREE.BackSide} />
      </Sphere>
    </group>
  );
}

export function InteractiveGlobe({ className }: { className?: string }) {
  return (
    <div className={className} style={{ width: '100%', height: '100%', minHeight: 520 }}>
      <Canvas
        camera={{ position: [0, 0.25, 2.55], fov: 40 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent', width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 3, 5]} intensity={1} color="#d9fffa" />
        <directionalLight position={[-4, -2, -4]} intensity={0.35} color="#63c9c1" />
        <pointLight position={[0, 2.5, 1.5]} intensity={0.3} color="#6bd8cb" />
        <Suspense fallback={null}>
          <GlobeScene />
        </Suspense>
        <OrbitControls enableZoom={false} enablePan={false} autoRotate={false} minPolarAngle={Math.PI * 0.28} maxPolarAngle={Math.PI * 0.72} rotateSpeed={0.45} />
      </Canvas>
    </div>
  );
}
