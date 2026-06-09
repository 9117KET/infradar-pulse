import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Heart, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HealthScoreBadgeProps {
  healthScore: number | null | undefined;
  delayProbability?: number | null;
  signals?: Record<string, unknown> | null;
  size?: 'sm' | 'md';
  showDelay?: boolean;
  className?: string;
}

function scoreColor(score: number): string {
  if (score >= 75) return 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10';
  if (score >= 50) return 'text-amber-400 border-amber-400/40 bg-amber-400/10';
  if (score >= 30) return 'text-orange-400 border-orange-400/40 bg-orange-400/10';
  return 'text-red-400 border-red-400/40 bg-red-400/10';
}

function scoreLabel(score: number): string {
  if (score >= 75) return 'Healthy';
  if (score >= 50) return 'Moderate';
  if (score >= 30) return 'At Risk';
  return 'Critical';
}

function ScoreIcon({ score, size }: { score: number; size: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  if (score >= 75) return <TrendingUp className={cls} />;
  if (score >= 50) return <Minus className={cls} />;
  return <TrendingDown className={cls} />;
}

export function HealthScoreBadge({
  healthScore,
  delayProbability,
  signals,
  size = 'md',
  showDelay = true,
  className,
}: HealthScoreBadgeProps) {
  if (healthScore == null) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground', className)}>
        <Heart className="h-3 w-3" />
        <span>Not scored</span>
      </span>
    );
  }

  const summary = (signals as any)?.summary as string | undefined;
  const delayPct = delayProbability != null ? Math.round(delayProbability * 100) : null;

  const badge = (
    <span
      data-testid="health-score-badge"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 font-medium leading-tight',
        size === 'sm' ? 'text-[11px] py-0.5' : 'text-xs py-1',
        scoreColor(healthScore),
        className,
      )}
    >
      <ScoreIcon score={healthScore} size={size} />
      <span>{healthScore}</span>
      <span className="opacity-70">/ 100</span>
      {showDelay && delayPct != null && (
        <span className="ml-1 opacity-60">· {delayPct}% delay</span>
      )}
    </span>
  );

  if (!summary) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p className="font-semibold mb-1">{scoreLabel(healthScore)} — score {healthScore}/100</p>
          {summary && <p className="text-muted-foreground">{summary}</p>}
          {delayPct != null && (
            <p className="mt-1 text-muted-foreground">Delay probability: {delayPct}%</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
