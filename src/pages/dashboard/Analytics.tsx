import { useProjects } from '@/hooks/use-projects';
import { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function Analytics() {
  const { projects, loading } = useProjects();

  const sectorData = useMemo(() => {
    const map: Record<string, { count: number; value: number }> = {};
    projects.forEach(p => {
      if (!map[p.sector]) map[p.sector] = { count: 0, value: 0 };
      map[p.sector].count++;
      map[p.sector].value += p.valueUsd;
    });
    return Object.entries(map).sort((a, b) => b[1].value - a[1].value);
  }, [projects]);

  const maxValue = Math.max(...sectorData.map(([, d]) => d.value), 1);

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <h1 className="font-serif text-2xl font-bold">Analytics</h1>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="font-serif text-2xl font-bold">Analytics</h1>

      <div className="glass-panel rounded-xl p-6">
        <h3 className="font-serif text-lg font-semibold mb-6">Pipeline by sector</h3>
        <div className="space-y-4">
          {sectorData.map(([sector, data]) => (
            <div key={sector}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm">{sector}</span>
                <span className="text-xs text-muted-foreground">{data.count} projects · ${(data.value / 1e9).toFixed(1)}B</span>
              </div>
              <div className="h-6 rounded bg-black/20 overflow-hidden">
                <div className="h-full rounded bg-gradient-to-r from-primary/80 to-primary/40 transition-all" style={{ width: `${(data.value / maxValue) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-panel rounded-xl p-6">
        <h3 className="font-serif text-lg font-semibold mb-6">Confidence distribution</h3>
        <div className="grid grid-cols-5 gap-3 text-center">
          {[
            { range: '60-69%', count: projects.filter(p => p.confidence >= 60 && p.confidence < 70).length },
            { range: '70-79%', count: projects.filter(p => p.confidence >= 70 && p.confidence < 80).length },
            { range: '80-89%', count: projects.filter(p => p.confidence >= 80 && p.confidence < 90).length },
            { range: '90-95%', count: projects.filter(p => p.confidence >= 90 && p.confidence <= 95).length },
            { range: '95-100%', count: projects.filter(p => p.confidence > 95).length },
          ].map(b => (
            <div key={b.range} className="glass-panel rounded-lg p-3">
              <div className="text-xl font-bold text-primary">{b.count}</div>
              <div className="text-xs text-muted-foreground">{b.range}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
