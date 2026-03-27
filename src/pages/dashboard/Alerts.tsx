import { useAlerts } from '@/hooks/use-alerts';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const severityClass: Record<string, string> = {
  critical: 'text-destructive border-destructive/30',
  high: 'text-amber-500 border-amber-500/30',
  medium: 'text-blue-400 border-blue-400/30',
  low: 'text-muted-foreground border-border',
};

export default function Alerts() {
  const { alerts, loading } = useAlerts();

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="font-serif text-2xl font-bold">Alerts</h1>
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
        ) : alerts.map(a => (
          <div key={a.id} className={`glass-panel rounded-xl p-5 flex items-start gap-4 ${!a.read ? 'border-primary/20' : ''}`}>
            <AlertTriangle className={`h-5 w-5 mt-0.5 shrink-0 ${a.severity === 'critical' ? 'text-destructive' : a.severity === 'high' ? 'text-amber-500' : 'text-muted-foreground'}`} />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className={`text-[10px] ${severityClass[a.severity]}`}>{a.severity}</Badge>
                {!a.read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              </div>
              <p className="text-sm font-medium">{a.message}</p>
              <p className="text-xs text-muted-foreground mt-1">{a.projectName} · {a.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
