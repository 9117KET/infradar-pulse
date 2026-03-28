

# Sophisticated Hero Command Center Widget

## Current State
The right side of the hero has a simple card with 3 cycling project rows and basic stats. It works but feels like a basic list — not a "command center."

## Proposed Redesign

Replace the single card with a multi-layered **Intelligence Dashboard** widget that feels like a live operations terminal.

```text
┌──────────────────────────────────────────┐
│ ◉ INFRADAR COMMAND CENTER    ● Real-time │
├──────────────────────────────────────────┤
│                                          │
│  ┌─ SECTOR BREAKDOWN (mini donut) ─────┐ │
│  │  ◕ Energy 34%  ◕ Transport 22% ... │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  ┌─ LIVE FEED ─────────────────────────┐ │
│  │  ↑ NEOM Phase 2   $500B   SA  ▓▓▓░ │ │
│  │  ↑ Cairo Metro    $23B    EG  ▓▓░░ │ │
│  │  ↑ Kenya Wind     $1.2B   KE  ▓░░░ │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  ┌─ RISK HEATMAP ──┐ ┌─ ACTIVITY ─────┐ │
│  │  ■■■■□□  MENA   │ │ ┃▁▂▅▇█▅▃▁     │ │
│  │  ■■□□□□  Africa │ │ │ 24h volume   │ │
│  └──────────────────┘ └────────────────┘ │
│                                          │
│  $1.2T pipeline  │  142 projects  │ v1.0 │
└──────────────────────────────────────────┘
```

### Sections (top to bottom):

1. **Header** — "INFRADAR COMMAND CENTER" with scanning line animation + green pulsing dot

2. **Sector Breakdown** — Animated donut/ring chart (pure SVG, no library) showing project count by sector with colored segments. Sectors animate in on mount.

3. **Live Project Feed** — Same cycling 3-project list but enhanced with:
   - Risk score as a mini progress bar (colored green/amber/red)
   - Typewriter-style entry animation
   - Faint scan-line effect across each row

4. **Bottom Grid** (2 mini panels side by side):
   - **Regional Risk Summary** — tiny heatmap blocks for MENA vs Africa (avg risk scores)
   - **Activity Pulse** — SVG sparkline showing project count distribution (simulated from data, grouped by region/sector)

5. **Stats Footer** — Total pipeline value, project count, version — with a counting-up number animation on mount

### Visual Effects:
- Faint horizontal scan-line animation (CSS) moving down the card every 4s
- Ambient teal glow behind the card (existing)
- Glass-morphism with slightly more opacity
- Monospace font for numbers/codes

## Implementation

### Modify: `src/components/home/HeroLiveTracker.tsx`
- Complete rebuild with 5 sections above
- Pure SVG for donut chart and sparkline (no chart library needed for hero)
- `useMemo` to compute sector distribution, regional risk averages
- Counting animation via a small `useEffect` + `requestAnimationFrame` hook
- CSS keyframe for scan-line effect (inline style or tailwind extend)

### No other files change
- `HeroSection.tsx` already passes `projects` — no change needed

