import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface Coverage {
  approved_projects: number;
  with_reachable_contact: number;
  with_multiple_sources: number;
  discovery_queue: number;
  canonical_contacts: number;
  canonical_companies: number;
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

/** Staff view of how much of the portfolio actually has contacts and corroborating evidence. */
export function ContactCoveragePanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['contact-coverage-summary'],
    queryFn: async (): Promise<Coverage | null> => {
      const { data, error } = await supabase.rpc('get_contact_coverage_summary' as never);
      if (error) throw error;
      return (data as unknown as Coverage) ?? null;
    },
    refetchInterval: 60_000,
  });

  const c = data;
  const contactPct = c ? pct(c.with_reachable_contact, c.approved_projects) : 0;
  const sourcePct = c ? pct(c.with_multiple_sources, c.approved_projects) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contact &amp; evidence coverage</CardTitle>
        <CardDescription>
          Share of approved projects with a reachable contact and with more than one source.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !c ? (
          <p className="text-sm text-muted-foreground">Loading coverage…</p>
        ) : (
          <>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Projects with a reachable contact</span>
                <span className="font-medium">
                  {c.with_reachable_contact.toLocaleString()} / {c.approved_projects.toLocaleString()} ({contactPct}%)
                </span>
              </div>
              <Progress value={contactPct} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Projects with more than one source</span>
                <span className="font-medium">
                  {c.with_multiple_sources.toLocaleString()} / {c.approved_projects.toLocaleString()} ({sourcePct}%)
                </span>
              </div>
              <Progress value={sourcePct} />
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2 text-sm">
              <div>
                <p className="text-muted-foreground">Discovery queue</p>
                <p className="font-semibold">{c.discovery_queue.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Canonical contacts</p>
                <p className="font-semibold">{c.canonical_contacts.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Canonical companies</p>
                <p className="font-semibold">{c.canonical_companies.toLocaleString()}</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ContactCoveragePanel;
