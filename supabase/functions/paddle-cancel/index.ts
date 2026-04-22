// Cancels the user's Paddle subscription at the end of the current billing
// period. Webhook will mark cancel_at_period_end=true; status flips to
// 'canceled' once the period actually ends.
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
      .select('paddle_subscription_id')
      .eq('user_id', user.id)
      .eq('environment', env)
      .maybeSingle();

    if (!sub?.paddle_subscription_id) {
      return new Response(JSON.stringify({ error: 'No active subscription.' }), { status: 400, headers: corsHeaders });
    }

    const paddle = getPaddleClient(env);
    const cancelled = await paddle.subscriptions.cancel(sub.paddle_subscription_id, {
      effectiveFrom: 'next_billing_period',
    });

    return new Response(
      JSON.stringify({ ok: true, status: cancelled.status, cancel_at: cancelled.scheduledChange?.effectiveAt }),
      { headers: corsHeaders }
    );
  } catch (e) {
    console.error('paddle-cancel error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
