import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useProjects } from '@/hooks/use-projects';
import { REGIONS, SECTORS, STAGES } from '@/data/projects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, X, Loader2 } from 'lucide-react';

const STATUS_OPTIONS = ['Verified', 'Stable', 'Pending', 'At Risk'] as const;

export default function ProjectEditor() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { projects } = useProjects();

  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState<string>('MENA');
  const [sector, setSector] = useState<string>('Urban Development');
  const [stage, setStage] = useState<string>('Planned');
  const [status, setStatus] = useState<string>('Pending');
  const [valueUsd, setValueUsd] = useState('0');
  const [valueLabel, setValueLabel] = useState('$0');
  const [confidence, setConfidence] = useState('50');
  const [riskScore, setRiskScore] = useState('50');
  const [lat, setLat] = useState('0');
  const [lng, setLng] = useState('0');
  const [description, setDescription] = useState('');
  const [timeline, setTimeline] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [detailedAnalysis, setDetailedAnalysis] = useState('');
  const [keyRisks, setKeyRisks] = useState('');
  const [fundingSources, setFundingSources] = useState('');
  const [environmentalImpact, setEnvironmentalImpact] = useState('');
  const [politicalContext, setPoliticalContext] = useState('');

  // Stakeholders
  const [stakeholders, setStakeholders] = useState<string[]>([]);
  const [newStakeholder, setNewStakeholder] = useState('');

  // Milestones
  const [milestones, setMilestones] = useState<{ title: string; date: string; completed: boolean }[]>([]);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState('');

  const [dbId, setDbId] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit) {
      const project = projects.find(p => p.id === id);
      if (project) {
        setName(project.name);
        setCountry(project.country);
        setRegion(project.region);
        setSector(project.sector);
        setStage(project.stage);
        setStatus(project.status);
        setValueUsd(String(project.valueUsd));
        setValueLabel(project.valueLabel);
        setConfidence(String(project.confidence));
        setRiskScore(String(project.riskScore));
        setLat(String(project.lat));
        setLng(String(project.lng));
        setDescription(project.description);
        setTimeline(project.timeline);
        setSourceUrl(project.sourceUrl || '');
        setDetailedAnalysis(project.detailedAnalysis || '');
        setKeyRisks(project.keyRisks || '');
        setFundingSources(project.fundingSources || '');
        setEnvironmentalImpact(project.environmentalImpact || '');
        setPoliticalContext(project.politicalContext || '');
        setStakeholders(project.stakeholders);
        setMilestones(project.milestones.map(m => ({ title: m.title, date: m.date, completed: m.completed })));
        setDbId(project.dbId || null);
      }
    }
  }, [isEdit, id, projects]);

  const generateSlug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleSave = async () => {
    if (!name.trim() || !country.trim()) {
      toast({ title: 'Missing fields', description: 'Name and country are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const slug = generateSlug(name);
      const projectData = {
        name, country, region, sector, stage, status,
        value_usd: Number(valueUsd), value_label: valueLabel,
        confidence: Number(confidence), risk_score: Number(riskScore),
        lat: Number(lat), lng: Number(lng),
        description, timeline: timeline || null, slug,
        source_url: sourceUrl, detailed_analysis: detailedAnalysis,
        key_risks: keyRisks, funding_sources: fundingSources,
        environmental_impact: environmentalImpact, political_context: politicalContext,
        ai_generated: false, approved: true,
        last_updated: new Date().toISOString(),
      };

      let projectId: string;

      if (isEdit && dbId) {
        const { error } = await supabase.from('projects').update(projectData as any).eq('id', dbId);
        if (error) throw error;
        projectId = dbId;

        // Delete old stakeholders & milestones, re-insert
        await supabase.from('project_stakeholders').delete().eq('project_id', projectId);
        await supabase.from('project_milestones').delete().eq('project_id', projectId);
      } else {
        const { data, error } = await supabase.from('projects').insert(projectData as any).select('id').single();
        if (error) throw error;
        projectId = data.id;
      }

      // Insert stakeholders
      if (stakeholders.length > 0) {
        await supabase.from('project_stakeholders').insert(
          stakeholders.map(s => ({ project_id: projectId, name: s }))
        );
      }

      // Insert milestones
      if (milestones.length > 0) {
        await supabase.from('project_milestones').insert(
          milestones.map(m => ({ project_id: projectId, title: m.title, date: m.date, completed: m.completed }))
        );
      }

      toast({ title: isEdit ? 'Project updated' : 'Project created', description: `${name} has been saved.` });
      navigate(`/dashboard/projects/${slug}`);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Link to="/dashboard/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-4 w-4" />Back to projects
      </Link>

      <h1 className="font-serif text-2xl font-bold">{isEdit ? 'Edit Project' : 'New Project'}</h1>

      {/* Basic Info */}
      <div className="glass-panel rounded-xl p-5 space-y-4">
        <h3 className="font-serif text-lg font-semibold">Basic Information</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Project Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. NEOM Smart City" className="mt-1 bg-black/20" /></div>
          <div><Label>Country *</Label><Input value={country} onChange={e => setCountry(e.target.value)} placeholder="e.g. Saudi Arabia" className="mt-1 bg-black/20" /></div>
          <div><Label>Region</Label>
            <Select value={region} onValueChange={setRegion}><SelectTrigger className="mt-1 bg-black/20"><SelectValue /></SelectTrigger>
              <SelectContent>{REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Sector</Label>
            <Select value={sector} onValueChange={setSector}><SelectTrigger className="mt-1 bg-black/20"><SelectValue /></SelectTrigger>
              <SelectContent>{SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Stage</Label>
            <Select value={stage} onValueChange={setStage}><SelectTrigger className="mt-1 bg-black/20"><SelectValue /></SelectTrigger>
              <SelectContent>{STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Status</Label>
            <Select value={status} onValueChange={setStatus}><SelectTrigger className="mt-1 bg-black/20"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <div><Label>Value (USD)</Label><Input type="number" value={valueUsd} onChange={e => setValueUsd(e.target.value)} className="mt-1 bg-black/20" /></div>
          <div><Label>Value Label</Label><Input value={valueLabel} onChange={e => setValueLabel(e.target.value)} placeholder="$500B" className="mt-1 bg-black/20" /></div>
          <div><Label>Confidence (0-100)</Label><Input type="number" value={confidence} onChange={e => setConfidence(e.target.value)} className="mt-1 bg-black/20" /></div>
          <div><Label>Risk Score (0-100)</Label><Input type="number" value={riskScore} onChange={e => setRiskScore(e.target.value)} className="mt-1 bg-black/20" /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><Label>Latitude</Label><Input type="number" step="any" value={lat} onChange={e => setLat(e.target.value)} className="mt-1 bg-black/20" /></div>
          <div><Label>Longitude</Label><Input type="number" step="any" value={lng} onChange={e => setLng(e.target.value)} className="mt-1 bg-black/20" /></div>
          <div><Label>Timeline</Label><Input value={timeline} onChange={e => setTimeline(e.target.value)} placeholder="2025–2030" className="mt-1 bg-black/20" /></div>
        </div>
        <div><Label>Official Project URL</Label><Input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://..." className="mt-1 bg-black/20" /></div>
        <div><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} className="mt-1 bg-black/20" rows={3} /></div>
      </div>

      {/* Analysis */}
      <div className="glass-panel rounded-xl p-5 space-y-4">
        <h3 className="font-serif text-lg font-semibold">Deep Analysis</h3>
        <div><Label>Detailed Analysis</Label><Textarea value={detailedAnalysis} onChange={e => setDetailedAnalysis(e.target.value)} className="mt-1 bg-black/20" rows={4} placeholder="Market context, strategic significance..." /></div>
        <div><Label>Key Risks</Label><Textarea value={keyRisks} onChange={e => setKeyRisks(e.target.value)} className="mt-1 bg-black/20" rows={3} placeholder="Specific risk factors..." /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Funding Sources</Label><Textarea value={fundingSources} onChange={e => setFundingSources(e.target.value)} className="mt-1 bg-black/20" rows={3} /></div>
          <div><Label>Environmental Impact</Label><Textarea value={environmentalImpact} onChange={e => setEnvironmentalImpact(e.target.value)} className="mt-1 bg-black/20" rows={3} /></div>
        </div>
        <div><Label>Political Context</Label><Textarea value={politicalContext} onChange={e => setPoliticalContext(e.target.value)} className="mt-1 bg-black/20" rows={3} /></div>
      </div>

      {/* Stakeholders */}
      <div className="glass-panel rounded-xl p-5 space-y-3">
        <h3 className="font-serif text-lg font-semibold">Stakeholders</h3>
        <div className="flex flex-wrap gap-2">
          {stakeholders.map((s, i) => (
            <Badge key={i} variant="secondary" className="text-xs gap-1">
              {s}
              <button onClick={() => setStakeholders(prev => prev.filter((_, j) => j !== i))} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={newStakeholder} onChange={e => setNewStakeholder(e.target.value)} placeholder="Add stakeholder..." className="bg-black/20 flex-1" onKeyDown={e => { if (e.key === 'Enter' && newStakeholder.trim()) { setStakeholders(prev => [...prev, newStakeholder.trim()]); setNewStakeholder(''); } }} />
          <Button size="sm" variant="outline" onClick={() => { if (newStakeholder.trim()) { setStakeholders(prev => [...prev, newStakeholder.trim()]); setNewStakeholder(''); } }}><Plus className="h-3 w-3" /></Button>
        </div>
      </div>

      {/* Milestones */}
      <div className="glass-panel rounded-xl p-5 space-y-3">
        <h3 className="font-serif text-lg font-semibold">Milestones</h3>
        <div className="space-y-2">
          {milestones.map((m, i) => (
            <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.02] border border-white/5">
              <button onClick={() => setMilestones(prev => prev.map((item, j) => j === i ? { ...item, completed: !item.completed } : item))} className={`h-4 w-4 rounded-full border-2 shrink-0 ${m.completed ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground'}`} />
              <span className="flex-1 text-sm">{m.title}</span>
              <span className="text-xs text-muted-foreground">{m.date}</span>
              <button onClick={() => setMilestones(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={newMilestoneTitle} onChange={e => setNewMilestoneTitle(e.target.value)} placeholder="Milestone title..." className="bg-black/20 flex-1" />
          <Input type="text" value={newMilestoneDate} onChange={e => setNewMilestoneDate(e.target.value)} placeholder="YYYY-MM" className="bg-black/20 w-32" />
          <Button size="sm" variant="outline" onClick={() => { if (newMilestoneTitle.trim() && newMilestoneDate.trim()) { setMilestones(prev => [...prev, { title: newMilestoneTitle.trim(), date: newMilestoneDate.trim(), completed: false }]); setNewMilestoneTitle(''); setNewMilestoneDate(''); } }}><Plus className="h-3 w-3" /></Button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEdit ? 'Update Project' : 'Create Project'}
        </Button>
        <Button variant="outline" onClick={() => navigate('/dashboard/projects')}>Cancel</Button>
      </div>
    </div>
  );
}
