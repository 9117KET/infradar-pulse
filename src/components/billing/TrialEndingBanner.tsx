// In-app banner shown when a paid trial ends within 48h. Strategic reminder
// so users aren't surprised by the auto-charge — they get a clear path to
// switch plans, switch to yearly (save 20%), or cancel.
import { Link } from 'react-router-dom';
import { Clock, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useEntitlements } from '@/hooks/useEntitlements';

const DISMISS_KEY = 'infradar:trial-banner-dismissed-at';

function hoursUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 3_600_000);
}

export function TrialEndingBanner() {
  const { subInfo, plan, hasLifetime, staffBypass } = useEntitlements();
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissal once per day so users see the banner again the next time
  // they open the app, but not on every page nav.
  useEffect(() => {
    const ts = localStorage.getItem(DISMISS_KEY);
    if (!ts) return;
    const ageMs = Date.now() - Number(ts);
    if (ageMs < 24 * 60 * 60 * 1000) setDismissed(true);
  }, []);

  if (staffBypass || hasLifetime) return null;
  if (subInfo?.status !== 'trialing') return null;
  const hrs = hoursUntil(subInfo?.trial_end ?? null);
  if (hrs === null || hrs > 48) return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  const planLabel = plan === 'pro' ? 'Pro' : plan === 'starter' ? 'Starter' : 'your plan';
  const timeLabel =
    hrs <= 1 ? 'less than 1 hour'
    : hrs < 24 ? `${hrs} hours`
    : `${Math.ceil(hrs / 24)} day${Math.ceil(hrs / 24) === 1 ? '' : 's'}`;

  return (
    <div className="border-b border-primary/30 bg-primary/10 px-4 py-2.5">
      <div className="mx-auto max-w-7xl flex items-center gap-3 text-xs">
        <Clock className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-foreground font-medium">
            Your free trial ends in {timeLabel}.
          </span>{' '}
          <span className="text-muted-foreground">
            Your card will be charged for {planLabel}. Switch to yearly and save 20%, or manage your plan.
          </span>
        </div>
        <Link
          to="/dashboard/settings?tab=billing"
          className="text-primary hover:underline font-medium shrink-0 hidden sm:inline"
        >
          Manage plan →
        </Link>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="text-muted-foreground hover:text-foreground p-1 -mr-1"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
