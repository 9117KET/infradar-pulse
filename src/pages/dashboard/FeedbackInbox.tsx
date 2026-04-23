import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Bug, Lightbulb, Heart, MessageCircle, Mail, ExternalLink, Inbox } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

type FeedbackRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  type: 'bug' | 'idea' | 'praise' | 'other';
  message: string;
  page: string | null;
  user_agent: string | null;
  status: 'new' | 'triaged' | 'in_progress' | 'resolved' | 'wont_fix';
  admin_notes: string | null;
  created_at: string;
};

const TYPE_META = {
  bug: { icon: Bug, color: 'text-red-400', label: 'Bug' },
  idea: { icon: Lightbulb, color: 'text-amber-400', label: 'Idea' },
  praise: { icon: Heart, color: 'text-pink-400', label: 'Praise' },
  other: { icon: MessageCircle, color: 'text-primary', label: 'Other' },
} as const;

const STATUS_OPTIONS: FeedbackRow['status'][] = ['new', 'triaged', 'in_progress', 'resolved', 'wont_fix'];

export default function FeedbackInbox() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | FeedbackRow['status']>('new');
  const [typeFilter, setTypeFilter] = useState<'all' | FeedbackRow['type']>('all');

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      toast.error('Could not load feedback');
    } else {
      setRows((data as FeedbackRow[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const filtered = rows.filter((r) => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;
    return true;
  });

  async function updateStatus(id: string, status: FeedbackRow['status']) {
    const { error } = await supabase.from('feedback').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      toast.error('Update failed');
    } else {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      toast.success('Status updated');
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
            <Inbox className="h-5 w-5 text-primary" /> Feedback inbox
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            User-submitted bugs, ideas and praise from across the platform.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="bug">Bugs</SelectItem>
              <SelectItem value="idea">Ideas</SelectItem>
              <SelectItem value="praise">Praise</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load}>Refresh</Button>
        </div>
      </header>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border/40 p-12 text-center text-muted-foreground">
          Nothing here. Inbox zero.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const meta = TYPE_META[r.type];
            const Icon = meta.icon;
            return (
              <div key={r.id} className="rounded-xl border border-border/40 bg-card/30 p-4 backdrop-blur">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Icon className={`h-4 w-4 ${meta.color}`} />
                    <Badge variant="outline" className="text-[10px] uppercase">{meta.label}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{r.status.replace('_', ' ')}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <Select value={r.status} onValueChange={(v) => updateStatus(r.id, v as FeedbackRow['status'])}>
                    <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap mb-2">{r.message}</p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {r.email && (
                    <a href={`mailto:${r.email}`} className="flex items-center gap-1 hover:text-primary">
                      <Mail className="h-3 w-3" /> {r.email}
                    </a>
                  )}
                  {r.page && (
                    <a href={r.page} className="flex items-center gap-1 hover:text-primary truncate max-w-[300px]">
                      <ExternalLink className="h-3 w-3" /> {r.page}
                    </a>
                  )}
                  {r.user_agent && (
                    <span className="truncate max-w-[260px]" title={r.user_agent}>{r.user_agent.split(' ')[0]}…</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
