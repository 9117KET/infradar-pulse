

# Globe & Hero Section Cleanup

## Changes

### 1. Remove regional highlighting from globe (`InteractiveGlobe.tsx`)
- Remove `HIGHLIGHT_CODES` set entirely
- Remove the `highlight` property from `CountryData`
- Give **all countries** the same uniform dark fill color and border color — no differentiation between MENA/Africa and other regions
- All borders: same subtle teal color (`#2a6e7a`) at uniform line width (`0.8`) and opacity

### 2. Add hover tooltip on project markers (`InteractiveGlobe.tsx`)
- In `ProjectMarkers`, when a marker is hovered, render an `Html` component from `@react-three/drei` showing a small glass-panel tooltip with: project name, country, value, and confidence
- Tooltip appears only on hover, disappears on pointer out

### 3. Remove Verified Feed overlay from hero (`HeroSection.tsx`)
- Delete the entire `FEED_ITEMS` array and the "Verified Feed card overlay" `<div>` block (lines 60-91)
- Remove unused `Badge` import

### 4. Fix globe clipping / square container (`HeroSection.tsx`)
- Change the right column from `min-h-[500px]` with `absolute inset-0` to allow the globe to render at full visible size
- Remove the `absolute inset-0` wrapper around the globe — let it flow naturally and fill the column
- Increase the globe container's min-height and use `overflow-visible` so the sphere isn't clipped by the grid cell boundaries

### Files Modified
- `src/components/InteractiveGlobe.tsx` — remove highlighting logic, add hover tooltip
- `src/components/home/HeroSection.tsx` — remove verified feed, fix globe container sizing

