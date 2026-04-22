// Deletes the signed-in user permanently. Cancels any active Paddle subscription
// first (immediate effect, since the account is going away), then removes the
// auth.users row — RLS cascades wipe profile, watchlists, alerts, etc.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getPaddleClient, type PaddleEnv } from '../_shared/paddle.ts';
import { getUserFromBearer } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Content-Type': 'application/json',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const user = await getUserFromBearer(req, supabaseUrl, anonKey);
    if (!user) return new Response(JSON.stringify({ error: 'Sign in required' }), { status: 401, headers: corsHeaders });

    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Cancel any active subscriptions in Paddle (best-effort, both envs).
    const { data: subs } = await admin
      .from('subscriptions')
      .select('paddle_subscription_id, environment, status')
      .eq('user_id', user.id);

    for (const sub of subs ?? []) {
      if (!sub.paddle_subscription_id) continue;
      if (['canceled', 'paused'].includes(sub.status)) continue;
      try {
        const paddle = getPaddleClient(sub.environment as PaddleEnv);
        await paddle.subscriptions.cancel(sub.paddle_subscription_id, { effectiveFrom: 'immediately' });
      } catch (e) {
        console.warn('account-delete: failed to cancel paddle sub', sub.paddle_subscription_id, e);
      }
    }

    // 2. Delete the user. ON DELETE CASCADE on profiles + tracked_projects +
    //    saved_searches + alert_rules + subscriptions + user_roles wipes the rest.
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) {
      return new Response(JSON.stringify({ error: delErr.message }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (e) {
    console.error('account-delete error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
