import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Link } from 'react-router-dom';
import { Sparkles, Loader2, Clock } from 'lucide-react';
import { usePaddleCheckout } from '@/hooks/usePaddleCheckout';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useEntitlements } from '@/hooks/useEntitlements';

type Reason = 'ai' | 'export' | 'insight' | 'default';

const COPY: Record<Reason, { title: string; description: string }> = {
  default: {
    title: 'Unlock with a paid plan',
    description:
      'Explore every screen for free. To run AI research, agents, and advanced exports, subscribe to a paid plan. Upgrade anytime.',
  },
  ai: {
    title: 'AI & automation require an active plan',
    description:
      'Subscribe to a paid plan to run this workflow with higher daily limits, or choose Pro for full access.',
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

const REASON_TO_METRIC: Record<Exclude<Reason, 'default'>, string> = {
  ai: 'ai_generation',
  export: 'export_csv',
  insight: 'insight_read',
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
  const { openCheckout, loading } = usePaddleCheckout();
  const { toast } = useToast();
  const { plan } = useEntitlements();
  const { title, description } = COPY[reason] ?? COPY.default;
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestReason, setRequestReason] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const canRequestQuota = reason !== 'default';

  const subscribe = async () => {
    try {
      await openCheckout('starter_monthly_no_trial');
      onOpenChange(false);
    } catch (e) {
      toast({
        title: 'Checkout unavailable',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const submitQuotaRequest = async () => {
    if (reason === 'default') return;
    setSubmittingRequest(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Sign in required', variant: 'destructive' });
        return;
      }
      // Type-cast: quota_requests is a new table not yet in generated types
      const { error } = await (supabase as any).from('quota_requests').insert({
        user_id: user.id,
        metric: REASON_TO_METRIC[reason],
        current_plan: plan,
        reason: requestReason.trim(),
      });
      if (error) {
        if (error.code === '23505') {
          toast({
            title: 'Request already pending',
            description: 'You already have a pending request for this limit. We’ll review it shortly.',
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: 'Quota request submitted',
          description: 'Our team will review your request within one business day.',
        });
      }
      setShowRequestForm(false);
      setRequestReason('');
      onOpenChange(false);
    } catch (e) {
      toast({
        title: 'Could not submit request',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setShowRequestForm(false);
      setRequestReason('');
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-left leading-relaxed">{description}</DialogDescription>
        </DialogHeader>

        {showRequestForm && (
          <div className="space-y-2 pt-2">
            <label className="text-xs font-medium text-muted-foreground">
              Tell us why you need a temporary bump (optional)
            </label>
            <Textarea
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
              placeholder="e.g. Preparing a board pack on West Africa transport projects this week."
              rows={3}
              maxLength={500}
            />
            <p className="text-[11px] text-muted-foreground">
              We typically respond within one business day. You can have one pending request per limit type.
            </p>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-end">
          {!showRequestForm ? (
            <>
              <Button variant="outline" asChild>
                <Link to="/pricing" onClick={() => handleOpenChange(false)}>
                  Compare plans
                </Link>
              </Button>
              {canRequestQuota && (
                <Button variant="outline" onClick={() => setShowRequestForm(true)}>
                  <Clock className="h-4 w-4 mr-2" />
                  Request temporary quota
                </Button>
              )}
              <Button className="teal-glow" onClick={() => void subscribe()} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Subscribe to Starter
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setShowRequestForm(false)} disabled={submittingRequest}>
                Back
              </Button>
              <Button className="teal-glow" onClick={() => void submitQuotaRequest()} disabled={submittingRequest}>
                {submittingRequest ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Submit request
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
