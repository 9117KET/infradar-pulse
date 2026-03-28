import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Zap, Droplets, Train, Wifi, Sun, Shield } from 'lucide-react';

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
}

const SECTOR_ICONS: Record<string, typeof Building2> = {
  'Urban Development': Building2,
  'Digital Infrastructure': Wifi,
  'Renewable Energy': Sun,
  'Transport': Train,
  'Water': Droplets,
  'Energy': Zap,
};

const SECTOR_COLORS: Record<string, string> = {
  'Urban Development': 'text-blue-400',
  'Digital Infrastructure': 'text-violet-400',
  'Renewable Energy': 'text-emerald-400',
  'Transport': 'text-amber-400',
  'Water': 'text-cyan-400',
  'Energy': 'text-orange-400',
};

const COUNTRY_CODES: Record<string, string> = {
  'Saudi Arabia': 'SA', 'UAE': 'AE', 'United Arab Emirates': 'AE', 'Qatar': 'QA',
  'Egypt': 'EG', 'Morocco': 'MA', 'Kenya': 'KE', 'Nigeria': 'NG', 'Ethiopia': 'ET',
  'Ghana': 'GH', 'Tanzania': 'TZ', 'Rwanda': 'RW', 'Senegal': 'SN', 'Oman': 'OM',
  'Bahrain': 'BH', 'Kuwait': 'KW', 'Jordan': 'JO', 'Iraq': 'IQ', 'Tunisia': 'TN',
  'Algeria': 'DZ', 'Libya': 'LY', 'Sudan': 'SD', 'Uganda': 'UG', 'Mozambique': 'MZ',
  'South Africa': 'ZA', 'Ivory Coast': 'CI', "Côte d'Ivoire": 'CI', 'Cameroon': 'CM',
  'Angola': 'AO', 'DR Congo': 'CD', 'Lebanon': 'LB', 'Israel': 'IL', 'Palestine': 'PS',
  'Yemen': 'YE', 'Djibouti': 'DJ', 'Somalia': 'SO', 'Eritrea': 'ER',
};

function formatValue(total: number): string {
  if (total >= 1e12) return `$${(total / 1e12).toFixed(1)}T`;
  if (total >= 1e9) return `$${(total / 1e9).toFixed(1)}B`;
  if (total >= 1e6) return `$${(total / 1e6).toFixed(0)}M`;
  return `$${total.toLocaleString()}`;
}

export function HeroLiveTracker({ projects }: { projects: TrackerProject[] }) {
  const [offset, setOffset] = useState(0);

  const sorted = useMemo(
    () => [...projects].sort((a, b) => b.valueUsd - a.valueUsd),
    [projects]
  );

  const totalValue = useMemo(
    () => projects.reduce((s, p) => s + p.valueUsd, 0),
    [projects]
  );

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
      <div className="absolute -inset-4 rounded-3xl opacity-30 blur-2xl" style={{
        background: 'radial-gradient(ellipse at center, hsl(var(--primary) / 0.4), transparent 70%)',
      }} />

      <div className="relative rounded-2xl border border-border/50 bg-card/80 backdrop-blur-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
          <div className="flex items-center gap-2.5">
            <Shield className="h-5 w-5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-widest text-foreground/80">Live Tracking</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[10px] font-medium text-emerald-400">Real-time</span>
          </div>
        </div>

        {/* Project cards */}
        <div className="px-4 py-3 min-h-[210px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={offset}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col gap-2"
            >
              {visible.map((p, i) => {
                const Icon = SECTOR_ICONS[p.sector] || Building2;
                const iconColor = SECTOR_COLORS[p.sector] || 'text-muted-foreground';
                const code = COUNTRY_CODES[p.country] || p.country.slice(0, 2).toUpperCase();

                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1, duration: 0.3 }}
                    className="group flex items-center gap-3 rounded-xl border border-border/20 bg-muted/30 px-3.5 py-3 transition-all hover:bg-muted/60 hover:border-border/40"
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/60 ${iconColor}`}>
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{p.valueLabel}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{p.stage}</span>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground/60 shrink-0">{code}</span>
                  </motion.div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom stats */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border/30 bg-muted/20">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Projects</p>
              <p className="text-sm font-semibold text-foreground">{projects.length}</p>
            </div>
            <div className="w-px h-6 bg-border/30" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pipeline</p>
              <p className="text-sm font-semibold text-foreground">{formatValue(totalValue)}</p>
            </div>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground/40">INFRADAR v1.0</span>
        </div>
      </div>
    </div>
  );
}
