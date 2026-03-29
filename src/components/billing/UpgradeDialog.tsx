import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Sparkles, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { startCheckoutSession } from '@/lib/billing/stripeClient';

type Reason = 'ai' | 'export' | 'insight' | 'default';

const COPY: Record<Reason, { title: string; description: string }> = {
  default: {
    title: 'Unlock with Pro or a free trial',
    description:
      'Explore every screen for free. To run AI research, agents, and advanced exports, start a 3-day trial or subscribe. Limits apply during trial; upgrade anytime.',
  },
  ai: {
    title: 'AI & automation require an active plan',
    description:
      'Start a 3-day free trial to run this workflow with generous daily limits, or subscribe to Pro for full access.',
  },
  export: {
    title: 'You’ve hit your export limit',
    description:
      'Upgrade or start a trial for higher daily CSV/PDF export limits, or try again tomorrow on the free tier.',
  },
  insight: {
    title: 'Insight reading limit',
    description:
      'Subscribe or start a trial to read more full articles today, or browse again tomorrow.',
  },
};

export function UpgradeDialog({
  open,
  onOpenChange,
  reason = 'default',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason?: Reason;
}) {
  const [starting, setStarting] = useState(false);
  const starterPrice = import.meta.env.VITE_STRIPE_PRICE_STARTER as string | undefined;
  const { title, description } = COPY[reason] ?? COPY.default;

  const startTrial = async () => {
    setStarting(true);
    try {
      await startCheckoutSession(starterPrice);
    } catch {
      setStarting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-left leading-relaxed">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-end">
          <Button variant="outline" asChild>
            <Link to="/pricing" onClick={() => onOpenChange(false)}>
              Compare plans
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/dashboard/settings?tab=billing" onClick={() => onOpenChange(false)}>
              Billing & usage
            </Link>
          </Button>
          <Button className="teal-glow" onClick={() => void startTrial()} disabled={starting}>
            {starting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Start 3-day free trial
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
