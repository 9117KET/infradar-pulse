import { Badge } from '@/components/ui/badge';

const USERS = [
  { name: 'Jane Doe', email: 'jane@acme.com', role: 'Admin', lastActive: '2 min ago' },
  { name: 'Ahmed Hassan', email: 'ahmed@fund.co', role: 'Analyst', lastActive: '1h ago' },
  { name: 'Sarah Chen', email: 'sarah@advisory.com', role: 'Viewer', lastActive: '3d ago' },
];

export default function UsersPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="font-serif text-2xl font-bold">Users</h1>
      <div className="glass-panel rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-black/20"><th className="p-3 text-left font-medium text-muted-foreground">Name</th><th className="p-3 text-left font-medium text-muted-foreground">Email</th><th className="p-3 text-left font-medium text-muted-foreground">Role</th><th className="p-3 text-left font-medium text-muted-foreground">Last active</th></tr></thead>
          <tbody>
            {USERS.map(u => (
              <tr key={u.email} className="border-b border-border/50">
                <td className="p-3 font-medium">{u.name}</td>
                <td className="p-3 text-muted-foreground">{u.email}</td>
                <td className="p-3"><Badge variant="outline" className="text-xs">{u.role}</Badge></td>
                <td className="p-3 text-muted-foreground">{u.lastActive}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
