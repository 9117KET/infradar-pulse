import type { Project } from '@/data/projects';
import { Badge } from '@/components/ui/badge';
import { TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone, Mail, X, Plus, HardHat, Landmark, Building2, Briefcase, UserCheck, Users, Check, Trash2, type LucideIcon } from 'lucide-react';

interface ContactsTabProps {
  contacts: NonNullable<Project["contacts"]>;
  canModerate: boolean;
  showAddContact: boolean;
  setShowAddContact: (value: boolean) => void;
  ctName: string;
  setCtName: (value: string) => void;
  ctRole: string;
  setCtRole: (value: string) => void;
  ctOrg: string;
  setCtOrg: (value: string) => void;
  ctPhone: string;
  setCtPhone: (value: string) => void;
  ctEmail: string;
  setCtEmail: (value: string) => void;
  ctSourceUrl: string;
  setCtSourceUrl: (value: string) => void;
  ctType: string;
  setCtType: (value: string) => void;
  handleAddContact: () => Promise<void>;
  toggleContactVerified: (id: string, current: boolean) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;
}

export function ContactsTab({ contacts, canModerate, showAddContact, setShowAddContact, ctName, setCtName, ctRole, setCtRole, ctOrg, setCtOrg, ctPhone, setCtPhone, ctEmail, setCtEmail, ctSourceUrl, setCtSourceUrl, ctType, setCtType, handleAddContact, toggleContactVerified, deleteContact }: ContactsTabProps) {
  return (
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
                    <SelectTrigger className="bg-black/20" aria-label="Contact type"><SelectValue placeholder="Contact Type" /></SelectTrigger>
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
              const typeIcons: Record<string, LucideIcon> = { contractor: HardHat, government: Landmark, owner: Building2, financier: Briefcase, consultant: UserCheck, general: Users };

              const grouped: Record<string, typeof contacts> = {};
              contacts.forEach(c => {
                const t = c.contact_type || 'general';
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
  );
}
