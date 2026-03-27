

# Rebuild Interactive Globe from Scratch

## What's Changing
Replace the current `InteractiveGlobe.tsx` (which uses a 2D canvas texture projected onto a sphere) with a proper 3D globe using **real GeoJSON country polygons rendered as 3D mesh geometry** on the sphere surface.

## Approach
Use **Three.js** directly within the existing React Three Fiber setup to render actual 3D country polygons extruded on a sphere, giving a sophisticated look similar to globe.gl.

### Implementation Details

**1. New `InteractiveGlobe.tsx` — complete rewrite**
- Load `countries-110m.json` from `world-atlas` (already installed) and convert to GeoJSON features using `topojson-client`
- For each country polygon, triangulate the coordinates onto the sphere surface using a custom function that converts GeoJSON rings → Three.js `BufferGeometry` via earcut triangulation
- Render each country as a separate mesh with:
  - Dark fill (`#0a2a3a`) with teal edges (`#6bd8cb`)
  - Slight extrusion (altitude 0.002) above the ocean sphere for depth
  - MENA/Africa countries highlighted slightly brighter
- Ocean sphere: dark navy `#060d16` with subtle grid lines via a shader or wireframe overlay
- Atmosphere: two `BackSide` glow spheres (existing pattern, refined)
- Project markers: pulsing dots at lat/lng positions with vertical "pin" lines, status-colored, with Html labels on hover (keep existing pattern but cleaner)
- Slow auto-rotation via `useFrame`
- `OrbitControls` with zoom disabled (existing)

**2. Add `earcut` dependency** for polygon triangulation

**3. `HeroSection.tsx`** — no structural changes, keep globe + verified feed overlay as-is

### Technical Flow
```text
countries-110m.json (world-atlas)
  → topojson.feature() → GeoJSON FeatureCollection
  → For each feature:
      → Convert polygon rings to 3D vertices on sphere
      → Triangulate with earcut
      → Create BufferGeometry mesh
  → Render as <mesh> with MeshPhongMaterial
  → Add project pin markers from PROJECTS data
```

### Visual Result
- Every continent and country clearly visible with teal-tinted borders
- Dark ocean with subtle depth
- Glowing atmosphere halo
- Project pins with interactive hover labels
- Smooth rotation centered on Africa/MENA

