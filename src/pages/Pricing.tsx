import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Shield, Sparkles, Building2, Loader2, Zap, Globe, Crown, Infinity as InfinityIcon, Gift, Layers, Trophy, Link2, MessageSquare, Newspaper, BadgeCheck, CalendarCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
// DORMANT: import { usePaddleCheckout, type PlanPriceId } from '@/hooks/usePaddleCheckout';
import { useLemonSqueezyCheckout, type PlanPriceId } from '@/hooks/useLemonSqueezyCheckout';
import { useNoCardTrial } from '@/hooks/useNoCardTrial';
import { supabase } from '@/integrations/supabase/client';
import { getAppEnvironment } from '@/lib/billing/environment';
// DORMANT: import { getPaddleEnvironment, isLiveCheckoutEnabled, isPaymentsLive } from '@/lib/paddle';
import { isLiveCheckoutEnabled, isPaymentsLive, isTestCheckoutEnabled } from '@/lib/lemonSqueezy';
import { useFoundingAccess } from '@/components/billing/FoundingAccessProvider';
import { cn } from '@/lib/utils';
import { Seo } from '@/components/Seo';
import { PRICES, perMonth, yearlySavingPct } from '@/lib/billing/pricing';

// Competitor names are intentionally anonymized to keep the comparison
// category-based and avoid singling out any specific vendor. The blurred
// labels stand in for well-known incumbents in each segment (regional
// intelligence publishers, global market research firms, energy/commodity
// research houses, project finance data terminals, and emerging regional
// MENA/Africa intelligence platforms).
const COMPETITOR_TABLE = [
  { name: 'Development funding & tender database', price: '$250-$1,200 / yr per user', update: 'Daily, all aid sectors mixed', blur: true },
  { name: 'Regional intelligence publisher', price: '$5k-$15k / yr', update: 'Quarterly PDF', blur: true },
  { name: 'Global market research vendor', price: '$10k-$50k / yr', update: 'Static reports', blur: true },
  { name: 'Energy & commodity research house', price: '$50k-$200k / yr', update: 'Annual research', blur: true },
  { name: 'Project finance data terminal', price: '$20k-$100k / yr', update: 'Financial feeds', blur: true },
  { name: 'Regional MENA/Africa intel platform', price: '$3k-$12k / yr', update: 'Weekly updates', blur: true },
  { name: 'Construction & tender aggregator', price: '$4k-$20k / yr', update: 'Daily, unverified', blur: true },
  { name: 'INFRADARAI', price: `From $0 · Pro $${PRICES.pro.yearly} / yr`, update: 'Real-time, infrastructure-only, with award history', highlight: true },
];

// What a buyer gets that a list of tender notices doesn't give them. Keep each
// line true of the live product: these are promises, not roadmap.
const VALUE_POINTS = [
  { icon: Layers, title: 'Every source in one feed', desc: '7 development-bank pipelines plus World Bank procurement, EU TED, UK Find a Tender and South Africa eTenders. Stop checking a dozen portals.' },
  { icon: Trophy, title: 'Who won, and for how much', desc: 'Contract awards with the winning company and signed price, so you can price bids and choose partners with evidence.' },
  { icon: Link2, title: 'Tender linked to its project', desc: 'Each notice is tied to its parent project, financier and later news, so you can see whether it is real, funded and moving.' },
  { icon: MessageSquare, title: 'Ask in plain English', desc: 'Ask "water design-build awards in East Africa over $5M" and get instant answers, plus AI-written country, sector and tender reports.' },
  { icon: Newspaper, title: 'News watch on your projects', desc: 'Global news monitoring flags delays, cancellations, disputes and financing on the projects you track.' },
  { icon: BadgeCheck, title: 'Source on every record', desc: 'Every project and tender links to its official source, with a confidence score and human review behind it.' },
  { icon: CalendarCheck, title: 'No lock-in', desc: 'Monthly plans, cancel anytime, minimum 14-day refund window, and a no-card pilot to try everything first.' },
];

const LIFETIME_MAX_SEATS = 100;

type Cycle = 'monthly' | 'yearly';
type PilotCounter = {
  enabled: boolean;
  max_seats: number;
  used_seats: number;
  remaining_seats: number;
  duration_days: number;
};

export default function Pricing() {
  const { user } = useAuth();
  const { toast } = useToast();
  // DORMANT: const { openCheckout, loading } = usePaddleCheckout();
  const { openCheckout, loading } = useLemonSqueezyCheckout();
  const { startTrial, loading: trialLoading } = useNoCardTrial();
  const { openFoundingAccess } = useFoundingAccess();
  const navigate = useNavigate();
  // Test checkout (pre-launch sandbox round-trip) shows the real checkout UI too.
  const paymentsLive = isPaymentsLive() || isTestCheckoutEnabled();

  // Pre-launch: capture demand instead of charging.
  const reserve = (planKey: string, planLabel: string, billingCycle: string) =>
    openFoundingAccess({ planKey, planLabel, billingCycle, source: 'pricing' });
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [seatsTaken, setSeatsTaken] = useState<number | null>(null);
  const [pilotCounter, setPilotCounter] = useState<PilotCounter | null>(null);

  // Public seat counter — drives the urgency badge on the Lifetime card.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const env = getAppEnvironment(); // 'sandbox' | 'live'
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

  useEffect(() => {
    let cancelled = false;
    const loadPilotCounter = async () => {
      const { data, error } = await (supabase.rpc as any)('get_public_pilot_access_counter', {
        p_environment: 'live',
      });
      if (!cancelled && !error && data) setPilotCounter(data as PilotCounter);
    };

    void loadPilotCounter();
    const interval = window.setInterval(loadPilotCounter, 30000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadPilotCounter();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
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

  // List prices live in src/lib/billing/pricing.ts and must match the Lemon
  // Squeezy variants. Yearly is ~20% off twelve monthly payments.
  const starterMonthlyPrice = PRICES.starter.monthly;
  const starterYearlyPrice = PRICES.starter.yearly;
  const proMonthlyPrice = PRICES.pro.monthly;
  const proYearlyPrice = PRICES.pro.yearly;

  const starterPrice = isYearly ? starterYearlyPrice : starterMonthlyPrice;
  const starterUnit = isYearly ? '/yr' : '/mo';
  const starterSubtitle = isYearly
    ? `~${perMonth(starterYearlyPrice)}/mo, billed yearly · save ${yearlySavingPct(PRICES.starter)}%`
    : 'Billed monthly';
  const starterPriceId: PlanPriceId = isYearly ? 'starter_yearly' : 'starter_monthly';

  const proPrice = isYearly ? proYearlyPrice : proMonthlyPrice;
  const proUnit = isYearly ? '/yr' : '/mo';
  const proSubtitle = isYearly
    ? `~${perMonth(proYearlyPrice)}/mo, billed yearly · save ${yearlySavingPct(PRICES.pro)}%`
    : 'Billed monthly';
  const proPriceId: PlanPriceId = isYearly ? 'pro_yearly' : 'pro_monthly';

  const seatsRemaining =
    seatsTaken === null ? null : Math.max(0, LIFETIME_MAX_SEATS - seatsTaken);
  const lifetimeSoldOut = seatsRemaining !== null && seatsRemaining <= 0;
  const pilotMaxSeats = pilotCounter?.max_seats ?? 100;
  const pilotUsedSeats = pilotCounter?.used_seats ?? 0;
  const pilotRemainingSeats = pilotCounter?.remaining_seats ?? pilotMaxSeats;
  const pilotDurationDays = pilotCounter?.duration_days ?? 30;
  const pilotProgress = pilotMaxSeats > 0 ? Math.min(100, Math.round((pilotUsedSeats / pilotMaxSeats) * 100)) : 0;
  const checkoutEnabled = isLiveCheckoutEnabled();

  return (
    <div className="py-20">
      <Seo
        title="Pricing | InfradarAI Plans for Infrastructure Intelligence"
        description={`Infrastructure tenders, awards and project intelligence for less than a funding database. Free tier, Starter $${PRICES.starter.monthly}/mo, Pro $${PRICES.pro.monthly}/mo, cancel anytime.`}
        path="/pricing"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: 'InfradarAI Infrastructure Intelligence Platform',
          description: 'AI-assisted, human-verified global infrastructure intelligence. Track high-value projects across 14 global regions with confidence-scored signals.',
          brand: { '@type': 'Organization', name: 'InfradarAI' },
          offers: [
            { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD', description: '5 AI queries/day (earn +3/day per referral), 3 insight reads, public project data' },
            { '@type': 'Offer', name: 'Starter', price: String(PRICES.starter.monthly), priceCurrency: 'USD', priceSpecification: { '@type': 'UnitPriceSpecification', billingDuration: 'P1M' }, description: '20 AI queries/day, alert rules, CSV/Excel exports, portfolio chat' },
            { '@type': 'Offer', name: 'Pro', price: String(PRICES.pro.monthly), priceCurrency: 'USD', priceSpecification: { '@type': 'UnitPriceSpecification', billingDuration: 'P1M' }, description: '100 AI queries/day, award winners and prices, risk signals, news monitoring, AI report PDFs' },
            { '@type': 'Offer', name: 'Founders Lifetime', price: String(PRICES.lifetime), priceCurrency: 'USD', description: 'One-time payment for permanent Pro access, limited to 100 seats' },
          ],
        }}
      />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center mb-10">


          <h1 className="font-serif text-4xl font-bold mb-4">
            More infrastructure intelligence. A fraction of the price.
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-4">
            Tenders, contract awards, project pipelines and news from development banks and governments, in one feed you can search
            in plain English. Pro is <span className="text-foreground font-medium">${PRICES.pro.monthly}/month</span>: less than
            a development-funding database seat, and a fraction of a project-database licence. Cancel anytime.
          </p>
        </div>

        <div className="mb-10 overflow-hidden rounded-xl border border-primary/40 bg-primary/10 shadow-[0_0_40px_hsl(var(--primary)/0.12)]">
          <div className="grid gap-0 md:grid-cols-[1.25fr_0.75fr]">
            <div className="p-5 sm:p-6">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-background/40 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
                <Gift className="h-3.5 w-3.5" />
                Pilot access now open
              </div>
              <h2 className="font-serif text-2xl font-bold text-foreground sm:text-3xl">
                First {pilotMaxSeats} signups get {pilotDurationDays} days of Pro access.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Pilot users get {pilotDurationDays} days of full access with no credit card while seats are available. Card details are only requested for paid upgrades, and paid subscription charges include a minimum 14-day refund window with no extra conditions.
              </p>
            </div>
            <div className="border-t border-primary/20 bg-background/35 p-5 sm:p-6 md:border-l md:border-t-0">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Seats remaining</div>
                  <div className="mt-1 text-4xl font-bold text-foreground">{pilotRemainingSeats}</div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <span className="font-semibold text-primary">{pilotUsedSeats}</span> used<br />of {pilotMaxSeats}
                </div>
              </div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-primary/15">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pilotProgress}%` }} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Granted automatically after signup. Admins can increase the seat cap or manually grant access later.
              </p>
            </div>
          </div>
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
                'px-4 sm:px-5 py-2 text-xs font-medium rounded-full transition-colors min-h-[2.25rem]',
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
                'px-4 sm:px-5 py-2 text-xs font-medium rounded-full transition-colors flex items-center gap-1.5 sm:gap-2 min-h-[2.25rem]',
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
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 mb-12">
          {/* Free */}
          <div className="glass-panel rounded-xl p-7 border-border flex flex-col">
            <h2 className="font-serif text-lg font-bold mb-1">Free</h2>
            <p className="text-3xl font-serif font-bold mb-1">$0</p>
            <p className="text-xs text-muted-foreground mb-5">No credit card required</p>
            <ul className="space-y-2 text-sm text-muted-foreground mb-6 flex-1">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 5 AI queries/day · +3/day per referral (up to +30)</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 3 full insight reads/day</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 1 export/day (CSV or Excel, up to 25 rows)</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Core project discovery</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Portfolio tracking</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Basic alerts</li>
            </ul>
            <Button
              className="w-full teal-glow"
              onClick={() => void beginTrial()}
              disabled={trialLoading}
            >
              {trialLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Start 3-day trial - no card
            </Button>
            <Button variant="ghost" asChild className="w-full mt-2 text-muted-foreground">
              <Link to="/login">Or sign up free</Link>
            </Button>
          </div>

          {/* Starter */}
          <div className="glass-panel rounded-xl p-7 border-border flex flex-col">
            <h2 className="font-serif text-lg font-bold mb-1 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Starter
            </h2>
            <p className="text-3xl font-serif font-bold mb-1">
              ${starterPrice}
              <span className="text-sm font-normal text-muted-foreground">{starterUnit}</span>
            </p>
            <p className="text-xs text-muted-foreground mb-5 min-h-[32px]">{starterSubtitle}. Minimum 14-day refund window.</p>
            <ul className="space-y-2 text-sm text-muted-foreground mb-6 flex-1">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> All tender, award and project feeds</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 20 AI queries/day</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 50 full insight reads/day</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> 20 exports/day - CSV &amp; Excel (.xlsx), up to 1,000 rows</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> AI digest email alerts</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Full alert rules</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Portfolio chat (AI Q&amp;A)</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> AI digest and market snapshot summaries</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Saved searches</li>
            </ul>
            {!paymentsLive ? (
              <Button className="w-full teal-glow" onClick={() => reserve('starter', 'Starter', cycle)}>
                Reserve founding price
              </Button>
            ) : user ? (
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
          <div className="glass-panel rounded-xl p-7 border-primary/40 teal-glow relative flex flex-col">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-wider bg-primary text-primary-foreground px-3 py-1 rounded-full whitespace-nowrap">
              Best value for bid teams
            </span>
            <h2 className="font-serif text-lg font-bold mb-1 flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Pro
            </h2>
            <p className="text-3xl font-serif font-bold mb-1">
              ${proPrice}
              <span className="text-sm font-normal text-muted-foreground">{proUnit}</span>
            </p>
            <p className="text-xs text-muted-foreground mb-5 min-h-[32px]">{proSubtitle}. Minimum 14-day refund window.</p>
            <ul className="space-y-2 text-sm text-muted-foreground mb-6 flex-1">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Everything in Starter</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Award winners &amp; contract prices (competitor intelligence)</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> News monitoring on tracked projects</li>
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
            {!paymentsLive ? (
              <Button className="w-full teal-glow" onClick={() => reserve('pro', 'Pro', cycle)}>
                Reserve founding price
              </Button>
            ) : user ? (
              <Button className="w-full teal-glow" onClick={() => void goCheckout(proPriceId)} disabled={loading}>
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

          {/* Enterprise */}
          <div className="glass-panel rounded-xl p-7 border-border flex flex-col">
            <h2 className="font-serif text-lg font-bold mb-1 flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" /> Enterprise
            </h2>
            <p className="text-3xl font-serif font-bold mb-1">Custom</p>
            <p className="text-xs text-muted-foreground mb-5 min-h-[32px]">Annual contracts, invoicing available</p>
            <ul className="space-y-2 text-sm text-muted-foreground mb-6 flex-1">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Team seats at volume pricing</li>
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
                  Get permanent Pro-tier access to INFRADARAI. Every future feature, every new agent,
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
                <p className="text-5xl font-serif font-bold mb-1">${PRICES.lifetime.toLocaleString('en-US')}</p>
                <p className="text-xs text-muted-foreground mb-1">One-time · USD</p>
                <p className="text-[11px] text-muted-foreground line-through mb-4">vs ${(PRICES.pro.monthly * 12).toLocaleString('en-US')}/yr on Pro monthly</p>
                {seatsRemaining !== null && (
                  <div className="inline-block mb-4 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/30">
                    <span className="text-xs font-semibold text-primary">
                      {lifetimeSoldOut
                        ? 'Sold out'
                        : `${seatsRemaining} of ${LIFETIME_MAX_SEATS} seats left`}
                    </span>
                  </div>
                )}
                {!paymentsLive ? (
                  <Button
                    size="lg"
                    className="w-full md:w-auto teal-glow"
                    disabled={lifetimeSoldOut}
                    onClick={() => reserve('lifetime', 'Lifetime Pro', 'lifetime')}
                  >
                    <Crown className="h-4 w-4 mr-2" />
                    {lifetimeSoldOut ? 'Sold out' : 'Reserve founder seat'}
                  </Button>
                ) : user ? (
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

        {/* What you get */}
        <div className="max-w-5xl mx-auto mb-12">
          <h3 className="font-serif text-2xl font-bold text-center mb-2">What ${PRICES.pro.monthly}/month gets you</h3>
          <p className="text-sm text-muted-foreground text-center max-w-2xl mx-auto mb-8">
            A tender list tells you what was published. INFRADARAI tells you what it is, who funds it, who usually wins, and what is
            happening to it, from one search box.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {VALUE_POINTS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="glass-panel rounded-xl p-5">
                <Icon className="h-5 w-5 text-primary mb-3" />
                <h4 className="font-semibold text-sm mb-1">{title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Competitor comparison */}
        <div className="glass-panel rounded-xl p-8 max-w-4xl mx-auto mb-8">
          <h3 className="font-serif text-lg font-semibold mb-1 flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> How the price compares
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            Typical list prices for the tools infrastructure teams use today. Funding databases cover every aid sector and charge per
            user; project databases sell static reports for thousands per topic. INFRADARAI focuses on infrastructure and keeps
            the whole picture live, from tender to award to news, for less than either.
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
            For business development teams, EPC contractors, project managers, infrastructure consultants, development finance analysts, project finance professionals, owners, developers, and procurement teams, INFRADARAI replaces expensive consultant engagements and stale research subscriptions with{' '}
            <span className="text-foreground">real-time AI research</span>,{' '}
            <span className="text-foreground">confidence-scored signals</span>, and{' '}
            <span className="text-foreground">self-serve workflows</span> for faster market research and pipeline decisions.
            Export your pipeline as CSV, Excel (.xlsx), project tearsheets, and intelligence reports with account-level audit traceability.
            Enterprise and API access available for teams embedding INFRADARAI into their own workflows.
          </p>
        </div>
      </div>
    </div>
  );
}
