// Upgrades / downgrades a user's Paddle subscription to a different price,
// charging or crediting the prorated difference immediately.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getPaddleClient, gatewayFetch, type PaddleEnv } from '../_shared/paddle.ts';
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

    const body = await req.json().catch(() => ({}));
    const newPriceExternalId: string | undefined = body.priceId;
    const env = (body.environment === 'live' ? 'live' : 'sandbox') as PaddleEnv;

    if (!newPriceExternalId) {
      return new Response(JSON.stringify({ error: 'priceId required' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: sub } = await admin
      .from('subscriptions')
      .select('paddle_subscription_id')
      .eq('user_id', user.id)
      .eq('environment', env)
      .maybeSingle();

    if (!sub?.paddle_subscription_id) {
      return new Response(
        JSON.stringify({ error: 'No active subscription. Subscribe first.' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Resolve external_id → Paddle internal price id.
    const priceLookup = await gatewayFetch(env, `/prices?external_id=${encodeURIComponent(newPriceExternalId)}`);
    const priceData = await priceLookup.json();
    const paddlePriceId: string | undefined = priceData?.data?.[0]?.id;
    if (!paddlePriceId) {
      return new Response(JSON.stringify({ error: 'Price not found' }), { status: 404, headers: corsHeaders });
    }

    const paddle = getPaddleClient(env);
    const updated = await paddle.subscriptions.update(sub.paddle_subscription_id, {
      items: [{ priceId: paddlePriceId, quantity: 1 }],
      prorationBillingMode: 'prorated_immediately',
    });

    return new Response(JSON.stringify({ ok: true, status: updated.status }), { headers: corsHeaders });
  } catch (e) {
    console.error('paddle-change-plan error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
