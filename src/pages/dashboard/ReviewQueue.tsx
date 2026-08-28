import { useSearchParams } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SourceHealth from './SourceHealth';
import { useToast } from '@/hooks/use-toast';
import { calculateIntelligenceQuality } from '@/lib/intelligence-quality';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { isReachableContact } from '@/lib/contact-validation';
import {
  Check, X, ExternalLink, Bot, MapPin, DollarSign,
  ShieldAlert, Loader2, Inbox, AlertTriangle, Link2, FileCheck2,
  Mail, Phone, User, Building2, RefreshCw
} from 'lucide-react';

const REVIEW_PAGE_SIZE = 25;

function Pager({ page, total, onPageChange }: { page: number; total: number; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / REVIEW_PAGE_SIZE));
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground">
      <span>{total === 0 ? '0' : page * REVIEW_PAGE_SIZE + 1}–{Math.min((page + 1) * REVIEW_PAGE_SIZE, total)} of {total}</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => onPageChange(Math.max(0, page - 1))} disabled={page === 0}>Previous</Button>
        <span>Page {page + 1} of {totalPages}</span>
        <Button size="sm" variant="outline" onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))} disabled={page + 1 >= totalPages}>Next</Button>
      </div>
    </div>
  );
}

interface EvidenceRow {
  id: string;
  source: string;
  url: string;
  type: string;
  verified: boolean;
  date: string;
  title: string | null;
}

interface ContactRow {
  id: string;
  name: string;
  role: string;
  organization: string;
  email: string | null;
  phone: string | null;
  contact_type: string;
  source_url: string | null;
  verified: boolean;
}

export default function ReviewQueue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [approveGuardOpen, setApproveGuardOpen] = useState(false);
  const [pendingApproveId, setPendingApproveId] = useState<string | null>(null);
  // Tab lives in the URL so /dashboard/review?tab=source-health deep-links, and
  // so the redirect from the retired /dashboard/source-health route lands on the
  // right tab. Same pattern as AgentsHub.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'candidates';
  const setActiveTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'candidates') next.delete('tab');
    else next.set('tab', value);
    setSearchParams(next, { replace: true });
  };
  const [legacyPage, setLegacyPage] = useState(0);
  const [candidatePage, setCandidatePage] = useState(0);
  const [updatePage, setUpdatePage] = useState(0);
  const [duplicatePage, setDuplicatePage] = useState(0);
  const [sourceIssuePage, setSourceIssuePage] = useState(0);
  const [officialPage, setOfficialPage] = useState(0);

  const { data: pendingPageResult = { rows: [], total: 0 }, isLoading } = useQuery({
    queryKey: ['pending-projects', legacyPage],
    queryFn: async () => {
      const from = legacyPage * REVIEW_PAGE_SIZE;
      const { data, error, count } = await supabase
        .from('projects')
        .select('*', { count: 'exact' })
        .eq('approved', false)
        .order('created_at', { ascending: false })
        .range(from, from + REVIEW_PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });
  const pending = pendingPageResult.rows;

  const { data: candidatePageResult = { rows: [], total: 0 } } = useQuery({
    queryKey: ['project-candidates-review', candidatePage],
    queryFn: async () => {
      const from = candidatePage * REVIEW_PAGE_SIZE;
      const { data, error, count } = await (supabase as any)
        .from('project_candidates')
        .select('*', { count: 'exact' })
        .in('review_status', ['ready_for_review', 'needs_research'])
        .order('created_at', { ascending: false })
        .range(from, from + REVIEW_PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });
  const candidates = candidatePageResult.rows;

  const { data: updatePageResult = { rows: [], total: 0 } } = useQuery({
    queryKey: ['update-proposals-review', updatePage],
    queryFn: async () => {
      const from = updatePage * REVIEW_PAGE_SIZE;
      const { data, error, count } = await (supabase as any)
        .from('update_proposals')
        .select('*, projects(name, country, sector, stage, status)', { count: 'exact' })
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .range(from, from + REVIEW_PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });
  const updateProposals = updatePageResult.rows;

  const { data: duplicatePageResult = { rows: [], total: 0 } } = useQuery({
    queryKey: ['duplicate-candidates-review', duplicatePage],
    queryFn: async () => {
      const from = duplicatePage * REVIEW_PAGE_SIZE;
      const { data, error, count } = await (supabase as any)
        .from('project_candidates')
        .select('*', { count: 'exact' })
        .or('duplicate_of.not.is.null,canonical_project_id.not.is.null,pipeline_status.eq.deduping')
        .not('pipeline_status', 'in', '("merged","approved")')
        .not('review_status', 'in', '("rejected","approved")')
        .order('duplicate_confidence', { ascending: false })
        .range(from, from + REVIEW_PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const { data: sourceIssuePageResult = { rows: [], total: 0 } } = useQuery({
    queryKey: ['source-issues-review', sourceIssuePage],
    queryFn: async () => {
      const staleBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const from = sourceIssuePage * REVIEW_PAGE_SIZE;
      const { data, error, count } = await (supabase as any)
        .from('source_registry')
        .select('*', { count: 'exact' })
        .or(`status.eq.failing,and(status.neq.active,last_success_at.lt.${staleBefore})`)
        .order('last_failure_at', { ascending: false, nullsFirst: false })
        .range(from, from + REVIEW_PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  // Machine-published official-registry projects (already live) — read-only
  // spot-check list with an unpublish escape hatch.
  const { data: officialPageResult = { rows: [], total: 0 } } = useQuery({
    queryKey: ['official-published-review', officialPage],
    queryFn: async () => {
      const from = officialPage * REVIEW_PAGE_SIZE;
      const { data, error, count } = await supabase
        .from('projects')
        .select('id, name, country, region, sector, stage, status, value_label, confidence, source_url, last_updated', { count: 'exact' })
        .eq('approved', true)
        .order('last_updated', { ascending: false })
        .range(from, from + REVIEW_PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  // Load evidence sources for all pending projects. Memoise so the array
  // identity is stable across renders (it feeds the query keys below).
  const pendingIds = useMemo(() => pending.map((p: any) => p.id), [pending]);
  const { data: evidenceMap = {} } = useQuery({
    queryKey: ['pending-evidence', pendingIds],
    enabled: pendingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('evidence_sources')
        .select('id, project_id, source, url, type, verified, date, title')
        .in('project_id', pendingIds)
        .range(0, 999);
      if (error) throw error;
      const map: Record<string, EvidenceRow[]> = {};
      (data || []).forEach((e: any) => {
        if (!map[e.project_id]) map[e.project_id] = [];
        map[e.project_id].push(e);
      });
      return map;
    },
  });

  // Load contacts for all pending projects
  const { data: contactsMap = {} } = useQuery({
    queryKey: ['pending-contacts', pendingIds],
    enabled: pendingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_contacts')
        .select('id, project_id, name, role, organization, email, phone, contact_type, source_url, verified')
        .in('project_id', pendingIds)
        .range(0, 999);
      if (error) throw error;
      const map: Record<string, ContactRow[]> = {};
      (data || []).forEach((c: any) => {
        if (!map[c.project_id]) map[c.project_id] = [];
        map[c.project_id].push(c);
      });
      return map;
    },
  });

  const showErr = (e: unknown, title: string) => {
    let description = 'Unknown error';
    if (e instanceof Error) description = e.message;
    else if (e && typeof e === 'object') {
      const err = e as { message?: string; details?: string; hint?: string; code?: string };
      description = err.message || err.details || err.hint || err.code || JSON.stringify(e);
    } else if (e != null) description = String(e);
    toast({ title, description, variant: 'destructive' });
  };

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('projects').update({ approved: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({ title: 'Project approved', description: 'It will now appear on the dashboard and globe.' });
    },
    onError: (e) => showErr(e, 'Approve failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-projects'] });
      toast({ title: 'Project rejected and removed' });
    },
    onError: (e) => showErr(e, 'Reject failed'),
  });

  // Keep the Evidence & Verification page in sync whenever a verified flag changes here.
  const invalidateEvidenceViews = () => {
    queryClient.invalidateQueries({ queryKey: ['pending-evidence'] });
    queryClient.invalidateQueries({ queryKey: ['pending-contacts'] });
    queryClient.invalidateQueries({ queryKey: ['evidence-verification-stats'] });
    queryClient.invalidateQueries({ queryKey: ['evidence-verification-projects'] });
  };

  const verifyEvidence = useMutation({
    mutationFn: async ({ id, verified }: { id: string; verified: boolean }) => {
      const { error } = await supabase.from('evidence_sources').update({ verified }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      invalidateEvidenceViews();
      toast({ title: vars.verified ? 'Evidence verified' : 'Verification removed' });
    },
    onError: (e) => showErr(e, 'Could not update evidence'),
  });

  const verifyContact = useMutation({
    mutationFn: async ({ id, verified }: { id: string; verified: boolean }) => {
      const { error } = await supabase.from('project_contacts').update({ verified }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      invalidateEvidenceViews();
      toast({ title: vars.verified ? 'Contact verified' : 'Verification removed' });
    },
    onError: (e) => showErr(e, 'Could not update contact'),
  });

  // Unpublish a machine-published project: it disappears from the public
  // dashboard/map (approved=false lands it in the Legacy Queue) and the
  // action is recorded in the review audit trail.
  const unpublishMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('projects').update({ approved: false }).eq('id', id);
      if (error) throw error;
      const { error: logErr } = await supabase
        .from('review_actions')
        .insert({ item_type: 'quality_issue', project_id: id, action: 'note', reason: 'Unpublished official-registry project from verification workbench' });
      if (logErr) throw logErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['official-published-review'] });
      queryClient.invalidateQueries({ queryKey: ['pending-projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({ title: 'Project unpublished', description: 'It is off the public dashboard and now sits in the Legacy Queue for re-review.' });
    },
    onError: (e) => showErr(e, 'Unpublish failed'),
  });

  const duplicateAction = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'merged' | 'not_duplicate' }) => {
      if (action === 'merged') {
        const { error } = await (supabase as any)
          .from('project_candidates')
          .update({ pipeline_status: 'merged', review_status: 'rejected', updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
        const { error: logErr } = await (supabase as any)
          .from('review_actions')
          .insert({ item_type: 'duplicate', candidate_id: id, action: 'merged', reason: 'Marked as duplicate / merged from verification workbench' });
        if (logErr) throw logErr;
        return;
      }
      // not_duplicate: clear the duplicate linkage and return the candidate to the review queue.
      const { error } = await (supabase as any)
        .from('project_candidates')
        .update({ duplicate_of: null, canonical_project_id: null, duplicate_confidence: null, pipeline_status: 'ready_for_review', review_status: 'ready_for_review', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      const { error: logErr } = await (supabase as any)
        .from('review_actions')
        .insert({ item_type: 'duplicate', candidate_id: id, action: 'note', reason: 'Confirmed not a duplicate' });
      if (logErr) throw logErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['duplicate-candidates-review'] });
      queryClient.invalidateQueries({ queryKey: ['project-candidates-review'] });
      toast({ title: 'Duplicate resolved' });
    },
    onError: (e) => showErr(e, 'Duplicate action failed'),
  });

  const sourceAction = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'retry' | 'pause' }) => {
      const status = action === 'retry' ? 'active' : 'paused';
      const { error } = await (supabase as any)
        .from('source_registry')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      const { error: logErr } = await (supabase as any)
        .from('review_actions')
        .insert({ item_type: 'source', action: 'note', reason: action === 'retry' ? `Source re-activated for retry: ${id}` : `Source paused: ${id}` });
      if (logErr) throw logErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['source-issues-review'] });
      toast({ title: 'Source updated' });
    },
    onError: (e) => showErr(e, 'Source action failed'),
  });

  const candidateAction = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'approved' | 'rejected' | 'requested_research' }) => {
      if (action === 'approved') {
        const { error } = await (supabase as any).rpc('promote_project_candidate', {
          p_candidate_id: id,
          p_reason: 'Approved from verification workbench',
        });
        if (error) throw error;
        return;
      }
      if (action === 'rejected') {
        // Use RPC so a rejection signature is recorded and the candidate
        // can never re-appear in the queue via future agent runs.
        const { error } = await (supabase as any).rpc('reject_project_candidate', {
          p_candidate_id: id,
          p_reason: 'Rejected from verification workbench',
        });
        if (error) throw error;
        return;
      }
      const { error } = await (supabase as any)
        .from('project_candidates')
        .update({ review_status: 'needs_research', pipeline_status: 'needs_research', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      const { error: logErr } = await (supabase as any)
        .from('review_actions')
        .insert({ item_type: 'candidate', candidate_id: id, action, reason: action.replace('_', ' ') });
      if (logErr) throw logErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-candidates-review'] });
      queryClient.invalidateQueries({ queryKey: ['pending-projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({ title: 'Candidate updated' });
    },
    onError: (e) => showErr(e, 'Candidate action failed'),
  });

  const updateAction = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'approved' | 'rejected' }) => {
      if (action === 'approved') {
        const { error } = await (supabase as any).rpc('apply_update_proposal', {
          p_update_proposal_id: id,
          p_reason: 'Approved from verification workbench',
        });
        if (error) throw error;
        return;
      }
      const { error } = await (supabase as any)
        .from('update_proposals')
        .update({ status: action, reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      const { error: logErr } = await (supabase as any)
        .from('review_actions')
        .insert({ item_type: 'update', update_proposal_id: id, action, reason: `Update proposal ${action}` });
      if (logErr) throw logErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['update-proposals-review'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({ title: 'Update proposal reviewed' });
    },
    onError: (e) => showErr(e, 'Update action failed'),
  });

  const hasSource = (project: any) => project.source_url && project.source_url.trim() !== '' && project.source_url !== '#';
  const projectEvidence = (id: string) => (evidenceMap as Record<string, EvidenceRow[]>)[id] || [];
  const projectContacts = (id: string) => (contactsMap as Record<string, ContactRow[]>)[id] || [];
  const hasReachableContactRow = (id: string) => projectContacts(id).some(isReachableContact);

  const requestApprove = (id: string) => {
    if (hasReachableContactRow(id)) {
      approveMutation.mutate(id);
      return;
    }
    setPendingApproveId(id);
    setApproveGuardOpen(true);
  };

  const confirmApproveWithoutReachableContact = () => {
    if (pendingApproveId) approveMutation.mutate(pendingApproveId);
    setApproveGuardOpen(false);
    setPendingApproveId(null);
  };

  const contactTypeIcon: Record<string, string> = {
    contractor: '🏗️', government: '🏛️', financier: '💰', consultant: '📋', owner: '👤', general: '📌',
  };

  const stageBadgeColor = (stage: string) => {
    const map: Record<string, string> = {
      Construction: 'bg-emerald-500/20 text-emerald-400',
      Planned: 'bg-blue-500/20 text-blue-400',
      Financing: 'bg-amber-500/20 text-amber-400',
      Tender: 'bg-purple-500/20 text-purple-400',
      Awarded: 'bg-cyan-500/20 text-cyan-400',
      Completed: 'bg-green-500/20 text-green-400',
    };
    return map[stage] || 'bg-muted text-muted-foreground';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            Review Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {pendingPageResult.total} AI-discovered project{pendingPageResult.total !== 1 ? 's' : ''} awaiting review.
            Approve expects at least one reachable contact (name + email or phone + http source URL) unless you override.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-7 bg-muted/60">
          <TabsTrigger value="candidates">Legacy Queue ({pendingPageResult.total})</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline Candidates ({candidatePageResult.total})</TabsTrigger>
          <TabsTrigger value="duplicates">Duplicates ({duplicatePageResult.total})</TabsTrigger>
          <TabsTrigger value="updates">Update Proposals ({updatePageResult.total})</TabsTrigger>
          <TabsTrigger value="sources">Source Issues ({sourceIssuePageResult.total})</TabsTrigger>
          <TabsTrigger value="official">Published (official) ({officialPageResult.total})</TabsTrigger>
          <TabsTrigger value="source-health">Source Health</TabsTrigger>
        </TabsList>

        <TabsContent value="candidates" className="space-y-4">
      {pending.length === 0 ? (
        <div className="glass-panel rounded-xl p-12 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-serif text-lg font-semibold">Queue is empty</h3>
          <p className="text-sm text-muted-foreground mt-1">
            No pending projects. Run the Research Agent from Settings to discover new ones.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((project: any) => {
            const hasPrimarySource = hasSource(project);
            const evidence = projectEvidence(project.id);
            const contacts = projectContacts(project.id);
            const hasAnySource = hasPrimarySource || evidence.length > 0;

            return (
              <div
                key={project.id}
                className="glass-panel rounded-xl p-5 space-y-3 transition-all hover:border-primary/30"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-serif font-semibold text-base">{project.name}</h3>
                      <Badge variant="outline" className={stageBadgeColor(project.stage)}>
                        {project.stage}
                      </Badge>
                      <Badge variant="outline" className="bg-primary/10 text-primary text-[10px]">
                        AI-discovered
                      </Badge>
                      {/* Source verification badge */}
                      {hasAnySource ? (
                        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 text-[10px] gap-1">
                          <Link2 className="h-3 w-3" /> Source verified
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-500/15 text-red-400 text-[10px] gap-1">
                          <AlertTriangle className="h-3 w-3" /> Missing source
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {project.country} · {project.region}
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {project.value_label}
                      </span>
                      <span>{project.sector}</span>
                      <span className="flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3" />
                        Risk: {project.risk_score}/100
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-400 hover:text-red-300 hover:border-red-400/50"
                      onClick={() => rejectMutation.mutate(project.id)}
                      disabled={rejectMutation.isPending}
                    >
                      <X className="h-4 w-4 mr-1" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => requestApprove(project.id)}
                      disabled={approveMutation.isPending}
                      className="teal-glow"
                    >
                      <Check className="h-4 w-4 mr-1" /> Approve
                    </Button>
                  </div>
                </div>

                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => setExpandedId(expandedId === project.id ? null : project.id)}
                >
                  {expandedId === project.id ? 'Hide details' : 'Show details'}
                </button>

                {expandedId === project.id && (
                  <div className="border-t border-border pt-3 space-y-4 text-sm">
                    <p className="text-muted-foreground">{project.description}</p>

                    {/* Source Verification Block */}
                    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <FileCheck2 className="h-3.5 w-3.5" /> Source Verification
                      </h4>

                      {hasPrimarySource ? (
                        <a
                          href={project.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-primary hover:underline text-xs group"
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{project.source_url}</span>
                        </a>
                      ) : (
                        <p className="text-xs text-red-400 flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Primary source link missing; requires enrichment before approval
                        </p>
                      )}

                      {/* Evidence sources */}
                      {evidence.length > 0 && (
                        <div className="space-y-1 pt-1 border-t border-border/50">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Supporting Evidence</p>
                          {evidence.map((ev) => (
                            <div key={ev.id} className="flex items-center gap-2 text-xs">
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                                {ev.type}
                              </Badge>
                              {ev.verified && (
                                <Check className="h-3 w-3 text-emerald-400" />
                              )}
                              <span className="text-muted-foreground truncate max-w-[150px]">{ev.source}</span>
                              {ev.url && ev.url !== '#' && (
                                <a
                                  href={ev.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline flex items-center gap-0.5 shrink-0"
                                >
                                  <ExternalLink className="h-3 w-3" /> View
                                </a>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="ml-auto h-6 px-2 text-[10px] shrink-0"
                                onClick={() => verifyEvidence.mutate({ id: ev.id, verified: !ev.verified })}
                                disabled={verifyEvidence.isPending}
                              >
                                {ev.verified ? 'Unverify' : 'Verify'}
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {!hasPrimarySource && evidence.length === 0 && (
                        <p className="text-[10px] text-muted-foreground italic">
                          No evidence sources found. The Data Enrichment agent will attempt to backfill.
                        </p>
                      )}
                    </div>

                    {/* Contacts Block */}
                    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5" /> Contacts & Stakeholders
                        {contacts.length > 0 && (
                          <Badge variant="outline" className="ml-auto text-[9px] bg-primary/10 text-primary">{contacts.length} found</Badge>
                        )}
                      </h4>

                      {contacts.length > 0 ? (
                        <div className="space-y-2">
                          {contacts.map((contact) => (
                            <div key={contact.id} className="flex items-start gap-3 rounded-md bg-background/50 p-2 text-xs">
                              <span className="text-sm mt-0.5">{contactTypeIcon[contact.contact_type] || '📌'}</span>
                              <div className="flex-1 min-w-0 space-y-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">{contact.name}</span>
                                  {isReachableContact(contact) ? (
                                    <Badge variant="outline" className="text-[8px] px-1.5 py-0 bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                                      Reachable
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[8px] px-1.5 py-0 bg-amber-500/10 text-amber-500 border-amber-500/25" title="Needs name + email or phone + http(s) source URL">
                                      Incomplete
                                    </Badge>
                                  )}
                                  {contact.verified && (
                                    <Badge variant="outline" className="text-[8px] px-1 py-0 bg-emerald-500/15 text-emerald-400">Verified</Badge>
                                  )}
                                  <Badge variant="outline" className="text-[8px] px-1 py-0 capitalize">{contact.contact_type}</Badge>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="ml-auto h-5 px-2 text-[9px]"
                                    onClick={() => verifyContact.mutate({ id: contact.id, verified: !contact.verified })}
                                    disabled={verifyContact.isPending}
                                  >
                                    {contact.verified ? 'Unverify' : 'Verify'}
                                  </Button>
                                </div>
                                {contact.role && (
                                  <p className="text-muted-foreground">{contact.role}</p>
                                )}
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Building2 className="h-3 w-3" />
                                  <span>{contact.organization}</span>
                                </div>
                                <div className="flex items-center gap-3 pt-0.5">
                                  {contact.email && (
                                    <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-primary hover:underline">
                                      <Mail className="h-3 w-3" /> {contact.email}
                                    </a>
                                  )}
                                  {contact.phone && (
                                    <a href={`tel:${contact.phone}`} className="flex items-center gap-1 text-primary hover:underline">
                                      <Phone className="h-3 w-3" /> {contact.phone}
                                    </a>
                                  )}
                                </div>
                                {contact.source_url && (
                                  <a href={contact.source_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-muted-foreground hover:text-primary text-[10px]">
                                    <ExternalLink className="h-2.5 w-2.5" /> Source
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-amber-400 flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          No contacts found. Contact Finder agent will attempt to discover stakeholders
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Timeline:</span>{' '}
                        {project.timeline || 'N/A'}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Confidence:</span>{' '}
                        {project.confidence}%
                      </div>
                      <div>
                        <span className="text-muted-foreground">Coordinates:</span>{' '}
                        {project.lat.toFixed(2)}, {project.lng.toFixed(2)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Discovered:</span>{' '}
                        {new Date(project.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
          <Pager page={legacyPage} total={pendingPageResult.total} onPageChange={setLegacyPage} />
        </TabsContent>

        <TabsContent value="duplicates" className="space-y-3">
          {duplicatePageResult.rows.length === 0 ? (
            <div className="glass-panel rounded-xl p-12 text-center">
              <Link2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-serif text-lg font-semibold">No duplicate suggestions</h3>
              <p className="text-sm text-muted-foreground mt-1">Entity resolution suggestions will appear here before merge decisions.</p>
            </div>
          ) : <>
            <Pager page={duplicatePage} total={duplicatePageResult.total} onPageChange={setDuplicatePage} />
            {duplicatePageResult.rows.map((candidate: any) => (
              <div key={candidate.id} className="glass-panel rounded-xl p-5 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-serif font-semibold">{candidate.name}</h3>
                    <p className="text-xs text-muted-foreground">{candidate.country} · {candidate.sector || 'Unknown sector'} · {candidate.pipeline_status}</p>
                  </div>
                  <Badge variant="outline" className="bg-amber-500/15 text-amber-400">Duplicate risk {candidate.duplicate_confidence ?? '—'}%</Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{candidate.description || 'No extracted description.'}</p>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" className="teal-glow" onClick={() => duplicateAction.mutate({ id: candidate.id, action: 'merged' })} disabled={duplicateAction.isPending}><Link2 className="h-4 w-4 mr-1" />Merge duplicate</Button>
                  <Button size="sm" variant="outline" onClick={() => duplicateAction.mutate({ id: candidate.id, action: 'not_duplicate' })} disabled={duplicateAction.isPending}><Check className="h-4 w-4 mr-1" />Not a duplicate</Button>
                  <Button size="sm" variant="outline" onClick={() => candidateAction.mutate({ id: candidate.id, action: 'requested_research' })}>More research</Button>
                  <Button size="sm" variant="outline" className="text-red-400 hover:text-red-300" onClick={() => candidateAction.mutate({ id: candidate.id, action: 'rejected' })}><X className="h-4 w-4 mr-1" />Reject</Button>
                </div>
              </div>
            ))}
            <Pager page={duplicatePage} total={duplicatePageResult.total} onPageChange={setDuplicatePage} />
          </>}
        </TabsContent>

        <TabsContent value="pipeline" className="space-y-3">
          {candidates.length === 0 ? (
            <div className="glass-panel rounded-xl p-12 text-center">
              <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-serif text-lg font-semibold">No pipeline candidates</h3>
              <p className="text-sm text-muted-foreground mt-1">Source-first candidates will appear here after ingest and extraction.</p>
            </div>
          ) : <>
            <Pager page={candidatePage} total={candidatePageResult.total} onPageChange={setCandidatePage} />
            {candidates.map((candidate: any) => {
            const quality = calculateIntelligenceQuality({
              sourceUrl: candidate.source_url,
              confidence: candidate.confidence,
              description: candidate.description,
              valueUsd: candidate.value_usd,
              lat: candidate.lat,
              lng: candidate.lng,
              evidenceCount: Array.isArray(candidate.extracted_claims?.evidence_ids) ? candidate.extracted_claims.evidence_ids.length : 0,
              lastUpdated: candidate.updated_at,
            });
            return (
              <div key={candidate.id} className="glass-panel rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-serif font-semibold">{candidate.name}</h3>
                      <Badge variant="outline">{candidate.stage}</Badge>
                      <Badge variant="outline" className="bg-primary/10 text-primary">Quality {quality.totalScore}</Badge>
                      <Badge variant="outline" className="capitalize">{quality.recommendation.replace('_', ' ')}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{candidate.country} · {candidate.region || 'Unknown region'} · {candidate.sector || 'Unknown sector'}</p>
                    <p className="text-sm text-muted-foreground line-clamp-2">{candidate.description || 'No description extracted yet.'}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {quality.missingFields.map(field => <Badge key={field} variant="outline" className="text-[10px]">Missing {field}</Badge>)}
                      {quality.flags.map(flag => <Badge key={flag} variant="outline" className="text-[10px]">{flag.replace(/_/g, ' ')}</Badge>)}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => candidateAction.mutate({ id: candidate.id, action: 'requested_research' })}>More research</Button>
                    <Button size="sm" variant="outline" onClick={() => candidateAction.mutate({ id: candidate.id, action: 'rejected' })}><X className="h-4 w-4 mr-1" />Reject</Button>
                    <Button size="sm" className="teal-glow" onClick={() => candidateAction.mutate({ id: candidate.id, action: 'approved' })}><Check className="h-4 w-4 mr-1" />Approve</Button>
                  </div>
                </div>
                {candidate.source_url && <a href={candidate.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1"><ExternalLink className="h-3 w-3" />{candidate.source_url}</a>}
              </div>
            );
            })}
            <Pager page={candidatePage} total={candidatePageResult.total} onPageChange={setCandidatePage} />
          </>}
        </TabsContent>

        <TabsContent value="updates" className="space-y-3">
          {updateProposals.length === 0 ? (
            <div className="glass-panel rounded-xl p-12 text-center">
              <RefreshCw className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-serif text-lg font-semibold">No pending updates</h3>
              <p className="text-sm text-muted-foreground mt-1">Approved project changes will wait here before being applied.</p>
            </div>
          ) : <>
            <Pager page={updatePage} total={updatePageResult.total} onPageChange={setUpdatePage} />
            {updateProposals.map((proposal: any) => (
            <div key={proposal.id} className="glass-panel rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-serif font-semibold">{proposal.projects?.name || 'Project update'}</h3>
                    <Badge variant="outline">Confidence {proposal.confidence}%</Badge>
                    <Badge variant="outline">{proposal.proposed_by_agent}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{proposal.impact || 'Field changes detected.'}</p>
                  <pre className="text-xs bg-muted/30 rounded-md p-3 overflow-auto max-h-36">{JSON.stringify(proposal.field_changes, null, 2)}</pre>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => updateAction.mutate({ id: proposal.id, action: 'rejected' })}><X className="h-4 w-4 mr-1" />Reject</Button>
                  <Button size="sm" className="teal-glow" onClick={() => updateAction.mutate({ id: proposal.id, action: 'approved' })}><Check className="h-4 w-4 mr-1" />Approve</Button>
                </div>
              </div>
              {proposal.source_url && <a href={proposal.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1"><ExternalLink className="h-3 w-3" />{proposal.source_url}</a>}
            </div>
            ))}
            <Pager page={updatePage} total={updatePageResult.total} onPageChange={setUpdatePage} />
          </>}
        </TabsContent>

        <TabsContent value="sources" className="space-y-3">
          {sourceIssuePageResult.rows.length === 0 ? (
            <div className="glass-panel rounded-xl p-12 text-center">
              <FileCheck2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-serif text-lg font-semibold">No stale or failing sources</h3>
              <p className="text-sm text-muted-foreground mt-1">Source registry issues will appear here when crawls fail or sources go stale.</p>
            </div>
          ) : <>
            <Pager page={sourceIssuePage} total={sourceIssuePageResult.total} onPageChange={setSourceIssuePage} />
            {sourceIssuePageResult.rows.map((source: any) => (
              <div key={source.id} className="glass-panel rounded-xl p-5 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-serif font-semibold">{source.name}</h3>
                    <p className="text-xs text-muted-foreground">{source.kind} · reliability {source.reliability_score}% · last success {source.last_success_at ? new Date(source.last_success_at).toLocaleDateString() : 'never'}</p>
                  </div>
                  <Badge variant="outline" className="bg-red-500/15 text-red-400 capitalize">{source.status}</Badge>
                </div>
                {source.last_error && <p className="text-sm text-muted-foreground line-clamp-2">{source.last_error}</p>}
                {source.base_url && <a href={source.base_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1"><ExternalLink className="h-3 w-3" />{source.base_url}</a>}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => sourceAction.mutate({ id: source.id, action: 'retry' })} disabled={sourceAction.isPending}><RefreshCw className="h-4 w-4 mr-1" />Re-activate</Button>
                  {source.status !== 'paused' && (
                    <Button size="sm" variant="outline" onClick={() => sourceAction.mutate({ id: source.id, action: 'pause' })} disabled={sourceAction.isPending}>Pause</Button>
                  )}
                </div>
              </div>
            ))}
            <Pager page={sourceIssuePage} total={sourceIssuePageResult.total} onPageChange={setSourceIssuePage} />
          </>}
        </TabsContent>

        <TabsContent value="official" className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Auto-published from official registries (World Bank, IFC, ADB, IADB, AIIB, GEM, EIB). These are already live —
            spot-check them here and unpublish anything that looks wrong; unpublished projects return to the Legacy Queue.
          </p>
          {officialPageResult.rows.length === 0 ? (
            <div className="glass-panel rounded-xl p-12 text-center">
              <FileCheck2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-serif text-lg font-semibold">No auto-published projects yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Official-registry ingest runs will publish here once the backfill cron is armed.</p>
            </div>
          ) : <>
            <Pager page={officialPage} total={officialPageResult.total} onPageChange={setOfficialPage} />
            {officialPageResult.rows.map((project: any) => (
              <div key={project.id} className="glass-panel rounded-xl p-5 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-serif font-semibold">{project.name}</h3>
                      <Badge variant="outline" className="border-sky-500/40 text-sky-400">Official registry</Badge>
                      <Badge variant="outline">{project.stage}</Badge>
                      {project.coord_precision && (
                        <Badge variant="outline" className="text-[10px] capitalize">
                          <MapPin className="h-3 w-3 mr-1" />{project.coord_precision === 'exact' ? 'Exact location' : 'Country-level location'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {project.country} · {project.sector || 'Unknown sector'} · {project.value_label} · confidence {project.confidence}%
                      {project.last_updated ? ` · published ${new Date(project.last_updated).toLocaleDateString()}` : ''}
                    </p>
                    {project.source_url && (
                      <a href={project.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />{project.source_url}
                      </a>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-400 hover:text-red-300 shrink-0"
                    onClick={() => unpublishMutation.mutate(project.id)}
                    disabled={unpublishMutation.isPending}
                  >
                    <X className="h-4 w-4 mr-1" />Unpublish
                  </Button>
                </div>
              </div>
            ))}
            <Pager page={officialPage} total={officialPageResult.total} onPageChange={setOfficialPage} />
          </>}
        </TabsContent>

        {/* Source Health was its own route until it moved here. It is the same
            job as the rest of this page - data hygiene - and sits next to
            Source Issues, which reports the problems it fixes. */}
        <TabsContent value="source-health" className="space-y-3">
          <SourceHealth />
        </TabsContent>
      </Tabs>

      <AlertDialog open={approveGuardOpen} onOpenChange={setApproveGuardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve without a reachable contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This project has no contact with a name, email or phone, and an http(s) source URL. Approve only if you accept publishing without a verifiable stakeholder reach path.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingApproveId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmApproveWithoutReachableContact}>Approve anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
