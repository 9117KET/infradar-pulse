// Returns a Lemon Squeezy customer-portal URL for the signed-in user.
// Simpler than Paddle's equivalent: LS exposes a ready-made
// `urls.customer_portal` link directly on the subscription resource, so no
// session-creation call is needed — just fetch and return it.
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
      .select('ls_subscription_id, ls_customer_id')
      .eq('user_id', user.id)
      .eq('environment', env)
      .eq('provider', 'lemonsqueezy')
      .maybeSingle();

    if (!sub?.ls_customer_id) {
      return new Response(
        JSON.stringify({ error: 'No subscription on file. Subscribe first.' }),
        { status: 400, headers: corsHeaders },
      );
    }

    if (!sub.ls_subscription_id) {
      return new Response(JSON.stringify({ error: 'No subscription on file.' }), { status: 400, headers: corsHeaders });
    }

    const res = await lsFetch(`/subscriptions/${sub.ls_subscription_id}`);
    if (!res.ok) {
      const errBody = await res.text();
      console.error('lemonsqueezy-portal: LS API error', res.status, errBody);
      return new Response(JSON.stringify({ error: 'Failed to load billing portal.' }), { status: 502, headers: corsHeaders });
    }

    const json = await res.json();
    const url = json?.data?.attributes?.urls?.customer_portal;
    if (!url) {
      return new Response(JSON.stringify({ error: 'Billing portal unavailable.' }), { status: 502, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ url }), { headers: corsHeaders });
  } catch (e) {
    console.error('lemonsqueezy-portal error:', e);
    return new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
