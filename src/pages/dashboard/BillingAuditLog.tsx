import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, RefreshCw, ScrollText, ArrowLeft } from 'lucide-react';

interface BillingEvent {
  id: string;
  event_type: string;
  status: string | null;
  plan_key: string | null;
  environment: string;
  occurred_at: string;
  paddle_subscription_id: string | null;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  trialing: 'secondary',
  active: 'default',
  past_due: 'destructive',
  paused: 'outline',
  canceled: 'destructive',
};

function prettyEvent(t: string) {
  return t.replace(/^subscription\./, '').replace(/^transaction\./, 'txn: ').replace(/_/g, ' ');
}

export default function BillingAuditLog() {
  const { user } = useAuth();
  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('billing_events')
      .select('id, event_type, status, plan_key, environment, occurred_at, paddle_subscription_id')
      .order('occurred_at', { ascending: false })
      .limit(100);
    if (!error && data) setEvents(data as BillingEvent[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    if (!user) return;
    const channel = supabase
      .channel(`billing_events:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'billing_events', filter: `user_id=eq.${user.id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link to="/dashboard/settings?tab=billing">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Billing
            </Link>
          </Button>
          <h1 className="text-3xl font-serif tracking-tight flex items-center gap-2">
            <ScrollText className="h-7 w-7 text-primary" />
            Billing Audit Log
          </h1>
          <p className="text-muted-foreground text-sm">
            Recent Paddle subscription and payment events on your account.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>
            Showing the 100 most recent events. New events appear in real time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && events.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading events…
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No billing events yet. They will appear here when you start a trial, change plans, or
              are billed.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead className="hidden md:table-cell">Subscription</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(e.occurred_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-medium">{prettyEvent(e.event_type)}</TableCell>
                    <TableCell>
                      {e.status ? (
                        <Badge variant={STATUS_VARIANT[e.status] ?? 'outline'}>{e.status}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="capitalize">{e.plan_key ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={e.environment === 'live' ? 'default' : 'outline'}>
                        {e.environment === 'live' ? 'Live' : 'Test'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                      {e.paddle_subscription_id ?? '—'}
                    </TableCell>
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
