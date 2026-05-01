import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Building2, Plus, Mail, CalendarDays, ChevronRight, DollarSign, Handshake } from 'lucide-react';

const db = supabase as any;

const STATUSES = [
  { key: 'prospect', label: 'Prospect', color: 'bg-muted text-muted-foreground' },
  { key: 'intro',    label: 'Intro',    color: 'bg-blue-500/20 text-blue-400' },
  { key: 'demo',     label: 'Demo',     color: 'bg-yellow-500/20 text-yellow-400' },
  { key: 'pilot',    label: 'Pilot',    color: 'bg-orange-500/20 text-orange-400' },
  { key: 'closed',   label: 'Closed',   color: 'bg-emerald-500/20 text-emerald-400' },
  { key: 'lost',     label: 'Lost',     color: 'bg-red-500/20 text-red-400' },
];

const TIERS = [
  { value: 'consulting_firm',  label: 'Consulting firm' },
  { value: 'investment_bank',  label: 'Investment bank' },
  { value: 'dfi',              label: 'DFI' },
  { value: 'trade_assoc',      label: 'Trade association' },
  { value: 'epc_contractor',   label: 'EPC contractor' },
  { value: 'other',            label: 'Other' },
];

interface BDPartner {
  id: string;
  org_name: string;
  contact_name: string | null;
  contact_email: string | null;
  tier: string;
  deal_status: string;
  deal_value_usd: number | null;
  notes: string | null;
  next_action: string | null;
  next_action_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PartnerForm {
  org_name: string;
  contact_name: string;
  contact_email: string;
  tier: string;
  deal_status: string;
  deal_value_usd: string;
  notes: string;
  next_action: string;
  next_action_at: string;
}

const emptyForm: PartnerForm = {
  org_name: '', contact_name: '', contact_email: '',
  tier: 'consulting_firm', deal_status: 'prospect',
  deal_value_usd: '', notes: '', next_action: '', next_action_at: '',
};

function statusBadge(status: string) {
  const s = STATUSES.find(x => x.key === status) ?? STATUSES[0];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>{s.label}</span>;
}

function tierLabel(tier: string) {
  return TIERS.find(t => t.value === tier)?.label ?? tier;
}

export default function BDPipeline() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BDPartner | null>(null);
  const [form, setForm] = useState<PartnerForm>(emptyForm);

  const { data: partners = [], isLoading } = useQuery<BDPartner[]>({
    queryKey: ['bd-partners'],
    queryFn: async () => {
      const { data, error } = await db
        .from('bd_partners')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as unknown as BDPartner[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: PartnerForm) => {
      const payload = {
        org_name: values.org_name.trim(),
        contact_name: values.contact_name.trim() || null,
        contact_email: values.contact_email.trim() || null,
        tier: values.tier,
        deal_status: values.deal_status,
        deal_value_usd: values.deal_value_usd ? Number(values.deal_value_usd) : null,
        notes: values.notes.trim() || null,
        next_action: values.next_action.trim() || null,
        next_action_at: values.next_action_at || null,
      };
      if (editing) {
        const { error } = await db.from('bd_partners').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await db.from('bd_partners').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bd-partners'] });
      toast({ title: editing ? 'Partner updated' : 'Partner added' });
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const advanceStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await db.from('bd_partners').update({ deal_status: status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bd-partners'] }),
  });

  const openEdit = (p: BDPartner) => {
    setEditing(p);
    setForm({
      org_name: p.org_name,
      contact_name: p.contact_name ?? '',
      contact_email: p.contact_email ?? '',
      tier: p.tier,
      deal_status: p.deal_status,
      deal_value_usd: p.deal_value_usd?.toString() ?? '',
      notes: p.notes ?? '',
      next_action: p.next_action ?? '',
      next_action_at: p.next_action_at ?? '',
    });
    setOpen(true);
  };

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };

  // Summary stats
  const totalPipeline = partners.filter(p => p.deal_value_usd && p.deal_status !== 'lost')
    .reduce((s, p) => s + (p.deal_value_usd ?? 0), 0);
  const closed = partners.filter(p => p.deal_status === 'closed').length;
  const activeDeals = partners.filter(p => !['prospect', 'lost'].includes(p.deal_status)).length;
  const nextActions = partners.filter(p => p.next_action_at && new Date(p.next_action_at) <= new Date(Date.now() + 7 * 86400000));

  const nextStatusKey = (current: string) => {
    const idx = STATUSES.findIndex(s => s.key === current);
    if (idx < 0 || idx >= STATUSES.length - 2) return null; // no advance past 'closed'
    return STATUSES[idx + 1].key;
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
            <Handshake className="h-6 w-6 text-primary" />
            BD Pipeline
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Partner and deal tracking for business development.</p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-1" />Add partner
        </Button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Pipeline value', value: `$${(totalPipeline / 1000).toFixed(0)}k`, icon: DollarSign },
          { label: 'Active deals', value: activeDeals, icon: Building2 },
          { label: 'Closed', value: closed, icon: Handshake },
          { label: 'Actions due 7d', value: nextActions.length, icon: CalendarDays },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{value}</div></CardContent>
          </Card>
        ))}
      </div>

      {/* Pipeline table */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : partners.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-3">
            <Building2 className="h-8 w-8 opacity-40" />
            <p className="text-sm">No partners yet. Add your first BD target.</p>
            <Button variant="outline" size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add partner</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {partners.map(p => {
            const next = nextStatusKey(p.deal_status);
            const nextLabel = next ? STATUSES.find(s => s.key === next)?.label : null;
            const overdue = p.next_action_at && new Date(p.next_action_at) < new Date();
            return (
              <div key={p.id} className="glass-panel rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{p.org_name}</span>
                    {statusBadge(p.deal_status)}
                    <span className="text-xs text-muted-foreground">{tierLabel(p.tier)}</span>
                    {p.deal_value_usd && (
                      <span className="text-xs text-muted-foreground">${(p.deal_value_usd / 1000).toFixed(0)}k</span>
                    )}
                  </div>
                  {(p.contact_name || p.contact_email) && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {p.contact_name && <span>{p.contact_name}</span>}
                      {p.contact_email && (
                        <a href={`mailto:${p.contact_email}`} className="flex items-center gap-1 hover:text-primary">
                          <Mail className="h-3 w-3" />{p.contact_email}
                        </a>
                      )}
                    </div>
                  )}
                  {p.next_action && (
                    <div className={`flex items-center gap-1 text-xs mt-1 ${overdue ? 'text-red-400' : 'text-muted-foreground'}`}>
                      <CalendarDays className="h-3 w-3" />
                      {p.next_action_at ? new Date(p.next_action_at).toLocaleDateString() : ''} — {p.next_action}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {next && nextLabel && (
                    <Button
                      size="sm" variant="outline"
                      className="text-xs h-7"
                      disabled={advanceStatus.isPending}
                      onClick={() => advanceStatus.mutate({ id: p.id, status: next })}
                    >
                      → {nextLabel} <ChevronRight className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => openEdit(p)}>Edit</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditing(null); setForm(emptyForm); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit partner' : 'Add BD partner'}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={e => { e.preventDefault(); upsert.mutate(form); }}
          >
            <div>
              <Label>Organization name *</Label>
              <Input value={form.org_name} onChange={e => setForm(f => ({ ...f, org_name: e.target.value }))} required placeholder="KPMG Infrastructure Advisory" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Contact name</Label>
                <Input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Jane Smith" />
              </div>
              <div>
                <Label>Contact email</Label>
                <Input value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} type="email" placeholder="jane@kpmg.com" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Tier</Label>
                <Select value={form.tier} onValueChange={v => setForm(f => ({ ...f, tier: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIERS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.deal_status} onValueChange={v => setForm(f => ({ ...f, deal_status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Est. deal value (USD)</Label>
              <Input value={form.deal_value_usd} onChange={e => setForm(f => ({ ...f, deal_value_usd: e.target.value }))} type="number" placeholder="50000" />
            </div>
            <div>
              <Label>Next action</Label>
              <Input value={form.next_action} onChange={e => setForm(f => ({ ...f, next_action: e.target.value }))} placeholder="Send sample report" />
            </div>
            <div>
              <Label>Due date</Label>
              <Input value={form.next_action_at} onChange={e => setForm(f => ({ ...f, next_action_at: e.target.value }))} type="date" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Met at Infrastructure Investor Summit..." />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={upsert.isPending}>{upsert.isPending ? 'Saving...' : editing ? 'Save changes' : 'Add partner'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
