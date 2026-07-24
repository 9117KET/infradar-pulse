// Cancels the user's Lemon Squeezy subscription (access continues until the
// current period's `ends_at`). Webhook (subscription_cancelled) syncs local
// status once LS processes it.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { lsFetch, type LsEnv } from '../_shared/lemonsqueezy.ts';
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
    if (!user) {
      return new Response(JSON.stringify({ error: 'Sign in required' }), { status: 401, headers: corsHeaders });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const env = (body.environment === 'live' ? 'live' : 'sandbox') as LsEnv;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: sub } = await admin
      .from('subscriptions')
      .select('ls_subscription_id')
      .eq('user_id', user.id)
      .eq('environment', env)
      .eq('provider', 'lemonsqueezy')
      .maybeSingle();

    if (!sub?.ls_subscription_id) {
      return new Response(JSON.stringify({ error: 'No active subscription.' }), { status: 400, headers: corsHeaders });
    }

    const res = await lsFetch(`/subscriptions/${sub.ls_subscription_id}`, { method: 'DELETE' });
    if (!res.ok) {
      const errBody = await res.text();
      console.error('lemonsqueezy-cancel: LS API error', res.status, errBody);
      return new Response(JSON.stringify({ error: 'Failed to cancel subscription.' }), { status: 502, headers: corsHeaders });
    }

    const json = await res.json();
    return new Response(
      JSON.stringify({ ok: true, status: json?.data?.attributes?.status, ends_at: json?.data?.attributes?.ends_at }),
      { headers: corsHeaders },
    );
  } catch (e) {
    console.error('lemonsqueezy-cancel error:', e);
    return new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
