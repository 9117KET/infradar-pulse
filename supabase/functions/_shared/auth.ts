import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AuthUser = {
  id: string;
  email?: string;
  /** ISO timestamp the user verified their email, or null if unverified. */
  email_confirmed_at: string | null;
};

export async function getUserFromBearer(
  req: Request,
  supabaseUrl: string,
  anonKey: string
): Promise<AuthUser | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const supabase: SupabaseClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Prefer local/JWKS-backed claims validation. Calling getUser() requires the
  // auth service to make a live database-backed lookup; during brief auth API
  // restarts it can fail even when the browser still has a valid session, which
  // caused staff agent runs to incorrectly return "Sign in required.".
  try {
    const { data, error } = await supabase.auth.getClaims(token);
    const claims = data?.claims as Record<string, unknown> | undefined;
    if (!error && claims?.sub) {
      return {
        id: String(claims.sub),
        email: typeof claims.email === "string" ? claims.email : undefined,
        email_confirmed_at: typeof claims.email_confirmed_at === "string" ? claims.email_confirmed_at : null,
      };
    }
  } catch {
    // Fall through to getUser() for older runtimes or non-JWKS tokens.
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return {
    id: user.id,
    email: user.email ?? undefined,
    email_confirmed_at: user.email_confirmed_at ?? null,
  };
}

/**
 * Returns true when the user has confirmed their email address. We block
 * AI/export/insight-read actions for unconfirmed accounts to stop people
 * from spinning up throwaway emails just to burn free quota.
 */
export function isEmailVerified(user: AuthUser | null): boolean {
  return !!user?.email_confirmed_at;
}
