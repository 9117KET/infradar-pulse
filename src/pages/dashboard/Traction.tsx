import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, Users, CreditCard, MessageSquare, Mail, Share2, ArrowUpRight, ArrowDownRight, Minus, MousePointerClick, LogOut, Gift } from 'lucide-react';

interface TractionStats {
  total_signups: number;
  signups_this_week: number;
  signups_last_week: number;
  paid_subscribers: number;
  active_trials: number;
  plan_breakdown: Array<{ plan: string; count: number }> | null;
  channel_breakdown: Array<{ source: string; count: number }> | null;
  demo_requests_week: number;
  demo_requests_total: number;
  newsletter_total: number;
  referral_signups: number;
  referral_conversions: number;
  weekly_signups: Array<{ week: string; count: number }> | null;
}

interface ProductAnalyticsSummary {
  total_events: number;
  active_users: number;
  anonymous_visitors: number;
  sessions: number;
  paywall_views: number;
  signouts_after_paywall: number;
  top_events: Array<{ event_name: string; count: number }>;
  top_paywall_features: Array<{ feature: string; count: number }>;
}

type FunnelStep = { step: string; count: number };
type PaywallDropoff = { feature: string; paywall_views: number; signouts_30m: number; conversion_intent_30m: number };
type PilotSummary = { enabled: boolean; max_seats: number; used_seats: number; remaining_seats: number; active_grants: number; expiring_soon: number; duration_days: number };

const PLAN_COLORS: Record<string, string> = {
  pro: 'hsl(var(--primary))',
  starter: 'hsl(210, 60%, 55%)',
  enterprise: 'hsl(280, 50%, 55%)',
  lifetime: 'hsl(40, 80%, 55%)',
  trialing: 'hsl(160, 50%, 45%)',
  free: 'hsl(0, 0%, 50%)',
};

const PLAN_MRR: Record<string, number> = {
  starter: 29,
  pro: 199,
  enterprise: 500, // conservative estimate
  lifetime: 0,
  trialing: 0,
  free: 0,
};

function delta(current: number, previous: number) {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  if (pct > 0) return (
    <span className="flex items-center gap-0.5 text-xs text-emerald-400">
      <ArrowUpRight className="h-3 w-3" />+{pct}% wow
    </span>
  );
  if (pct < 0) return (
    <span className="flex items-center gap-0.5 text-xs text-red-400">
      <ArrowDownRight className="h-3 w-3" />{pct}% wow
    </span>
  );
  return <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="h-3 w-3" />0% wow</span>;
}

function KpiCard({ title, value, sub, icon: Icon, delta: d }: {
  title: string; value: string | number; sub?: string; icon: React.ElementType; delta?: number | null;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-2 mt-1">
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          {d !== undefined && <DeltaBadge pct={d} />}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Traction() {
  const [stats, setStats] = useState<TractionStats | null>(null);
  const [productStats, setProductStats] = useState<ProductAnalyticsSummary | null>(null);
  const [signupFunnel, setSignupFunnel] = useState<FunnelStep[]>([]);
  const [paywallDropoff, setPaywallDropoff] = useState<PaywallDropoff[]>([]);
  const [pilotSummary, setPilotSummary] = useState<PilotSummary | null>(null);
  const [pilotEnabled, setPilotEnabled] = useState(true);
  const [pilotMaxSeats, setPilotMaxSeats] = useState(100);
  const [pilotDurationDays, setPilotDurationDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const rpc = supabase.rpc.bind(supabase) as unknown as (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;

    Promise.all([
      rpc('get_traction_stats'),
      rpc('get_product_analytics_summary', { p_days: 30 }),
      rpc('get_signup_funnel', { p_days: 30 }),
      rpc('get_paywall_dropoff', { p_days: 30 }),
      rpc('get_pilot_access_summary', { p_environment: 'live' }),
    ]).then(([traction, product, funnel, dropoff, pilot]) => {
      const err = traction.error ?? product.error ?? funnel.error ?? dropoff.error ?? pilot.error;
      if (err) { setError(err.message); }
      else {
        setStats(traction.data as TractionStats);
        setProductStats(product.data as ProductAnalyticsSummary);
        setSignupFunnel((funnel.data ?? []) as FunnelStep[]);
        setPaywallDropoff((dropoff.data ?? []) as PaywallDropoff[]);
        const pilotData = pilot.data as PilotSummary;
        setPilotSummary(pilotData);
        setPilotEnabled(!!pilotData?.enabled);
        setPilotMaxSeats(pilotData?.max_seats ?? 100);
        setPilotDurationDays(pilotData?.duration_days ?? 30);
      }
      setLoading(false);
    });
  }, []);

  const updatePilotConfig = async () => {
    const maxSeats = Math.max(1, Math.floor(Number(pilotMaxSeats) || 100));
    const durationDays = Math.max(1, Math.floor(Number(pilotDurationDays) || 30));
    const { error: updateError } = await (supabase as any)
      .from('pilot_access_config')
      .update({ enabled: pilotEnabled, max_seats: maxSeats, duration_days: durationDays })
      .eq('environment', 'live');

    if (updateError) {
      toast({ title: 'Could not update pilot settings', description: updateError.message, variant: 'destructive' });
      return;
    }

    const { data } = await (supabase.rpc as any)('get_pilot_access_summary', { p_environment: 'live' });
    if (data) setPilotSummary(data as PilotSummary);
    toast({ title: 'Pilot settings updated', description: `${maxSeats} seats · ${durationDays} days · ${pilotEnabled ? 'enabled' : 'disabled'}` });
  };

  const mrr = stats?.plan_breakdown
    ? stats.plan_breakdown.reduce((sum, p) => sum + (PLAN_MRR[p.plan] ?? 0) * p.count, 0)
    : 0;

  const conversionRate = stats && stats.total_signups > 0
    ? ((stats.paid_subscribers / stats.total_signups) * 100).toFixed(1)
    : '0.0';

  const signupDelta = stats ? delta(stats.signups_this_week, stats.signups_last_week) : null;

  const weeklyData = stats?.weekly_signups?.map(w => ({
    week: new Date(w.week).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
    count: w.count,
  })) ?? [];

  if (error) {
    return (
      <div className="p-8 text-sm text-red-400">
        Failed to load traction stats: {error}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          Traction
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Growth metrics, channel attribution, and conversion funnel.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {loading ? Array.from({ length: 4 }).map((_, i) => (
          <Card key={`product-${i}`}><CardContent className="pt-6"><Skeleton className="h-8 w-20 mb-2" /><Skeleton className="h-3 w-16" /></CardContent></Card>
        )) : <>
          <KpiCard title="Product Events" value={productStats?.total_events ?? 0} sub="last 30 days" icon={MousePointerClick} />
          <KpiCard title="Active Users" value={productStats?.active_users ?? 0} sub={`${productStats?.sessions ?? 0} sessions`} icon={Users} />
          <KpiCard title="Paywall Views" value={productStats?.paywall_views ?? 0} sub="upgrade friction" icon={CreditCard} />
          <KpiCard title="Signouts After Paywall" value={productStats?.signouts_after_paywall ?? 0} sub="within 30 minutes" icon={LogOut} />
        </>}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {loading ? Array.from({ length: 4 }).map((_, i) => (
          <Card key={`pilot-${i}`}><CardContent className="pt-6"><Skeleton className="h-8 w-20 mb-2" /><Skeleton className="h-3 w-16" /></CardContent></Card>
        )) : <>
          <KpiCard title="Pilot Seats Used" value={`${pilotSummary?.used_seats ?? 0}/${pilotSummary?.max_seats ?? 100}`} sub={pilotSummary?.enabled ? 'pilot enabled' : 'pilot disabled'} icon={Gift} />
          <KpiCard title="Pilot Remaining" value={pilotSummary?.remaining_seats ?? 0} sub={`${pilotSummary?.duration_days ?? 30}-day access`} icon={Users} />
          <KpiCard title="Active Pilot Grants" value={pilotSummary?.active_grants ?? 0} sub="full access users" icon={CreditCard} />
          <KpiCard title="Expiring Soon" value={pilotSummary?.expiring_soon ?? 0} sub="next 7 days" icon={LogOut} />
        </>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2"><Gift className="h-4 w-4 text-primary" /> Pilot Access Settings</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
          <label className="space-y-2 text-xs text-muted-foreground">
            <span>Enabled</span>
            <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3">
              <Switch checked={pilotEnabled} onCheckedChange={setPilotEnabled} />
              <span className="text-foreground">{pilotEnabled ? 'On' : 'Off'}</span>
            </div>
          </label>
          <label className="space-y-2 text-xs text-muted-foreground">
            <span>Seats</span>
            <Input type="number" min={1} value={pilotMaxSeats} onChange={(e) => setPilotMaxSeats(Number(e.target.value))} />
          </label>
          <label className="space-y-2 text-xs text-muted-foreground">
            <span>Days</span>
            <Input type="number" min={1} value={pilotDurationDays} onChange={(e) => setPilotDurationDays(Number(e.target.value))} />
          </label>
          <Button onClick={updatePilotConfig} disabled={loading}>Save</Button>
        </CardContent>
      </Card>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {loading ? Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}><CardContent className="pt-6"><Skeleton className="h-8 w-20 mb-2" /><Skeleton className="h-3 w-16" /></CardContent></Card>
        )) : <>
          <KpiCard title="Est. MRR" value={`$${mrr.toLocaleString()}`} sub="active subscriptions" icon={CreditCard} />
          <KpiCard title="Paid Subscribers" value={stats?.paid_subscribers ?? 0} sub={`${stats?.active_trials ?? 0} trials`} icon={CreditCard} />
          <KpiCard title="Total Signups" value={stats?.total_signups ?? 0} sub={`${stats?.signups_this_week ?? 0} this week`} icon={Users} delta={signupDelta} />
          <KpiCard title="Free → Paid" value={`${conversionRate}%`} sub="conversion rate" icon={TrendingUp} />
          <KpiCard title="Demo Requests" value={stats?.demo_requests_total ?? 0} sub={`${stats?.demo_requests_week ?? 0} this week`} icon={MessageSquare} />
          <KpiCard title="Newsletter" value={stats?.newsletter_total ?? 0} sub="subscribers" icon={Mail} />
          <KpiCard title="Referral Signups" value={stats?.referral_signups ?? 0} sub={`${stats?.referral_conversions ?? 0} converted`} icon={Share2} />
          <KpiCard title="Signups This Week" value={stats?.signups_this_week ?? 0} sub="vs last week" icon={Users} delta={signupDelta} />
        </>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Signup & Activation Funnel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? <Skeleton className="h-40 w-full" /> : signupFunnel.map((step, index) => {
              const first = signupFunnel[0]?.count || 1;
              const pct = Math.round((step.count / first) * 100);
              return (
                <div key={step.step} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="capitalize text-muted-foreground">{step.step.replace(/_/g, ' ')}</span>
                    <span>{step.count} · {index === 0 ? 100 : pct}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary" style={{ width: `${index === 0 ? 100 : pct}%` }} /></div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Paywall Drop-off by Feature</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? <Skeleton className="h-40 w-full" /> : paywallDropoff.length ? paywallDropoff.map(row => (
              <div key={row.feature} className="rounded-lg border border-border/60 p-3 text-xs">
                <div className="flex justify-between gap-3"><span className="font-medium truncate">{row.feature}</span><span>{row.paywall_views} views</span></div>
                <div className="mt-1 text-muted-foreground">{row.signouts_30m} signouts · {row.conversion_intent_30m} intent actions</div>
              </div>
            )) : <p className="text-sm text-muted-foreground">No paywall behavior recorded yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top Product Events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? <Skeleton className="h-40 w-full" /> : (productStats?.top_events ?? []).slice(0, 8).map(event => (
              <div key={event.event_name} className="flex items-center justify-between gap-3 text-xs">
                <span className="font-mono text-muted-foreground truncate">{event.event_name}</span>
                <Badge variant="outline">{event.count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>


      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Weekly signups trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Weekly Signups (12 weeks)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 w-full" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weeklyData} barSize={16}>
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={28} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Plan breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Active Plan Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 w-full" /> : (
              <div className="space-y-2">
                {(stats?.plan_breakdown ?? []).map(p => {
                  const total = stats?.plan_breakdown?.reduce((s, x) => s + x.count, 0) ?? 1;
                  const pct = Math.round((p.count / total) * 100);
                  return (
                    <div key={p.plan} className="flex items-center gap-3">
                      <Badge variant="outline" className="w-20 justify-center capitalize text-xs" style={{ borderColor: PLAN_COLORS[p.plan] ?? undefined }}>
                        {p.plan}
                      </Badge>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: PLAN_COLORS[p.plan] ?? 'hsl(var(--primary))' }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-16 text-right">{p.count} ({pct}%)</span>
                    </div>
                  );
                })}
                {!stats?.plan_breakdown?.length && (
                  <p className="text-sm text-muted-foreground">No subscription data yet.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Channel attribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Acquisition Channel Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-32 w-full" /> : (
            <div className="space-y-2">
              {(stats?.channel_breakdown ?? []).map(c => {
                const total = stats?.total_signups ?? 1;
                const pct = Math.round((c.count / total) * 100);
                return (
                  <div key={c.source} className="flex items-center gap-3">
                    <span className="text-xs font-mono w-28 truncate text-muted-foreground">{c.source}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-20 text-right">{c.count} signups ({pct}%)</span>
                  </div>
                );
              })}
              {!stats?.channel_breakdown?.length && (
                <p className="text-sm text-muted-foreground">No attribution data yet. UTM params will appear here as users sign up from tracked channels.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bullseye experiment reminder */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Bullseye Tracker</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Run 4-week experiments. A channel passes when:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>CAC &lt; $200 (Starter) or &lt; $800 (Pro)</li>
            <li>Payback period &lt; 6 months</li>
            <li>At least 5 paying conversions from the experiment</li>
          </ul>
          <p className="text-xs pt-1">See <code className="text-primary">docs/TRACTION_MARKETING.md</code> for full channel playbook, BD targets, and cold email templates.</p>
        </CardContent>
      </Card>
    </div>
  );
}
