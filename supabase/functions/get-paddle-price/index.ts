// Resolves human-readable price IDs (e.g. "starter_monthly") to Paddle internal
// IDs that Paddle.Checkout.open() requires.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { gatewayFetch, type PaddleEnv } from '../_shared/paddle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Content-Type': 'application/json',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { priceId, environment } = await req.json();
    if (!priceId) {
      return new Response(JSON.stringify({ error: 'priceId required' }), { status: 400, headers: corsHeaders });
    }
    const env = (environment === 'live' ? 'live' : 'sandbox') as PaddleEnv;

    const response = await gatewayFetch(env, `/prices?external_id=${encodeURIComponent(priceId)}`);
    const data = await response.json();

    if (!data?.data?.length) {
      return new Response(JSON.stringify({ error: 'Price not found' }), { status: 404, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ paddleId: data.data[0].id }), { headers: corsHeaders });
  } catch (e) {
    console.error('get-paddle-price error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
