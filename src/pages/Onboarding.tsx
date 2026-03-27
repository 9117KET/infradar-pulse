import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { InfradarLogo } from '@/components/InfradarLogo';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ArrowRight, ArrowLeft, Briefcase, Globe, Rocket } from 'lucide-react';

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

const REGIONS = ['MENA', 'East Africa', 'West Africa'];
const SECTORS = ['Urban Development', 'Digital Infrastructure', 'Renewable Energy', 'Transport', 'Water', 'Energy'];
const STAGES = ['Planned', 'Tender', 'Awarded', 'Financing', 'Construction', 'Completed'];

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
    await refreshProfile();
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center space-y-2">
          <InfradarLogo size={40} className="mx-auto" />
          <h1 className="font-serif text-2xl font-bold">Welcome to InfraRadar AI</h1>
          <p className="text-sm text-muted-foreground">Let's personalize your experience</p>
        </div>

        {/* Progress */}
        <div className="flex gap-2">
          {[0, 1, 2].map(i => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-lg font-serif font-semibold">
              <Briefcase className="h-5 w-5 text-primary" /> Your role
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
            <Button onClick={() => setStep(1)} disabled={!role} className="w-full">
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
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
              <Button variant="outline" onClick={() => setStep(0)} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={() => setStep(2)} disabled={regions.length === 0 && sectors.length === 0} className="flex-1">
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-lg font-serif font-semibold">
              <Rocket className="h-5 w-5 text-primary" /> You're all set
            </div>
            <div className="glass-panel rounded-xl p-5 space-y-3">
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
            <p className="text-xs text-muted-foreground text-center">Your dashboard will be personalized based on these preferences. You can change them anytime in Settings.</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={finish} disabled={saving} className="flex-1">
                {saving ? 'Saving…' : 'Go to dashboard'} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
