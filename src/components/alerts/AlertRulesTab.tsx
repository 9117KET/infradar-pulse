import { useState } from 'react';
import { useAlertRules } from '@/hooks/use-alert-rules';
import { ALERT_CATEGORIES } from '@/data/alerts';
import { REGIONS, SECTORS } from '@/data/projects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Trash2, BellRing, BellOff } from 'lucide-react';
import { toast } from 'sonner';

const SEVERITY_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (vals: string[]) => void;
}) {
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
              selected.includes(o.value)
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:border-primary/50'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AlertRulesTab() {
  const { rules, isLoading, createRule, toggleRule, deleteRule } = useAlertRules();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [severities, setSeverities] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);

  const resetForm = () => {
    setName('');
    setSeverities([]);
    setCategories([]);
    setRegions([]);
    setSectors([]);
  };

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Rule name is required'); return; }
    try {
      await createRule.mutateAsync({
        name: name.trim(),
        filters: {
          ...(severities.length > 0 && { severity: severities }),
          ...(categories.length > 0 && { categories }),
          ...(regions.length > 0 && { regions }),
          ...(sectors.length > 0 && { sectors }),
        },
      });
      toast.success('Alert rule created');
      setOpen(false);
      resetForm();
    } catch {
      toast.error('Failed to create rule');
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await toggleRule.mutateAsync({ id, enabled: !enabled });
    } catch {
      toast.error('Failed to update rule');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRule.mutateAsync(id);
      toast.success('Rule deleted');
    } catch {
      toast.error('Failed to delete rule');
    }
  };

  const renderFilters = (filters: Record<string, string[]>) => {
    const chips: string[] = [];
    if (filters.severity?.length) chips.push(...filters.severity.map(s => `Severity: ${s}`));
    if (filters.categories?.length) chips.push(...filters.categories.map(c => `Cat: ${c.replace('_', ' ')}`));
    if (filters.regions?.length) chips.push(...filters.regions.map(r => `Region: ${r}`));
    if (filters.sectors?.length) chips.push(...filters.sectors.map(s => `Sector: ${s}`));
    return chips;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Notification Rules</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Rules filter which alerts appear in your personalized digests.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> New Rule
        </Button>
      </div>

      <Card className="glass-panel border-border">
        <CardContent className="pt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rules yet. Create a rule to filter your digest and alert feed.
            </p>
          ) : (
            <div className="space-y-3">
              {rules.map(rule => (
                <div key={rule.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{rule.name}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${rule.enabled ? 'text-emerald-400 border-emerald-400/30' : 'text-muted-foreground'}`}
                      >
                        {rule.enabled ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {renderFilters(rule.filters as Record<string, string[]>).length === 0 ? (
                        <span className="text-[10px] text-muted-foreground">All alerts</span>
                      ) : (
                        renderFilters(rule.filters as Record<string, string[]>).map((chip, i) => (
                          <Badge key={i} variant="outline" className="text-[9px]">{chip}</Badge>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => void handleToggle(rule.id, rule.enabled)}
                      className="h-7 w-7 flex items-center justify-center rounded hover:bg-white/[0.04] transition-colors"
                      title={rule.enabled ? 'Pause rule' : 'Enable rule'}
                    >
                      {rule.enabled
                        ? <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
                        : <BellRing className="h-3.5 w-3.5 text-emerald-400" />}
                    </button>
                    <button
                      onClick={() => void handleDelete(rule.id)}
                      className="h-7 w-7 flex items-center justify-center rounded hover:bg-destructive/10 transition-colors"
                      title="Delete rule"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Alert Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Rule Name</p>
              <Input
                placeholder="e.g. Critical Africa alerts"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <MultiSelect
              label="Severity (leave blank for all)"
              options={SEVERITY_OPTIONS}
              selected={severities}
              onChange={setSeverities}
            />
            <MultiSelect
              label="Categories (leave blank for all)"
              options={ALERT_CATEGORIES}
              selected={categories}
              onChange={setCategories}
            />
            <MultiSelect
              label="Regions (leave blank for all)"
              options={REGIONS.map(r => ({ value: r, label: r }))}
              selected={regions}
              onChange={setRegions}
            />
            <MultiSelect
              label="Sectors (leave blank for all)"
              options={SECTORS.map(s => ({ value: s, label: s }))}
              selected={sectors}
              onChange={setSectors}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={() => void handleCreate()} disabled={createRule.isPending}>
              {createRule.isPending ? 'Creating…' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
