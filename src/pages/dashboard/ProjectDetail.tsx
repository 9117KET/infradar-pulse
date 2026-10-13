import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useProjects } from '@/hooks/use-projects';
import { useAuth } from '@/contexts/AuthContext';
import { useTrackedProjects } from '@/hooks/use-tracked-projects';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Globe, Star, Clock, Download, ShieldAlert, ShieldCheck, Edit, Bot, Loader2, Trash2 } from 'lucide-react';
import { ProvenanceBadge } from '@/components/dashboard/ProvenanceBadge';
import { formatDistanceToNow } from 'date-fns';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { agentApi } from '@/lib/api/agents';
import { isReachableContact } from '@/lib/contact-validation';
import { canDeleteProject, canEditProject } from '@/lib/project-permissions';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useCopyProtection } from '@/hooks/useCopyProtection';
import { trackUsage } from '@/lib/billing/trackUsage';


import { OverviewTab } from './project-detail/OverviewTab';
import { AnalysisTab } from './project-detail/AnalysisTab';
import { ContactsTab } from './project-detail/ContactsTab';
import { EvidenceTab } from './project-detail/EvidenceTab';
import { TimelineTab } from './project-detail/TimelineTab';
import { VerificationTab } from './project-detail/VerificationTab';
import { ChangelogTab } from './project-detail/ChangelogTab';
import { RiskHistoryTab } from './project-detail/RiskHistoryTab';
import { ProjectScores } from './project-detail/ProjectScores';
import { exportTearsheet } from './project-detail/exportTearsheet';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasRole, user, roles } = useAuth();
  const { projects, loading } = useProjects();
  const { isTracked, toggleTrack } = useTrackedProjects();
  const project = projects.find(p => p.id === id);
  const canEditMetadata = project ? canEditProject(user?.id, roles, project) : false;
  const canDelete = project ? canDeleteProject(user?.id, roles, project) : false;
  /** Verify, evidence, contacts, agents — researcher + admin only (plan table). */
  const canModerate = hasRole('admin') || hasRole('researcher');

  // Copy/paste deterrent on the proprietary Analysis section for free + trial users.
  const { staffBypass, isFreeTier, plan, canExportPdf, refresh: refreshEntitlements } = useEntitlements();
  const [tearsheetUpgradeOpen, setTearsheetUpgradeOpen] = useState(false);
  const protectAnalysis = !!user && !staffBypass && (isFreeTier || plan === 'trialing');
  const analysisCopyProps = useCopyProtection(
    protectAnalysis,
    `Excerpted from InfradarAI — full analysis: ${typeof window !== 'undefined' ? window.location.href : 'infradarai.com'} · Subscribe for unlimited access.`,
  );

  // Evidence form state
  const [showAddEvidence, setShowAddEvidence] = useState(false);
  const [evSource, setEvSource] = useState('');
  const [evUrl, setEvUrl] = useState('');
  const [evType, setEvType] = useState<string>('News');
  const [evDesc, setEvDesc] = useState('');
  const [evDate, setEvDate] = useState(new Date().toISOString().split('T')[0]);

  // Contact form state
  const [showAddContact, setShowAddContact] = useState(false);
  const [ctName, setCtName] = useState('');
  const [ctRole, setCtRole] = useState('');
  const [ctOrg, setCtOrg] = useState('');
  const [ctPhone, setCtPhone] = useState('');
  const [ctEmail, setCtEmail] = useState('');
  const [ctSourceUrl, setCtSourceUrl] = useState('');
  const [ctType, setCtType] = useState('general');
  const [contactFinderLoading, setContactFinderLoading] = useState(false);
  // Verification toggle state
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [verifyAction, setVerifyAction] = useState<'verified' | 'unverified'>('verified');
  const [verifyReason, setVerifyReason] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verificationLog, setVerificationLog] = useState<{ id: string; action: string; reason: string; performed_by: string | null; created_at: string }[]>([]);

  // Fetch verification log
  useEffect(() => {
    if (!project?.dbId) return;
    supabase
      .from('project_verification_log')
      .select('*')
      .eq('project_id', project.dbId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setVerificationLog(data);
      });
  }, [project?.dbId, verifyLoading]);

  const { data: changelog = [] } = useQuery({
    queryKey: ['project-changelog', project?.dbId],
    queryFn: async () => {
      if (!project?.dbId) return [];
      const { data } = await supabase
        .from('project_updates')
        .select('id, field_changed, old_value, new_value, source, created_at')
        .eq('project_id', project.dbId)
        .order('created_at', { ascending: false })
        .limit(100);
      return data ?? [];
    },
    enabled: !!project?.dbId,
  });

  const { data: riskHistory = [] } = useQuery({
    queryKey: ['project-risk-history', project?.dbId],
    queryFn: async () => {
      if (!project?.dbId) return [];
      const { data } = await supabase
        .from('project_updates')
        .select('new_value, created_at')
        .eq('project_id', project.dbId)
        .eq('field_changed', 'risk_score')
        .order('created_at', { ascending: true });
      return (data ?? []).map(d => ({
        date: new Date(d.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        score: parseFloat(d.new_value ?? '0'),
      }));
    },
    enabled: !!project?.dbId,
  });

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Project not found.</p>
        <Link to="/dashboard/projects"><Button variant="outline" className="mt-4">Back to projects</Button></Link>
      </div>
    );
  }

  const contacts = project.contacts || [];

  const handleVerificationToggle = async () => {
    if (!project.dbId || !verifyReason.trim()) return;
    setVerifyLoading(true);
    try {
      const newStatus = verifyAction === 'verified' ? 'Verified' : 'Pending';
      await supabase.from('projects').update({ status: newStatus as any }).eq('id', project.dbId);
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('project_verification_log').insert({
        project_id: project.dbId,
        action: verifyAction,
        reason: verifyReason,
        performed_by: user?.id,
      });
      toast({ title: verifyAction === 'verified' ? 'Project verified' : 'Project marked unverified', description: verifyReason });
      setShowVerifyDialog(false);
      setVerifyReason('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!project.dbId) return;
    try {
      await supabase.from('project_contacts').delete().eq('project_id', project.dbId);
      await supabase.from('project_stakeholders').delete().eq('project_id', project.dbId);
      await supabase.from('project_milestones').delete().eq('project_id', project.dbId);
      await supabase.from('evidence_sources').delete().eq('project_id', project.dbId);
      await supabase.from('projects').delete().eq('id', project.dbId);
      toast({ title: 'Deleted', description: `${project.name} has been removed.` });
      navigate('/dashboard/projects');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleAddEvidence = async () => {
    if (!project.dbId || !evSource.trim()) return;
    try {
      await supabase.from('evidence_sources').insert({
        project_id: project.dbId,
        source: evSource, url: evUrl || '#', type: evType as any,
        date: evDate, verified: false, title: evSource, description: evDesc, added_by: 'human',
      } as any);
      toast({ title: 'Source added' });
      setShowAddEvidence(false);
      setEvSource(''); setEvUrl(''); setEvDesc('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleAddContact = async () => {
    if (!project.dbId || !ctName.trim()) return;
    if (!isReachableContact({ name: ctName, email: ctEmail || null, phone: ctPhone || null, source_url: ctSourceUrl })) {
      toast({
        title: 'Incomplete contact',
        description: 'Add name, email or phone, and an http(s) source URL where this person is listed.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await supabase.from('project_contacts').insert({
        project_id: project.dbId,
        name: ctName,
        role: ctRole,
        organization: ctOrg,
        phone: ctPhone || null,
        email: ctEmail || null,
        contact_type: ctType,
        source: 'Manual entry',
        source_url: ctSourceUrl.trim(),
        added_by: 'human',
      } as any);
      toast({ title: 'Contact added' });
      setShowAddContact(false);
      setCtName(''); setCtRole(''); setCtOrg(''); setCtPhone(''); setCtEmail(''); setCtSourceUrl(''); setCtType('general');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleRunContactFinder = async () => {
    if (!project.dbId) return;
    setContactFinderLoading(true);
    try {
      const res = await agentApi.runContactFinder(project.dbId) as { contacts_added?: number; note?: string };
      toast({
        title: 'Contact finder finished',
        description: res?.note || (typeof res?.contacts_added === 'number' ? `Added ${res.contacts_added} contact(s). Refresh if needed.` : 'Done. Refresh if new contacts do not appear.'),
      });
    } catch (err: any) {
      toast({ title: 'Contact finder failed', description: err?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setContactFinderLoading(false);
    }
  };

  const toggleContactVerified = async (contactId: string, current: boolean) => {
    const { error } = await supabase.from('project_contacts').update({ verified: !current }).eq('id', contactId);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: current ? 'Marked unverified' : 'Marked verified' });
  };

  const deleteContact = async (contactId: string) => {
    const { error } = await supabase.from('project_contacts').delete().eq('id', contactId);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Contact removed' });
  };

  const toggleVerified = async (evidenceId: string, current: boolean) => {
    const { error } = await supabase.from('evidence_sources').update({ verified: !current }).eq('id', evidenceId);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: current ? 'Marked unverified' : 'Marked verified' });
  };

  const deleteEvidence = async (evidenceId: string) => {
    const { error } = await supabase.from('evidence_sources').delete().eq('id', evidenceId);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Source removed' });
  };

  const toggleMilestone = async (milestoneId: string, current: boolean) => {
    const { error } = await supabase.from('project_milestones').update({ completed: !current }).eq('id', milestoneId);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: current ? 'Milestone uncompleted' : 'Milestone completed' });
  };


  const downloadTearsheet = async () => {
    if (!canExportPdf) { setTearsheetUpgradeOpen(true); return; }
    exportTearsheet(project, user?.email);

    const trackResult = await trackUsage('export_pdf');
    if (!trackResult.ok) {
      if (trackResult.emailUnverified) {
        toast({ title: 'Confirm your email', description: 'Please verify your email before exporting.', variant: 'destructive' });
        return;
      }
      if (trackResult.overLimit) setTearsheetUpgradeOpen(true);
      toast({ title: 'Export limit reached', description: trackResult.message, variant: 'destructive' });
      return;
    }
    await refreshEntitlements();
    toast({ title: 'Tearsheet downloaded', description: `${project.name} exported as PDF.` });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <UpgradeDialog open={tearsheetUpgradeOpen} onOpenChange={setTearsheetUpgradeOpen} reason="export" />
      <Link to="/dashboard/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" />Back to projects</Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <h1 className="font-serif text-xl sm:text-2xl font-bold break-words min-w-0">{project.name}</h1>
          {project.sourceUrl && (
            <a href={project.sourceUrl} target="_blank" rel="noopener" className="text-primary hover:underline">
              <Globe className="h-4 w-4" />
            </a>
          )}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Badge variant="outline" className="border-primary/30 text-primary">{project.status}</Badge>
          <ProvenanceBadge provenance={project.provenance} />
          <Badge variant="outline">{project.stage}</Badge>
          <Badge variant="outline">{project.sector}</Badge>
          {project.lastUpdated && (
            <Badge variant="outline" className="text-muted-foreground gap-1 font-normal" title={`Last data update: ${project.lastUpdated}`}>
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(project.lastUpdated), { addSuffix: true })}
            </Badge>
          )}
          {/* Track/bookmark button (all roles) */}
          {project.dbId && (
            <Button size="sm" variant="outline" onClick={() => project.dbId && toggleTrack(project.dbId)} className={isTracked(project.dbId) ? 'text-amber-400 border-amber-400/30' : ''}>
              <Star className={`h-3 w-3 mr-1 ${isTracked(project.dbId) ? 'fill-amber-400' : ''}`} />
              {isTracked(project.dbId) ? 'Tracked' : 'Track'}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => void downloadTearsheet()}
            title={!canExportPdf ? 'Tearsheet PDF requires the Pro plan' : 'Download project tearsheet as PDF'}
          >
            <Download className="h-3 w-3 mr-1" />
            Tearsheet
            {!canExportPdf && <span className="ml-1 text-[9px] text-primary">PRO</span>}
          </Button>
          {canModerate && (
            <>
              {project.status === 'Verified' ? (
                <Button size="sm" variant="outline" className="text-destructive border-destructive/30" onClick={() => { setVerifyAction('unverified'); setShowVerifyDialog(true); }}>
                  <ShieldAlert className="h-3 w-3 mr-1" />Mark Unverified
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="text-emerald-500 border-emerald-500/30" onClick={() => { setVerifyAction('verified'); setShowVerifyDialog(true); }}>
                  <ShieldCheck className="h-3 w-3 mr-1" />Mark Verified
                </Button>
              )}
            </>
          )}
          {canEditMetadata && (
            <Link to={`/dashboard/projects/${project.id}/edit`}>
              <Button size="sm" variant="outline"><Edit className="h-3 w-3 mr-1" />Edit</Button>
            </Link>
          )}
          {canModerate && project.dbId && (
            <Button size="sm" variant="outline" disabled={contactFinderLoading} onClick={handleRunContactFinder}>
              {contactFinderLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Bot className="h-3 w-3 mr-1" />}
              Contact finder
            </Button>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="text-destructive border-destructive/30"><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
                  <AlertDialogDescription>This will permanently remove this project and all associated data.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Verification Dialog */}
      <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{verifyAction === 'verified' ? 'Mark Project as Verified' : 'Mark Project as Unverified'}</DialogTitle>
            <DialogDescription>
              {verifyAction === 'verified'
                ? 'Confirm that this project data has been verified and is accurate.'
                : 'Flag this project as unverified. Provide a reason so the team knows why.'}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={verifyReason}
            onChange={e => setVerifyReason(e.target.value)}
            placeholder="Reason for status change (required)..."
            className="bg-black/20"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVerifyDialog(false)}>Cancel</Button>
            <Button
              onClick={handleVerificationToggle}
              disabled={!verifyReason.trim() || verifyLoading}
              className={verifyAction === 'verified' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-destructive hover:bg-destructive/90'}
            >
              {verifyLoading ? 'Saving...' : verifyAction === 'verified' ? 'Confirm Verified' : 'Confirm Unverified'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Score badges */}
      <ProjectScores project={project} />

      {/* Tabbed content */}
      <Tabs defaultValue="overview" className="space-y-4">
        <div className="-mx-1 overflow-x-auto scrollbar-none">
          <TabsList className="bg-black/20 w-max">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
            <TabsTrigger value="contacts">Contacts ({contacts.length})</TabsTrigger>
            <TabsTrigger value="evidence">Evidence ({project.evidence.length})</TabsTrigger>
            <TabsTrigger value="timeline">Timeline ({project.milestones.length})</TabsTrigger>
            <TabsTrigger value="verification">Verification ({verificationLog.length})</TabsTrigger>
            <TabsTrigger value="changelog">Changelog {changelog.length > 0 && `(${changelog.length})`}</TabsTrigger>
            <TabsTrigger value="risk-history">Risk History</TabsTrigger>
          </TabsList>
        </div>

        {/* Overview */}
        <OverviewTab project={project} />

        {/* Analysis */}
        <AnalysisTab project={project} analysisCopyProps={analysisCopyProps} canEditMetadata={canEditMetadata} />

        {/* Contacts */}
        <ContactsTab contacts={contacts} canModerate={canModerate}
          showAddContact={showAddContact} setShowAddContact={setShowAddContact}
          ctName={ctName} setCtName={setCtName}
          ctRole={ctRole} setCtRole={setCtRole}
          ctOrg={ctOrg} setCtOrg={setCtOrg}
          ctPhone={ctPhone} setCtPhone={setCtPhone}
          ctEmail={ctEmail} setCtEmail={setCtEmail}
          ctSourceUrl={ctSourceUrl} setCtSourceUrl={setCtSourceUrl}
          ctType={ctType} setCtType={setCtType}
          handleAddContact={handleAddContact} toggleContactVerified={toggleContactVerified} deleteContact={deleteContact} />

        {/* Evidence */}
        <EvidenceTab project={project} canModerate={canModerate}
          showAddEvidence={showAddEvidence} setShowAddEvidence={setShowAddEvidence}
          evSource={evSource} setEvSource={setEvSource}
          evUrl={evUrl} setEvUrl={setEvUrl}
          evType={evType} setEvType={setEvType}
          evDesc={evDesc} setEvDesc={setEvDesc}
          evDate={evDate} setEvDate={setEvDate}
          handleAddEvidence={handleAddEvidence} toggleVerified={toggleVerified} deleteEvidence={deleteEvidence} />

        {/* Timeline */}
        <TimelineTab project={project} canModerate={canModerate} toggleMilestone={toggleMilestone} />

        {/* Verification History */}
        <VerificationTab verificationLog={verificationLog} />

        {/* Changelog */}
        <ChangelogTab changelog={changelog} />

        {/* Risk History */}
        <RiskHistoryTab project={project} riskHistory={riskHistory} />
      </Tabs>
    </div>
  );
}
