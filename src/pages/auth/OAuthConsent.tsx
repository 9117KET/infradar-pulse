// OAuth 2.1 consent route for the app's MCP server. Supabase Auth redirects
// external OAuth clients (ChatGPT, Claude, Cursor, ...) here with an
// ?authorization_id=... so the signed-in user can approve or deny the
// connection. Handled entirely in the browser with the app's Supabase client.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { InfradarLogo } from "@/components/InfradarLogo";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";

// The `auth.oauth` namespace is still marked beta on @supabase/supabase-js,
// so we keep a tiny local typed wrapper instead of grepping SDK internals.
type OAuthClient = { name?: string | null; redirect_uris?: string[] | null };
type AuthorizationDetails = {
  client?: OAuthClient | null;
  scope?: string | null;
  scopes?: string[] | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};
type OAuthResult = { data: AuthorizationDetails | null; error: { message: string } | null };
type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id in the request.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/login?next=" + encodeURIComponent(next);
        return;
      }
      setUserEmail(sess.session.user.email ?? null);

      const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorizationId)
      : await oauth().denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an external app";
  const scopeList = details?.scopes ?? (details?.scope ? details.scope.split(/\s+/).filter(Boolean) : []);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background:
          "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(107,216,203,0.06) 0%, hsl(210,15%,6%) 70%)",
      }}
    >
      <div className="glass-panel rounded-xl p-8 w-full max-w-md teal-glow">
        <div className="flex items-center gap-2 justify-center mb-4">
          <InfradarLogo size={32} />
          <span className="font-serif text-lg font-semibold tracking-wide">INFRADARAI</span>
        </div>

        {error ? (
          <div className="space-y-3">
            <h1 className="text-lg font-semibold">Could not load this connection request</h1>
            <p className="text-sm text-destructive">{error}</p>
            <a href="/dashboard" className="text-xs text-muted-foreground hover:text-primary block">
              Back to dashboard
            </a>
          </div>
        ) : !details ? (
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2 py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading connection request…
          </p>
        ) : (
          <div className="space-y-5">
            <div>
              <h1 className="text-lg font-semibold">
                Connect {clientName} to InfraRadarAI
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                This lets {clientName} use InfraRadarAI as you. Your row-level security and plan limits
                still apply — {clientName} cannot see data you cannot see.
              </p>
            </div>

            {userEmail && (
              <div className="text-xs text-muted-foreground">
                Signed in as <span className="text-foreground">{userEmail}</span>
              </div>
            )}

            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" /> {clientName} will be able to:
              </div>
              <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
                <li>List and search infrastructure projects you can see in InfraRadarAI</li>
                <li>Read full project details, risks, and health signals</li>
                <li>Read recent alerts and your tracked-project watchlist</li>
              </ul>
              {scopeList.length > 0 && (
                <div className="text-[11px] text-muted-foreground pt-1">
                  Requested scopes: {scopeList.join(", ")}
                </div>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              You can revoke this connection at any time from your account settings.
            </p>

            <div className="flex gap-2">
              <Button
                onClick={() => decide(true)}
                disabled={busy}
                className="flex-1 teal-glow"
              >
                {busy ? "Working…" : `Approve ${clientName}`}
              </Button>
              <Button
                onClick={() => decide(false)}
                disabled={busy}
                variant="outline"
                className="flex-1"
              >
                Deny
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
