import { useSearchParams } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SourceHealth from './SourceHealth';
import { EscalationsPanel } from '@/components/dashboard/EscalationsPanel';
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

import { REVIEW_PAGE_SIZE, Pager, stageBadgeColor, type EvidenceRow, type ContactRow } from './review-queue/shared';
import { CandidatesTab, DuplicatesTab, PipelineTab, UpdatesTab, SourcesTab, OfficialTab } from './review-queue/tabs';
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

  // Count of items the automated checks refused to decide on their own.
  const { data: escalationCount = 0 } = useQuery({
    queryKey: ['agent-escalations-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('agent_escalations')
        .select('id', { count: 'exact', head: true })
        .in('status', ['open', 'acknowledged']);
      if (error) throw error;
      return count ?? 0;
    },
  });

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
      const { data, error, count } = await supabase
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
      const { data, error, count } = await supabase
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
      const { data, error, count } = await supabase
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
      const { data, error, count } = await supabase
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
        const { error } = await supabase
          .from('project_candidates')
          .update({ pipeline_status: 'merged', review_status: 'rejected', updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
        const { error: logErr } = await supabase
          .from('review_actions')
          .insert({ item_type: 'duplicate', candidate_id: id, action: 'merged', reason: 'Marked as duplicate / merged from verification workbench' });
        if (logErr) throw logErr;
        return;
      }
      // not_duplicate: clear the duplicate linkage and return the candidate to the review queue.
      const { error } = await supabase
        .from('project_candidates')
        .update({ duplicate_of: null, canonical_project_id: null, duplicate_confidence: null, pipeline_status: 'ready_for_review', review_status: 'ready_for_review', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      const { error: logErr } = await supabase
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
      const { error } = await supabase
        .from('source_registry')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      const { error: logErr } = await supabase
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
        const { error } = await supabase.rpc('promote_project_candidate', {
          p_candidate_id: id,
          p_reason: 'Approved from verification workbench',
        });
        if (error) throw error;
        return;
      }
      if (action === 'rejected') {
        // Use RPC so a rejection signature is recorded and the candidate
        // can never re-appear in the queue via future agent runs.
        const { error } = await supabase.rpc('reject_project_candidate', {
          p_candidate_id: id,
          p_reason: 'Rejected from verification workbench',
        });
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from('project_candidates')
        .update({ review_status: 'needs_research', pipeline_status: 'needs_research', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      const { error: logErr } = await supabase
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
        const { error } = await supabase.rpc('apply_update_proposal', {
          p_update_proposal_id: id,
          p_reason: 'Approved from verification workbench',
        });
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from('update_proposals')
        .update({ status: action, reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      const { error: logErr } = await supabase
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
        <TabsList className="grid h-auto w-full grid-cols-1 gap-1 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 bg-muted/60 [&>button]:min-w-0 [&>button]:whitespace-normal [&>button]:min-h-10">
          <TabsTrigger value="escalations">Needs a human ({escalationCount})</TabsTrigger>
          <TabsTrigger value="candidates">Legacy Queue ({pendingPageResult.total})</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline Candidates ({candidatePageResult.total})</TabsTrigger>
          <TabsTrigger value="duplicates">Duplicates ({duplicatePageResult.total})</TabsTrigger>
          <TabsTrigger value="updates">Update Proposals ({updatePageResult.total})</TabsTrigger>
          <TabsTrigger value="sources">Source Issues ({sourceIssuePageResult.total})</TabsTrigger>
          <TabsTrigger value="official">Published (official) ({officialPageResult.total})</TabsTrigger>
          <TabsTrigger value="source-health">Source Health</TabsTrigger>
        </TabsList>

        <TabsContent value="candidates" className="space-y-4">
          <CandidatesTab pending={pending} hasSource={hasSource} projectEvidence={projectEvidence} projectContacts={projectContacts} rejectMutation={rejectMutation} approveMutation={approveMutation} requestApprove={requestApprove} expandedId={expandedId} setExpandedId={setExpandedId} verifyEvidence={verifyEvidence} verifyContact={verifyContact} legacyPage={legacyPage} total={pendingPageResult.total} setLegacyPage={setLegacyPage} />
        </TabsContent>

        <TabsContent value="duplicates" className="space-y-3">
          <DuplicatesTab rows={duplicatePageResult.rows} total={duplicatePageResult.total} page={duplicatePage} onPageChange={setDuplicatePage} duplicateAction={duplicateAction} candidateAction={candidateAction} />
        </TabsContent>

        <TabsContent value="pipeline" className="space-y-3">
          <PipelineTab candidates={candidates} total={candidatePageResult.total} page={candidatePage} onPageChange={setCandidatePage} candidateAction={candidateAction} />
        </TabsContent>

        <TabsContent value="updates" className="space-y-3">
          <UpdatesTab proposals={updateProposals} total={updatePageResult.total} page={updatePage} onPageChange={setUpdatePage} updateAction={updateAction} />
        </TabsContent>

        <TabsContent value="sources" className="space-y-3">
          <SourcesTab rows={sourceIssuePageResult.rows} total={sourceIssuePageResult.total} page={sourceIssuePage} onPageChange={setSourceIssuePage} sourceAction={sourceAction} />
        </TabsContent>

        <TabsContent value="official" className="space-y-3">
          <OfficialTab rows={officialPageResult.rows} total={officialPageResult.total} page={officialPage} onPageChange={setOfficialPage} unpublishMutation={unpublishMutation} />
        </TabsContent>

        {/* Source Health was its own route until it moved here. It is the same
            job as the rest of this page - data hygiene - and sits next to
            Source Issues, which reports the problems it fixes. */}
        <TabsContent value="source-health" className="space-y-3">
          <SourceHealth />
        </TabsContent>

        {/* Anything an automated step refuses to decide lands here. */}
        <TabsContent value="escalations" className="space-y-3">
          <EscalationsPanel />
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
