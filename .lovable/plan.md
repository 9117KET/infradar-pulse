

# Hero Section — Live Tracking Widget

## What Changes

Replace the Leaflet map on the right side of the hero with a **Live Tracking** widget inspired by the reference image, but enhanced with real database data and subtle animations.

## Design

The widget will be a dark glass-morphism card containing:

1. **Header**: Infradar logo icon + "LIVE TRACKING" label + green pulsing "Real-time" badge
2. **Project Cards** (top 3 by value): Each card shows an icon, project name, value label, stage/status, and country code — with staggered fade-in animations
3. **Bottom Stats Bar**: Total project count + total pipeline value (summed from DB) + version tag
4. **Ambient effects**: Subtle border glow, card hover lift, and a slow rotating gradient behind the widget for depth

Data comes from the existing `useProjects()` hook — no new queries needed. The top 3 projects cycle every 5 seconds with a crossfade to show the platform is alive.

## Implementation

### New Component: `src/components/home/HeroLiveTracker.tsx`

- Accepts `projects` array prop
- Computes: `totalProjects`, `totalPipelineValue` (formatted as $xT/$xB), top 3 projects sorted by `valueUsd`
- Auto-rotates visible projects every 5s (show 3 at a time from the full list, cycling through)
- Each project row: colored icon (by sector), name, value label, stage badge, country ISO code
- Framer Motion `AnimatePresence` for smooth card transitions
- Country codes derived from existing `country` field (map country name → ISO code)

### Modify: `src/components/home/HeroSection.tsx`

- Replace `HeroMap` import with `HeroLiveTracker`
- Remove `min-h-[500px]` constraint since the widget is more compact
- Pass `projects` to the new component

## Files Changed

| Action | File |
|--------|------|
| Create | `src/components/home/HeroLiveTracker.tsx` |
| Modify | `src/components/home/HeroSection.tsx` — swap map for live tracker |

