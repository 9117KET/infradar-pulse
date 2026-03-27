import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { REGIONS } from '@/data/projects';
import { agentApi } from '@/lib/api/agents';
import { Bot, Search, RefreshCw, ShieldAlert, Loader2 } from 'lucide-react';

interface Settings {
  emailAlerts: boolean;
  weeklyDigest: boolean;
  criticalOnly: boolean;
  regions: string[];
}

const defaults: Settings = { emailAlerts: true, weeklyDigest: true, criticalOnly: false, regions: ['MENA', 'East Africa', 'West Africa'] };

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
        <p className="text-xs text-muted-foreground">Manually trigger AI research agents to discover new projects, check for updates, or recalculate risk scores.</p>
        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            disabled={!!runningAgent}
            onClick={() => runAgent('Research Agent', agentApi.runResearchAgent)}
          >
            {runningAgent === 'Research Agent' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Run Research Agent
            <span className="text-xs text-muted-foreground ml-auto">Discover new projects</span>
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            disabled={!!runningAgent}
            onClick={() => runAgent('Update Checker', agentApi.runUpdateChecker)}
          >
            {runningAgent === 'Update Checker' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Run Update Checker
            <span className="text-xs text-muted-foreground ml-auto">Check for changes</span>
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            disabled={!!runningAgent}
            onClick={() => runAgent('Risk Scorer', agentApi.runRiskScorer)}
          >
            {runningAgent === 'Risk Scorer' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
            Run Risk Scorer
            <span className="text-xs text-muted-foreground ml-auto">Recalculate risk</span>
          </Button>
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
