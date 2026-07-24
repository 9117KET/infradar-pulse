// Upgrades / downgrades a user's Lemon Squeezy subscription to a different
// variant. Unlike Paddle, LS has no native "schedule change for period end" —
// variant changes (and their proration) apply immediately. For v1 we accept
// this for both upgrades and downgrades on LS, dropping Paddle's
// downgrade-grandfathering behavior for LS customers. This is a deliberate,
// called-out UX difference between the two providers, not an oversight.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { lsFetch, type LsEnv } from '../_shared/lemonsqueezy.ts';
import { getVariantId, type LsPlanKey } from '../_shared/lemonsqueezyPlans.ts';
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
    const planKey: LsPlanKey | undefined = body.planKey;
    const env = (body.environment === 'live' ? 'live' : 'sandbox') as LsEnv;

    if (!planKey) {
      return new Response(JSON.stringify({ error: 'planKey required' }), { status: 400, headers: corsHeaders });
    }

    let variantId: string;
    try {
      variantId = getVariantId(planKey);
    } catch {
      return new Response(JSON.stringify({ error: 'Unknown plan' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: sub } = await admin
      .from('subscriptions')
      .select('ls_subscription_id, status')
      .eq('user_id', user.id)
      .eq('environment', env)
      .eq('provider', 'lemonsqueezy')
      .in('status', ['active', 'on_trial', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub?.ls_subscription_id) {
      return new Response(
        JSON.stringify({ error: 'No active subscription. Subscribe first.' }),
        { status: 400, headers: corsHeaders },
      );
    }

    const res = await lsFetch(`/subscriptions/${sub.ls_subscription_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          type: 'subscriptions',
          id: sub.ls_subscription_id,
          attributes: { variant_id: Number(variantId) },
        },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error('lemonsqueezy-change-plan: LS API error', res.status, errBody);
      return new Response(JSON.stringify({ error: 'Failed to change plan.' }), { status: 502, headers: corsHeaders });
    }

    const json = await res.json();
    return new Response(
      JSON.stringify({ ok: true, status: json?.data?.attributes?.status }),
      { headers: corsHeaders },
    );
  } catch (e) {
    console.error('lemonsqueezy-change-plan error:', e);
    return new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
