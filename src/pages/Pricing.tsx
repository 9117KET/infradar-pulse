import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Shield, Sparkles, Building2, Loader2, Zap, Globe, Crown, Infinity as InfinityIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { usePaddleCheckout, type PlanPriceId } from '@/hooks/usePaddleCheckout';
import { useNoCardTrial } from '@/hooks/useNoCardTrial';
import { supabase } from '@/integrations/supabase/client';
import { getPaddleEnvironment, isLiveCheckoutEnabled } from '@/lib/paddle';
import { cn } from '@/lib/utils';

// Competitor names are intentionally anonymized to keep the comparison
// category-based and avoid singling out any specific vendor. The blurred
// labels stand in for well-known incumbents in each segment (regional
// intelligence publishers, global market research firms, energy/commodity
// research houses, project finance data terminals, and emerging regional
// MENA/Africa intelligence platforms).
const COMPETITOR_TABLE = [
  { name: 'Regional intelligence publisher', price: '$5k-$15k / yr', update: 'Quarterly PDF', blur: true },
  { name: 'Global market research vendor', price: '$10k-$50k / yr', update: 'Static reports', blur: true },
  { name: 'Energy & commodity research house', price: '$50k-$200k / yr', update: 'Annual research', blur: true },
  { name: 'Project finance data terminal', price: '$20k-$100k / yr', update: 'Financial feeds', blur: true },
  { name: 'Regional MENA/Africa intel platform', price: '$3k-$12k / yr', update: 'Weekly updates', blur: true },
  { name: 'Construction & tender aggregator', price: '$4k-$20k / yr', update: 'Daily, unverified', blur: true },
  { name: 'InfradarAI', price: 'From $0 / mo', update: 'Real-time AI', highlight: true },
];

const LIFETIME_MAX_SEATS = 100;

type Cycle = 'monthly' | 'yearly';

export default function Pricing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { openCheckout, loading } = usePaddleCheckout();
  const { startTrial, loading: trialLoading } = useNoCardTrial();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [seatsTaken, setSeatsTaken] = useState<number | null>(null);

  // Public seat counter — drives the urgency badge on the Lifetime card.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const env = getPaddleEnvironment(); // 'sandbox' | 'live'
      const { data, error } = await supabase.rpc('lifetime_seats_taken', {
        p_environment: env,
      });
      if (!cancelled && !error && typeof data === 'number') {
        setSeatsTaken(data);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const goCheckout = async (priceId: PlanPriceId) => {
    if (!isLiveCheckoutEnabled()) {
      navigate('/contact?intent=pilot');
      return;
    }

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

  const beginTrial = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      await startTrial();
      toast({ title: 'Trial started', description: 'Your 3-day trial is active. No card was required.' });
      navigate('/dashboard/settings?tab=billing');
    } catch (e) {
      toast({
        title: 'Trial unavailable',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const isYearly = cycle === 'yearly';

  // Pricing data — matches Paddle catalog. Yearly is 20% off the rounded
  // monthly equivalent; effectiveMonthly is what we surface to users.
  const starterMonthlyPrice = 29;
  const starterYearlyPrice = 278; // ~$23.20/mo
  const proMonthlyPrice = 199;
  const proYearlyPrice = 1910; // ~$159.20/mo

  const starterPrice = isYearly ? starterYearlyPrice : starterMonthlyPrice;
  const starterUnit = isYearly ? '/yr' : '/mo';
  const starterSubtitle = isYearly
    ? `~$${(starterYearlyPrice / 12).toFixed(2)}/mo, billed yearly · save 20%`
    : 'Billed monthly';
  const starterPriceId: PlanPriceId = isYearly ? 'starter_yearly_no_trial' : 'starter_monthly_no_trial';

  const proPrice = isYearly ? proYearlyPrice : proMonthlyPrice;
  const proUnit = isYearly ? '/yr' : '/mo';
  const proSubtitle = isYearly
    ? `~$${(proYearlyPrice / 12).toFixed(2)}/mo, billed yearly · save 20%`
    : 'Billed monthly';
  const proPriceId: PlanPriceId = isYearly ? 'pro_yearly_no_trial' : 'pro_monthly_no_trial';

  const seatsRemaining =
    seatsTaken === null ? null : Math.max(0, LIFETIME_MAX_SEATS - seatsTaken);
  const lifetimeSoldOut = seatsRemaining !== null && seatsRemaining <= 0;
  const checkoutEnabled = isLiveCheckoutEnabled();

  return (
    <div className="py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center mb-10">
          <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">Pricing</div>
          <h1 className="font-serif text-4xl font-bold mb-4">
            Intelligence that pays for itself
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-4">
            Instead of paying thousands for a single static market report, subscribe to living project intelligence: verified data,
            alerts, portfolio Q&amp;A, and <span className="text-foreground font-medium">AI-generated market reports</span> that update with your scope.
            Pay for what you use, cancel anytime.
          </p>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Start with a 3-day trial, no card required. Card details are only requested for paid upgrades,
            and your first paid charge has a 14-day refund guarantee.
          </p>
        </div>

        {/* Billing cycle toggle */}
        <div className="flex justify-center mb-10">
          <div
            role="tablist"
            aria-label="Billing cycle"
            className="inline-flex items-center rounded-full border border-border bg-card/50 p-1"
          >
            <button
              role="tab"
              aria-selected={!isYearly}
              onClick={() => setCycle('monthly')}
              className={cn(
                'px-5 py-2 text-xs font-medium rounded-full transition-colors',
                !isYearly ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Monthly
            </button>
            <button
              role="tab"
              aria-selected={isYearly}
              onClick={() => setCycle('yearly')}
              className={cn(
                'px-5 py-2 text-xs font-medium rounded-full transition-colors flex items-center gap-2',
                isYearly ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Yearly
              <span
                className={cn(
                  'text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full',
                  isYearly
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-primary/15 text-primary',
                )}
              >
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Recurring plans */}
        <div className="grid gap-6 md:grid-cols-4 mb-12">
          {/* Free */}
          <div className="glass-panel rounded-xl p-7 border-border flex flex-col">
            <h2 className="font-serif text-lg font-bold mb-1">Free</h2>
            <p className="text-3xl font-serif font-bold mb-1">$0</p>
            <p className="text-xs text-muted-foreground mb-5">No credit card required</p>
            <ul className="space-y-2 text-sm text-muted-foreground mb-6 flex-1">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 2 AI queries/day</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 3 full insight reads/day</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 1 export/day (CSV or Excel, up to 25 rows)</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Core project discovery</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Portfolio tracking</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Basic alerts</li>
            </ul>
            <Button variant="outline" asChild className="w-full">
              <Link to="/login">Get started</Link>
            </Button>
            <Button
              variant="ghost"
              className="w-full mt-2"
              onClick={() => void beginTrial()}
              disabled={trialLoading}
            >
              {trialLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Start 3-day trial
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
            <p className="text-3xl font-serif font-bold mb-1">
              ${starterPrice}
              <span className="text-sm font-normal text-muted-foreground">{starterUnit}</span>
            </p>
            <p className="text-xs text-muted-foreground mb-5 min-h-[32px]">{starterSubtitle}. 14-day refund guarantee.</p>
            <ul className="space-y-2 text-sm text-muted-foreground mb-6 flex-1">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 20 AI queries/day</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 50 full insight reads/day</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 20 exports/day - CSV &amp; Excel (.xlsx), up to 1,000 rows</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> AI digest email alerts</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Full alert rules</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Portfolio chat (AI Q&amp;A)</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> AI digest and market snapshot summaries</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Saved searches</li>
            </ul>
            {user ? (
              <Button className="w-full teal-glow" onClick={() => void goCheckout(starterPriceId)} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {checkoutEnabled ? (isYearly ? 'Subscribe yearly' : 'Subscribe') : 'Request pilot access'}
              </Button>
            ) : (
              <Button className="w-full teal-glow" asChild>
                <Link to={checkoutEnabled ? '/login' : '/contact?intent=pilot'}>
                  {checkoutEnabled ? 'Sign in to subscribe' : 'Request pilot access'}
                </Link>
              </Button>
            )}
          </div>

          {/* Pro */}
          <div className="glass-panel rounded-xl p-7 border-border flex flex-col">
            <h2 className="font-serif text-lg font-bold mb-1 flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Pro
            </h2>
            <p className="text-3xl font-serif font-bold mb-1">
              ${proPrice}
              <span className="text-sm font-normal text-muted-foreground">{proUnit}</span>
            </p>
            <p className="text-xs text-muted-foreground mb-5 min-h-[32px]">{proSubtitle}. 14-day refund guarantee.</p>
            <ul className="space-y-2 text-sm text-muted-foreground mb-6 flex-1">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 100 AI queries/day</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 200 full insight reads/day</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 100 exports/day - CSV &amp; Excel (.xlsx), up to 10,000 rows</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Project tearsheet PDFs (per-project one-pager)</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> AI-generated country, sector, tender and portfolio report PDFs</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> AI digest email alerts</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Delay risk scores</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Early warning alerts</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Contractor intelligence</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Permit &amp; regulatory tracker</li>
            </ul>
            {user ? (
              <Button className="w-full" onClick={() => void goCheckout(proPriceId)} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {checkoutEnabled ? (isYearly ? 'Subscribe yearly' : 'Subscribe') : 'Request pilot access'}
              </Button>
            ) : (
              <Button className="w-full" asChild>
                <Link to={checkoutEnabled ? '/login' : '/contact?intent=pilot'}>
                  {checkoutEnabled ? 'Sign in to subscribe' : 'Request pilot access'}
                </Link>
              </Button>
            )}
          </div>

          {/* Enterprise */}
          <div className="glass-panel rounded-xl p-7 border-border flex flex-col">
            <h2 className="font-serif text-lg font-bold mb-1 flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" /> Enterprise
            </h2>
            <p className="text-3xl font-serif font-bold mb-1">Custom</p>
            <p className="text-xs text-muted-foreground mb-5 min-h-[32px]">Annual contracts, invoicing available</p>
            <ul className="space-y-2 text-sm text-muted-foreground mb-6 flex-1">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Unlimited AI, insights &amp; exports</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Unlimited CSV, Excel &amp; PDF exports (no row cap)</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Full API access + webhooks</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> SSO / SAML</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> White-label reports &amp; tearsheet PDFs</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Dedicated onboarding</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> SLA guarantee</li>
            </ul>
            <Button variant="outline" asChild className="w-full">
              <Link to="/contact">Contact sales</Link>
            </Button>
          </div>
        </div>

        {/* Founders Lifetime — limited offer */}
        <div className="relative mb-12">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 blur-2xl rounded-2xl" />
          <div className="relative glass-panel rounded-2xl p-8 border-2 border-primary/40 teal-glow overflow-hidden">
            <div className="grid md:grid-cols-[1fr_auto] gap-8 items-center">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Crown className="h-5 w-5 text-primary" />
                  <span className="text-[10px] uppercase tracking-widest text-primary font-semibold">
                    Founders offer · limited to 100 seats
                  </span>
                </div>
                <h2 className="font-serif text-2xl md:text-3xl font-bold mb-2 flex items-center gap-2">
                  Lifetime access. Pay once, own it forever
                  <InfinityIcon className="h-6 w-6 text-primary" />
                </h2>
                <p className="text-sm text-muted-foreground mb-4 max-w-xl">
                  Get permanent Pro-tier access to InfradarAI. Every future feature, every new agent,
                  every market we cover, yours at no extra cost. Help us build the category, get
                  rewarded forever.
                </p>
                <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-muted-foreground mb-2">
                  <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Everything in Pro, forever</li>
                  <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> All future features included</li>
                  <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Unlimited CSV, Excel &amp; PDF exports</li>
                  <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> No recurring charges, ever</li>
                  <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Priority support &amp; roadmap input</li>
                </ul>
              </div>
              <div className="text-center md:text-right md:border-l md:border-primary/20 md:pl-8">
                <p className="text-5xl font-serif font-bold mb-1">$1,499</p>
                <p className="text-xs text-muted-foreground mb-1">One-time · USD</p>
                <p className="text-[11px] text-muted-foreground line-through mb-4">vs $2,388/yr on Pro</p>
                {seatsRemaining !== null && (
                  <div className="inline-block mb-4 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/30">
                    <span className="text-xs font-semibold text-primary">
                      {lifetimeSoldOut
                        ? 'Sold out'
                        : `${seatsRemaining} of ${LIFETIME_MAX_SEATS} seats left`}
                    </span>
                  </div>
                )}
                {user ? (
                  <Button
                    size="lg"
                    className="w-full md:w-auto teal-glow"
                    disabled={loading || lifetimeSoldOut}
                    onClick={() => void goCheckout('lifetime_pro_onetime')}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Crown className="h-4 w-4 mr-2" />}
                    {lifetimeSoldOut ? 'Sold out' : checkoutEnabled ? 'Claim lifetime access' : 'Request founder access'}
                  </Button>
                ) : (
                  <Button size="lg" className="w-full md:w-auto teal-glow" asChild>
                    <Link to={checkoutEnabled ? '/login' : '/contact?intent=pilot'}>
                      {checkoutEnabled ? 'Sign in to claim' : 'Request founder access'}
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Competitor comparison */}
        <div className="glass-panel rounded-xl p-8 max-w-4xl mx-auto mb-8">
          <h3 className="font-serif text-lg font-semibold mb-1 flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> Why InfradarAI vs. legacy intelligence vendors
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            Legacy vendors sell static PDF reports for thousands per topic. InfradarAI turns the same job into a living workflow:
            search the data, monitor alerts, ask AI questions, and generate fresh report-quality briefs from your selected scope.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <th className="pb-3 pr-6">Vendor category</th>
                  <th className="pb-3 pr-6">Typical price</th>
                  <th className="pb-3">Data freshness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {COMPETITOR_TABLE.map(r => (
                  <tr key={r.name} className={r.highlight ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                    <td className="py-3 pr-6">
                      <span className="flex items-center gap-2">
                        {r.highlight && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                        <span
                          className={cn(r.blur && 'blur-[3px] hover:blur-[2px] transition-all select-none')}
                          aria-label={r.blur ? 'Competitor name redacted' : undefined}
                          title={r.blur ? 'Vendor name intentionally redacted' : undefined}
                        >
                          {r.name}
                        </span>
                      </span>
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
            <Building2 className="h-5 w-5 text-primary" /> Built for infrastructure commercial, finance, and delivery teams
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            For business development teams, EPC contractors, project managers, infrastructure consultants, development finance analysts, project finance professionals, owners, developers, and procurement teams, InfradarAI replaces expensive consultant engagements and stale research subscriptions with{' '}
            <span className="text-foreground">real-time AI research</span>,{' '}
            <span className="text-foreground">confidence-scored signals</span>, and{' '}
            <span className="text-foreground">self-serve workflows</span> for faster market research and pipeline decisions.
            Export your pipeline as CSV, Excel (.xlsx), project tearsheets, and intelligence reports with account-level audit traceability.
            Enterprise and API access available for teams embedding InfradarAI into their own workflows.
          </p>
        </div>
      </div>
    </div>
  );
}
