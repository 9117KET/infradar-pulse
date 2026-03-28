import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { REGIONS } from '@/data/projects';
import { agentApi } from '@/lib/api/agents';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Bot, Search, RefreshCw, ShieldAlert, Loader2, Users, DollarSign, Scale, MessageSquare, Package, TrendingUp, User, Bell, RotateCcw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Settings {
  emailAlerts: boolean;
  weeklyDigest: boolean;
  criticalOnly: boolean;
  regions: string[];
}

const defaults: Settings = { emailAlerts: true, weeklyDigest: true, criticalOnly: false, regions: ['MENA', 'East Africa', 'West Africa'] };

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

const ALL_SECTORS = ['Urban Development', 'Digital Infrastructure', 'Renewable Energy', 'Transport', 'Water', 'Energy'];
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
];

export default function SettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('infradar_settings');
    return saved ? JSON.parse(saved) : defaults;
  });
  const [runningAgent, setRunningAgent] = useState<string | null>(null);

  const save = () => {
    localStorage.setItem('infradar_settings', JSON.stringify(settings));
    toast({ title: 'Settings saved' });
  };

  const toggleRegion = (r: string) => {
    setSettings(s => ({ ...s, regions: s.regions.includes(r) ? s.regions.filter(x => x !== r) : [...s.regions, r] }));
  };

  const runAgent = async (name: string, fn: () => Promise<any>) => {
    setRunningAgent(name);
    try {
      const result = await fn();
      toast({ title: `${name} complete`, description: JSON.stringify(result) });
    } catch (e: any) {
      toast({ title: `${name} failed`, description: e.message, variant: 'destructive' });
    } finally {
      setRunningAgent(null);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-serif text-2xl font-bold">Settings</h1>

      <Tabs defaultValue="preferences">
        <TabsList>
          <TabsTrigger value="preferences"><User className="h-4 w-4 mr-1" />Preferences</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="h-4 w-4 mr-1" />Notifications</TabsTrigger>
          <TabsTrigger value="agents"><Bot className="h-4 w-4 mr-1" />Agents</TabsTrigger>
        </TabsList>

        <TabsContent value="preferences">
          <PreferencesTab />
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

          <div className="glass-panel rounded-xl p-6 space-y-4">
            <h3 className="font-serif text-lg font-semibold">Region preferences</h3>
            {REGIONS.map(r => (
              <label key={r} className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={settings.regions.includes(r)} onCheckedChange={() => toggleRegion(r)} />
                <span className="text-sm">{r}</span>
              </label>
            ))}
          </div>

          <Button onClick={save} className="teal-glow">Save settings</Button>
        </TabsContent>

        <TabsContent value="agents">
          <div className="glass-panel rounded-xl p-6 space-y-4">
            <h3 className="font-serif text-lg font-semibold flex items-center gap-2"><Bot className="h-5 w-5 text-primary" />Intelligence agents</h3>
            <p className="text-xs text-muted-foreground">Manually trigger AI research agents.</p>
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
        </TabsContent>
      </Tabs>
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
            {ALL_SECTORS.map(s => (
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
