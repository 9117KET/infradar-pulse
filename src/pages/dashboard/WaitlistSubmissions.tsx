import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Mail, Building2 } from 'lucide-react';
import { format } from 'date-fns';

export default function WaitlistSubmissions() {
  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ['waitlist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('waitlist')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-bold">Waitlist Submissions</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs"><Users className="h-3.5 w-3.5" />Total signups</CardDescription>
            <CardTitle className="text-2xl">{submissions.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs"><Mail className="h-3.5 w-3.5" />This week</CardDescription>
            <CardTitle className="text-2xl">
              {submissions.filter(s => new Date(s.created_at) > new Date(Date.now() - 7 * 86400000)).length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs"><Building2 className="h-3.5 w-3.5" />Companies</CardDescription>
            <CardTitle className="text-2xl">
              {new Set(submissions.map(s => s.company).filter(Boolean)).size}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="glass-panel border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
          ) : submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No submissions yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Interest</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map(s => (
                  <TableRow key={s.id} className="border-border/50">
                    <TableCell className="font-medium">{s.name || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{s.email}</TableCell>
                    <TableCell>{s.company || '-'}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{s.role || '-'}</Badge></TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">{s.interest || '-'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{format(new Date(s.created_at), 'MMM d, yyyy')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
