import { useState, useEffect } from 'react';
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
import { ArrowLeft, Calendar, MapPin, Users, ExternalLink, ShieldCheck, TrendingUp, Edit, Trash2, Plus, Globe, X, Check, Phone, Mail, ShieldAlert, History, HardHat, Building2, Landmark, Briefcase, UserCheck, Star } from 'lucide-react';
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

const EVIDENCE_TYPES = ['Satellite', 'Filing', 'News', 'Registry', 'Partner'] as const;

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const { projects, loading } = useProjects();
  const { isTracked, toggleTrack } = useTrackedProjects();
  const project = projects.find(p => p.id === id);
  const canEdit = hasRole('admin') || hasRole('researcher');
  const canDelete = hasRole('admin');

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
  const [ctType, setCtType] = useState('general');
  // Verification toggle state
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [verifyAction, setVerifyAction] = useState<'verified' | 'unverified'>('verified');
  const [verifyReason, setVerifyReason] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verificationLog, setVerificationLog] = useState<any[]>([]);

  // Fetch verification log
  useEffect(() => {
    if (!project?.dbId) return;
    supabase
      .from('project_verification_log' as any)
      .select('*')
      .eq('project_id', project.dbId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setVerificationLog(data);
      });
  }, [project?.dbId, verifyLoading]);

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
      await supabase.from('project_verification_log' as any).insert({
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
        added_by: 'human',
      } as any);
      toast({ title: 'Contact added' });
      setShowAddContact(false);
      setCtName(''); setCtRole(''); setCtOrg(''); setCtPhone(''); setCtEmail(''); setCtType('general');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const toggleContactVerified = async (contactId: string, current: boolean) => {
    await supabase.from('project_contacts').update({ verified: !current } as any).eq('id', contactId);
    toast({ title: current ? 'Marked unverified' : 'Marked verified' });
  };

  const deleteContact = async (contactId: string) => {
    await supabase.from('project_contacts').delete().eq('id', contactId);
    toast({ title: 'Contact removed' });
  };

  const toggleVerified = async (evidenceId: string, current: boolean) => {
    await supabase.from('evidence_sources').update({ verified: !current } as any).eq('id', evidenceId);
    toast({ title: current ? 'Marked unverified' : 'Marked verified' });
  };

  const deleteEvidence = async (evidenceId: string) => {
    await supabase.from('evidence_sources').delete().eq('id', evidenceId);
    toast({ title: 'Source removed' });
  };

  const toggleMilestone = async (milestoneId: string, current: boolean) => {
    await supabase.from('project_milestones').update({ completed: !current }).eq('id', milestoneId);
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

  return (
    <div className="space-y-6 max-w-4xl">
      <Link to="/dashboard/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" />Back to projects</Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-2xl font-bold">{project.name}</h1>
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
          {/* Track/Bookmark button — all roles */}
          {project.dbId && (
            <Button size="sm" variant="outline" onClick={() => toggleTrack(project.dbId!)} className={isTracked(project.dbId) ? 'text-amber-400 border-amber-400/30' : ''}>
              <Star className={`h-3 w-3 mr-1 ${isTracked(project.dbId) ? 'fill-amber-400' : ''}`} />
              {isTracked(project.dbId) ? 'Tracked' : 'Track'}
            </Button>
          )}
          {canEdit && (
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
              <Link to={`/dashboard/projects/${project.id}/edit`}>
                <Button size="sm" variant="outline"><Edit className="h-3 w-3 mr-1" />Edit</Button>
              </Link>
            </>
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
        <TabsList className="bg-black/20">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="contacts">Contacts ({contacts.length})</TabsTrigger>
          <TabsTrigger value="evidence">Evidence ({project.evidence.length})</TabsTrigger>
          <TabsTrigger value="timeline">Timeline ({project.milestones.length})</TabsTrigger>
          <TabsTrigger value="verification">Verification ({verificationLog.length})</TabsTrigger>
        </TabsList>

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
          <div className="glass-panel rounded-xl p-5 space-y-2">
            {!project.detailedAnalysis && !project.keyRisks && !project.fundingSources && !project.environmentalImpact && !project.politicalContext ? (
              <p className="text-sm text-muted-foreground">No analysis content yet. <Link to={`/dashboard/projects/${project.id}/edit`} className="text-primary hover:underline">Add analysis →</Link></p>
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
              {canEdit && (
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

            {/* Group contacts by type — contractors first */}
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
                          <button onClick={() => toggleContactVerified(c.id, c.verified)}>
                            {c.verified
                              ? <Badge className="bg-emerald-500/20 text-emerald-500 text-[10px] cursor-pointer hover:bg-emerald-500/30"><Check className="h-2 w-2 mr-0.5" />Verified</Badge>
                              : <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 cursor-pointer hover:bg-amber-500/10">Unverified</Badge>}
                          </button>
                          <button onClick={() => deleteContact(c.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
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
              {canEdit && (
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
                    <button onClick={() => toggleVerified(e.id, e.verified)}>
                      {e.verified
                        ? <Badge className="bg-emerald-500/20 text-emerald-500 text-[10px] cursor-pointer hover:bg-emerald-500/30"><Check className="h-2 w-2 mr-0.5" />Verified</Badge>
                        : <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 cursor-pointer hover:bg-amber-500/10">Unverified</Badge>}
                    </button>
                    {e.url && e.url !== '#' && (
                      <a href={e.url} target="_blank" rel="noopener"><ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary" /></a>
                    )}
                    <button onClick={() => deleteEvidence(e.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
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
                  <button onClick={() => toggleMilestone(m.id, m.completed)} className={`h-4 w-4 rounded-full shrink-0 border-2 cursor-pointer ${m.completed ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground hover:border-primary'}`} />
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
      </Tabs>
    </div>
  );
}
