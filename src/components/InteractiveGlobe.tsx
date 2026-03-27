import { useRef, useMemo, useState, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { feature } from 'topojson-client';
import earcut from 'earcut';
import { PROJECTS, statusColor } from '@/data/projects';

// Use countries (not just land) for individual borders
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

/* MENA / Africa ISO codes for highlighting */
const HIGHLIGHT_CODES = new Set([
  '012','818','434','788','504','732','728','736','729','180','404','800',
  '834','508','454','646','894','716','710','426','748','072','516','024',
  '120','140','148','178','226','266','270','288','324','624','384','430',
  '466','478','562','566','654','678','686','694','768','854','108',
  '784','682','512','634','048','400','368','760','792','414','275','422',
  '887','364',
]);

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
  // coordinates[0] = outer ring, coordinates[1..] = holes
  const outerRing = coordinates[0];
  if (!outerRing || outerRing.length < 4) return null;

  const allVerts: number[] = [];
  const allFlat: number[] = [];
  const holeIndices: number[] = [];

  // Outer ring
  const outer = ringToSphericalVertices(outerRing, radius);
  for (let i = 0; i < outer.verts.length; i++) allVerts.push(outer.verts[i]);
  for (let i = 0; i < outer.flat2d.length; i++) allFlat.push(outer.flat2d[i]);

  // Holes
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
  highlight: boolean;
}

function Countries() {
  const countries = useMemo(() => {
    const fc = feature(countriesData as any, (countriesData as any).objects.countries) as any;
    const result: CountryData[] = [];
    const LAND_R = 1.003;
    const BORDER_R = 1.005;

    for (const feat of fc.features) {
      const id = feat.id || feat.properties?.iso_n3 || '';
      const geos = featureToGeometries(feat, LAND_R);
      const borders = featureToBorders(feat, BORDER_R);
      const highlight = HIGHLIGHT_CODES.has(String(id));
      if (geos.length || borders.length) {
        result.push({ geos, borders, highlight });
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
                color={c.highlight ? '#0f3d4d' : '#0a2a3a'}
                emissive={c.highlight ? '#0d4a4a' : '#071e2b'}
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
              color={c.highlight ? '#6bd8cb' : '#2a6e7a'}
              lineWidth={c.highlight ? 1.2 : 0.6}
              transparent
              opacity={c.highlight ? 0.7 : 0.35}
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
    // Latitude lines
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lng = -180; lng <= 180; lng += 4) {
        pts.push(latLngToVec3(lat, lng, R));
      }
      result.push(pts);
    }
    // Longitude lines
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

/* ── Project markers ────────────────────────────────────── */

function ProjectMarkers() {
  const [hovered, setHovered] = useState<string | null>(null);

  const markers = useMemo(
    () =>
      PROJECTS.map((p) => ({
        id: p.id,
        position: latLngToArray(p.lat, p.lng, 1.025),
        pinTop: latLngToArray(p.lat, p.lng, 1.08),
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
          {/* Outer glow */}
          <mesh position={m.position} onPointerOver={() => setHovered(m.id)} onPointerOut={() => setHovered(null)}>
            <sphereGeometry args={[0.035, 16, 16]} />
            <meshBasicMaterial color={m.color} transparent opacity={hovered === m.id ? 0.5 : 0.18} />
          </mesh>
          {/* Inner dot */}
          <mesh position={m.position}>
            <sphereGeometry args={[0.015, 12, 12]} />
            <meshBasicMaterial color={m.color} />
          </mesh>
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
      {/* Ocean sphere */}
      <mesh>
        <sphereGeometry args={[1, 96, 96]} />
        <meshPhongMaterial
          color="#060d16"
          emissive="#050a12"
          emissiveIntensity={0.3}
          shininess={12}
        />
      </mesh>

      {/* Graticule grid */}
      <Graticule />

      {/* Country polygons + borders */}
      <Countries />

      {/* Project markers */}
      <ProjectMarkers />

      {/* Atmosphere glow layers */}
      <mesh>
        <sphereGeometry args={[1.04, 64, 64]} />
        <meshBasicMaterial color="#6bd8cb" transparent opacity={0.03} side={THREE.BackSide} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.09, 64, 64]} />
        <meshBasicMaterial color="#6bd8cb" transparent opacity={0.015} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

/* ── Exported component ─────────────────────────────────── */

export function InteractiveGlobe({ className }: { className?: string }) {
  return (
    <div className={className} style={{ width: '100%', height: '100%', minHeight: 520 }}>
      <Canvas
        camera={{ position: [0, 0.3, 2.5], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent', width: '100%', height: '100%' }}
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
