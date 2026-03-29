import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Mail, Building2, BellRing, Handshake, Newspaper } from 'lucide-react';
import { format } from 'date-fns';

const TYPE_META: Record<string, { label: string; color: string; icon: any }> = {
  newsletter: { label: 'Newsletter', color: 'border-primary/30 text-primary', icon: Newspaper },
  alert: { label: 'Alert', color: 'border-amber-500/30 text-amber-500', icon: BellRing },
  demo_request: { label: 'Demo', color: 'border-blue-500/30 text-blue-500', icon: Handshake },
};

export default function SubscriberManagement() {
  const [filter, setFilter] = useState<string>('all');

  const { data: subscribers = [], isLoading } = useQuery({
    queryKey: ['subscribers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscribers' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const filtered = filter === 'all' ? subscribers : subscribers.filter((s: any) => s.type === filter);
  const counts = {
    all: subscribers.length,
    newsletter: subscribers.filter((s: any) => s.type === 'newsletter').length,
    alert: subscribers.filter((s: any) => s.type === 'alert').length,
    demo_request: subscribers.filter((s: any) => s.type === 'demo_request').length,
  };

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-bold">Subscribers</h1>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs"><Users className="h-3.5 w-3.5" />Total</CardDescription>
            <CardTitle className="text-2xl">{counts.all}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs"><Newspaper className="h-3.5 w-3.5" />Newsletter</CardDescription>
            <CardTitle className="text-2xl">{counts.newsletter}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs"><BellRing className="h-3.5 w-3.5" />Alerts</CardDescription>
            <CardTitle className="text-2xl">{counts.alert}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs"><Handshake className="h-3.5 w-3.5" />Demo requests</CardDescription>
            <CardTitle className="text-2xl">{counts.demo_request}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="flex gap-2">
        {(['all', 'newsletter', 'alert', 'demo_request'] as const).map(t => (
          <Button key={t} size="sm" variant={filter === t ? 'default' : 'outline'} onClick={() => setFilter(t)} className="text-xs capitalize">
            {t === 'demo_request' ? 'Demo' : t === 'all' ? 'All' : t} ({counts[t]})
          </Button>
        ))}
      </div>

      <Card className="glass-panel border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No subscribers yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Type</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Preferences</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s: any) => {
                  const meta = TYPE_META[s.type] || TYPE_META.newsletter;
                  const Icon = meta.icon;
                  return (
                    <TableRow key={s.id} className="border-border/50">
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${meta.color}`}>
                          <Icon className="h-3 w-3 mr-1" />{meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{s.email}</TableCell>
                      <TableCell className="font-medium">{s.name || '-'}</TableCell>
                      <TableCell>{s.company || '-'}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground text-xs">
                        {s.preferences && Object.keys(s.preferences).length > 0
                          ? Object.entries(s.preferences).map(([k, v]) => `${k}: ${v}`).join(', ')
                          : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{format(new Date(s.created_at), 'MMM d, yyyy')}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
