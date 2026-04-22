// Returns a Paddle customer portal URL for the signed-in user. Opens in a new tab.
//
// Important edge case: if the user only has a CANCELED subscription, we
// still want to show them the portal (to download invoices, update payment
// methods, etc.) — we just don't pass any subscription IDs to the portal
// session call, which would 400 on a canceled sub.
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
    if (!user) {
      return new Response(JSON.stringify({ error: 'Sign in required' }), { status: 401, headers: corsHeaders });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const env = (body.environment === 'live' ? 'live' : 'sandbox') as PaddleEnv;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: sub } = await admin
      .from('subscriptions')
      .select('paddle_customer_id, paddle_subscription_id, status, environment')
      .eq('user_id', user.id)
      .eq('environment', env)
      .maybeSingle();

    if (!sub?.paddle_customer_id) {
      return new Response(
        JSON.stringify({ error: 'No subscription on file. Subscribe first.' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Only attach the subscription ID for portal links if the sub is still
    // alive on Paddle's side. For canceled subs, Paddle returns an error
    // when you try to bind the portal session to a non-actionable sub.
    const stillActive =
      sub.paddle_subscription_id && !['canceled'].includes(sub.status ?? '');

    const paddle = getPaddleClient(env);
    const portal = await paddle.customerPortalSessions.create(
      sub.paddle_customer_id,
      stillActive ? [sub.paddle_subscription_id!] : []
    );

    return new Response(
      JSON.stringify({ url: portal.urls?.general?.overview }),
      { headers: corsHeaders }
    );
  } catch (e) {
    console.error('paddle-portal error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
