/**
 * Your Analyst — the per-user standing AI analyst.
 *
 * Settings (focus, cadence, delivery), standing questions, and the briefing
 * inbox. All AI work happens server-side in the `personal-analyst` function.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { getAnalystCap } from '@/lib/billing/limits';
import { agentApi } from '@/lib/api/agents';
import { Seo } from '@/components/Seo';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Bot, RefreshCw, Plus, Trash2, ExternalLink, ThumbsUp, ThumbsDown, Lock } from 'lucide-react';
import { REGIONS, SECTORS, STAGES } from '@/data/projects';

type Analyst = {
  id: string;
  user_id: string;
  name: string;
  enabled: boolean;
  regions: string[];
  sectors: string[];
  stages: string[];
  countries: string[];
  min_value_usd: number | null;
  tracked_only: boolean;
  cadence: 'daily' | 'weekly';
  channels: string[];
  include_report: boolean;
  last_run_at: string | null;
  next_run_at: string;
};

type Question = { id: string; question: string; enabled: boolean; last_answered_at: string | null };

type Briefing = {
  id: string;
  kind: 'brief' | 'watch' | 'answer' | 'report';
  title: string;
  summary: string | null;
  body: string | null;
  sources: Array<{ label?: string; url: string }>;
  read_at: string | null;
  feedback: number | null;
  created_at: string;
};

const KIND_LABEL: Record<Briefing['kind'], string> = {
  brief: 'Brief',
  watch: 'Change',
  answer: 'Answer',
  report: 'Report',
};

function MultiToggle({ label, options, value, onChange }: {
  label: string;
  options: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                on ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AnalystPage() {
  const { user } = useAuth();
  const { plan, staffBypass } = useEntitlements();
  const cap = getAnalystCap(staffBypass ? 'enterprise' : plan);
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Analyst | null>(null);
  const [newQuestion, setNewQuestion] = useState('');

  const analystQuery = useQuery({
    queryKey: ['user-analyst', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Analyst> => {
      const { data, error } = await supabase.from('user_agents').select('*').eq('user_id', user!.id).maybeSingle();
      if (error) throw error;
      if (data) return data as Analyst;
      const { data: created, error: insErr } = await supabase
        .from('user_agents')
        .insert({ user_id: user!.id })
        .select('*')
        .single();
      if (insErr) throw insErr;
      return created as Analyst;
    },
  });

  const analyst = analystQuery.data;

  useEffect(() => {
    if (analyst) setDraft(analyst);
  }, [analyst]);

  const questionsQuery = useQuery({
    queryKey: ['user-analyst-questions', analyst?.id],
    enabled: !!analyst,
    queryFn: async (): Promise<Question[]> => {
      const { data, error } = await supabase
        .from('user_agent_questions')
        .select('id, question, enabled, last_answered_at')
        .eq('agent_id', analyst!.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Question[];
    },
  });

  const briefingsQuery = useQuery({
    queryKey: ['user-analyst-briefings', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Briefing[]> => {
      const { data, error } = await supabase
        .from('user_agent_briefings')
        .select('id, kind, title, summary, body, sources, read_at, feedback, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Briefing[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (patch: Partial<Analyst>) => {
      const { error } = await supabase.from('user_agents').update(patch).eq('id', analyst!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Analyst updated');
      void qc.invalidateQueries({ queryKey: ['user-analyst', user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addQuestion = useMutation({
    mutationFn: async (question: string) => {
      const { error } = await supabase
        .from('user_agent_questions')
        .insert({ agent_id: analyst!.id, user_id: user!.id, question });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewQuestion('');
      void qc.invalidateQueries({ queryKey: ['user-analyst-questions', analyst?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeQuestion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_agent_questions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['user-analyst-questions', analyst?.id] }),
  });

  const rateBriefing = useMutation({
    mutationFn: async ({ id, feedback }: { id: string; feedback: number }) => {
      const { error } = await supabase.from('user_agent_briefings').update({ feedback }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['user-analyst-briefings', user?.id] }),
  });

  const runNow = useMutation({
    mutationFn: () => agentApi.runPersonalAnalyst(),
    onSuccess: (data: { success?: boolean; error?: string }) => {
      if (data?.success === false) toast.error(data.error ?? 'Your analyst could not finish this run.');
      else toast.success('Your analyst just ran — new briefings below.');
      void qc.invalidateQueries({ queryKey: ['user-analyst-briefings', user?.id] });
      void qc.invalidateQueries({ queryKey: ['user-analyst', user?.id] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not run your analyst right now.'),
  });

  const questions = questionsQuery.data ?? [];
  const atQuestionLimit = questions.length >= cap.maxQuestions;

  const toggleChannel = (channel: string) => {
    if (!draft) return;
    const next = draft.channels.includes(channel)
      ? draft.channels.filter((c) => c !== channel)
      : [...draft.channels, channel];
    setDraft({ ...draft, channels: next });
  };

  return (
    <div className="space-y-6">
      <Seo
        title="Your Analyst | Standing AI intelligence"
        description="A personal AI analyst that watches your regions, sectors and tracked projects and delivers cited intelligence briefings."
        path="/dashboard/analyst"
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" /> Your Analyst
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            One analyst, always on. It watches your patch, answers your standing questions and cites every claim.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {analyst?.last_run_at && (
            <span className="text-xs text-muted-foreground">
              Last run {new Date(analyst.last_run_at).toLocaleString()}
            </span>
          )}
          <Button onClick={() => runNow.mutate()} disabled={runNow.isPending || !analyst} className="teal-glow">
            <RefreshCw className={`mr-2 h-4 w-4 ${runNow.isPending ? 'animate-spin' : ''}`} />
            Run now
          </Button>
        </div>
      </div>

      <Tabs defaultValue="inbox" className="space-y-4">
        <TabsList className="bg-muted/60">
          <TabsTrigger value="inbox">Briefings</TabsTrigger>
          <TabsTrigger value="questions">Standing questions</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="space-y-3">
          {briefingsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading briefings…</p>}
          {!briefingsQuery.isLoading && (briefingsQuery.data ?? []).length === 0 && (
            <Card className="glass-panel">
              <CardContent className="py-10 text-center space-y-2">
                <p className="text-sm font-medium">No briefings yet</p>
                <p className="text-xs text-muted-foreground">
                  Set your focus under Settings, then press Run now — or wait for the next scheduled run.
                </p>
              </CardContent>
            </Card>
          )}
          {(briefingsQuery.data ?? []).map((b) => (
            <Card key={b.id} className="glass-panel">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{KIND_LABEL[b.kind]}</Badge>
                      <CardTitle className="text-base">{b.title}</CardTitle>
                    </div>
                    {b.summary && <CardDescription className="mt-1">{b.summary}</CardDescription>}
                    <p className="text-[10px] text-muted-foreground mt-1">{new Date(b.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant={b.feedback === 1 ? 'default' : 'ghost'}
                      onClick={() => rateBriefing.mutate({ id: b.id, feedback: 1 })}
                      aria-label="Useful"
                    >
                      <ThumbsUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant={b.feedback === -1 ? 'default' : 'ghost'}
                      onClick={() => rateBriefing.mutate({ id: b.id, feedback: -1 })}
                      aria-label="Not useful"
                    >
                      <ThumbsDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {b.body && <p className="text-sm whitespace-pre-wrap leading-relaxed">{b.body}</p>}
                {(b.sources ?? []).length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Sources</p>
                      {b.sources.map((s, i) => (
                        <a
                          key={`${b.id}-${i}`}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-primary hover:underline break-all"
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          {s.label || s.url}
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="questions" className="space-y-4">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-base">Standing questions</CardTitle>
              <CardDescription>
                Written in plain language. Your analyst answers them on every run and cites its sources.
                Your plan covers {cap.maxQuestions} question{cap.maxQuestions === 1 ? '' : 's'}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  placeholder="e.g. Tell me when a hydrogen project in Egypt reaches tender"
                  disabled={atQuestionLimit}
                />
                <Button
                  onClick={() => newQuestion.trim() && addQuestion.mutate(newQuestion.trim())}
                  disabled={!newQuestion.trim() || atQuestionLimit || addQuestion.isPending}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {atQuestionLimit && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" /> You have used all {cap.maxQuestions} questions on your plan. Upgrade for more.
                </p>
              )}
              <div className="space-y-2">
                {questions.map((q) => (
                  <div key={q.id} className="flex items-center gap-2 rounded-lg border border-border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{q.question}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {q.last_answered_at ? `Last answered ${new Date(q.last_answered_at).toLocaleDateString()}` : 'Not answered yet'}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => removeQuestion.mutate(q.id)} aria-label="Remove question">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {questions.length === 0 && <p className="text-xs text-muted-foreground">No questions saved yet.</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          {draft && (
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="text-base">What your analyst watches</CardTitle>
                <CardDescription>Leave a list empty to cover everything.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Analyst name</Label>
                    <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Minimum project value (USD)</Label>
                    <Input
                      type="number"
                      value={draft.min_value_usd ?? ''}
                      onChange={(e) => setDraft({ ...draft, min_value_usd: e.target.value ? Number(e.target.value) : null })}
                      placeholder="Any"
                    />
                  </div>
                </div>

                <MultiToggle label="Regions" options={REGIONS} value={draft.regions} onChange={(regions) => setDraft({ ...draft, regions })} />
                <MultiToggle label="Sectors" options={SECTORS} value={draft.sectors} onChange={(sectors) => setDraft({ ...draft, sectors })} />
                <MultiToggle label="Stages" options={STAGES} value={draft.stages} onChange={(stages) => setDraft({ ...draft, stages })} />

                <Separator />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">How often</Label>
                    <Select
                      value={draft.cadence}
                      onValueChange={(v) => setDraft({ ...draft, cadence: v as 'daily' | 'weekly' })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="daily" disabled={!cap.allowDaily}>
                          Daily{cap.allowDaily ? '' : ' — paid plans'}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-xs text-muted-foreground">Where it delivers</Label>
                    {[
                      { key: 'inapp', label: 'In-app briefings' },
                      { key: 'email', label: 'Email' },
                      { key: 'alerts', label: 'Alerts feed' },
                    ].map((c) => (
                      <div key={c.key} className="flex items-center justify-between">
                        <span className="text-sm">{c.label}</span>
                        <Switch
                          checked={draft.channels.includes(c.key)}
                          onCheckedChange={() => toggleChannel(c.key)}
                          disabled={c.key === 'inapp'}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Only my tracked projects</p>
                      <p className="text-xs text-muted-foreground">Ignore everything outside your watchlist.</p>
                    </div>
                    <Switch checked={draft.tracked_only} onCheckedChange={(v) => setDraft({ ...draft, tracked_only: v })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Draft a full report each period</p>
                      <p className="text-xs text-muted-foreground">
                        {cap.autoReport ? 'A client-ready cited report on every run.' : 'Available on paid plans.'}
                      </p>
                    </div>
                    <Switch
                      checked={draft.include_report && cap.autoReport}
                      disabled={!cap.autoReport}
                      onCheckedChange={(v) => setDraft({ ...draft, include_report: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Analyst is running</p>
                      <p className="text-xs text-muted-foreground">Switch off to pause all briefings.</p>
                    </div>
                    <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} />
                  </div>
                </div>

                <Button
                  onClick={() =>
                    saveMutation.mutate({
                      name: draft.name,
                      enabled: draft.enabled,
                      regions: draft.regions,
                      sectors: draft.sectors,
                      stages: draft.stages,
                      countries: draft.countries,
                      min_value_usd: draft.min_value_usd,
                      tracked_only: draft.tracked_only,
                      cadence: cap.allowDaily ? draft.cadence : 'weekly',
                      channels: draft.channels,
                      include_report: draft.include_report && cap.autoReport,
                    })
                  }
                  disabled={saveMutation.isPending}
                >
                  Save settings
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
