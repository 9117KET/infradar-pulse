import { cn } from '@/lib/utils';

export function InfradarLogo({ className, size = 32 }: { className?: string; size?: number }) {
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn('shrink-0', className)} aria-label="Infradar logo">
      <circle cx={r} cy={r} r={r * 0.9} fill="none" stroke="hsl(170,55%,63%)" strokeWidth={1.2} opacity={0.3} />
      <circle cx={r} cy={r} r={r * 0.6} fill="none" stroke="hsl(170,55%,63%)" strokeWidth={1} opacity={0.5} />
      <circle cx={r} cy={r} r={r * 0.3} fill="none" stroke="hsl(170,55%,63%)" strokeWidth={0.8} opacity={0.7} />
      <circle cx={r} cy={r} r={2.5} fill="hsl(170,55%,63%)" />
      {/* crosshair ticks */}
      <line x1={r} y1={1} x2={r} y2={r * 0.35} stroke="hsl(170,55%,63%)" strokeWidth={1} opacity={0.6} />
      <line x1={r} y1={r * 1.65} x2={r} y2={size - 1} stroke="hsl(170,55%,63%)" strokeWidth={1} opacity={0.6} />
      <line x1={1} y1={r} x2={r * 0.35} y2={r} stroke="hsl(170,55%,63%)" strokeWidth={1} opacity={0.6} />
      <line x1={r * 1.65} y1={r} x2={size - 1} y2={r} stroke="hsl(170,55%,63%)" strokeWidth={1} opacity={0.6} />
    </svg>
  );
}
