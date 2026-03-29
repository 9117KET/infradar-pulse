import { cn } from '@/lib/utils';

/** Brand mark — same asset as `/infradar-mark.svg` (favicon). */
export function InfradarLogo({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <img
      src="/infradar-mark.svg"
      alt=""
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      aria-hidden
    />
  );
}
