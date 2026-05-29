import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { agentApi } from "@/lib/api/agents";
import { Seo } from "@/components/Seo";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface LinkCheck {
  url: string;
  status: string;
  http_code: number | null;
  error: string | null;
  checked_at: string;
}

interface CleanupResult {
  dry_run: boolean;
  broken_urls?: number;
  evidence_removed?: number;
  evidence_unverified?: number;
  projects_url_cleared?: number;
  contacts_url_cleared?: number;
  insights_sources_cleaned?: number;
  insights_now_unpublished?: number;
  note?: string;
}

export default function SourceHealth() {
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const [counts, setCounts] = useState({ ok: 0, broken: 0, invalid: 0, total: 0 });
  const [broken, setBroken] = useState<LinkCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [lastCleanup, setLastCleanup] = useState<CleanupResult | null>(null);

  const isAdmin = hasRole("admin");

  async function refresh() {
    setLoading(true);
    const [okQ, brokenQ, invalidQ, totalQ, brokenRows] = await Promise.all([
      supabase.from("source_link_checks").select("*", { count: "exact", head: true }).eq("status", "ok"),
      supabase.from("source_link_checks").select("*", { count: "exact", head: true }).eq("status", "broken"),
      supabase.from("source_link_checks").select("*", { count: "exact", head: true }).eq("status", "invalid"),
      supabase.from("source_link_checks").select("*", { count: "exact", head: true }),
      supabase.from("source_link_checks").select("url, status, http_code, error, checked_at").eq("status", "broken").order("checked_at", { ascending: false }).limit(100),
    ]);
    setCounts({
      ok: okQ.count ?? 0,
      broken: brokenQ.count ?? 0,
      invalid: invalidQ.count ?? 0,
      total: totalQ.count ?? 0,
    });
    setBroken((brokenRows.data ?? []) as LinkCheck[]);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function runValidator(mode: "incremental" | "full") {
    setValidating(true);
    try {
      const data = await agentApi.runLinkValidator({ mode, batch: 500, concurrency: 8 });
      toast({ title: "Validator run complete", description: `Checked ${data?.checked ?? 0} URLs · ${data?.broken ?? 0} broken in this batch` });
      await refresh();
    } catch (e) {
      toast({ title: "Validator failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setValidating(false);
    }
  }

  async function runCleanup(dryRun: boolean) {
    if (!dryRun && !confirm("This will permanently delete AI-sourced broken evidence, clear broken source URLs from projects/contacts, and unpublish insights with no remaining sources. Continue?")) return;
    setCleaning(true);
    try {
      const data = await agentApi.runSourceCleanup({ dry_run: dryRun });
      setLastCleanup(data as CleanupResult);
      toast({
        title: dryRun ? "Dry run complete" : "Cleanup complete",
        description: `${(data as CleanupResult).broken_urls ?? 0} broken URLs · ${(data as CleanupResult).evidence_removed ?? 0} evidence rows · ${(data as CleanupResult).projects_url_cleared ?? 0} projects affected`,
      });
      if (!dryRun) await refresh();
    } catch (e) {
      toast({ title: "Cleanup failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setCleaning(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <Seo title="Source Health · InfraRadarAI" description="Validate and clean up broken source URLs across evidence, projects, contacts and insights." />
      <div>
        <h1 className="text-3xl font-serif">Source Health</h1>
        <p className="text-muted-foreground mt-1">Validate every source URL surfaced by agents. Quarantine and remove broken citations.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Total checked</CardDescription><CardTitle className="text-3xl">{counts.total}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>OK</CardDescription><CardTitle className="text-3xl text-emerald-500">{counts.ok}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Broken</CardDescription><CardTitle className="text-3xl text-destructive">{counts.broken}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Invalid</CardDescription><CardTitle className="text-3xl text-amber-500">{counts.invalid}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
          <CardDescription>Run the validator first, then preview and run cleanup.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={() => runValidator("incremental")} disabled={validating}>
            {validating ? <Loader2 className="size-4 animate-spin mr-2" /> : <RefreshCw className="size-4 mr-2" />}
            Re-validate (incremental, 500)
          </Button>
          <Button variant="outline" onClick={() => runValidator("full")} disabled={validating}>
            Full re-validate (500/batch)
          </Button>
          {isAdmin && (
            <>
              <Button variant="secondary" onClick={() => runCleanup(true)} disabled={cleaning}>
                {cleaning ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Cleanup — dry run
              </Button>
              <Button variant="destructive" onClick={() => runCleanup(false)} disabled={cleaning}>
                <Trash2 className="size-4 mr-2" />
                Cleanup — run for real
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {lastCleanup && (
        <Card>
          <CardHeader><CardTitle>Last cleanup result {lastCleanup.dry_run ? <Badge variant="secondary">dry run</Badge> : <Badge variant="destructive">applied</Badge>}</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto">{JSON.stringify(lastCleanup, null, 2)}</pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Broken URLs (latest 100)</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Loader2 className="size-5 animate-spin" /> : broken.length === 0 ? (
            <p className="text-muted-foreground text-sm">No broken URLs recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>URL</TableHead>
                    <TableHead>HTTP</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Checked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {broken.map((b) => (
                    <TableRow key={b.url}>
                      <TableCell className="max-w-md truncate"><a href={b.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{b.url}</a></TableCell>
                      <TableCell>{b.http_code ?? "—"}</TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground text-xs">{b.error ?? "—"}</TableCell>
                      <TableCell className="text-xs">{new Date(b.checked_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
