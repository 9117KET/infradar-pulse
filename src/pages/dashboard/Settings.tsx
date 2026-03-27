import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { REGIONS } from '@/data/projects';

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

  const save = () => {
    localStorage.setItem('infradar_settings', JSON.stringify(settings));
    toast({ title: 'Settings saved' });
  };

  const toggleRegion = (r: string) => {
    setSettings(s => ({ ...s, regions: s.regions.includes(r) ? s.regions.filter(x => x !== r) : [...s.regions, r] }));
  };

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="font-serif text-2xl font-bold">Settings</h1>

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
