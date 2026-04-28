import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { InfradarLogo } from '@/components/InfradarLogo';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { REGIONS, SECTORS, STAGES, type ProjectStage, type Region } from '@/data/projects';
import {
  ArrowRight, ArrowLeft, Briefcase, Globe, Rocket, LayoutDashboard,
  FolderSearch, Search, ShieldCheck, AlertTriangle, BarChart3, BookOpen, Activity, Sparkles, Star,
  Bell, MessageSquare, Award, CalendarDays, Columns, GitCompare, Users2, Flag
} from 'lucide-react';
import { trackEvent } from '@/lib/analytics';

const TOTAL_STEPS = 7;

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

const CORE_FEATURES = [
  { icon: LayoutDashboard, name: 'Overview Dashboard', desc: 'Real-time portfolio metrics, regional risk heatmaps, and KPI tracking across all your monitored projects.' },
  { icon: Sparkles, name: 'Ask AI', desc: 'Ask plain-language questions across the project database and get filtered intelligence with source-aware results.' },
  { icon: FolderSearch, name: 'Project Intelligence', desc: 'Detailed project profiles with verified data, stakeholders, funding sources, evidence, timelines, and watchlist tracking.' },
  { icon: MessageSquare, name: 'Portfolio Chat', desc: 'Chat directly with your tracked portfolio to identify risks, updates, actions, and priority opportunities.' },
  { icon: Bell, name: 'Alerts & Rules', desc: 'Monitor political, financial, regulatory, supply chain, security, and construction alerts with configurable notification rules.' },
];

const INTEL_FEATURES = [
  { icon: Globe, name: 'Geo Intelligence', desc: 'Interactive maps showing project clusters, infrastructure corridors, and regional investment patterns.' },
  { icon: Award, name: 'Tenders & Awards', desc: 'Track contract awards, open tenders, re-tenders, cancellations, disputes, and arbitration signals.' },
  { icon: CalendarDays, name: 'Tender Calendar', desc: 'View upcoming tender and award activity in a time-based workflow.' },
  { icon: Columns, name: 'Pipeline View', desc: 'See projects grouped by selected stages from planning through completion, including cancelled and stopped projects.' },
  { icon: GitCompare, name: 'Compare Projects', desc: 'Compare opportunities side by side across value, geography, sector, stage, confidence, and risk.' },
  { icon: Users2, name: 'Stakeholder Intel', desc: 'Map owners, contractors, financiers, consultants, and other key counterparties across projects.' },
  { icon: Flag, name: 'Country Intelligence', desc: 'Review country-level pipeline, sectors, values, risks, and alert exposure.' },
  { icon: ShieldCheck, name: 'Evidence & Verification', desc: 'Multi-source evidence layers: satellite imagery, filings, news, and registry data for each project.' },
  { icon: AlertTriangle, name: 'Risk & Anomaly Signals', desc: 'AI-powered risk scoring with political, financial, regulatory, and environmental signal detection.' },
  { icon: BarChart3, name: 'Analytics & Reports', desc: 'Custom dashboards with sector breakdowns, investment flows, and exportable PDF reports.' },
  { icon: BookOpen, name: 'Insights & Briefings', desc: 'AI-generated intelligence briefings on market trends, regulatory changes, and emerging opportunities.' },
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

function FeatureCard({ icon: Icon, name, desc }: { icon: LucideIcon; name: string; desc: string }) {
  return (
    <div className="flex gap-3 p-4 rounded-xl border border-border bg-card/50 hover:bg-card/80 transition-colors">
      <div className="shrink-0 h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h4 className="text-sm font-semibold">{name}</h4>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

export default function Onboarding() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [regions, setRegions] = useState<string[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [suggestedProjects, setSuggestedProjects] = useState<{ id: string; name: string; country: string; sector: string; stage: string; value_usd: number | null }[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Reload suggested projects when the portfolio step is opened or preferences change.
  useEffect(() => {
    void trackEvent(step === 0 ? 'onboarding_started' : 'onboarding_step_completed', { step }, 'activation');
  }, [step]);

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
    query.then(({ data }) => {
      if (cancelled) return;
      setSuggestedProjects(data ?? []);
      setLoadingProjects(false);
    });
    return () => { cancelled = true; };
  }, [step, regions, sectors, stages]);

  const toggleProject = (id: string) => {
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
    // Seed portfolio with selected projects
    if (selectedProjectIds.size > 0) {
      const rows = Array.from(selectedProjectIds).map(project_id => ({
        user_id: user.id,
        project_id,
        notes: '',
      }));
      await supabase.from('tracked_projects').upsert(rows, { onConflict: 'user_id,project_id' });
      void trackEvent('first_project_tracked', { count: selectedProjectIds.size }, 'activation');
    }
    void trackEvent('onboarding_completed', { role, regions_count: regions.length, sectors_count: sectors.length, stages_count: stages.length }, 'activation');
    await refreshProfile();
    navigate('/dashboard', { replace: true });
  };

  const roleTips = ROLE_TIPS[role] || { tip: 'Welcome to InfradarAI.', startWith: 'Start with the Overview Dashboard to explore your data.' };

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
            <Button onClick={() => setStep(1)} disabled={!displayName.trim()} className="w-full">
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
              <Button variant="outline" onClick={() => setStep(0)} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={() => setStep(2)} disabled={!role} className="flex-1">
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
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={() => setStep(3)} disabled={regions.length === 0 && sectors.length === 0} className="flex-1">
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
              Select projects to add to your portfolio. You can add more anytime from the Projects page.
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
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={() => setStep(4)} className="flex-1">
                {selectedProjectIds.size === 0 ? 'Skip' : 'Continue'} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Platform tour, core features */}
        {step === 4 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-lg font-serif font-semibold">
              <Sparkles className="h-5 w-5 text-primary" /> Core Features
            </div>
            <p className="text-sm text-muted-foreground">Here's what powers your intelligence workflow:</p>
            <div className="space-y-3">
              {CORE_FEATURES.map(f => <FeatureCard key={f.name} {...f} />)}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(3)} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={() => setStep(5)} className="flex-1">
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 5: Platform tour, intelligence and analysis */}
        {step === 5 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-lg font-serif font-semibold">
              <Activity className="h-5 w-5 text-primary" /> Intelligence & Analysis
            </div>
            <p className="text-sm text-muted-foreground">Deep analytical tools for informed decisions:</p>
            <div className="space-y-3">
              {INTEL_FEATURES.map(f => <FeatureCard key={f.name} {...f} />)}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(4)} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={() => setStep(6)} className="flex-1">
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 6: Getting started, role-specific tips and summary */}
        {step === 6 && (
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
              <Button variant="outline" onClick={() => setStep(5)} className="flex-1">
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
