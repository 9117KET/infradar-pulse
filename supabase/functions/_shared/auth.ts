import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function getUserFromBearer(
  req: Request,
  supabaseUrl: string,
  anonKey: string
): Promise<{ id: string; email?: string } | null> {
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
  return { id: user.id, email: user.email ?? undefined };
}
