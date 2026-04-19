import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Globe, MapPin, DollarSign, ShieldCheck, FileSearch } from 'lucide-react';
import { usePublicProjectLocations } from '@/hooks/use-public-project-locations';

function formatBillions(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(0)}B`;
  return `$${(value / 1e6).toFixed(0)}M`;
}

interface StatItemProps {
  icon: React.ElementType;
  value: string;
  label: string;
}

function StatItem({ icon: Icon, value, label }: StatItemProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-sm font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function TrustStrip() {
  const { locations, loading } = usePublicProjectLocations();

  const stats = useMemo(() => ({
    projects: locations.length,
    countries: new Set(locations.map(p => p.country)).size,
    pipeline: locations.reduce((s, p) => s + (p.value_usd ?? 0), 0),
  }), [locations]);

  if (loading) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="border-y border-border/30 bg-muted/20 py-5"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 lg:gap-16">
          <StatItem
            icon={Globe}
            value={stats.projects.toLocaleString()}
            label="approved projects"
          />
          <div className="hidden sm:block h-8 w-px bg-border/40" />
          <StatItem
            icon={MapPin}
            value={`${stats.countries} countries`}
            label="global coverage"
          />
          <div className="hidden sm:block h-8 w-px bg-border/40" />
          {stats.pipeline > 0 && (
            <>
              <StatItem
                icon={DollarSign}
                value={formatBillions(stats.pipeline)}
                label="tracked pipeline value"
              />
              <div className="hidden sm:block h-8 w-px bg-border/40" />
            </>
          )}
          <StatItem
            icon={ShieldCheck}
            value="Analyst-verified"
            label="before publication"
          />
          <div className="hidden sm:block h-8 w-px bg-border/40" />
          <StatItem
            icon={FileSearch}
            value="Evidence cited"
            label="on every project"
          />
        </div>
      </div>
    </motion.section>
  );
}
