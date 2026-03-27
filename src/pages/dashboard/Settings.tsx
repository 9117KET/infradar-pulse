import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { REGIONS } from '@/data/projects';
import { agentApi } from '@/lib/api/agents';
import { Bot, Search, RefreshCw, ShieldAlert, Loader2, Users, DollarSign, Scale, MessageSquare, Package, TrendingUp } from 'lucide-react';

interface Settings {
  emailAlerts: boolean;
  weeklyDigest: boolean;
  criticalOnly: boolean;
  regions: string[];
}

const defaults: Settings = { emailAlerts: true, weeklyDigest: true, criticalOnly: false, regions: ['MENA', 'East Africa', 'West Africa'] };

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
    <div className="space-y-6 max-w-xl">
      <h1 className="font-serif text-2xl font-bold">Settings</h1>

      {/* Intelligence Agents */}
      <div className="glass-panel rounded-xl p-6 space-y-4">
        <h3 className="font-serif text-lg font-semibold flex items-center gap-2"><Bot className="h-5 w-5 text-primary" />Intelligence agents</h3>
        <p className="text-xs text-muted-foreground">Manually trigger AI research agents. All agents also run automatically on schedule.</p>
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
    </div>
  );
}
