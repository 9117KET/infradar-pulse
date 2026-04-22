import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Check, Shield, Sparkles, Building2, Loader2, Zap, Globe } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { usePaddleCheckout, type PlanPriceId } from '@/hooks/usePaddleCheckout';

const COMPETITOR_TABLE = [
  { name: 'MEED', price: '$5k-$15k/yr', update: 'Quarterly PDF' },
  { name: 'GlobalData', price: '$10k-$50k/yr', update: 'Static reports' },
  { name: 'Wood Mackenzie', price: '$50k-$200k/yr', update: 'Annual research' },
  { name: 'InfraRadar', price: 'From $0/mo', update: 'Real-time AI', highlight: true },
];

export default function Pricing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { openCheckout, loading } = usePaddleCheckout();

  const goCheckout = async (priceId: PlanPriceId) => {
    try {
      await openCheckout(priceId);
    } catch (e) {
      toast({
        title: 'Checkout unavailable',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center mb-14">
          <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">Pricing</div>
          <h1 className="font-serif text-4xl font-bold mb-4">
            Intelligence that pays for itself
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-4">
            While incumbents charge $5,000-$200,000/year for quarterly PDF reports, InfraRadar delivers{' '}
            <span className="text-foreground font-medium">real-time AI intelligence</span> at a fraction of the cost.
            3-day free trial on all paid plans. No sales call required.
          </p>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            14-day refund guarantee on your first paid charge. Cancel anytime from your billing portal.
            Daily quotas reset at 00:00 UTC. Trial users get 5 AI queries, 10 insight reads, and 3 exports per day.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-4 mb-12">
          {/* Free */}
          <div className="glass-panel rounded-xl p-7 border-border flex flex-col">
            <h2 className="font-serif text-lg font-bold mb-1">Free</h2>
            <p className="text-3xl font-serif font-bold mb-1">$0</p>
            <p className="text-xs text-muted-foreground mb-5">No credit card required</p>
            <ul className="space-y-2 text-sm text-muted-foreground mb-6 flex-1">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 2 AI queries/day</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 3 full insight reads/day</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 1 export/day (CSV or PDF)</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Core project discovery</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Portfolio tracking</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Basic alerts</li>
            </ul>
            <Button variant="outline" asChild className="w-full">
              <Link to="/login">Get started</Link>
            </Button>
          </div>

          {/* Starter */}
          <div className="glass-panel rounded-xl p-7 border-primary/40 teal-glow relative flex flex-col">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-wider bg-primary text-primary-foreground px-3 py-1 rounded-full">
              Most popular
            </span>
            <h2 className="font-serif text-lg font-bold mb-1 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Starter
            </h2>
            <p className="text-3xl font-serif font-bold mb-1">$29<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
            <p className="text-xs text-muted-foreground mb-5">3-day trial, then billed monthly</p>
            <ul className="space-y-2 text-sm text-muted-foreground mb-6 flex-1">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 20 AI queries/day</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 50 full insight reads/day</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 20 exports/day (CSV + PDF combined)</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Full alert rules</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Portfolio chat (AI Q&amp;A)</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Saved searches</li>
            </ul>
            {user ? (
              <Button className="w-full teal-glow" onClick={() => void goCheckout('starter_monthly')} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Start trial
              </Button>
            ) : (
              <Button className="w-full teal-glow" asChild>
                <Link to="/login">Sign in to start trial</Link>
              </Button>
            )}
          </div>

          {/* Pro */}
          <div className="glass-panel rounded-xl p-7 border-border flex flex-col">
            <h2 className="font-serif text-lg font-bold mb-1 flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Pro
            </h2>
            <p className="text-3xl font-serif font-bold mb-1">$199<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
            <p className="text-xs text-muted-foreground mb-5">3-day trial, then billed monthly</p>
            <ul className="space-y-2 text-sm text-muted-foreground mb-6 flex-1">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 100 AI queries/day</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 200 full insight reads/day</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 100 exports/day (CSV + PDF combined)</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Delay risk scores</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Early warning alerts</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Contractor intelligence</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Permit &amp; regulatory tracker</li>
            </ul>
            {user ? (
              <Button className="w-full" onClick={() => void goCheckout('pro_monthly')} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Start trial
              </Button>
            ) : (
              <Button className="w-full" asChild>
                <Link to="/login">Sign in to start trial</Link>
              </Button>
            )}
          </div>

          {/* Enterprise */}
          <div className="glass-panel rounded-xl p-7 border-border flex flex-col">
            <h2 className="font-serif text-lg font-bold mb-1 flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" /> Enterprise
            </h2>
            <p className="text-3xl font-serif font-bold mb-1">Custom</p>
            <p className="text-xs text-muted-foreground mb-5">Annual contracts, invoicing available</p>
            <ul className="space-y-2 text-sm text-muted-foreground mb-6 flex-1">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Unlimited AI, insights &amp; exports</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Full API access + webhooks</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> SSO / SAML</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> White-label reports</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Dedicated onboarding</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> SLA guarantee</li>
            </ul>
            <Button variant="outline" asChild className="w-full">
              <Link to="/contact">Contact sales</Link>
            </Button>
          </div>
        </div>

        {/* Competitor comparison */}
        <div className="glass-panel rounded-xl p-8 max-w-4xl mx-auto mb-8">
          <h3 className="font-serif text-lg font-semibold mb-1 flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> Why InfraRadar vs. legacy intelligence vendors
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            Incumbents sell annual PDF reports gated behind long sales cycles. InfraRadar is self-serve, AI-native, and 100x cheaper.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <th className="pb-3 pr-6">Vendor</th>
                  <th className="pb-3 pr-6">Typical price</th>
                  <th className="pb-3">Data freshness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {COMPETITOR_TABLE.map(r => (
                  <tr key={r.name} className={r.highlight ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                    <td className="py-3 pr-6 flex items-center gap-2">
                      {r.highlight && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                      {r.name}
                    </td>
                    <td className={`py-3 pr-6 ${r.highlight ? 'text-primary' : ''}`}>{r.price}</td>
                    <td className="py-3">{r.update}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-8 max-w-4xl mx-auto">
          <h3 className="font-serif text-lg font-semibold mb-3 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" /> Built for DFI analysts, project finance teams, and EPC contractors
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            InfraRadar replaces expensive consultant engagements and stale research subscriptions with{' '}
            <span className="text-foreground">real-time AI research</span>,{' '}
            <span className="text-foreground">confidence-scored signals</span>, and{' '}
            <span className="text-foreground">self-serve workflows</span> - no annual contracts, no sales calls, no waiting for a quarterly report.
            Enterprise and API access available for teams embedding InfraRadar into their own workflows.
          </p>
        </div>
      </div>
    </div>
  );
}
