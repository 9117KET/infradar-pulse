// Account data export and permanent deletion. Provider-agnostic.
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';

/** Triggers a JSON download of the signed-in user's data. */
export async function exportAccountData(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in required');

  const url = `${SUPABASE_URL}/functions/v1/account-export`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `infradar-account-${session.user.id}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('account-delete', { body: {} });
  if (error) throw new Error(error.message);
  await supabase.auth.signOut();
  window.location.href = '/';
}
