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
  const supabase: SupabaseClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
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
