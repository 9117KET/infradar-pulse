/**
 * FeatureGate — wraps a route or section and enforces the plan requirement.
 *
 * Variants:
 *   - 'page': replaces children with an upgrade screen
 *   - 'overlay': renders blurred children behind an upgrade card (preview)
 *   - 'inline': renders nothing of children, just an inline upgrade banner
 *
 * Staff (admin/researcher) and lifetime users bypass automatically.
 */
import { type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Sparkles, ArrowRight } from 'lucide-react';
import { useEntitlements } from '@/hooks/useEntitlements';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';
import {
  canAccessFeature,
  FEATURE_LABELS,
  FEATURE_MIN_PLAN,
  type FeatureKey,
} from '@/lib/billing/featureAccess';
import { trackEvent } from '@/lib/analytics';

type Variant = 'page' | 'overlay' | 'inline';

interface FeatureGateProps {
  feature: FeatureKey;
  variant?: Variant;
  children: ReactNode;
}

const PLAN_BADGE: Record<string, string> = {
  starter: 'Starter plan',
  pro: 'Pro plan',
  enterprise: 'Enterprise plan',
};

export function FeatureGate({ feature, variant = 'page', children }: FeatureGateProps) {
  const { plan, staffBypass, loading } = useEntitlements();
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-[240px] glass-panel rounded-xl border-border/60 p-6">
        <div className="h-full min-h-[192px] flex flex-col items-center justify-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 animate-pulse" />
          <div className="h-3 w-40 rounded bg-muted animate-pulse" />
          <div className="h-3 w-64 max-w-full rounded bg-muted/60 animate-pulse" />
        </div>
      </div>
    );
  }

  if (canAccessFeature(plan, feature, staffBypass)) return <>{children}</>;

  const minPlan = FEATURE_MIN_PLAN[feature];
  const label = FEATURE_LABELS[feature];
  const badge = PLAN_BADGE[minPlan] ?? `${minPlan} plan`;

  useEffect(() => {
    void trackEvent('paywall_viewed', { feature, min_plan: minPlan, variant }, 'monetization');
  }, [feature, minPlan, variant]);

  const openUpgrade = (source: string) => {
    void trackEvent('paywall_cta_clicked', { feature, min_plan: minPlan, action: 'start_trial', source }, 'monetization');
    setOpen(true);
  };

  const cta = (
    <div className="glass-panel rounded-xl border-primary/30 p-8 max-w-xl mx-auto text-center">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Lock className="h-5 w-5 text-primary" />
      </div>
      <Badge variant="outline" className="mb-3 border-primary/40 text-primary">
        <Sparkles className="h-3 w-3 mr-1" />{badge}
      </Badge>
      <h2 className="font-serif text-2xl font-bold mb-2">{label.name}</h2>
      <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
        {label.description} Unlock with the {badge.replace(' plan', '')} plan or start a 3-day free trial.
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        <Button onClick={() => openUpgrade('feature_gate_primary')} className="teal-glow">
          Start free trial
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <Button variant="outline" asChild>
          <Link to="/pricing" onClick={() => void trackEvent('paywall_cta_clicked', { feature, min_plan: minPlan, action: 'compare_plans', source: 'feature_gate' }, 'monetization')}>Compare plans</Link>
        </Button>
      </div>
      <UpgradeDialog open={open} onOpenChange={setOpen} />
    </div>
  );

  if (variant === 'inline') {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
        <Lock className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{label.name} — {badge}</p>
          <p className="text-xs text-muted-foreground">{label.description}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => openUpgrade('feature_gate_inline')}>Upgrade</Button>
        <UpgradeDialog open={open} onOpenChange={setOpen} />
      </div>
    );
  }

  if (variant === 'overlay') {
    return (
      <div className="relative">
        <div className="pointer-events-none select-none blur-sm opacity-40" aria-hidden="true">{children}</div>
        <div className="absolute inset-0 flex items-center justify-center p-6 bg-background/40 backdrop-blur-sm">
          {cta}
        </div>
      </div>
    );
  }

  return <div className="py-12">{cta}</div>;
}
