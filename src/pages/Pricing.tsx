import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Check, Shield, Sparkles, Building2, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { startCheckoutSession } from '@/lib/billing/stripeClient';

const starterPrice = import.meta.env.VITE_STRIPE_PRICE_STARTER as string | undefined;

export default function Pricing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const goCheckout = async () => {
    setLoading(true);
    try {
      await startCheckoutSession(starterPrice);
    } catch (e) {
      toast({
        title: 'Checkout unavailable',
        description: e instanceof Error ? e.message : 'Configure Stripe price IDs and sign in.',
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  return (
    <div className="py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center mb-14">
          <h1 className="font-serif text-4xl font-bold mb-4">Pricing</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-4">
            Transparent tiers for individuals and teams — with a <strong className="text-foreground">3-day trial</strong> on paid plans.
            Unlike opaque enterprise-only stacks (common among large project-intelligence vendors), InfraRadar combines{' '}
            <span className="text-foreground">AI-assisted pipelines</span>,{' '}
            <span className="text-foreground">human-in-the-loop review</span>, and a modern UX at a lower entry price.
          </p>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            We stand behind the product: if you cancel within 14 days of your first paid charge, contact support for a refund per our policy.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-12">
          <div className="glass-panel rounded-xl p-8 border-border flex flex-col">
            <h2 className="font-serif text-xl font-bold mb-1">Free</h2>
            <p className="text-2xl font-serif font-bold mb-4">$0</p>
            <ul className="space-y-2 text-sm text-muted-foreground mb-6 flex-1">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Limited AI &amp; exports (daily caps)</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Core project discovery</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Public insights (read caps apply when signed in)</li>
            </ul>
            <Button variant="outline" asChild className="w-full">
              <Link to="/login">Get started</Link>
            </Button>
          </div>

          <div className="glass-panel rounded-xl p-8 border-primary/40 teal-glow relative flex flex-col">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-wider bg-primary text-primary-foreground px-3 py-1 rounded-full">
              3-day trial
            </span>
            <h2 className="font-serif text-xl font-bold mb-1 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Starter
            </h2>
            <p className="text-2xl font-serif font-bold mb-1">From $29<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
            <p className="text-xs text-muted-foreground mb-4">After trial — see checkout for current price</p>
            <ul className="space-y-2 text-sm text-muted-foreground mb-6 flex-1">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Higher daily AI &amp; export limits</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Full insight reads</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Stripe Customer Portal (cancel anytime)</li>
            </ul>
            {user ? (
              <Button className="w-full teal-glow" onClick={() => void goCheckout()} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Start trial
              </Button>
            ) : (
              <Button className="w-full teal-glow" asChild>
                <Link to="/login">Sign in to subscribe</Link>
              </Button>
            )}
          </div>

          <div className="glass-panel rounded-xl p-8 border-border flex flex-col">
            <h2 className="font-serif text-xl font-bold mb-1 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" /> Pro / Enterprise
            </h2>
            <p className="text-2xl font-serif font-bold mb-4">Custom</p>
            <ul className="space-y-2 text-sm text-muted-foreground mb-6 flex-1">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Highest limits &amp; priority workflows</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> SSO, invoicing, or annual contracts</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Dedicated onboarding</li>
            </ul>
            <Button variant="outline" asChild className="w-full">
              <a href="/#connect">Contact sales</a>
            </Button>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-8 max-w-3xl mx-auto">
          <h3 className="font-serif text-lg font-semibold mb-3 flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> Why InfraRadar vs. typical competitors
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Many enterprise project-data platforms gate pricing behind demos and long sales cycles; InfraRadar is built for teams that want{' '}
            <span className="text-foreground">speed and transparency</span>: self-serve subscription, clear usage limits during trial, and optional enterprise
            for regulated or large deployments. You get verifiable sources, review workflows, and AI where it helps — without paying opaque enterprise premiums
            until you need them.
          </p>
        </div>
      </div>
    </div>
  );
}
