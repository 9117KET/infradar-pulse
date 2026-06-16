import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useToast } from '@/hooks/use-toast';
import { trackEvent } from '@/lib/analytics';

export type FoundingAccessRequest = {
  planKey: string;            // 'starter' | 'pro' | 'lifetime' | ...
  planLabel: string;          // display name, e.g. 'Pro'
  billingCycle?: string;      // 'monthly' | 'yearly' | 'lifetime'
  source: string;             // 'pricing' | 'upgrade_dialog' | 'settings'
};

type Sentiment = 'ready' | 'maybe' | 'curious';

type Ctx = { openFoundingAccess: (req: FoundingAccessRequest) => void };

const FoundingAccessContext = createContext<Ctx | null>(null);

/**
 * Honest pre-launch "painted door". When billing isn't live, Upgrade CTAs open
 * this instead of a checkout: it tells the user we're not charging yet and
 * captures their intent (sentiment + willingness-to-pay) into plan_interest.
 * Validation signal without the dark pattern of a fake failed payment.
 */
export function FoundingAccessProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { plan, usage } = useEntitlements();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [req, setReq] = useState<FoundingAccessRequest | null>(null);
  const [sentiment, setSentiment] = useState<Sentiment>('ready');
  const [expectedPrice, setExpectedPrice] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => {
    setSentiment('ready');
    setExpectedPrice('');
    setEmail('');
    setNote('');
    setSubmitting(false);
    setDone(false);
  };

  const openFoundingAccess = useCallback((next: FoundingAccessRequest) => {
    reset();
    setReq(next);
    setOpen(true);
    void trackEvent('founding_access_opened', { plan: next.planKey, cycle: next.billingCycle ?? null, source: next.source }, 'monetization');
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setReq(null);
  };

  const submit = async () => {
    if (!req) return;
    const finalEmail = (user?.email ?? email).trim();
    if (!finalEmail) {
      toast({ title: 'Email needed', description: 'Add an email so we can reach you at launch.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const priceNum = expectedPrice.trim() ? Math.max(0, Math.round(Number(expectedPrice.replace(/[^0-9.]/g, '')))) : null;
      // Cast to any: plan_interest is a brand-new table not yet in generated types.
      const { error } = await (supabase as any).from('plan_interest').insert({
        user_id: user?.id ?? null,
        email: finalEmail,
        plan_key: req.planKey,
        billing_cycle: req.billingCycle ?? null,
        sentiment,
        expected_price: Number.isFinite(priceNum as number) ? priceNum : null,
        note: note.trim() || null,
        source: req.source,
        current_plan: plan,
        context: { cycle: req.billingCycle ?? null, ai_used_today: usage.ai_generation ?? 0 },
      });
      if (error) throw error;
      void trackEvent('plan_interest_submitted', {
        plan: req.planKey, cycle: req.billingCycle ?? null, sentiment,
        expected_price: priceNum, source: req.source,
      }, 'monetization');
      setDone(true);
    } catch (e) {
      toast({ title: 'Could not save', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const value = useMemo(() => ({ openFoundingAccess }), [openFoundingAccess]);

  const sentiments: { key: Sentiment; label: string; hint: string }[] = [
    { key: 'ready', label: 'Ready to pay now', hint: "I'd subscribe today" },
    { key: 'maybe', label: 'Maybe — keep me posted', hint: 'Interested, not yet' },
    { key: 'curious', label: 'Just curious', hint: 'Exploring options' },
  ];

  return (
    <FoundingAccessContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          {done ? (
            <div className="py-4 text-center space-y-3">
              <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
              <DialogTitle className="font-serif text-xl">You're on the founding list</DialogTitle>
              <DialogDescription className="text-center">
                We'll email you the moment {req?.planLabel} billing opens — with your founding-member discount locked in. Thanks for helping shape what we build next.
              </DialogDescription>
              <Button className="teal-glow mt-2" onClick={() => handleOpenChange(false)}>Done</Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="font-serif flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Reserve your {req?.planLabel} plan
                </DialogTitle>
                <DialogDescription className="text-left leading-relaxed">
                  We're putting the finishing touches on billing — you're early. Reserve now to lock in
                  <span className="text-foreground font-medium"> founding-member pricing</span> and we'll
                  email you the moment it opens. No charge today.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 pt-1">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">How ready are you?</Label>
                  <div className="grid gap-2">
                    {sentiments.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setSentiment(s.key)}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                          sentiment === s.key ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <span className="font-medium">{s.label}</span>
                        <span className="text-xs text-muted-foreground">{s.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="fa-price" className="text-xs text-muted-foreground">
                    What would you expect to pay? <span className="opacity-60">(optional)</span>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <Input
                      id="fa-price"
                      inputMode="numeric"
                      value={expectedPrice}
                      onChange={(e) => setExpectedPrice(e.target.value)}
                      placeholder="e.g. 49"
                      className="pl-7"
                    />
                  </div>
                </div>

                {!user && (
                  <div className="space-y-1.5">
                    <Label htmlFor="fa-email" className="text-xs text-muted-foreground">Email</Label>
                    <Input
                      id="fa-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="fa-note" className="text-xs text-muted-foreground">
                    Anything you need this to do? <span className="opacity-60">(optional)</span>
                  </Label>
                  <Textarea
                    id="fa-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="e.g. CSV exports + alerts for West Africa transport."
                  />
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-end">
                <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
                  Not now
                </Button>
                <Button className="teal-glow" onClick={() => void submit()} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Reserve my spot
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </FoundingAccessContext.Provider>
  );
}

export function useFoundingAccess(): Ctx {
  const ctx = useContext(FoundingAccessContext);
  if (!ctx) throw new Error('useFoundingAccess must be used within FoundingAccessProvider');
  return ctx;
}
