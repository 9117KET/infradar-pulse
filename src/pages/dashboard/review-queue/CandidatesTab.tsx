import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, ExternalLink, MapPin, DollarSign, ShieldAlert, Inbox, AlertTriangle, Link2, FileCheck2, Mail, Phone, User, Building2 } from 'lucide-react';
import { Pager, stageBadgeColor, type EvidenceRow, type ContactRow } from './shared';
import { isReachableContact } from '@/lib/contact-validation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
interface Mut<V> { mutate(v: V): void; isPending: boolean }
interface PageProps { total: number; page: number; onPageChange: (p: number) => void }

export function CandidatesTab({ pending, hasSource, projectEvidence, projectContacts, rejectMutation, approveMutation, requestApprove, expandedId, setExpandedId, verifyEvidence, verifyContact, legacyPage, total, setLegacyPage }: { pending: Row[]; hasSource: (p: Row) => boolean; projectEvidence: (id: string) => EvidenceRow[]; projectContacts: (id: string) => ContactRow[]; rejectMutation: Mut<string>; approveMutation: { isPending: boolean }; requestApprove: (id: string) => void; expandedId: string | null; setExpandedId: (id: string | null) => void; verifyEvidence: Mut<{ id: string; verified: boolean }>; verifyContact: Mut<{ id: string; verified: boolean }>; legacyPage: number; total: number; setLegacyPage: (p: number) => void }) {
  const contactTypeIcon: Record<string, string> = {
    contractor: '🏗️', government: '🏛️', financier: '💰', consultant: '📋', owner: '👤', general: '📌',
  };
  return (
    <>
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
            <Pager page={legacyPage} total={total} onPageChange={setLegacyPage} />
    </>
  );
}
