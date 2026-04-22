// Reactivates a subscription that was scheduled to cancel at period end.
// Removes Paddle's scheduledChange so the subscription continues renewing.
// Webhook (subscription.updated) will sync cancel_at_period_end=false locally.
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
      .select('paddle_subscription_id, status, cancel_at_period_end')
      .eq('user_id', user.id)
      .eq('environment', env)
      .maybeSingle();

    if (!sub?.paddle_subscription_id) {
      return new Response(JSON.stringify({ error: 'No subscription on file.' }), { status: 400, headers: corsHeaders });
    }

    if (!sub.cancel_at_period_end) {
      return new Response(
        JSON.stringify({ error: 'Subscription is not scheduled to cancel.' }),
        { status: 400, headers: corsHeaders },
      );
    }

    // Paddle: setting scheduledChange to null clears the pending cancel.
    // prorationBillingMode is required by the API even when nothing changes.
    const paddle = getPaddleClient(env);
    const updated = await paddle.subscriptions.update(sub.paddle_subscription_id, {
      scheduledChange: null,
      prorationBillingMode: 'do_not_bill',
    });

    return new Response(
      JSON.stringify({ ok: true, status: updated.status }),
      { headers: corsHeaders },
    );
  } catch (e) {
    console.error('paddle-resume error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
