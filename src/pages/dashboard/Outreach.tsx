import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { agentApi } from '@/lib/api/agents';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Send, Plus, Check, X, Copy, Sparkles, Mail, Linkedin, Users, ExternalLink } from 'lucide-react';

const db = supabase as any;

const PERSONAS = [
  { value: 'dfi_analyst', label: 'DFI / MDB analyst (LOI)' },
  { value: 'infra_pe', label: 'Infrastructure PE' },
  { value: 'epc_bd', label: 'EPC contractor BD' },
  { value: 'consultant', label: 'Strategy / infra consultant' },
  { value: 'project_finance', label: 'Project finance bank' },
  { value: 'political_risk', label: 'Political risk / insurance' },
  { value: 'government_ppp', label: 'Government / PPP unit' },
  { value: 'think_tank', label: 'Think tank / NGO' },
];

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  approved: 'bg-blue-500/20 text-blue-400',
  scheduled: 'bg-blue-500/20 text-blue-400',
  sent: 'bg-emerald-500/20 text-emerald-400',
  skipped: 'bg-muted text-muted-foreground',
  failed: 'bg-red-500/20 text-red-400',
  new: 'bg-muted text-muted-foreground',
  sequencing: 'bg-yellow-500/20 text-yellow-400',
  replied: 'bg-emerald-500/20 text-emerald-400',
  pilot: 'bg-orange-500/20 text-orange-400',
  paid: 'bg-emerald-500/20 text-emerald-400',
  unsubscribed: 'bg-red-500/20 text-red-400',
  bounced: 'bg-red-500/20 text-red-400',
};

function personaLabel(p: string) {
  return PERSONAS.find((x) => x.value === p)?.label ?? p;
}

function badge(status: string) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? STATUS_COLORS.draft}`}>
      {status}
    </span>
  );
}

interface AgentResult {
  drafted?: number;
  skipped?: number;
  sent?: number;
  suppressed?: number;
}

interface Prospect {
  id: string;
  name: string;
  org: string | null;
  role: string | null;
  email: string | null;
  linkedin_url: string | null;
  persona: string;
  wave: number;
  region: string | null;
  sector: string | null;
  status: string;
  next_step: number;
}

interface OutreachMessage {
  id: string;
  prospect_id: string;
  channel: string;
  step: number;
  status: string;
  subject: string | null;
  body: string;
  created_at: string;
  prospect: Prospect | null;
}

const emptyProspect = {
  name: '', org: '', role: '', email: '', linkedin_url: '',
  persona: 'infra_pe', wave: '1', region: '', sector: '',
};

export default function Outreach() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<OutreachMessage | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyProspect);

  const { data: messages = [], isLoading: msgLoading } = useQuery<OutreachMessage[]>({
    queryKey: ['outreach-messages'],
    queryFn: async () => {
      const { data, error } = await db
        .from('outreach_messages')
        .select('id, prospect_id, channel, step, status, subject, body, created_at, prospect:outreach_prospects(id, name, org, role, email, linkedin_url, persona, region, sector, status, next_step)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as OutreachMessage[];
    },
  });

  const { data: prospects = [], isLoading: prospectLoading } = useQuery<Prospect[]>({
    queryKey: ['outreach-prospects'],
    queryFn: async () => {
      const { data, error } = await db
        .from('outreach_prospects')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as Prospect[];
    },
  });

  const runAgent = useMutation({
    mutationFn: async (which: 'draft' | 'send' | 'signal') => {
      if (which === 'draft') return agentApi.runOutreachDraft();
      if (which === 'send') return agentApi.runOutreachSend();
      return agentApi.runWeeklySignal();
    },
    onSuccess: (data: AgentResult, which) => {
      qc.invalidateQueries({ queryKey: ['outreach-messages'] });
      qc.invalidateQueries({ queryKey: ['outreach-prospects'] });
      const summary =
        which === 'draft' ? `Drafted ${data?.drafted ?? 0}, skipped ${data?.skipped ?? 0}`
        : which === 'send' ? `Sent ${data?.sent ?? 0}, suppressed ${data?.suppressed ?? 0}`
        : `Sent ${data?.sent ?? 0} to subscribers`;
      toast({ title: 'Agent run complete', description: summary });
    },
    onError: (e: Error) => toast({ title: 'Agent failed', description: e.message, variant: 'destructive' }),
  });

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await db
        .from('outreach_messages')
        .update({ subject: editSubject.trim() || null, body: editBody })
        .eq('id', editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outreach-messages'] });
      toast({ title: 'Draft updated' });
      setEditing(null);
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const approve = useMutation({
    mutationFn: async (m: OutreachMessage) => {
      const { error } = await db
        .from('outreach_messages')
        .update({ status: 'approved', approved_by: user?.id ?? null, scheduled_for: new Date().toISOString() })
        .eq('id', m.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outreach-messages'] });
      toast({ title: 'Approved — queued for the next send run' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const skip = useMutation({
    mutationFn: async (m: OutreachMessage) => {
      const { error } = await db.from('outreach_messages').update({ status: 'skipped' }).eq('id', m.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outreach-messages'] });
      toast({ title: 'Skipped' });
    },
  });

  // LinkedIn touches are sent manually; this records that + advances the prospect.
  const markLinkedinSent = useMutation({
    mutationFn: async (m: OutreachMessage) => {
      const { error } = await db
        .from('outreach_messages')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', m.id);
      if (error) throw error;
      if (m.prospect) {
        await db
          .from('outreach_prospects')
          .update({ next_step: m.step + 1, last_contacted_at: new Date().toISOString(), status: 'sequencing' })
          .eq('id', m.prospect.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outreach-messages'] });
      qc.invalidateQueries({ queryKey: ['outreach-prospects'] });
      toast({ title: 'Marked sent — prospect advanced to next touch' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const addProspect = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        org: form.org.trim() || null,
        role: form.role.trim() || null,
        email: form.email.trim() || null,
        linkedin_url: form.linkedin_url.trim() || null,
        persona: form.persona,
        wave: Number(form.wave) || 1,
        region: form.region.trim() || null,
        sector: form.sector.trim() || null,
      };
      const { error } = await db.from('outreach_prospects').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outreach-prospects'] });
      toast({ title: 'Prospect added' });
      setAddOpen(false);
      setForm(emptyProspect);
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast({ title: 'Copied to clipboard' }),
      () => toast({ title: 'Copy failed', variant: 'destructive' }),
    );
  };

  const openEdit = (m: OutreachMessage) => {
    setEditing(m);
    setEditSubject(m.subject ?? '');
    setEditBody(m.body);
  };

  const emailDrafts = messages.filter((m) => m.channel === 'email' && m.status === 'draft');
  const linkedinDrafts = messages.filter((m) => m.channel === 'linkedin' && m.status === 'draft');
  const sentCount = messages.filter((m) => m.status === 'sent').length;
  const queuedCount = messages.filter((m) => m.status === 'approved' || m.status === 'scheduled').length;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
            <Send className="h-6 w-6 text-primary" />
            Outreach
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI drafts each touch from live project data; you approve before anything sends.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" disabled={runAgent.isPending} onClick={() => runAgent.mutate('draft')}>
            <Sparkles className="h-4 w-4 mr-1" />Draft next touches
          </Button>
          <Button size="sm" variant="outline" disabled={runAgent.isPending} onClick={() => runAgent.mutate('send')}>
            <Mail className="h-4 w-4 mr-1" />Send approved
          </Button>
          <Button size="sm" variant="outline" disabled={runAgent.isPending} onClick={() => runAgent.mutate('signal')}>
            <Send className="h-4 w-4 mr-1" />Weekly Signal
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Email drafts', value: emailDrafts.length, icon: Mail },
          { label: 'LinkedIn drafts', value: linkedinDrafts.length, icon: Linkedin },
          { label: 'Queued to send', value: queuedCount, icon: Send },
          { label: 'Prospects', value: prospects.length, icon: Users },
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

      <Tabs defaultValue="email">
        <TabsList>
          <TabsTrigger value="email">Email queue ({emailDrafts.length})</TabsTrigger>
          <TabsTrigger value="linkedin">LinkedIn ({linkedinDrafts.length})</TabsTrigger>
          <TabsTrigger value="prospects">Prospects ({prospects.length})</TabsTrigger>
        </TabsList>

        {/* ---------- Email approval queue ---------- */}
        <TabsContent value="email" className="space-y-2 mt-4">
          {msgLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          ) : emailDrafts.length === 0 ? (
            <EmptyState text="No email drafts. Run “Draft next touches” to generate the next email for each prospect." />
          ) : (
            emailDrafts.map((m) => (
              <div key={m.id} className="glass-panel rounded-xl p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-sm">{m.prospect?.name ?? 'Unknown'}</span>
                  {m.prospect?.org && <span className="text-xs text-muted-foreground">{m.prospect.org}</span>}
                  <span className="text-xs text-muted-foreground">· {personaLabel(m.prospect?.persona ?? '')}</span>
                  <span className="text-xs text-muted-foreground">· Touch {m.step + 1}</span>
                  {badge(m.status)}
                </div>
                {m.subject && <div className="text-sm font-medium">{m.subject}</div>}
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{m.body}</p>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" className="h-7 text-xs" disabled={approve.isPending} onClick={() => approve.mutate(m)}>
                    <Check className="h-3 w-3 mr-1" />Approve &amp; queue
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(m)}>Edit</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => skip.mutate(m)}>
                    <X className="h-3 w-3 mr-1" />Skip
                  </Button>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        {/* ---------- LinkedIn (manual) ---------- */}
        <TabsContent value="linkedin" className="space-y-2 mt-4">
          {linkedinDrafts.length === 0 ? (
            <EmptyState text="No LinkedIn drafts. These are copied and sent by hand to stay within LinkedIn’s terms." />
          ) : (
            linkedinDrafts.map((m) => (
              <div key={m.id} className="glass-panel rounded-xl p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-sm">{m.prospect?.name ?? 'Unknown'}</span>
                  {m.prospect?.org && <span className="text-xs text-muted-foreground">{m.prospect.org}</span>}
                  <span className="text-xs text-muted-foreground">· Touch {m.step + 1}</span>
                  {m.prospect?.linkedin_url && (
                    <a href={m.prospect.linkedin_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                      profile <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{m.body}</p>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copyText(m.body)}>
                    <Copy className="h-3 w-3 mr-1" />Copy
                  </Button>
                  <Button size="sm" className="h-7 text-xs" disabled={markLinkedinSent.isPending} onClick={() => markLinkedinSent.mutate(m)}>
                    <Check className="h-3 w-3 mr-1" />Mark sent
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(m)}>Edit</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => skip.mutate(m)}>Skip</Button>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        {/* ---------- Prospects ---------- */}
        <TabsContent value="prospects" className="space-y-2 mt-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" />Add prospect</Button>
          </div>
          {prospectLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : prospects.length === 0 ? (
            <EmptyState text="No prospects yet. Add named targets from your private research list, or let contact-finder feed them in." />
          ) : (
            prospects.map((p) => (
              <div key={p.id} className="glass-panel rounded-xl p-3 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-sm">{p.name}</span>
                {p.org && <span className="text-xs text-muted-foreground">{p.org}</span>}
                <span className="text-xs text-muted-foreground">· {personaLabel(p.persona)}</span>
                <span className="text-xs text-muted-foreground">· Wave {p.wave}</span>
                {p.region && <span className="text-xs text-muted-foreground">· {p.region}</span>}
                <span className="text-xs text-muted-foreground">· Touch {Math.min(p.next_step + 1, 5)}/5</span>
                {badge(p.status)}
                {p.email && <a href={`mailto:${p.email}`} className="text-xs text-primary hover:underline ml-auto">{p.email}</a>}
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Edit draft dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit draft</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {editing?.channel === 'email' && (
              <div>
                <Label>Subject</Label>
                <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
              </div>
            )}
            <div>
              <Label>Body</Label>
              <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={10} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button disabled={saveEdit.isPending} onClick={() => saveEdit.mutate()}>{saveEdit.isPending ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add prospect dialog */}
      <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) setForm(emptyProspect); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add prospect</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); addProspect.mutate(); }}>
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required placeholder="Nicolas Escallon" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Organisation</Label>
                <Input value={form.org} onChange={(e) => setForm((f) => ({ ...f, org: e.target.value }))} placeholder="Actis" />
              </div>
              <div>
                <Label>Role</Label>
                <Input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} placeholder="MD, Energy Infrastructure" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} type="email" placeholder="name@actis.com" />
              </div>
              <div>
                <Label>LinkedIn URL</Label>
                <Input value={form.linkedin_url} onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))} placeholder="https://linkedin.com/in/…" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Persona</Label>
                <Select value={form.persona} onValueChange={(v) => setForm((f) => ({ ...f, persona: v }))}>
                  <SelectTrigger aria-label="Persona"><SelectValue /></SelectTrigger>
                  <SelectContent>{PERSONAS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Wave</Label>
                <Select value={form.wave} onValueChange={(v) => setForm((f) => ({ ...f, wave: v }))}>
                  <SelectTrigger aria-label="Wave"><SelectValue /></SelectTrigger>
                  <SelectContent>{['1', '2', '3'].map((w) => <SelectItem key={w} value={w}>Wave {w}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Region</Label>
                <Input value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} placeholder="Sub-Saharan Africa" />
              </div>
              <div>
                <Label>Sector</Label>
                <Input value={form.sector} onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))} placeholder="Energy" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addProspect.isPending}>{addProspect.isPending ? 'Saving…' : 'Add prospect'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-2">
        <Send className="h-7 w-7 opacity-40" />
        <p className="text-sm max-w-md">{text}</p>
      </CardContent>
    </Card>
  );
}
