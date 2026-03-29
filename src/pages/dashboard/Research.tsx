import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Search, Globe, FileText, Bot, CheckCircle, Loader2, ExternalLink, Save, Clock, AlertTriangle, Mail, Phone, Building2, User, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { agentApi } from '@/lib/api/agents';
import { filterReachableContacts } from '@/lib/contact-validation';
import jsPDF from 'jspdf';

const STEPS = [
  { key: 'searching', label: 'Searching', icon: Search, progress: 20 },
  { key: 'scraping', label: 'Scraping', icon: Globe, progress: 40 },
  { key: 'extracting', label: 'Extracting', icon: FileText, progress: 70 },
  { key: 'enriching', label: 'Enriching', icon: Bot, progress: 90 },
  { key: 'completed', label: 'Complete', icon: CheckCircle, progress: 100 },
];

export default function Research() {
  const [query, setQuery] = useState('');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedProjects, setSavedProjects] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Poll active task
  const { data: activeTask } = useQuery({
    queryKey: ['research-task', activeTaskId],
    queryFn: async () => {
      if (!activeTaskId) return null;
      const { data } = await supabase
        .from('research_tasks')
        .select('*')
        .eq('id', activeTaskId)
        .single();
      return data;
    },
    enabled: !!activeTaskId,
    refetchInterval: (data) => {
      // In TanStack Query v5, refetchInterval receives the query object
      const task = typeof data === 'object' && data !== null && 'state' in data 
        ? (data as any).state?.data 
        : data;
      if (!task) return 2000;
      const status = task?.status;
      if (status === 'completed' || status === 'failed') return false;
      return 2000;
    },
  });

  // Research history
  const { data: history } = useQuery({
    queryKey: ['research-history'],
    queryFn: async () => {
      const { data } = await supabase
        .from('research_tasks')
        .select('*')
        .eq('task_type', 'user-research')
        .order('created_at', { ascending: false })
        .limit(10);
      return data || [];
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await agentApi.runUserResearch(query.trim());
      if (result.taskId) {
        setActiveTaskId(result.taskId);
        toast({ title: 'Research started', description: 'Watching agents work in real time...' });
      }
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to start research', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const result = activeTask?.result as Record<string, any> | null;
  const currentStep = result?.step || 'initializing';
  const isRunning = activeTask?.status === 'running' || activeTask?.status === 'pending';
  const isComplete = activeTask?.status === 'completed';
  const stepIndex = STEPS.findIndex(s => s.key === currentStep);
  const progressValue = stepIndex >= 0 ? STEPS[stepIndex].progress : 5;

  const handleSaveProject = async (project: any, index: number) => {
    const key = `${activeTaskId}-${index}`;
    if (savedProjects.has(key)) return;
    try {
      // Use project source_url, or fall back to research sources
      const sources = (result?.sources as any[]) || [];
      const fallbackUrl = sources[0]?.url || '';
      const sourceUrl = project.source_url || fallbackUrl;

      const { data: { user } } = await supabase.auth.getUser();
      const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const { data: inserted } = await supabase.from('projects').insert({
        name: project.name,
        slug,
        country: project.country || 'Unknown',
        description: project.description || '',
        sector: project.sector || 'Urban Development',
        region: 'MENA',
        stage: project.stage || 'Planned',
        status: 'Pending',
        lat: 0,
        lng: 0,
        approved: false,
        ai_generated: true,
        source_url: sourceUrl,
        value_label: project.value_label || 'Undisclosed',
        research_saved_by: user?.id ?? null,
      }).select('id').single();

      const trackSavedProject = async (projectId: string) => {
        if (!user?.id) return;
        const { error } = await supabase.from('tracked_projects' as any).insert({ user_id: user.id, project_id: projectId });
        if (error && (error as any).code !== '23505') {
          console.warn('track project:', error.message);
        }
        queryClient.invalidateQueries({ queryKey: ['tracked-projects'] });
      };

      // Only store "reachable" contacts: name + email|phone + http source
      if (inserted?.id && project.contacts?.length) {
        const resolveUrl = (c: any) => {
          if (c.source_url && String(c.source_url).trim().startsWith('http')) return String(c.source_url).trim();
          if (sourceUrl && String(sourceUrl).trim().startsWith('http')) return String(sourceUrl).trim();
          if (fallbackUrl && String(fallbackUrl).trim().startsWith('http')) return String(fallbackUrl).trim();
          return null;
        };
        const mapped = project.contacts.map((c: any) => ({
          project_id: inserted.id,
          name: (c.name || 'Unknown').trim() || 'Unknown',
          role: c.role || '',
          organization: c.organization || '',
          email: c.email || null,
          phone: c.phone || null,
          source: 'user-research',
          source_url: resolveUrl(c),
          added_by: 'ai',
          contact_type: 'general',
        }));
        const contactRows = filterReachableContacts(mapped);
        if (contactRows.length) await supabase.from('project_contacts').insert(contactRows);
        const skipped = (project.contacts?.length || 0) - contactRows.length;
        await trackSavedProject(inserted.id);
        setSavedProjects(prev => new Set(prev).add(key));
        toast({
          title: 'Saved to Review Queue',
          description: `${project.name}: ${contactRows.length} reachable contact(s) saved${skipped ? ` (${skipped} skipped — need name, email or phone, and http source)` : ''}. Added to your tracked list.`,
        });
        return;
      }

      if (inserted?.id) await trackSavedProject(inserted.id);
      setSavedProjects(prev => new Set(prev).add(key));
      toast({ title: 'Saved to Review Queue', description: `${project.name} added and tracked on your dashboard.` });
    } catch {
      toast({ title: 'Error', description: 'Failed to save project', variant: 'destructive' });
    }
  };

  const handleExportPDF = useCallback(() => {
    if (!result || !activeTask) return;
    const doc = new jsPDF();
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    const addText = (text: string, size: number, bold = false, color: [number, number, number] = [30, 30, 30]) => {
      doc.setFontSize(size);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(text, maxWidth);
      for (const line of lines) {
        if (y > 270) { doc.addPage(); y = margin; }
        doc.text(line, margin, y);
        y += size * 0.5;
      }
      y += 2;
    };

    const addLine = () => {
      if (y > 270) { doc.addPage(); y = margin; }
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 6;
    };

    // Header
    addText('INFRADAR RESEARCH REPORT', 18, true, [20, 80, 160]);
    addText(`Query: "${activeTask.query}"`, 11, false, [100, 100, 100]);
    addText(`Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, 9, false, [150, 150, 150]);
    y += 4;
    addLine();

    // Summary
    addText('Summary', 14, true);
    addText(`Sources Found: ${result.sources_found || 0}  |  Pages Scraped: ${result.pages_scraped || 0}  |  Projects Discovered: ${result.projects_found || 0}`, 10, false, [80, 80, 80]);
    y += 4;

    // Sources
    if (result.sources?.length) {
      addLine();
      addText('Sources', 14, true);
      (result.sources as any[]).forEach((s: any, i: number) => {
        addText(`${i + 1}. ${s.url}`, 9, false, [40, 80, 160]);
      });
      y += 2;
    }

    // Discovered Projects
    const projects = result.projects as any[] || [];
    if (projects.length > 0) {
      addLine();
      addText('Discovered Projects', 14, true);
      y += 2;

      projects.forEach((p: any, i: number) => {
        if (y > 250) { doc.addPage(); y = margin; }
        addText(`${i + 1}. ${p.name}`, 12, true);
        const meta = [p.country, p.sector, p.stage, p.value_label].filter(Boolean).join('  |  ');
        if (meta) addText(meta, 9, false, [100, 100, 100]);
        if (p.description) addText(p.description, 9);
        if (p.source_url) addText(`Source: ${p.source_url}`, 8, false, [40, 80, 160]);

        if (p.contacts?.length) {
          addText('Contacts:', 9, true, [60, 60, 60]);
          (p.contacts as any[]).forEach((c: any) => {
            const parts = [c.name, c.role, c.organization, c.email, c.phone].filter(Boolean).join(' · ');
            addText(`  • ${parts}`, 8, false, [80, 80, 80]);
          });
        }
        y += 4;
      });
    }

    // Similar Projects
    const similar = result.similar_projects as any[] || [];
    if (similar.length > 0) {
      addLine();
      addText('Similar Projects in Database', 14, true);
      similar.forEach((p: any) => {
        addText(`• ${p.name} - ${p.country} · ${p.sector} · ${p.stage} (${p.confidence}% confidence)`, 9);
      });
    }

    // Footer
    y += 8;
    addLine();
    addText('Report generated by InfraRadar Intelligence Platform', 8, false, [150, 150, 150]);

    const filename = `infradar-research-${activeTask.query.substring(0, 30).replace(/[^a-z0-9]/gi, '-')}.pdf`;
    doc.save(filename);
    toast({ title: 'Report exported', description: `Saved as ${filename}` });
  }, [result, activeTask, toast]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Research Hub</h1>
        <p className="text-muted-foreground text-sm mt-1">Search for infrastructure projects and watch our AI agents research in real time</p>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSubmit} className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. 'Port expansion projects in Ghana' or 'renewable energy Kenya'"
            className="pl-10 h-12 text-base"
          />
        </div>
        <Button type="submit" disabled={isSubmitting || !query.trim()} className="h-12 px-6">
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
          Research
        </Button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Live Visualization */}
          {activeTask && (
            <Card className="border-primary/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {isRunning && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {isComplete && <CheckCircle className="h-4 w-4 text-emerald-500" />}
                    Live Research
                  </CardTitle>
                  <Badge variant={isRunning ? 'default' : isComplete ? 'secondary' : 'destructive'}>
                    {activeTask.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{activeTask.query}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Progress */}
                <Progress value={progressValue} className="h-2" />

                {/* Pipeline Steps */}
                <div className="flex items-center justify-between">
                  {STEPS.map((step, i) => {
                    const isActive = step.key === currentStep;
                    const isDone = stepIndex > i;
                    const Icon = step.icon;
                    return (
                      <div key={step.key} className="flex flex-col items-center gap-1">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                          isDone ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500'
                          : isActive ? 'bg-primary/10 border-primary text-primary animate-pulse'
                          : 'bg-muted/30 border-border text-muted-foreground'
                        }`}>
                          {isDone ? <CheckCircle className="h-4 w-4" /> : isActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                        </div>
                        <span className={`text-[10px] font-medium ${isDone ? 'text-emerald-500' : isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Status message */}
                {result?.message && (
                  <div className="bg-muted/30 rounded-lg p-3 text-sm text-muted-foreground">
                    {result.message}
                  </div>
                )}

                {/* Live Sources */}
                {result?.sources && result.sources.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sources</h4>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {(result.sources as Array<{ url: string; status: string }>).map((s, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs py-1">
                          {s.status === 'scraped' || s.status === 'verified' ? (
                            <CheckCircle className="h-3 w-3 text-emerald-500 shrink-0" />
                          ) : s.status === 'scraping' ? (
                            <Loader2 className="h-3 w-3 text-primary animate-spin shrink-0" />
                          ) : (
                            <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                          )}
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="truncate text-muted-foreground hover:text-primary transition-colors">
                            {s.url}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stats */}
                {(result?.sources_found || result?.pages_scraped || result?.projects_found) && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-muted/20 rounded-lg p-3 text-center">
                      <div className="text-lg font-bold">{result.sources_found || 0}</div>
                      <div className="text-[10px] text-muted-foreground">Sources Found</div>
                    </div>
                    <div className="bg-muted/20 rounded-lg p-3 text-center">
                      <div className="text-lg font-bold">{result.pages_scraped || 0}</div>
                      <div className="text-[10px] text-muted-foreground">Pages Scraped</div>
                    </div>
                    <div className="bg-muted/20 rounded-lg p-3 text-center">
                      <div className="text-lg font-bold">{result.projects_found || 0}</div>
                      <div className="text-[10px] text-muted-foreground">Projects Found</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Report: extracted projects */}
          {isComplete && result?.projects && (result.projects as any[]).length > 0 && (
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Discovered Projects</CardTitle>
                <Button size="sm" variant="outline" onClick={handleExportPDF}>
                  <Download className="h-3 w-3 mr-1" /> Export PDF
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {(result.projects as any[]).map((p: any, i: number) => (
                  <div key={i} className="border border-border rounded-lg p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-sm">{p.name}</h3>
                        <div className="flex gap-2 mt-1">
                          {p.country && <Badge variant="outline" className="text-[10px]">{p.country}</Badge>}
                          {p.sector && <Badge variant="outline" className="text-[10px]">{p.sector}</Badge>}
                          {p.stage && <Badge variant="outline" className="text-[10px]">{p.stage}</Badge>}
                        </div>
                      </div>
                      {savedProjects.has(`${activeTaskId}-${i}`) ? (
                        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">
                          <CheckCircle className="h-3 w-3 mr-1" /> In Review Queue
                        </Badge>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => handleSaveProject(p, i)}>
                          <Save className="h-3 w-3 mr-1" /> Save to Review
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{p.description}</p>
                    {p.value_label && <p className="text-xs"><span className="text-muted-foreground">Value:</span> {p.value_label}</p>}
                    
                    {/* Source URL - always visible */}
                    <div className="flex items-center gap-2 mt-1">
                      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                      {p.source_url ? (
                        <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate">
                          {p.source_url}
                        </a>
                      ) : (
                        <span className="text-xs text-destructive/70 italic">No source URL found</span>
                      )}
                    </div>

                    {/* Contacts & Emails */}
                    <div className="mt-2 border-t border-border pt-2 space-y-1.5">
                      <h4 className="text-[10px] font-semibold uppercase text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" /> Contacts & Emails
                        {p.contacts?.length > 0 && (
                          <Badge variant="outline" className="text-[10px] ml-1">{p.contacts.length}</Badge>
                        )}
                      </h4>
                      {p.contacts && (p.contacts as any[]).length > 0 ? (
                        (p.contacts as any[]).map((c: any, ci: number) => (
                          <div key={ci} className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-xs bg-muted/20 rounded p-1.5">
                            <span className="font-medium">{c.name}</span>
                            {c.role && <span className="text-muted-foreground">· {c.role}</span>}
                            {c.organization && (
                              <span className="text-muted-foreground flex items-center gap-0.5">
                                <Building2 className="h-3 w-3" /> {c.organization}
                              </span>
                            )}
                            {c.email && (
                              <a href={`mailto:${c.email}`} className="text-primary hover:underline flex items-center gap-0.5">
                                <Mail className="h-3 w-3" /> {c.email}
                              </a>
                            )}
                            {c.phone && (
                              <a href={`tel:${c.phone}`} className="text-primary hover:underline flex items-center gap-0.5">
                                <Phone className="h-3 w-3" /> {c.phone}
                              </a>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-destructive/70 italic">No contacts discovered</p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Similar Projects */}
          {isComplete && result?.similar_projects && (result.similar_projects as any[]).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Similar Projects in Database</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(result.similar_projects as any[]).map((p: any) => (
                  <a key={p.id} href={`/dashboard/projects/${p.id}`} className="flex items-center justify-between border border-border rounded-lg p-3 hover:bg-muted/20 transition-colors">
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground">{p.country} · {p.sector} · {p.stage}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{p.confidence}% confidence</Badge>
                  </a>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {!activeTask && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Search className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-semibold text-muted-foreground">Start a Research Query</h3>
                <p className="text-sm text-muted-foreground/70 max-w-md mt-2">
                  Enter a project name, region, or topic above. Our AI agents will search the web, scrape sources, and extract structured project data in real time.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* History Sidebar */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" /> Research History
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!history || history.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No research yet</p>
              ) : history.map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTaskId(t.id)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                    activeTaskId === t.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/20'
                  }`}
                >
                  <p className="text-xs font-medium truncate">{t.query}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={t.status === 'completed' ? 'secondary' : t.status === 'running' ? 'default' : 'destructive'} className="text-[10px]">
                      {t.status}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
