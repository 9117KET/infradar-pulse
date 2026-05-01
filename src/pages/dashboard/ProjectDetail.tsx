import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useProjects } from '@/hooks/use-projects';
import { useAuth } from '@/contexts/AuthContext';
import { useTrackedProjects } from '@/hooks/use-tracked-projects';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Calendar, MapPin, Users, ExternalLink, ShieldCheck, TrendingUp, Edit, Trash2, Plus, Globe, X, Check, Phone, Mail, ShieldAlert, History, HardHat, Building2, Landmark, Briefcase, UserCheck, Star, Bot, Loader2, Activity, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import { applyPdfWatermark, buildWatermarkLabel } from '@/lib/billing/exportCaps';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';
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

const EVIDENCE_TYPES = ['Satellite', 'Filing', 'News', 'Registry', 'Partner'] as const;

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
    const { error } = await supabase.from('project_contacts').update({ verified: !current } as any).eq('id', contactId);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: current ? 'Marked unverified' : 'Marked verified' });
  };

  const deleteContact = async (contactId: string) => {
    const { error } = await supabase.from('project_contacts').delete().eq('id', contactId);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Contact removed' });
  };

  const toggleVerified = async (evidenceId: string, current: boolean) => {
    const { error } = await supabase.from('evidence_sources').update({ verified: !current } as any).eq('id', evidenceId);
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

  const AnalysisSection = ({ title, content }: { title: string; content?: string }) => {
    if (!content) return null;
    return (
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-primary mb-1">{title}</h4>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{content}</p>
      </div>
    );
  };

  const downloadTearsheet = async () => {
    if (!canExportPdf) { setTearsheetUpgradeOpen(true); return; }
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;
    const colRight = pageW / 2 + 5;
    let y = 15;

    // Header bar
    doc.setFillColor(30, 30, 45);
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(project.name, margin, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(180, 180, 200);
    doc.text(`${project.country} · ${project.region} · ${project.sector}`, margin, 22);
    doc.text('InfradarAI Intelligence', pageW - margin, 22, { align: 'right' });
    y = 36;

    // Key metrics row
    const metrics = [
      { label: 'Stage', value: project.stage },
      { label: 'Status', value: project.status },
      { label: 'Value', value: project.valueLabel || 'N/A' },
      { label: 'Confidence', value: `${project.confidence}%` },
      { label: 'Risk Score', value: String(project.riskScore ?? 'N/A') },
    ];
    const boxW = (pageW - margin * 2 - 4 * 4) / 5;
    metrics.forEach((m, i) => {
      const bx = margin + i * (boxW + 4);
      doc.setFillColor(40, 40, 58);
      doc.roundedRect(bx, y, boxW, 18, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(200, 235, 255);
      doc.text(m.value, bx + boxW / 2, y + 9, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(130, 140, 160);
      doc.text(m.label, bx + boxW / 2, y + 15, { align: 'center' });
    });
    y += 26;

    // Description
    if (project.description) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(220, 220, 235);
      doc.text('Project Overview', margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(160, 165, 180);
      const descLines = doc.splitTextToSize(project.description, pageW - margin * 2);
      doc.text(descLines.slice(0, 6), margin, y);
      y += Math.min(descLines.length, 6) * 4.5 + 6;
    }

    // Two-column: Contacts (left) + Key facts (right)
    const colStart = y;
    const halfW = (pageW - margin * 2 - 8) / 2;

    // Left: contacts
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(220, 220, 235);
    doc.text('Key Contacts', margin, colStart);
    let leftY = colStart + 6;
    const contactList = (project.contacts || []).slice(0, 5);
    if (contactList.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(120, 125, 140);
      doc.text('No contacts recorded', margin, leftY);
      leftY += 5;
    } else {
      contactList.forEach(c => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(200, 210, 230);
        doc.text(c.name || 'Unknown', margin, leftY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(130, 140, 155);
        doc.text(`${c.role || ''} · ${c.organization || ''}`, margin, leftY + 4);
        leftY += 10;
      });
    }

    // Right: Key facts
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(220, 220, 235);
    doc.text('Project Details', colRight, colStart);
    let rightY = colStart + 6;
    const facts = [
      ['Country', project.country],
      ['Region', project.region],
      ['Sector', project.sector],
      ['Stage', project.stage],
      ['Last Updated', project.lastUpdated || 'N/A'],
      ...(project.sourceUrl ? [['Source', project.sourceUrl.slice(0, 40)]] : []),
    ] as [string, string][];
    facts.forEach(([k, v]) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(140, 150, 165);
      doc.text(k + ':', colRight, rightY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(200, 210, 225);
      doc.text(v, colRight + 28, rightY);
      rightY += 5.5;
    });

    y = Math.max(leftY, rightY) + 6;

    // AI Analysis excerpt (if available)
    if (project.detailedAnalysis) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(220, 220, 235);
      doc.text('AI Analysis (excerpt)', margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(150, 160, 175);
      const analysisLines = doc.splitTextToSize(project.detailedAnalysis, pageW - margin * 2);
      doc.text(analysisLines.slice(0, 8), margin, y);
    }

    const watermark = buildWatermarkLabel(user?.email);
    applyPdfWatermark(doc, watermark);
    const slug = project.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    doc.save(`infradar_tearsheet_${slug}.pdf`);

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
          <Badge variant="outline">{project.stage}</Badge>
          <Badge variant="outline">{project.sector}</Badge>
          {/* Track/bookmark button (all roles) */}
          {project.dbId && (
            <Button size="sm" variant="outline" onClick={() => toggleTrack(project.dbId!)} className={isTracked(project.dbId) ? 'text-amber-400 border-amber-400/30' : ''}>
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
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="glass-panel rounded-xl p-4 text-center">
          <TrendingUp className="h-5 w-5 mx-auto mb-1 text-primary" />
          <div className="text-2xl font-bold">{project.confidence}%</div>
          <div className="text-xs text-muted-foreground">Confidence</div>
        </div>
        <div className="glass-panel rounded-xl p-4 text-center">
          <ShieldCheck className="h-5 w-5 mx-auto mb-1 text-amber-500" />
          <div className="text-2xl font-bold">{project.riskScore}</div>
          <div className="text-xs text-muted-foreground">Risk Score</div>
        </div>
        <div className="glass-panel rounded-xl p-4 text-center">
          <Calendar className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
          <div className="text-sm font-bold mt-1">{project.timeline}</div>
          <div className="text-xs text-muted-foreground">Timeline</div>
        </div>
        <div className="glass-panel rounded-xl p-4 text-center">
          <MapPin className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
          <div className="text-sm font-bold mt-1">{project.country}</div>
          <div className="text-xs text-muted-foreground">{project.region}</div>
        </div>
      </div>

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
        <TabsContent value="overview" className="space-y-4">
          <div className="glass-panel rounded-xl p-5">
            <p className="text-muted-foreground">{project.description}</p>
          </div>
          <div className="glass-panel rounded-xl p-5">
            <h3 className="font-serif text-lg font-semibold mb-3 flex items-center gap-2"><Users className="h-4 w-4" />Stakeholders</h3>
            <div className="flex flex-wrap gap-2">
              {project.stakeholders.map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
              {project.stakeholders.length === 0 && <p className="text-sm text-muted-foreground">No stakeholders listed.</p>}
            </div>
          </div>
        </TabsContent>

        {/* Analysis */}
        <TabsContent value="analysis">
          <div
            {...analysisCopyProps}
            className={`glass-panel rounded-xl p-5 space-y-2 ${analysisCopyProps.className}`}
          >
            {!project.detailedAnalysis && !project.keyRisks && !project.fundingSources && !project.environmentalImpact && !project.politicalContext ? (
              <p className="text-sm text-muted-foreground">
                No analysis content yet.
                {canEditMetadata && (
                  <> <Link to={`/dashboard/projects/${project.id}/edit`} className="text-primary hover:underline">Add analysis →</Link></>
                )}
              </p>
            ) : (
              <>
                <AnalysisSection title="Detailed Analysis" content={project.detailedAnalysis} />
                <AnalysisSection title="Key Risks" content={project.keyRisks} />
                <AnalysisSection title="Funding Sources" content={project.fundingSources} />
                <AnalysisSection title="Environmental Impact" content={project.environmentalImpact} />
                <AnalysisSection title="Political Context" content={project.politicalContext} />
              </>
            )}
          </div>
        </TabsContent>

        {/* Contacts */}
        <TabsContent value="contacts" className="space-y-4">
          <div className="glass-panel rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif text-lg font-semibold flex items-center gap-2"><Phone className="h-4 w-4" />Verification Contacts</h3>
              {canModerate && (
                <Button size="sm" variant="outline" onClick={() => setShowAddContact(!showAddContact)}>
                  {showAddContact ? <X className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                  {showAddContact ? 'Cancel' : 'Add Contact'}
                </Button>
              )}
            </div>

            {showAddContact && (
              <div className="mb-4 p-4 rounded-lg border border-primary/20 bg-primary/5 space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input value={ctName} onChange={e => setCtName(e.target.value)} placeholder="Name *" className="bg-black/20" />
                  <Input value={ctRole} onChange={e => setCtRole(e.target.value)} placeholder="Role / Title" className="bg-black/20" />
                  <Input value={ctOrg} onChange={e => setCtOrg(e.target.value)} placeholder="Organization" className="bg-black/20" />
                </div>
                <Input value={ctSourceUrl} onChange={e => setCtSourceUrl(e.target.value)} placeholder="Source URL (https://...) *" className="bg-black/20" />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input value={ctPhone} onChange={e => setCtPhone(e.target.value)} placeholder="Phone number" className="bg-black/20" />
                  <Input value={ctEmail} onChange={e => setCtEmail(e.target.value)} placeholder="Email" className="bg-black/20" />
                  <Select value={ctType} onValueChange={setCtType}>
                    <SelectTrigger className="bg-black/20"><SelectValue placeholder="Contact Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contractor">Contractor</SelectItem>
                      <SelectItem value="government">Government</SelectItem>
                      <SelectItem value="financier">Financier</SelectItem>
                      <SelectItem value="consultant">Consultant</SelectItem>
                      <SelectItem value="owner">Project Owner</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" onClick={handleAddContact}>Add Contact</Button>
              </div>
            )}

            {contacts.length === 0 && <p className="text-sm text-muted-foreground">No contacts found yet. The Contact Finder agent will discover contacts automatically.</p>}

            {/* Group contacts by type (contractors first) */}
            {(() => {
              const typeOrder = ['contractor', 'government', 'owner', 'financier', 'consultant', 'general'];
              const typeLabels: Record<string, string> = { contractor: 'Contractors', government: 'Government', owner: 'Project Owners', financier: 'Financiers', consultant: 'Consultants', general: 'Other' };
              const typeIcons: Record<string, any> = { contractor: HardHat, government: Landmark, owner: Building2, financier: Briefcase, consultant: UserCheck, general: Users };

              const grouped: Record<string, typeof contacts> = {};
              contacts.forEach(c => {
                const t = (c as any).contact_type || 'general';
                if (!grouped[t]) grouped[t] = [];
                grouped[t].push(c);
              });

              return typeOrder.filter(t => grouped[t]?.length).map(t => {
                const Icon = typeIcons[t] || Users;
                return (
                  <div key={t} className="space-y-2 mt-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Icon className="h-3 w-3" />{typeLabels[t] || t} ({grouped[t].length})
                    </h4>
                    {grouped[t].map(c => (
                      <div key={c.id} className={`flex items-center justify-between p-3 rounded-lg border ${t === 'contractor' ? 'bg-amber-500/5 border-amber-500/20' : 'bg-white/[0.02] border-white/5'}`}>
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{c.name}</span>
                            {t === 'contractor' && <Badge className="text-[9px] bg-amber-500/20 text-amber-400">Contractor</Badge>}
                            {c.added_by === 'human' && <Badge className="text-[9px] bg-blue-500/20 text-blue-400">Human</Badge>}
                            {c.added_by === 'ai' && <Badge className="text-[9px] bg-purple-500/20 text-purple-400">AI</Badge>}
                          </div>
                          {(c.role || c.organization) && (
                            <p className="text-xs text-muted-foreground">
                              {c.role}{c.role && c.organization ? ' · ' : ''}{c.organization}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            {c.phone && (
                              <a href={`tel:${c.phone}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                                <Phone className="h-3 w-3" />{c.phone}
                              </a>
                            )}
                            {c.email && (
                              <a href={`mailto:${c.email}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                                <Mail className="h-3 w-3" />{c.email}
                              </a>
                            )}
                          </div>
                          {c.source && <p className="text-[10px] text-muted-foreground">Source: {c.source}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {canModerate && (
                            <>
                              <button type="button" onClick={() => toggleContactVerified(c.id, c.verified)}>
                                {c.verified
                                  ? <Badge className="bg-emerald-500/20 text-emerald-500 text-[10px] cursor-pointer hover:bg-emerald-500/30"><Check className="h-2 w-2 mr-0.5" />Verified</Badge>
                                  : <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 cursor-pointer hover:bg-amber-500/10">Unverified</Badge>}
                              </button>
                              <button type="button" onClick={() => deleteContact(c.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              });
            })()}
          </div>
        </TabsContent>

        {/* Evidence */}
        <TabsContent value="evidence" className="space-y-4">
          <div className="glass-panel rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif text-lg font-semibold">Evidence Sources</h3>
              {canModerate && (
                <Button size="sm" variant="outline" onClick={() => setShowAddEvidence(!showAddEvidence)}>
                  {showAddEvidence ? <X className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                  {showAddEvidence ? 'Cancel' : 'Add Source'}
                </Button>
              )}
            </div>

            {showAddEvidence && (
              <div className="mb-4 p-4 rounded-lg border border-primary/20 bg-primary/5 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input value={evSource} onChange={e => setEvSource(e.target.value)} placeholder="Source name *" className="bg-black/20" />
                  <Input value={evUrl} onChange={e => setEvUrl(e.target.value)} placeholder="URL (https://...)" className="bg-black/20" />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Select value={evType} onValueChange={setEvType}>
                    <SelectTrigger className="bg-black/20"><SelectValue /></SelectTrigger>
                    <SelectContent>{EVIDENCE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input value={evDate} onChange={e => setEvDate(e.target.value)} placeholder="Date" className="bg-black/20" />
                  <Input value={evDesc} onChange={e => setEvDesc(e.target.value)} placeholder="Description" className="bg-black/20" />
                </div>
                <Button size="sm" onClick={handleAddEvidence}>Add Evidence</Button>
              </div>
            )}

            <div className="space-y-2">
              {project.evidence.length === 0 && <p className="text-sm text-muted-foreground">No evidence sources yet.</p>}
              {project.evidence.map(e => (
                <div key={e.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/5">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Badge variant="outline" className="text-[10px] shrink-0">{e.type}</Badge>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{e.source}</span>
                        {e.added_by === 'human' && <Badge className="text-[9px] bg-blue-500/20 text-blue-400">Human</Badge>}
                        {e.added_by === 'ai' && <Badge className="text-[9px] bg-purple-500/20 text-purple-400">AI</Badge>}
                      </div>
                      {e.description && <p className="text-xs text-muted-foreground truncate">{e.description}</p>}
                      <span className="text-xs text-muted-foreground">{e.date}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canModerate && (
                      <>
                        <button type="button" onClick={() => toggleVerified(e.id, e.verified)}>
                          {e.verified
                            ? <Badge className="bg-emerald-500/20 text-emerald-500 text-[10px] cursor-pointer hover:bg-emerald-500/30"><Check className="h-2 w-2 mr-0.5" />Verified</Badge>
                            : <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 cursor-pointer hover:bg-amber-500/10">Unverified</Badge>}
                        </button>
                        <button type="button" onClick={() => deleteEvidence(e.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                      </>
                    )}
                    {e.url && e.url !== '#' && (
                      <a href={e.url} target="_blank" rel="noopener"><ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary" /></a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Timeline */}
        <TabsContent value="timeline">
          <div className="glass-panel rounded-xl p-5">
            <h3 className="font-serif text-lg font-semibold mb-3">Milestones</h3>
            <div className="space-y-3">
              {project.milestones.length === 0 && <p className="text-sm text-muted-foreground">No milestones yet.</p>}
              {project.milestones.map(m => (
                <div key={m.id} className="flex items-center gap-3">
                  {canModerate ? (
                    <button type="button" onClick={() => toggleMilestone(m.id, m.completed)} className={`h-4 w-4 rounded-full shrink-0 border-2 cursor-pointer ${m.completed ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground hover:border-primary'}`} />
                  ) : (
                    <span className={`h-4 w-4 rounded-full shrink-0 border-2 ${m.completed ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground'}`} />
                  )}
                  <div className="flex-1">
                    <span className="text-sm">{m.title}</span>
                    <span className="text-xs text-muted-foreground ml-2">{m.date}</span>
                  </div>
                  {m.completed && <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">Complete</Badge>}
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Verification History */}
        <TabsContent value="verification">
          <div className="glass-panel rounded-xl p-5">
            <h3 className="font-serif text-lg font-semibold mb-3 flex items-center gap-2"><History className="h-4 w-4" />Verification History</h3>
            <div className="space-y-3">
              {verificationLog.length === 0 && <p className="text-sm text-muted-foreground">No verification changes recorded yet.</p>}
              {verificationLog.map((entry: any) => (
                <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                  <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${entry.action === 'verified' ? 'bg-emerald-500' : 'bg-destructive'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] ${entry.action === 'verified' ? 'text-emerald-500 border-emerald-500/30' : 'text-destructive border-destructive/30'}`}>
                        {entry.action === 'verified' ? 'Verified' : 'Unverified'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleDateString()} {new Date(entry.created_at).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{entry.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Changelog */}
        <TabsContent value="changelog">
          <div className="glass-panel rounded-xl p-5">
            <h3 className="font-serif text-lg font-semibold mb-4 flex items-center gap-2">
              <History className="h-4 w-4" /> Project Changelog
            </h3>
            {changelog.length === 0 ? (
              <p className="text-sm text-muted-foreground">No changes recorded yet. Changes are tracked automatically when project data is updated.</p>
            ) : (
              <div className="space-y-1">
                {changelog.reduce((acc: { date: string; entries: typeof changelog }[], entry: any) => {
                  const date = new Date(entry.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
                  const last = acc[acc.length - 1];
                  if (last?.date === date) { last.entries.push(entry); }
                  else { acc.push({ date, entries: [entry] }); }
                  return acc;
                }, []).map((group: any) => (
                  <div key={group.date}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-2 border-b border-border/40 mb-2">{group.date}</p>
                    <div className="space-y-2 mb-4">
                      {group.entries.map((entry: any) => {
                        const fieldLabel = entry.field_changed
                          .replace(/_/g, ' ')
                          .replace(/\b\w/g, (c: string) => c.toUpperCase());
                        const timeStr = new Date(entry.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                        return (
                          <div key={entry.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                            <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-[9px]">{fieldLabel}</Badge>
                                {entry.old_value && (
                                  <span className="text-[11px] text-muted-foreground line-through">{String(entry.old_value).substring(0, 60)}</span>
                                )}
                                {entry.old_value && entry.new_value && <span className="text-[11px] text-muted-foreground">→</span>}
                                {entry.new_value && (
                                  <span className="text-[11px] text-emerald-400">{String(entry.new_value).substring(0, 60)}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {entry.source && (
                                  <Badge variant="secondary" className="text-[9px]">{entry.source}</Badge>
                                )}
                                <span className="text-[10px] text-muted-foreground">{timeStr}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Risk History */}
        <TabsContent value="risk-history">
          <div className="glass-panel rounded-xl p-5">
            <h3 className="font-serif text-lg font-semibold mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4" /> Risk Score History
            </h3>
            {riskHistory.length < 2 ? (
              <div className="text-center py-10">
                <Activity className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Not enough data yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Risk score changes are recorded automatically when the project is re-scored.</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
                  <span>Current: <strong className={`${project.riskScore >= 70 ? 'text-red-400' : project.riskScore >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>{project.riskScore}</strong></span>
                  <span>Changes recorded: <strong className="text-foreground">{riskHistory.length}</strong></span>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={riskHistory} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={30} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(210 12% 9%)', border: '1px solid hsl(210 10% 18%)', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => [v, 'Risk Score']}
                    />
                    <ReferenceLine y={70} stroke="hsl(0 72% 51% / 0.4)" strokeDasharray="4 2" label={{ value: 'High', fontSize: 10, fill: 'hsl(0 72% 51% / 0.6)' }} />
                    <ReferenceLine y={40} stroke="hsl(38 92% 50% / 0.4)" strokeDasharray="4 2" label={{ value: 'Med', fontSize: 10, fill: 'hsl(38 92% 50% / 0.6)' }} />
                    <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3, fill: 'hsl(var(--primary))' }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
