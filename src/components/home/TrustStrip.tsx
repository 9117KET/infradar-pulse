import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Globe, MapPin, Building2, Users } from 'lucide-react';
import { usePublicProjectLocations } from '@/hooks/use-public-project-locations';
import { usePlatformCounts } from '@/hooks/use-platform-counts';

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
  const { counts } = usePlatformCounts();

  const stats = useMemo(() => ({
    projects: counts?.projects ?? locations.length,
    countries: counts?.countries ?? new Set(locations.map(p => p.country)).size,
    companies: counts?.companies ?? 0,
    contacts: counts?.contacts ?? 0,
  }), [locations, counts]);

  if (loading) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="border-y border-border/30 bg-muted/20 py-8"
    >
      <div className="section-fluid">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <StatItem
            icon={Globe}
            value={stats.projects.toLocaleString()}
            label="approved projects"
          />
          <StatItem
            icon={MapPin}
            value={`${stats.countries} countries`}
            label="global coverage"
          />
          <StatItem
            icon={Building2}
            value={stats.companies.toLocaleString()}
            label="companies tracked"
          />
          <StatItem
            icon={Users}
            value={stats.contacts.toLocaleString()}
            label="contacts"
          />
        </div>
      </div>
    </motion.section>
  );
}
