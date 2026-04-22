import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { REGIONS, SECTORS } from '@/data/projects';
import { agentApi } from '@/lib/api/agents';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Bot, Search, RefreshCw, ShieldAlert, Loader2, Users, DollarSign, Scale, MessageSquare, Package, TrendingUp, User, Bell, RotateCcw, CreditCard, ExternalLink, GitMerge, Building2, Leaf, Shield, Gavel, ScrollText, Bookmark, Trash2, Mail, Download, AlertTriangle, ArrowUpRight, ArrowDownRight, XCircle } from 'lucide-react';
import { useSavedSearches } from '@/hooks/use-saved-searches';
import { Switch as UISwitch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEntitlements } from '@/hooks/useEntitlements';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';
import { isEntitlementOrQuotaError, isStaffOnlyError } from '@/lib/billing/functionsErrors';
import { openCustomerPortal, changePlan, cancelSubscription, exportAccountData, deleteAccount } from '@/lib/billing/paddleClient';
import { usePaddleCheckout, type PlanPriceId } from '@/hooks/usePaddleCheckout';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useCheckoutCompletion } from '@/hooks/useCheckoutCompletion';
import { Progress } from '@/components/ui/progress';

interface NotifSettings {
  emailAlerts: boolean;
  weeklyDigest: boolean;
  criticalOnly: boolean;
}

const defaults: NotifSettings = { emailAlerts: true, weeklyDigest: true, criticalOnly: false };

const ROLE_OPTIONS = [
  { value: 'investor', label: 'Investor / CFO' },
  { value: 'strategy', label: 'Strategy Leader' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'business_dev', label: 'Business Development' },
  { value: 'dfi_analyst', label: 'DFI Analyst' },
  { value: 'contractor', label: 'EPC Contractor' },
  { value: 'insurance_risk', label: 'Insurance / Risk' },
  { value: 'government', label: 'Government / SWF' },
  { value: 'legal_advisory', label: 'Legal / Advisory' },
  { value: 'supply_chain', label: 'Supply Chain / Logistics' },
];

const ALL_STAGES = ['Planned', 'Tender', 'Awarded', 'Financing', 'Construction', 'Completed'];

const agents = [
  { name: 'Research Agent', fn: agentApi.runResearchAgent, icon: Search, desc: 'Discover new projects' },
  { name: 'Update Checker', fn: agentApi.runUpdateChecker, icon: RefreshCw, desc: 'Check for changes' },
  { name: 'Risk Scorer', fn: agentApi.runRiskScorer, icon: ShieldAlert, desc: 'Recalculate risk' },
  { name: 'Stakeholder Intel', fn: agentApi.runStakeholderIntel, icon: Users, desc: 'Track stakeholders' },
  { name: 'Funding Tracker', fn: agentApi.runFundingTracker, icon: DollarSign, desc: 'Monitor funding flows' },
  { name: 'Regulatory Monitor', fn: agentApi.runRegulatoryMonitor, icon: Scale, desc: 'Compliance & permits' },
  { name: 'Sentiment Analyzer', fn: agentApi.runSentimentAnalyzer, icon: MessageSquare, desc: 'Media sentiment' },
  { name: 'Supply Chain', fn: agentApi.runSupplyChainMonitor, icon: Package, desc: 'Commodity & logistics' },
  { name: 'Market Intel', fn: agentApi.runMarketIntel, icon: TrendingUp, desc: 'Competitive intelligence' },
  { name: 'Entity Dedup', fn: agentApi.runEntityDedup, icon: GitMerge, desc: 'Flag duplicate project records' },
  { name: 'Corporate / M&A', fn: agentApi.runCorporateMaMonitor, icon: Building2, desc: 'Ownership & counterparty moves' },
  { name: 'ESG & Social', fn: agentApi.runEsgSocialMonitor, icon: Leaf, desc: 'Permits, litigation, social license' },
  { name: 'Security & Resilience', fn: agentApi.runSecurityResilience, icon: Shield, desc: 'Cyber & outage signals' },
  { name: 'Tender / Award', fn: agentApi.runTenderAwardMonitor, icon: Gavel, desc: 'Awards, disputes, re-tenders' },
  { name: 'Executive Briefing', fn: agentApi.runExecutiveBriefing, icon: ScrollText, desc: 'Synthesize alerts into a brief' },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const { profile, refreshProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'preferences';
  const setTab = (v: string) => {
    setSearchParams(v === 'preferences' ? {} : { tab: v });
  };

  useEffect(() => {
    if (searchParams.get('checkout') !== 'success') return;
    toast({ title: 'Subscription updated', description: 'Welcome! Your plan will sync in a few seconds.' });
    const next = new URLSearchParams(searchParams);
    next.delete('checkout');
    if (!next.get('tab')) next.set('tab', 'billing');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, toast]);

  const [settings, setSettings] = useState<NotifSettings>(defaults);
  const [saving, setSaving] = useState(false);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const { canUseAi, staffBypass } = useEntitlements();

  // Sync notification prefs from profile once it loads
  useEffect(() => {
    if (!profile) return;
    setSettings({
      emailAlerts: profile.email_alerts ?? defaults.emailAlerts,
      weeklyDigest: profile.weekly_digest ?? defaults.weeklyDigest,
      criticalOnly: profile.critical_only ?? defaults.criticalOnly,
    });
  }, [profile?.id]);

  const save = useCallback(async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      email_alerts: settings.emailAlerts,
      weekly_digest: settings.weeklyDigest,
      critical_only: settings.criticalOnly,
      updated_at: new Date().toISOString(),
    }).eq('id', profile.id);
    if (error) {
      toast({ title: 'Error saving', description: error.message, variant: 'destructive' });
    } else {
      await refreshProfile();
      toast({ title: 'Settings saved' });
    }
    setSaving(false);
  }, [profile, settings, toast, refreshProfile]);

  const runAgent = async (name: string, fn: () => Promise<unknown>) => {
    if (!staffBypass) {
      toast({
        title: 'Team access required',
        description: 'Batch intelligence agents are limited to admin and researcher accounts.',
        variant: 'destructive',
      });
      return;
    }
    if (!canUseAi) {
      setUpgradeOpen(true);
      return;
    }
    setRunningAgent(name);
    try {
      const result = await fn();
      toast({ title: `${name} complete`, description: JSON.stringify(result) });
    } catch (e: unknown) {
      if (isStaffOnlyError(e)) {
        toast({
          title: 'Team access required',
          description: 'Batch agents are restricted to admin or researcher accounts.',
          variant: 'destructive',
        });
        return;
      }
      if (isEntitlementOrQuotaError(e)) {
        setUpgradeOpen(true);
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: `${name} failed`, description: msg, variant: 'destructive' });
    } finally {
      setRunningAgent(null);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-serif text-2xl font-bold">Settings</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="preferences"><User className="h-4 w-4 mr-1" />Preferences</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="h-4 w-4 mr-1" />Notifications</TabsTrigger>
          <TabsTrigger value="saved-searches"><Bookmark className="h-4 w-4 mr-1" />Saved Searches</TabsTrigger>
          <TabsTrigger value="billing"><CreditCard className="h-4 w-4 mr-1" />Billing</TabsTrigger>
          <TabsTrigger value="account"><Shield className="h-4 w-4 mr-1" />Account</TabsTrigger>
          {staffBypass && <TabsTrigger value="agents"><Bot className="h-4 w-4 mr-1" />Agents</TabsTrigger>}
        </TabsList>

        <TabsContent value="preferences">
          <PreferencesTab />
        </TabsContent>

        <TabsContent value="saved-searches">
          <SavedSearchesTab />
        </TabsContent>

        <TabsContent value="billing">
          <BillingTab />
        </TabsContent>

        <TabsContent value="account">
          <AccountTab />
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <div className="glass-panel rounded-xl p-6 space-y-5">
            <h3 className="font-serif text-lg font-semibold">Notifications</h3>
            <div className="flex items-center justify-between">
              <span className="text-sm">Email alerts</span>
              <Switch checked={settings.emailAlerts} onCheckedChange={v => setSettings(s => ({ ...s, emailAlerts: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Weekly digest</span>
              <Switch checked={settings.weeklyDigest} onCheckedChange={v => setSettings(s => ({ ...s, weeklyDigest: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Critical alerts only</span>
              <Switch checked={settings.criticalOnly} onCheckedChange={v => setSettings(s => ({ ...s, criticalOnly: v }))} />
            </div>
          </div>

          <Button onClick={save} disabled={saving} className="teal-glow">{saving ? 'Saving…' : 'Save settings'}</Button>
        </TabsContent>

        {staffBypass && <TabsContent value="agents">
          <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} reason="ai" />
          <div className="glass-panel rounded-xl p-6 space-y-4">
            <h3 className="font-serif text-lg font-semibold flex items-center gap-2"><Bot className="h-5 w-5 text-primary" />Intelligence agents</h3>
            <p className="text-xs text-muted-foreground">
              Manually trigger batch intelligence agents (admin/researcher). Runs count against your daily AI allowance where applicable; start a trial or subscribe if you need more.
            </p>
            <div className="space-y-3">
              {agents.map(agent => {
                const Icon = agent.icon;
                return (
                  <Button
                    key={agent.name}
                    variant="outline"
                    className="w-full justify-start gap-2"
                    disabled={!!runningAgent}
                    onClick={() => runAgent(agent.name, agent.fn)}
                  >
                    {runningAgent === agent.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                    Run {agent.name}
                    <span className="text-xs text-muted-foreground ml-auto">{agent.desc}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        </TabsContent>}
      </Tabs>
    </div>
  );
}

function SavedSearchesTab() {
  const { savedSearches, isLoading, deleteSearch, updateNotify } = useSavedSearches();
  const { toast } = useToast();

  const handleDelete = async (id: string) => {
    try {
      await deleteSearch.mutateAsync(id);
      toast({ title: 'Search deleted' });
    } catch {
      toast({ title: 'Failed to delete', variant: 'destructive' });
    }
  };

  const handleToggleNotify = async (id: string, current: boolean) => {
    try {
      await updateNotify.mutateAsync({ id, notifyEmail: !current });
    } catch {
      toast({ title: 'Failed to update', variant: 'destructive' });
    }
  };

  const formatFilters = (filters: Record<string, unknown>) => {
    const parts: string[] = [];
    if (filters.search) parts.push(`"${filters.search}"`);
    if (filters.stage && filters.stage !== 'all') parts.push(`Stage: ${filters.stage}`);
    if (filters.sector && filters.sector !== 'all') parts.push(`Sector: ${filters.sector}`);
    if (filters.confFilter && filters.confFilter !== 'all') parts.push(`Confidence: ${filters.confFilter}`);
    return parts.length ? parts.join(' · ') : 'All projects';
  };

  if (isLoading) {
    return <div className="space-y-2 mt-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted/20 animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-4 mt-4">
      <div>
        <h2 className="text-sm font-semibold">Saved Searches</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Searches saved from the Projects page. Toggle email alerts to be notified of new matches.</p>
      </div>
      {savedSearches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
          <Bookmark className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No saved searches yet</p>
          <p className="text-xs text-muted-foreground mt-1">Use the "Save search" button on the Projects page to save filters here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {savedSearches.map(s => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-muted/10">
              <Bookmark className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground truncate">{formatFilters(s.filters)}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5" title="Email notifications">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  <UISwitch
                    checked={s.notify_email}
                    onCheckedChange={() => void handleToggleNotify(s.id, s.notify_email)}
                    className="scale-75"
                  />
                </div>
                <button onClick={() => void handleDelete(s.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function BillingTab() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { loading, plan, limits, usage, hasPaddleCustomer, staffBypass, subInfo, refresh } = useEntitlements();
  const { openCheckout, loading: checkoutLoading } = usePaddleCheckout();
  const [busy, setBusy] = useState<'starter' | 'pro' | 'portal' | 'change' | 'cancel' | null>(null);

  // After Paddle checkout completes, poll the subscriptions table until the
  // webhook lands (~2-30s). Without this, users see "Free plan" right after
  // paying which is jarring.
  const completion = useCheckoutCompletion(user?.id, async () => {
    await refresh();
    toast({ title: 'Subscription active', description: 'Your new plan is ready to use.' });
  });

  // If we already arrived via ?checkout=success, kick the poller off immediately.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success' && user?.id) {
      completion.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const upgrade = async (priceId: PlanPriceId, key: 'starter' | 'pro') => {
    setBusy(key);
    try {
      await openCheckout(priceId);
      // Paddle's overlay closes on success — we begin polling at that point.
      // (If the user just abandons the overlay, we'll still poll for 30s,
      // which is harmless.)
      completion.start();
    } catch (e) {
      toast({ title: 'Checkout failed', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const portal = async () => {
    setBusy('portal');
    try {
      await openCustomerPortal();
    } catch (e) {
      toast({ title: 'Portal failed', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const switchPlan = async (priceId: PlanPriceId) => {
    setBusy('change');
    try {
      await changePlan(priceId);
      toast({ title: 'Plan updated', description: 'Charges and access adjust immediately. New plan will sync in a few seconds.' });
    } catch (e) {
      toast({ title: 'Plan change failed', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy('cancel');
    try {
      await cancelSubscription();
      toast({ title: 'Cancellation scheduled', description: 'You keep access until the end of your current billing period.' });
    } catch (e) {
      toast({ title: 'Cancel failed', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const trialDays = daysUntil(subInfo?.trial_end ?? null);
  const periodDays = daysUntil(subInfo?.current_period_end ?? null);
  const isTrialing = subInfo?.status === 'trialing' && trialDays !== null && trialDays > 0;
  const isPastDue = subInfo?.status === 'past_due';
  const willCancel = !!subInfo?.cancel_at_period_end && subInfo?.status !== 'canceled';
  const hasActiveSub = subInfo && ['active', 'trialing', 'past_due'].includes(subInfo.status ?? '');

  return (
    <div className="space-y-4 max-w-lg">
      <div className="glass-panel rounded-xl p-6 space-y-5">
        <h3 className="font-serif text-lg font-semibold flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          Billing &amp; usage
        </h3>

        {staffBypass ? (
          <p className="text-sm text-muted-foreground">Team access — billing limits do not apply to your account.</p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Loading plan…</p>
        ) : (
          <div className="text-sm space-y-2 text-muted-foreground">
            <p>
              <span className="text-foreground font-medium capitalize">{plan}</span> plan — daily caps:{' '}
              {limits.aiPerDay} AI runs, {limits.exportsPerDay} exports (per type), {limits.insightReadsPerDay} full insight reads.
            </p>
            <p>
              Used today: {usage.ai_generation ?? 0} / {limits.aiPerDay} AI · {usage.export_csv ?? 0} / {limits.exportsPerDay} CSV ·{' '}
              {usage.export_pdf ?? 0} / {limits.exportsPerDay} PDF · {usage.insight_read ?? 0} / {limits.insightReadsPerDay} reads
            </p>
          </div>
        )}

        {/* Status banners */}
        {isTrialing && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
            <strong>Trial ends in {trialDays} day{trialDays === 1 ? '' : 's'}</strong> ({formatDate(subInfo!.trial_end)}). Your card will be charged on that date unless you cancel.
          </div>
        )}
        {isPastDue && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <span>Your last payment failed. Update your payment method in the billing portal to keep access.</span>
          </div>
        )}
        {willCancel && (
          <div className="rounded-lg border border-amber-400/40 bg-amber-100/10 px-3 py-2 text-xs text-foreground">
            Subscription will cancel on {formatDate(subInfo!.current_period_end)} ({periodDays} day{periodDays === 1 ? '' : 's'}). Resubscribe anytime before then to keep your plan.
          </div>
        )}

        {/* Checkout completion poller — visible only while we wait for the webhook to land */}
        {completion.status === 'polling' && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-3 text-xs text-foreground space-y-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="font-medium">Activating your subscription…</span>
            </div>
            <Progress value={Math.min(100, (completion.elapsedSec / 30) * 100)} className="h-1.5" />
            <p className="text-muted-foreground">
              Confirming with our payment provider. This usually takes 5–15 seconds.
            </p>
          </div>
        )}
        {completion.status === 'timeout' && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground space-y-2">
            <p>
              Still processing. Your payment was likely successful — refresh in a minute, or contact support if your plan doesn't update.
            </p>
            <Button size="sm" variant="outline" onClick={() => { completion.reset(); void refresh(); }}>
              Refresh now
            </Button>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="glass-panel rounded-xl p-6 space-y-3">
        {!hasActiveSub && !staffBypass && (
          <>
            <p className="text-xs text-muted-foreground">Both paid plans include a 3-day free trial. Card collected at checkout, charged on day 3 unless you cancel.</p>
            <div className="flex flex-wrap gap-2">
              <Button className="teal-glow" disabled={!!busy || checkoutLoading} onClick={() => void upgrade('starter_monthly', 'starter')}>
                {busy === 'starter' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Start Starter trial — $29/mo
              </Button>
              <Button variant="outline" disabled={!!busy || checkoutLoading} onClick={() => void upgrade('pro_monthly', 'pro')}>
                {busy === 'pro' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Start Pro trial — $199/mo
              </Button>
            </div>
          </>
        )}

        {hasActiveSub && !staffBypass && (
          <>
            <p className="text-xs text-muted-foreground">Switch plans (charges adjust immediately, prorated) or cancel.</p>
            <div className="flex flex-wrap gap-2">
              {plan !== 'pro' && (
                <Button className="teal-glow" disabled={!!busy} onClick={() => void switchPlan('pro_monthly')}>
                  {busy === 'change' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowUpRight className="h-4 w-4 mr-2" />}
                  Upgrade to Pro
                </Button>
              )}
              {plan !== 'starter' && plan !== 'free' && (
                <Button variant="outline" disabled={!!busy} onClick={() => void switchPlan('starter_monthly')}>
                  {busy === 'change' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowDownRight className="h-4 w-4 mr-2" />}
                  Downgrade to Starter
                </Button>
              )}
              {!willCancel && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" disabled={!!busy}>
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancel subscription
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
                      <AlertDialogDescription>
                        You'll keep full access until {formatDate(subInfo?.current_period_end ?? null)}, then drop to the Free tier. You can resubscribe anytime.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep subscription</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void cancel()}>Yes, cancel</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </>
        )}

        {hasPaddleCustomer && (
          <div className="pt-2 border-t border-border/40">
            <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void portal()}>
              {busy === 'portal' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
              Update payment method / view invoices
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              Refresh
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a href="/dashboard/billing/audit">
                <ScrollText className="h-4 w-4 mr-2" />
                View billing audit log
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function AccountTab() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const onExport = async () => {
    setExporting(true);
    try {
      await exportAccountData();
      toast({ title: 'Export started', description: 'Your account data is downloading as JSON.' });
    } catch (e) {
      toast({ title: 'Export failed', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const onDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
    } catch (e) {
      toast({ title: 'Delete failed', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-lg">
      <div className="glass-panel rounded-xl p-6 space-y-4">
        <h3 className="font-serif text-lg font-semibold flex items-center gap-2">
          <Download className="h-5 w-5 text-primary" />
          Export your data
        </h3>
        <p className="text-sm text-muted-foreground">
          Download a JSON file with your profile, watchlists, saved searches, alerts, and subscription history.
        </p>
        <Button variant="outline" disabled={exporting} onClick={() => void onExport()}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
          Export account data
        </Button>
      </div>

      <div className="glass-panel rounded-xl p-6 space-y-4 border border-destructive/30">
        <h3 className="font-serif text-lg font-semibold flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          Delete account
        </h3>
        <p className="text-sm text-muted-foreground">
          Permanently deletes your profile, watchlist, saved searches, alerts, and cancels any active subscription. This cannot be undone.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete my account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Permanently delete your account?</AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <span>This will cancel any active subscription, delete all your data ({user?.email ?? 'your account'}), and sign you out. <strong>This cannot be undone.</strong></span>
                <span className="block">Type <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">delete</code> below to confirm:</span>
                <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="delete" autoFocus />
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmText('')}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={confirmText.trim().toLowerCase() !== 'delete'}
                onClick={() => void onDelete()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete forever
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function PreferencesTab() {
  const { profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [company, setCompany] = useState(profile?.company || '');
  const [role, setRole] = useState(profile?.role || '');
  const [regions, setRegions] = useState<string[]>(profile?.regions || []);
  const [sectors, setSectors] = useState<string[]>(profile?.sectors || []);
  const [stages, setStages] = useState<string[]>(profile?.stages || []);

  const toggle = (arr: string[], val: string, setter: (v: string[]) => void) => {
    setter(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };

  const savePrefs = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      display_name: displayName, company, role, regions, sectors, stages, updated_at: new Date().toISOString(),
    }).eq('id', profile.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      await refreshProfile();
      toast({ title: 'Preferences saved' });
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-xl p-6 space-y-4">
        <h3 className="font-serif text-lg font-semibold">Profile</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Display name</Label><Input value={displayName} onChange={e => setDisplayName(e.target.value)} className="mt-1" /></div>
          <div><Label>Company</Label><Input value={company} onChange={e => setCompany(e.target.value)} className="mt-1" /></div>
        </div>
        <div>
          <Label>Role</Label>
          <select value={role} onChange={e => setRole(e.target.value)} className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Select role…</option>
            {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </div>

      <div className="glass-panel rounded-xl p-6 space-y-4">
        <h3 className="font-serif text-lg font-semibold">Focus areas</h3>
        <div>
          <Label className="mb-2 block">Regions</Label>
          <div className="flex flex-wrap gap-3">
            {REGIONS.map(r => (
              <label key={r} className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={regions.includes(r)} onCheckedChange={() => toggle(regions, r, setRegions)} />
                <span className="text-sm">{r}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label className="mb-2 block">Sectors</Label>
          <div className="flex flex-wrap gap-3">
            {SECTORS.map(s => (
              <label key={s} className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={sectors.includes(s)} onCheckedChange={() => toggle(sectors, s, setSectors)} />
                <span className="text-sm">{s}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label className="mb-2 block">Stages</Label>
          <div className="flex flex-wrap gap-3">
            {ALL_STAGES.map(s => (
              <label key={s} className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={stages.includes(s)} onCheckedChange={() => toggle(stages, s, setStages)} />
                <span className="text-sm">{s}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={savePrefs} disabled={saving} className="teal-glow">{saving ? 'Saving…' : 'Save preferences'}</Button>
        <RestartTourButton />
      </div>
    </div>
  );
}

function RestartTourButton() {
  const { toast } = useToast();
  const { user, refreshProfile } = useAuth();

  const restart = async () => {
    if (!user) return;
    await supabase.from('profiles').update({ tour_completed: false }).eq('id', user.id);
    await refreshProfile();
    toast({ title: 'Tour restarted', description: 'Refresh the page to begin the guided tour.' });
  };

  return (
    <Button variant="outline" onClick={restart} className="gap-2">
      <RotateCcw className="h-4 w-4" /> Restart Tour
    </Button>
  );
}
