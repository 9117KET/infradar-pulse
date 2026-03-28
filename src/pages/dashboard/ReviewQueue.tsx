import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Check, X, ExternalLink, Bot, MapPin, DollarSign,
  ShieldAlert, Loader2, Inbox, AlertTriangle, Link2, FileCheck2,
  Mail, Phone, User, Building2
} from 'lucide-react';

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

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ['pending-projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('approved', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Load evidence sources for all pending projects
  const pendingIds = pending.map((p: any) => p.id);
  const { data: evidenceMap = {} } = useQuery({
    queryKey: ['pending-evidence', pendingIds],
    enabled: pendingIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('evidence_sources')
        .select('id, project_id, source, url, type, verified, date, title')
        .in('project_id', pendingIds);
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
      const { data } = await supabase
        .from('project_contacts')
        .select('id, project_id, name, role, organization, email, phone, contact_type, source_url, verified')
        .in('project_id', pendingIds);
      const map: Record<string, ContactRow[]> = {};
      (data || []).forEach((c: any) => {
        if (!map[c.project_id]) map[c.project_id] = [];
        map[c.project_id].push(c);
      });
      return map;
    },
  });

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
  });

  const approveAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('projects').update({ approved: true }).eq('approved', false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({ title: 'All projects approved' });
    },
  });

  const hasSource = (project: any) => project.source_url && project.source_url.trim() !== '' && project.source_url !== '#';
  const projectEvidence = (id: string) => (evidenceMap as Record<string, EvidenceRow[]>)[id] || [];
  const projectContacts = (id: string) => (contactsMap as Record<string, ContactRow[]>)[id] || [];

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
            {pending.length} AI-discovered project{pending.length !== 1 ? 's' : ''} awaiting review
          </p>
        </div>
        {pending.length > 1 && (
          <Button size="sm" onClick={() => approveAll.mutate()} disabled={approveAll.isPending} className="teal-glow">
            {approveAll.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
            Approve all ({pending.length})
          </Button>
        )}
      </div>

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
                      onClick={() => approveMutation.mutate(project.id)}
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
                          Primary source link missing — requires enrichment before approval
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
    </div>
  );
}
