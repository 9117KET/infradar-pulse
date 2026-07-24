// Creates a Lemon Squeezy Checkout object server-side and returns its URL.
//
// Deliberately NOT a static "buy-link with client-supplied query params" —
// trusting a client-supplied variant ID would let a tampered client point
// checkout at the wrong price for a given plan key. Resolving the plan key
// to a variant ID server-side (via lemonsqueezyPlans.ts) mirrors the trust
// boundary already established by Paddle's get-paddle-price function.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { lsFetch, getStoreId } from '../_shared/lemonsqueezy.ts';
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

    const user = await getUserFromBearer(req, supabaseUrl, anonKey);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Sign in required' }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const planKey: LsPlanKey | undefined = body.planKey;
    const referralCode: string | undefined = body.referralCode;
    const redirectUrl: string | undefined = body.redirectUrl;

    if (!planKey) {
      return new Response(JSON.stringify({ error: 'planKey required' }), { status: 400, headers: corsHeaders });
    }

    let variantId: string;
    try {
      variantId = getVariantId(planKey);
    } catch {
      return new Response(JSON.stringify({ error: 'Unknown plan' }), { status: 400, headers: corsHeaders });
    }

    const res = await lsFetch('/checkouts', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: {
              email: user.email ?? undefined,
              custom: {
                user_id: user.id,
                ...(referralCode ? { referral_code: referralCode } : {}),
              },
            },
            product_options: {
              ...(redirectUrl ? { redirect_url: redirectUrl } : {}),
            },
          },
          relationships: {
            store: { data: { type: 'stores', id: getStoreId() } },
            variant: { data: { type: 'variants', id: variantId } },
          },
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('lemonsqueezy-create-checkout: LS API error', res.status, errBody);
      return new Response(JSON.stringify({ error: 'Failed to create checkout.' }), { status: 502, headers: corsHeaders });
    }

    const json = await res.json();
    const url = json?.data?.attributes?.url;
    if (!url) {
      return new Response(JSON.stringify({ error: 'Checkout URL unavailable.' }), { status: 502, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ url }), { headers: corsHeaders });
  } catch (e) {
    console.error('lemonsqueezy-create-checkout error:', e);
    return new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
