import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Lock, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Button } from '@/components/ui/button';
import { usePublicProjectLocations } from '@/hooks/use-public-project-locations';

const SECTOR_COLORS: Record<string, string> = {
  'AI Infrastructure': 'hsl(292 84% 61%)',
  'Building Construction': 'hsl(199 89% 48%)',
  'Chemical': 'hsl(82 85% 45%)',
  'Data Centers': 'hsl(215 20% 65%)',
  'Digital Infrastructure': 'hsl(263 70% 60%)',
  'Energy': 'hsl(25 95% 53%)',
  'Industrial': 'hsl(30 6% 55%)',
  'Infrastructure': 'hsl(38 92% 50%)',
  'Mining': 'hsl(43 96% 42%)',
  'Oil & Gas': 'hsl(350 89% 60%)',
  'Renewable Energy': 'hsl(160 84% 39%)',
  'Transport': 'hsl(38 92% 50%)',
  'Urban Development': 'hsl(217 91% 60%)',
  'Water': 'hsl(188 78% 41%)',
};

interface SectorStat {
  name: string;
  count: number;
  avgRisk: number;
}

function formatSectorName(name: string): string {
  if (name.length > 14) return name.split(' ').slice(0, 2).join(' ');
  return name;
}

export function SectorSnapshotSection() {
  const { locations, loading } = usePublicProjectLocations();

  const sectorData = useMemo((): SectorStat[] => {
    const map: Record<string, { count: number; riskTotal: number }> = {};
    locations.forEach(p => {
      if (!map[p.sector]) map[p.sector] = { count: 0, riskTotal: 0 };
      map[p.sector].count += 1;
      map[p.sector].riskTotal += p.risk_score;
    });
    return Object.entries(map)
      .map(([name, { count, riskTotal }]) => ({
        name,
        count,
        avgRisk: count ? Math.round(riskTotal / count) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [locations]);

  if (loading || sectorData.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6 }}
      className="relative py-24"
    >
      <div className="pointer-events-none absolute inset-0" style={{
        background: 'radial-gradient(ellipse 60% 50% at 80% 50%, rgba(107,216,203,0.05) 0%, transparent 70%)',
      }} />

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">Live data</div>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <h2 className="font-serif text-3xl font-bold sm:text-4xl">
              Where the global pipeline sits right now
            </h2>
            <p className="mt-3 max-w-xl text-muted-foreground leading-relaxed">
              Project distribution across {sectorData.length} sectors, live from the database.
            </p>
          </div>
          <Link to="/explore" className="shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5">
              Browse all projects <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Bar chart */}
          <div className="glass-panel rounded-xl p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
              Projects by sector
            </p>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={sectorData.map(s => ({ ...s, displayName: formatSectorName(s.name) }))}
                layout="vertical"
                margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="displayName"
                  width={110}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as SectorStat;
                    return (
                      <div className="rounded-lg border border-border/50 bg-card px-3 py-2 text-xs shadow-lg">
                        <p className="font-medium text-foreground mb-1">{d.name}</p>
                        <p className="text-muted-foreground">{d.count.toLocaleString()} projects</p>
                        <p className="text-muted-foreground">Avg risk: {d.avgRisk}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {sectorData.map(s => (
                    <Cell
                      key={s.name}
                      fill={SECTOR_COLORS[s.name] ?? 'hsl(var(--primary))'}
                      fillOpacity={0.8}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="glass-panel rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border/30">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Sector intelligence
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/20">
                    <th className="text-left py-2.5 px-4 text-xs text-muted-foreground font-medium">Sector</th>
                    <th className="text-right py-2.5 px-4 text-xs text-muted-foreground font-medium">Projects</th>
                    <th className="text-right py-2.5 px-4 text-xs text-muted-foreground font-medium">Avg Risk</th>
                    <th className="text-right py-2.5 px-4 text-xs text-muted-foreground font-medium">
                      <span className="flex items-center justify-end gap-1">
                        <Lock className="h-3 w-3" /> Value ($B)
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sectorData.map(s => (
                    <tr key={s.name} className="border-b border-border/10 hover:bg-muted/10 transition-colors">
                      <td className="py-2.5 px-4 font-medium">{s.name}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-sm">{s.count.toLocaleString()}</td>
                      <td className="py-2.5 px-4 text-right">
                        <span className={`font-mono text-xs ${
                          s.avgRisk >= 75 ? 'text-red-400' :
                          s.avgRisk >= 50 ? 'text-amber-400' :
                          s.avgRisk >= 25 ? 'text-green-400' : 'text-teal-400'
                        }`}>
                          {s.avgRisk}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <span className="blur-sm select-none text-muted-foreground/30 font-mono text-xs">
                          $██B
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 bg-muted/10 border-t border-border/20">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Lock className="h-3 w-3" />
                Financial data (total pipeline value per sector) available to registered users.{' '}
                <Link to="/login" className="text-primary hover:underline">Sign up free →</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
