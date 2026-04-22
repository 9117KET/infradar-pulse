import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Shield, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { AppRole } from '@/contexts/AuthContext';

interface UserRow {
  id: string;
  display_name: string | null;
  company: string | null;
  email: string;
  role: AppRole;
  updated_at: string | null;
}

const ROLE_COLORS: Record<AppRole, string> = {
  admin: 'bg-destructive/10 text-destructive border-destructive/30',
  researcher: 'bg-primary/10 text-primary border-primary/30',
  user: 'bg-muted text-muted-foreground border-border',
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const { toast } = useToast();

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles, error: profilesError } = await supabase.from('profiles').select('*');
    const { data: rolesRows, error: rolesError } = await supabase.from('user_roles').select('*');
    const { data: emailRows, error: emailError } = await (supabase.rpc as any)('admin_list_user_emails');

    if (profilesError) {
      toast({
        title: 'Could not load profiles',
        description: profilesError.message,
        variant: 'destructive',
      });
      setUsers([]);
      setLoading(false);
      return;
    }

    if (rolesError) {
      toast({
        title: 'Could not load roles',
        description: `${rolesError.message} — Users will show as "user" until this is fixed.`,
        variant: 'destructive',
      });
    }
    if (emailError) {
      toast({
        title: 'Could not load emails',
        description: emailError.message,
        variant: 'destructive',
      });
    }

    const profilesList = profiles ?? [];
    const roles = rolesRows ?? [];
    const emailMap = new Map((emailRows ?? []).map((r) => [r.user_id, r.email]));

    const roleMap = new Map<string, AppRole>();
    for (const r of roles) {
      const current = roleMap.get(r.user_id);
      if (!current || r.role === 'admin' || (r.role === 'researcher' && current === 'user')) {
        roleMap.set(r.user_id, r.role as AppRole);
      }
    }

    const mapped: UserRow[] = profilesList.map((p: { id: string; display_name: string | null; company: string | null; updated_at: string | null }) => ({
      id: p.id,
      display_name: p.display_name,
      company: p.company,
      email: emailMap.get(p.id) ?? '',
      role: roleMap.get(p.id) || 'user',
      updated_at: p.updated_at,
    }));
    setUsers(mapped);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const changeRole = async (userId: string, newRole: AppRole) => {
    // Delete existing roles, insert new one
    await supabase.from('user_roles').delete().eq('user_id', userId);
    const { error } = await supabase.from('user_roles').insert({ user_id: userId, role: newRole });
    if (error) {
      toast({ title: 'Error updating role', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Role updated', description: `User role changed to ${newRole}` });
      fetchUsers();
    }
  };

  const inviteResearcher = async () => {
    if (!inviteEmail.trim()) return;
    // We store the email as a "pending invite"; when user signs up with this email,
    // we can check and assign researcher role. For now, show confirmation.
    toast({ title: 'Researcher invite noted', description: `When ${inviteEmail} signs up, assign them the researcher role from this page.` });
    setInviteEmail('');
    setInviteOpen(false);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">User Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage platform access. Roles shown here come from the <code className="text-xs">user_roles</code> table
            (admin / researcher / user), not the job title on a profile.
          </p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><UserPlus className="mr-2 h-4 w-4" /> Invite Researcher</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite Researcher</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Enter the email of the person you want to assign as a researcher. Once they sign up, change their role from this page.</p>
            <Input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="researcher@example.com" />
            <Button onClick={inviteResearcher} disabled={!inviteEmail.trim()}>Send Invite</Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground animate-pulse">Loading users…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-black/20">
                <th className="p-3 text-left font-medium text-muted-foreground">User / email</th>
                <th className="p-3 text-left font-medium text-muted-foreground">Company</th>
                <th className="p-3 text-left font-medium text-muted-foreground">Current Role</th>
                <th className="p-3 text-left font-medium text-muted-foreground">Change Role</th>
                <th className="p-3 text-left font-medium text-muted-foreground">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-border/50">
                  <td className="p-3">
                    <div className="font-medium">{u.display_name || 'Unnamed'}</div>
                    <div className="text-xs text-muted-foreground break-all">{u.email || `${u.id.slice(0, 8)}…`}</div>
                  </td>
                  <td className="p-3 text-muted-foreground">{u.company || '-'}</td>
                  <td className="p-3">
                    <Badge variant="outline" className={`text-xs ${ROLE_COLORS[u.role]}`}>
                      <Shield className="mr-1 h-3 w-3" />
                      {u.role}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Select value={u.role} onValueChange={(val) => changeRole(u.id, val as AppRole)}>
                      <SelectTrigger className="w-32 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="researcher">Researcher</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {u.updated_at ? new Date(u.updated_at).toLocaleDateString() : '-'}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No users found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
