import { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { InfradarLogo } from '@/components/InfradarLogo';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { REGIONS, SECTORS, STAGES, type ProjectStage, type Region } from '@/data/projects';
import {
  ArrowRight, ArrowLeft, Briefcase, Globe, Rocket, Star,
} from 'lucide-react';
import { trackEvent } from '@/lib/analytics';
import { TOTAL_ONBOARDING_STEPS as TOTAL_STEPS, resolveResumeStep, computePreselectedIds } from '@/lib/onboarding';

const ROLES = [
  { value: 'investor', label: 'Investor / CFO', desc: 'Portfolio tracking, risk assessment' },
  { value: 'strategy', label: 'Strategy Leader', desc: 'Market intelligence, competitive analysis' },
  { value: 'project_manager', label: 'Project Manager', desc: 'Pipeline tracking, milestone monitoring' },
  { value: 'business_dev', label: 'Business Development', desc: 'Opportunity identification, bid intelligence' },
  { value: 'dfi_analyst', label: 'DFI Analyst', desc: 'Portfolio oversight, verification tracking' },
  { value: 'contractor', label: 'EPC Contractor', desc: 'Tender tracking, competitor monitoring' },
  { value: 'insurance_risk', label: 'Insurance / Risk', desc: 'Construction risk, political risk pricing' },
  { value: 'government', label: 'Government / SWF', desc: 'Cross-sector coordination, economic planning' },
  { value: 'legal_advisory', label: 'Legal / Advisory', desc: 'Due diligence, regulatory tracking' },
  { value: 'supply_chain', label: 'Supply Chain / Logistics', desc: 'Material demand, transport timing' },
];

const ROLE_TIPS: Record<string, { tip: string; startWith: string }> = {
  investor: { tip: 'As an Investor, your priority is risk-adjusted returns.', startWith: 'Start with Risk Signals to assess your portfolio exposure.' },
  strategy: { tip: 'As a Strategy Leader, market positioning is key.', startWith: 'Start with Research Hub to scan competitive landscapes.' },
  project_manager: { tip: 'As a Project Manager, timeline visibility matters most.', startWith: 'Start with Projects to track milestones and stage transitions.' },
  business_dev: { tip: 'As Business Development, opportunities are everything.', startWith: 'Start with Research Hub to find new tenders and partnerships.' },
  dfi_analyst: { tip: 'As a DFI Analyst, verification drives your work.', startWith: 'Start with Evidence & Verification for portfolio oversight.' },
  contractor: { tip: 'As an EPC Contractor, tender intelligence is critical.', startWith: 'Start with Projects filtered to Tender stage.' },
  insurance_risk: { tip: 'As Insurance/Risk, construction and political risk pricing is key.', startWith: 'Start with Risk Signals for real-time risk monitoring.' },
  government: { tip: 'As Government/SWF, cross-sector coordination matters.', startWith: 'Start with Overview Dashboard for the big picture.' },
  legal_advisory: { tip: 'As Legal/Advisory, due diligence requires verified data.', startWith: 'Start with Evidence & Verification and Project contacts.' },
  supply_chain: { tip: 'As Supply Chain/Logistics, timing and demand signals are crucial.', startWith: 'Start with Monitoring for real-time project updates.' },
};

export default function Onboarding() {
  const { user, profile, profileLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [portfolioSaving, setPortfolioSaving] = useState(false);

  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [regions, setRegions] = useState<string[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [suggestedProjects, setSuggestedProjects] = useState<{ id: string; name: string; country: string; sector: string; stage: string; value_usd: number | null }[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [loadingProjects, setLoadingProjects] = useState(false);
  const selectionTouched = useRef(false);
  const preselectedCount = useRef(0);
  const hydrated = useRef(false);

  // Resume: seed local state from the saved profile once it's available.
  useEffect(() => {
    if (hydrated.current || !profile || profile.onboarded) return;
    hydrated.current = true;
    setDisplayName(profile.display_name ?? '');
    setCompany(profile.company ?? '');
    setRole(profile.role ?? '');
    setRegions(profile.regions ?? []);
    setSectors(profile.sectors ?? []);
    setStages(profile.stages ?? []);
    const resume = resolveResumeStep(profile);
    setStep(resume);
    void trackEvent(resume > 0 ? 'onboarding_resumed' : 'onboarding_started', { step: resume }, 'activation');
  }, [profile]);

  // Save-as-you-go: advance the wizard and persist answers so refresh/re-login resumes here.
  // Fire-and-forget - a failed write only degrades resume, never blocks the wizard.
  const persistStep = (nextStep: number, fields: TablesUpdate<'profiles'> = {}) => {
    if (nextStep > step) void trackEvent('onboarding_step_completed', { step }, 'activation');
    setStep(nextStep);
    if (!user) return;
    // .then() is required to actually execute the lazy supabase builder.
    void supabase.from('profiles')
      .update({ ...fields, onboarding_step: nextStep, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .then(({ error }) => {
        if (error) console.warn('onboarding: failed to persist step', error.message);
      });
  };

  // Reload suggested projects when the portfolio step is opened or preferences change.
  useEffect(() => {
    if (step !== 3) return;
    let cancelled = false;
    setLoadingProjects(true);
    let query = supabase
      .from('projects')
      .select('id, name, country, sector, stage, value_usd')
      .eq('approved', true)
      .order('confidence', { ascending: false })
      .limit(24);
    if (regions.length > 0) query = query.in('region', regions as Region[]);
    if (sectors.length > 0) query = query.in('sector', sectors as never[]);
    if (stages.length > 0) query = query.in('stage', stages as ProjectStage[]);
    const trackedQuery = user
      ? supabase.from('tracked_projects').select('project_id').eq('user_id', user.id)
      : Promise.resolve({ data: [] as { project_id: string }[] });
    Promise.all([query, trackedQuery]).then(([{ data }, trackedRes]) => {
      if (cancelled) return;
      const suggestions = data ?? [];
      setSuggestedProjects(suggestions);
      const trackedIds = (trackedRes.data ?? []).map(t => t.project_id);
      setSelectedProjectIds(prev => {
        const next = computePreselectedIds(suggestions, trackedIds, selectionTouched.current, prev);
        if (!selectionTouched.current) preselectedCount.current = next.size;
        return next;
      });
      setLoadingProjects(false);
    });
    return () => { cancelled = true; };
  }, [step, regions, sectors, stages, user]);

  const toggleProject = (id: string) => {
    selectionTouched.current = true;
    setSelectedProjectIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggle = (arr: string[], val: string, setter: (v: string[]) => void) => {
    setter(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };

  // Persist the portfolio selection when leaving step 3, so resuming at the summary is accurate.
  // Only touches suggested ids - projects tracked elsewhere are never removed here.
  const continueFromPortfolio = async () => {
    if (!user) { persistStep(4); return; }
    setPortfolioSaving(true);
    const suggestedIds = suggestedProjects.map(p => p.id);
    const selected = suggestedIds.filter(id => selectedProjectIds.has(id));
    const deselected = suggestedIds.filter(id => !selectedProjectIds.has(id));
    if (selected.length > 0) {
      await supabase.from('tracked_projects').upsert(
        selected.map(project_id => ({ user_id: user.id, project_id, notes: '' })),
        { onConflict: 'user_id,project_id' },
      );
      void trackEvent('first_project_tracked', { count: selected.length, preselected_count: preselectedCount.current }, 'activation');
    }
    if (deselected.length > 0) {
      await supabase.from('tracked_projects').delete().eq('user_id', user.id).in('project_id', deselected);
    }
    setPortfolioSaving(false);
    persistStep(4);
  };

  const finish = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      display_name: displayName,
      company,
      role,
      regions,
      sectors,
      stages,
      onboarded: true,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      toast({ title: 'Error saving profile', description: error.message, variant: 'destructive' });
      setSaving(false);
      return;
    }
    void trackEvent('onboarding_completed', { role, regions_count: regions.length, sectors_count: sectors.length, stages_count: stages.length }, 'activation');
    await refreshProfile();
    navigate('/dashboard', { replace: true });
  };

  const roleTips = ROLE_TIPS[role] || { tip: 'Welcome to InfradarAI.', startWith: 'Start with the Overview Dashboard to explore your data.' };

  if (profile?.onboarded) return <Navigate to="/dashboard" replace />;

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-lg space-y-4">
          <Skeleton className="h-10 w-10 rounded-full mx-auto" />
          <Skeleton className="h-6 w-48 mx-auto" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <InfradarLogo size={40} className="mx-auto" />
          <h1 className="font-serif text-2xl font-bold">Welcome to InfradarAI</h1>
          <p className="text-sm text-muted-foreground">Let's personalize your experience</p>
        </div>

        {/* Progress */}
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground text-center">Step {step + 1} of {TOTAL_STEPS}</p>

        {/* Step 0: Name & Company */}
        {step === 0 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-lg font-serif font-semibold">
              <Briefcase className="h-5 w-5 text-primary" /> About you
            </div>
            <div className="space-y-3">
              <div>
                <Label>Display name</Label>
                <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" className="mt-1" />
              </div>
              <div>
                <Label>Company</Label>
                <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Your organization" className="mt-1" />
              </div>
            </div>
            <Button onClick={() => persistStep(1, { display_name: displayName, company })} disabled={!displayName.trim()} className="w-full">
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Step 1: Role Selection */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-lg font-serif font-semibold">
              <Briefcase className="h-5 w-5 text-primary" /> Your role
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map(r => (
                <button
                  key={r.value}
                  onClick={() => setRole(r.value)}
                  className={`text-left p-3 rounded-lg border transition-colors ${role === r.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
                >
                  <div className="text-sm font-medium">{r.label}</div>
                  <div className="text-[10px] text-muted-foreground">{r.desc}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => persistStep(0)} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={() => persistStep(2, { role })} disabled={!role} className="flex-1">
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Focus Areas */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-lg font-serif font-semibold">
              <Globe className="h-5 w-5 text-primary" /> Your focus areas
            </div>
            <div>
              <Label className="mb-2 block">Regions of interest</Label>
              <div className="flex flex-wrap gap-2">
                {REGIONS.map(r => (
                  <label key={r} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={regions.includes(r)} onCheckedChange={() => toggle(regions, r, setRegions)} />
                    <span className="text-sm">{r}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Sectors of interest</Label>
              <div className="flex flex-wrap gap-2">
                {SECTORS.map(s => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={sectors.includes(s)} onCheckedChange={() => toggle(sectors, s, setSectors)} />
                    <span className="text-sm">{s}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Project stages</Label>
              <div className="flex flex-wrap gap-2">
                {STAGES.map(s => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={stages.includes(s)} onCheckedChange={() => toggle(stages, s, setStages)} />
                    <span className="text-sm">{s}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => persistStep(1)} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={() => persistStep(3, { regions, sectors, stages })} disabled={regions.length === 0 && sectors.length === 0} className="flex-1">
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Project selection — seed portfolio */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-lg font-serif font-semibold">
              <Star className="h-5 w-5 text-primary" /> Start your portfolio
            </div>
            <p className="text-sm text-muted-foreground">
              We've pre-selected top matches for your focus areas — tap any to remove. You can add more anytime from the Projects page.
            </p>
            {loadingProjects ? (
              <div className="grid grid-cols-1 gap-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
              </div>
            ) : suggestedProjects.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No projects found for your selected focus areas yet — you can track projects from the dashboard.
              </div>
            ) : (
              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {suggestedProjects.map(p => {
                  const selected = selectedProjectIds.has(p.id);
                  const valueLabel = p.value_usd
                    ? p.value_usd >= 1e9 ? `$${(p.value_usd / 1e9).toFixed(1)}B`
                    : p.value_usd >= 1e6 ? `$${(p.value_usd / 1e6).toFixed(0)}M`
                    : `$${p.value_usd.toLocaleString()}`
                    : null;
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleProject(p.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-all flex items-start gap-3 ${
                        selected
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/40 hover:bg-white/[0.02]'
                      }`}
                    >
                      <Star className={`h-4 w-4 mt-0.5 shrink-0 transition-colors ${selected ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="text-[10px] text-muted-foreground">{p.country}</span>
                          <Badge variant="outline" className="text-[9px] py-0">{p.stage}</Badge>
                          <Badge variant="secondary" className="text-[9px] py-0">{p.sector}</Badge>
                          {valueLabel && <span className="text-[10px] text-muted-foreground">{valueLabel}</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedProjectIds.size > 0 && (
              <p className="text-xs text-primary text-center">{selectedProjectIds.size} project{selectedProjectIds.size !== 1 ? 's' : ''} selected</p>
            )}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => persistStep(2)} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={continueFromPortfolio} disabled={portfolioSaving} className="flex-1">
                {portfolioSaving ? 'Saving…' : selectedProjectIds.size === 0 ? 'Skip' : 'Continue'} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Getting started, role-specific tips and summary */}
        {step === 4 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-lg font-serif font-semibold">
              <Rocket className="h-5 w-5 text-primary" /> You're all set!
            </div>

            {/* Role-specific tip */}
            <div className="p-4 rounded-xl border border-primary/20 bg-primary/5">
              <p className="text-sm font-medium">{roleTips.tip}</p>
              <p className="text-xs text-muted-foreground mt-1">{roleTips.startWith}</p>
            </div>

            {/* Summary */}
            <div className="glass-panel rounded-xl p-5 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{displayName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Role</span>
                <span className="font-medium">{ROLES.find(r => r.value === role)?.label}</span>
              </div>
              {company && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Company</span>
                  <span className="font-medium">{company}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Regions</span>
                <span className="font-medium">{regions.length > 0 ? regions.join(', ') : 'All'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sectors</span>
                <span className="font-medium">{sectors.length > 0 ? sectors.join(', ') : 'All'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Stages</span>
                <span className="font-medium">{stages.length > 0 ? stages.join(', ') : 'All'}</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">You can change these preferences anytime in Settings.</p>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => persistStep(3)} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={finish} disabled={saving} className="flex-1">
                {saving ? 'Saving…' : 'Go to Dashboard'} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
