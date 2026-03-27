import { useRef, useMemo, useState, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { feature } from 'topojson-client';
import earcut from 'earcut';
import { PROJECTS, statusColor } from '@/data/projects';

import countriesData from 'world-atlas/countries-110m.json';

/* ── Helpers ──────────────────────────────────────────────── */

function latLngToVec3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function latLngToArray(lat: number, lng: number, radius: number): [number, number, number] {
  const v = latLngToVec3(lat, lng, radius);
  return [v.x, v.y, v.z];
}

/* ── Triangulate a GeoJSON polygon ring onto a sphere ───── */

function ringToSphericalVertices(ring: number[][], radius: number) {
  const verts: number[] = [];
  const flat2d: number[] = [];
  for (const [lng, lat] of ring) {
    const v = latLngToVec3(lat, lng, radius);
    verts.push(v.x, v.y, v.z);
    flat2d.push(lng, lat);
  }
  return { verts, flat2d };
}

function polygonToGeometry(coordinates: number[][][], radius: number): THREE.BufferGeometry | null {
  const outerRing = coordinates[0];
  if (!outerRing || outerRing.length < 4) return null;

  const allVerts: number[] = [];
  const allFlat: number[] = [];
  const holeIndices: number[] = [];

  const outer = ringToSphericalVertices(outerRing, radius);
  for (let i = 0; i < outer.verts.length; i++) allVerts.push(outer.verts[i]);
  for (let i = 0; i < outer.flat2d.length; i++) allFlat.push(outer.flat2d[i]);

  for (let h = 1; h < coordinates.length; h++) {
    holeIndices.push(allFlat.length / 2);
    const hole = ringToSphericalVertices(coordinates[h], radius);
    for (let i = 0; i < hole.verts.length; i++) allVerts.push(hole.verts[i]);
    for (let i = 0; i < hole.flat2d.length; i++) allFlat.push(hole.flat2d[i]);
  }

  const indices = earcut(allFlat, holeIndices.length ? holeIndices : undefined, 2);
  if (!indices.length) return null;

  const positions = new Float32Array(allVerts);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(Array.from(indices));
  geo.computeVertexNormals();
  return geo;
}

function featureToGeometries(feat: any, radius: number): THREE.BufferGeometry[] {
  const geos: THREE.BufferGeometry[] = [];
  if (feat.geometry.type === 'Polygon') {
    const g = polygonToGeometry(feat.geometry.coordinates, radius);
    if (g) geos.push(g);
  } else if (feat.geometry.type === 'MultiPolygon') {
    for (const coords of feat.geometry.coordinates) {
      const g = polygonToGeometry(coords, radius);
      if (g) geos.push(g);
    }
  }
  return geos;
}

/* ── Build border lines from polygon rings ──────────────── */

function ringToBorderPoints(ring: number[][], radius: number): THREE.Vector3[] {
  return ring.map(([lng, lat]) => latLngToVec3(lat, lng, radius));
}

function featureToBorders(feat: any, radius: number): THREE.Vector3[][] {
  const lines: THREE.Vector3[][] = [];
  if (feat.geometry.type === 'Polygon') {
    lines.push(ringToBorderPoints(feat.geometry.coordinates[0], radius));
  } else if (feat.geometry.type === 'MultiPolygon') {
    for (const coords of feat.geometry.coordinates) {
      lines.push(ringToBorderPoints(coords[0], radius));
    }
  }
  return lines;
}

/* ── Country meshes component ───────────────────────────── */

interface CountryData {
  geos: THREE.BufferGeometry[];
  borders: THREE.Vector3[][];
}

function Countries() {
  const countries = useMemo(() => {
    const fc = feature(countriesData as any, (countriesData as any).objects.countries) as any;
    const result: CountryData[] = [];
    const LAND_R = 1.003;
    const BORDER_R = 1.005;

    for (const feat of fc.features) {
      const geos = featureToGeometries(feat, LAND_R);
      const borders = featureToBorders(feat, BORDER_R);
      if (geos.length || borders.length) {
        result.push({ geos, borders });
      }
    }
    return result;
  }, []);

  return (
    <group>
      {countries.map((c, ci) => (
        <group key={ci}>
          {c.geos.map((geo, gi) => (
            <mesh key={`f-${ci}-${gi}`} geometry={geo}>
              <meshPhongMaterial
                color="#0a2a3a"
                emissive="#071e2b"
                emissiveIntensity={0.4}
                transparent
                opacity={0.92}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          ))}
          {c.borders.map((pts, bi) => (
            <Line
              key={`b-${ci}-${bi}`}
              points={pts}
              color="#2a6e7a"
              lineWidth={0.8}
              transparent
              opacity={0.4}
            />
          ))}
        </group>
      ))}
    </group>
  );
}

/* ── Graticule (lat/lng grid lines) ─────────────────────── */

function Graticule() {
  const lines = useMemo(() => {
    const result: THREE.Vector3[][] = [];
    const R = 1.001;
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lng = -180; lng <= 180; lng += 4) {
        pts.push(latLngToVec3(lat, lng, R));
      }
      result.push(pts);
    }
    for (let lng = -180; lng < 180; lng += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lat = -80; lat <= 80; lat += 4) {
        pts.push(latLngToVec3(lat, lng, R));
      }
      result.push(pts);
    }
    return result;
  }, []);

  return (
    <group>
      {lines.map((pts, i) => (
        <Line key={i} points={pts} color="#1a4a5a" lineWidth={0.4} transparent opacity={0.2} />
      ))}
    </group>
  );
}

/* ── Project markers with hover tooltip ─────────────────── */

function ProjectMarkers() {
  const [hovered, setHovered] = useState<string | null>(null);

  const markers = useMemo(
    () =>
      PROJECTS.map((p) => ({
        id: p.id,
        position: latLngToArray(p.lat, p.lng, 1.025),
        color: statusColor[p.status],
        name: p.name,
        country: p.country,
        valueLabel: p.valueLabel,
        confidence: p.confidence,
      })),
    [],
  );

  return (
    <group>
      {markers.map((m) => (
        <group key={m.id}>
          <mesh
            position={m.position}
            onPointerOver={() => setHovered(m.id)}
            onPointerOut={() => setHovered(null)}
          >
            <sphereGeometry args={[0.035, 16, 16]} />
            <meshBasicMaterial color={m.color} transparent opacity={hovered === m.id ? 0.5 : 0.18} />
          </mesh>
          <mesh position={m.position}>
            <sphereGeometry args={[0.015, 12, 12]} />
            <meshBasicMaterial color={m.color} />
          </mesh>
          {hovered === m.id && (
            <Html position={m.position} center style={{ pointerEvents: 'none' }}>
              <div className="rounded-lg border border-white/10 bg-[#0a1628]/90 backdrop-blur-md px-3 py-2 shadow-xl min-w-[160px]">
                <p className="text-xs font-semibold text-white">{m.name}</p>
                <p className="text-[10px] text-white/60 mt-0.5">{m.country}</p>
                <div className="flex items-center justify-between mt-1.5 gap-3">
                  <span className="text-[10px] text-primary font-medium">{m.valueLabel}</span>
                  <span className="text-[10px] text-white/50">{m.confidence}% conf.</span>
                </div>
              </div>
            </Html>
          )}
        </group>
      ))}
    </group>
  );
}

/* ── Main scene ─────────────────────────────────────────── */

function GlobeScene() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_state, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.055;
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[1, 96, 96]} />
        <meshPhongMaterial color="#0b1e2e" emissive="#0a1a28" emissiveIntensity={0.5} shininess={20} />
      </mesh>
      <Graticule />
      <Countries />
      <ProjectMarkers />
      <mesh>
        <sphereGeometry args={[1.04, 64, 64]} />
        <meshBasicMaterial color="#6bd8cb" transparent opacity={0.05} side={THREE.BackSide} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.09, 64, 64]} />
        <meshBasicMaterial color="#6bd8cb" transparent opacity={0.03} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

/* ── Exported component ─────────────────────────────────── */

export function InteractiveGlobe({ className }: { className?: string }) {
  return (
    <div className={className} style={{ width: '100%', height: '100%', minHeight: 520, overflow: 'visible' }}>
      <Canvas
        camera={{ position: [0, 0.3, 2.8], fov: 38 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent', width: '100%', height: '100%', overflow: 'visible' }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 3, 5]} intensity={0.9} color="#d9fffa" />
        <directionalLight position={[-4, -2, -4]} intensity={0.3} color="#63c9c1" />
        <pointLight position={[0, 2.5, 1.5]} intensity={0.25} color="#6bd8cb" />
        <Suspense fallback={null}>
          <GlobeScene />
        </Suspense>
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate={false}
          minPolarAngle={Math.PI * 0.28}
          maxPolarAngle={Math.PI * 0.72}
          rotateSpeed={0.45}
        />
      </Canvas>
    </div>
  );
}
