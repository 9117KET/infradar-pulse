import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  Zap,
  Droplets,
  Train,
  Wifi,
  Sun,
  Shield,
  Activity,
  Cpu,
  Factory,
  Fuel,
  Hexagon,
  Home,
  Landmark,
  Mountain,
  Server,
} from 'lucide-react';

interface TrackerProject {
  id: string;
  name: string;
  country: string;
  sector: string;
  stage: string;
  status: string;
  valueLabel: string;
  valueUsd: number;
  riskScore: number;
  region?: string;
}

const SECTOR_ICONS: Record<string, typeof Building2> = {
  'AI Infrastructure': Cpu,
  'Building Construction': Home,
  'Chemical': Hexagon,
  'Data Centers': Server,
  'Digital Infrastructure': Wifi,
  'Energy': Zap,
  'Industrial': Factory,
  'Infrastructure': Landmark,
  'Mining': Mountain,
  'Oil & Gas': Fuel,
  'Renewable Energy': Sun,
  'Transport': Train,
  'Urban Development': Building2,
  'Water': Droplets,
};

const SECTOR_COLORS: Record<string, { text: string; hsl: string }> = {
  'AI Infrastructure': { text: 'text-fuchsia-400', hsl: '292 84% 61%' },
  'Building Construction': { text: 'text-sky-400', hsl: '199 89% 48%' },
  'Chemical': { text: 'text-lime-400', hsl: '82 85% 45%' },
  'Data Centers': { text: 'text-slate-300', hsl: '215 20% 65%' },
  'Digital Infrastructure': { text: 'text-violet-400', hsl: '263 70% 60%' },
  'Energy': { text: 'text-orange-400', hsl: '25 95% 53%' },
  'Industrial': { text: 'text-stone-400', hsl: '30 6% 55%' },
  'Infrastructure': { text: 'text-amber-400', hsl: '38 92% 50%' },
  'Mining': { text: 'text-yellow-600', hsl: '43 96% 42%' },
  'Oil & Gas': { text: 'text-rose-400', hsl: '350 89% 60%' },
  'Renewable Energy': { text: 'text-emerald-400', hsl: '160 84% 39%' },
  'Transport': { text: 'text-amber-400', hsl: '38 92% 50%' },
  'Urban Development': { text: 'text-blue-400', hsl: '217 91% 60%' },
  'Water': { text: 'text-cyan-400', hsl: '188 78% 41%' },
};

const COUNTRY_CODES: Record<string, string> = {
  'Saudi Arabia': 'SA', 'UAE': 'AE', 'United Arab Emirates': 'AE', 'Qatar': 'QA',
  'Egypt': 'EG', 'Morocco': 'MA', 'Kenya': 'KE', 'Nigeria': 'NG', 'Ethiopia': 'ET',
  'Ghana': 'GH', 'Tanzania': 'TZ', 'Rwanda': 'RW', 'Senegal': 'SN', 'Oman': 'OM',
  'Bahrain': 'BH', 'Kuwait': 'KW', 'Jordan': 'JO', 'Iraq': 'IQ', 'Tunisia': 'TN',
  'Algeria': 'DZ', 'South Africa': 'ZA', 'Ivory Coast': 'CI', 'Cameroon': 'CM',
  'Angola': 'AO', 'Lebanon': 'LB', 'Uganda': 'UG', 'Mozambique': 'MZ',
};

function formatValue(total: number): string {
  if (total >= 1e12) return `$${(total / 1e12).toFixed(1)}T`;
  if (total >= 1e9) return `$${(total / 1e9).toFixed(1)}B`;
  if (total >= 1e6) return `$${(total / 1e6).toFixed(0)}M`;
  return `$${total.toLocaleString()}`;
}

function useCountUp(target: number, duration = 2000) {
  const [value, setValue] = useState(0);
  const ref = useRef<number>();
  useEffect(() => {
    if (target === 0) return;
    const start = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(target * eased));
      if (progress < 1) ref.current = requestAnimationFrame(animate);
    };
    ref.current = requestAnimationFrame(animate);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [target, duration]);
  return value;
}

function riskColor(score: number) {
  if (score >= 70) return 'bg-red-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function riskBarColor(score: number) {
  if (score >= 70) return 'bg-red-500/30';
  if (score >= 40) return 'bg-amber-500/30';
  return 'bg-emerald-500/30';
}

// SVG Donut Chart
function SectorDonut({ sectors }: { sectors: { name: string; count: number; pct: number }[] }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;

  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20">
      {sectors.map((s, i) => {
        const dash = (s.pct / 100) * circumference;
        const offset = -(accumulated / 100) * circumference;
        accumulated += s.pct;
        const color = SECTOR_COLORS[s.name]?.hsl || '0 0% 50%';
        return (
          <motion.circle
            key={s.name}
            cx="50" cy="50" r={radius}
            fill="none"
            stroke={`hsl(${color})`}
            strokeWidth="8"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.15, duration: 0.5 }}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
          />
        );
      })}
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central"
        className="fill-foreground text-[10px] font-bold font-mono">
        {sectors.reduce((s, x) => s + x.count, 0)}
      </text>
    </svg>
  );
}

// SVG Sparkline
function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const w = 120, h = 32;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8" preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.4" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.polyline
        points={points}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
      />
      <polygon
        points={`0,${h} ${points} ${w},${h}`}
        fill="url(#spark-grad)"
        opacity="0.5"
      />
    </svg>
  );
}

export function HeroLiveTracker({ projects }: { projects: TrackerProject[] }) {
  const [offset, setOffset] = useState(0);

  const sorted = useMemo(() => [...projects].sort((a, b) => b.valueUsd - a.valueUsd), [projects]);
  const totalValue = useMemo(() => projects.reduce((s, p) => s + p.valueUsd, 0), [projects]);
  const animatedValue = useCountUp(totalValue, 2000);

  const sectorData = useMemo(() => {
    const map: Record<string, number> = {};
    projects.forEach(p => { map[p.sector] = (map[p.sector] || 0) + 1; });
    const total = projects.length || 1;
    return Object.entries(map)
      .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count);
  }, [projects]);

  const regionRisk = useMemo(() => {
    const regions: Record<string, { total: number; count: number }> = {};
    projects.forEach(p => {
      const r = p.region || 'Unknown';
      if (!regions[r]) regions[r] = { total: 0, count: 0 };
      regions[r].total += p.riskScore; regions[r].count++;
    });
    return Object.entries(regions)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 4)
      .map(([name, { total, count }]) => ({
        name: name.length > 12 ? name.substring(0, 10) + '…' : name,
        avg: count ? Math.round(total / count) : 0,
      }));
  }, [projects]);

  const sparkData = useMemo(() => {
    const base = sectorData.map(s => s.count);
    const padded = [...base];
    const filler = [3, 1, 4, 2, 5, 2, 3, 1, 4, 2, 3, 1];
    let fi = 0;
    while (padded.length < 12) padded.push(filler[fi++ % filler.length]);
    return padded;
  }, [sectorData]);

  const visible = useMemo(() => {
    if (sorted.length === 0) return [];
    const items: TrackerProject[] = [];
    for (let i = 0; i < Math.min(3, sorted.length); i++) {
      items.push(sorted[(offset + i) % sorted.length]);
    }
    return items;
  }, [sorted, offset]);

  useEffect(() => {
    if (sorted.length <= 3) return;
    const id = setInterval(() => setOffset(o => (o + 3) % sorted.length), 5000);
    return () => clearInterval(id);
  }, [sorted.length]);

  return (
    <div className="relative w-full max-w-md mx-auto">
      {/* Ambient glow */}
      <div className="absolute -inset-6 rounded-3xl opacity-30 blur-3xl" style={{
        background: 'radial-gradient(ellipse at center, hsl(var(--primary) / 0.5), transparent 70%)',
      }} />

      <div className="relative rounded-2xl border border-border/50 bg-card/90 backdrop-blur-xl shadow-2xl overflow-hidden">
        {/* Scan line */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
          <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent animate-scan" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/30">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/80 font-mono">Command Center</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[9px] font-medium text-emerald-400 font-mono">LIVE</span>
          </div>
        </div>

        {/* Sector Breakdown */}
        <div className="px-4 py-3 border-b border-border/20">
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2 font-mono">Sector Breakdown</p>
          <div className="flex items-center gap-4">
            <SectorDonut sectors={sectorData} />
            <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-1">
              {sectorData.slice(0, 6).map(s => {
                const color = SECTOR_COLORS[s.name]?.text || 'text-muted-foreground';
                const Icon = SECTOR_ICONS[s.name] || Building2;
                return (
                  <div key={s.name} className="flex items-center gap-1.5">
                    <Icon className={`h-3 w-3 ${color}`} />
                    <span className="text-[10px] text-muted-foreground truncate">{s.name.split(' ')[0]}</span>
                    <span className="text-[10px] font-mono text-foreground ml-auto">{s.pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live Feed */}
        <div className="px-4 py-3 border-b border-border/20 min-h-[140px]">
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2 font-mono">Live Feed</p>
          <AnimatePresence mode="wait">
            <motion.div
              key={offset}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35 }}
              className="flex flex-col gap-1.5"
            >
              {visible.map((p, i) => {
                const Icon = SECTOR_ICONS[p.sector] || Building2;
                const iconColor = SECTOR_COLORS[p.sector]?.text || 'text-muted-foreground';
                const code = COUNTRY_CODES[p.country] || p.country.slice(0, 2).toUpperCase();

                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08, duration: 0.25 }}
                    className="flex items-center gap-2.5 rounded-lg border border-border/15 bg-muted/20 px-3 py-2 hover:bg-muted/40 transition-colors"
                  >
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background/50 ${iconColor}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-muted-foreground">{p.valueLabel}</span>
                        <span className="text-[9px] px-1 py-px rounded bg-primary/10 text-primary font-mono">{p.stage}</span>
                      </div>
                    </div>
                    {/* Risk bar */}
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className="text-[9px] font-mono text-muted-foreground">{code}</span>
                      <div className={`w-10 h-1.5 rounded-full ${riskBarColor(p.riskScore)} overflow-hidden`}>
                        <div className={`h-full rounded-full ${riskColor(p.riskScore)}`}
                          style={{ width: `${Math.min(p.riskScore, 100)}%` }} />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom Grid: Risk + Activity */}
        <div className="grid grid-cols-2 divide-x divide-border/20 border-b border-border/20">
          {/* Regional Risk */}
          <div className="px-4 py-3">
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2 font-mono">Regional Risk</p>
            <div className="space-y-1.5">
              {regionRisk.map(r => (
                <div key={r.name} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-14 truncate">{r.name}</span>
                  <div className="flex gap-0.5">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className={`w-2.5 h-4 rounded-sm ${
                        i < Math.round(r.avg / 16.7)
                          ? r.avg >= 60 ? 'bg-red-500/80' : r.avg >= 35 ? 'bg-amber-500/80' : 'bg-emerald-500/80'
                          : 'bg-muted/40'
                      }`} />
                    ))}
                  </div>
                  <span className="text-[9px] font-mono text-muted-foreground ml-auto">{r.avg}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Pulse */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Activity className="h-3 w-3 text-primary" />
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-mono">Activity</p>
            </div>
            <Sparkline data={sparkData} />
            <p className="text-[9px] text-muted-foreground/60 font-mono mt-1">Distribution by sector</p>
          </div>
        </div>

        {/* Stats Footer */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-muted/15">
          <div>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-mono">Pipeline</p>
            <p className="text-sm font-bold text-foreground font-mono">{formatValue(animatedValue)}</p>
          </div>
          <span className="text-[9px] font-mono text-muted-foreground/40">INFRADAR v1.0</span>
        </div>
      </div>

      {/* Scan line animation style */}
      <style>{`
        @keyframes scan {
          0% { top: -2px; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .animate-scan {
          animation: scan 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
