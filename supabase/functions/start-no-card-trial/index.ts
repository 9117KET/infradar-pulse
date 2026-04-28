import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUserFromBearer } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Content-Type': 'application/json',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error('Missing backend configuration');

    const user = await getUserFromBearer(req, supabaseUrl, anonKey);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Sign in required' }), { status: 401, headers: corsHeaders });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: authUser, error: authError } = await admin.auth.admin.getUserById(user.id);
    const email = authUser?.user?.email ?? user.email;
    if (authError || !authUser?.user || !email) {
      return new Response(JSON.stringify({ error: 'Could not verify your account' }), { status: 401, headers: corsHeaders });
    }
    if (!authUser.user.email_confirmed_at) {
      return new Response(JSON.stringify({ error: 'Please confirm your email address before starting a trial.' }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const body = await req.json().catch(() => ({}));
    const environment = body?.environment === 'live' ? 'live' : 'sandbox';
    const emailNormalized = email.trim().toLowerCase().replace(/\+[^@]*(@)/, '$1');

    const [{ data: existingTrial }, { data: existingSub }, { data: existingLifetime }] = await Promise.all([
      admin
        .from('no_card_trial_grants')
        .select('id, ends_at, status')
        .eq('environment', environment)
        .or(`user_id.eq.${user.id},email_normalized.eq.${emailNormalized}`)
        .maybeSingle(),
      admin
        .from('subscriptions')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('environment', environment)
        .in('status', ['active', 'trialing', 'past_due'])
        .maybeSingle(),
      admin
        .from('lifetime_grants')
        .select('id')
        .eq('user_id', user.id)
        .eq('environment', environment)
        .maybeSingle(),
    ]);

    if (existingSub || existingLifetime) {
      return new Response(JSON.stringify({ error: 'Your account already has paid access.' }), { status: 409, headers: corsHeaders });
    }
    if (existingTrial) {
      return new Response(JSON.stringify({ error: 'This account has already used the 3-day trial.' }), { status: 409, headers: corsHeaders });
    }

    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + 3 * 24 * 60 * 60 * 1000);
    const { data: grant, error: insertError } = await admin
      .from('no_card_trial_grants')
      .insert({
        user_id: user.id,
        email_normalized: emailNormalized,
        environment,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: 'active',
      })
      .select('starts_at, ends_at, status')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return new Response(JSON.stringify({ error: 'This account has already used the 3-day trial.' }), { status: 409, headers: corsHeaders });
      }
      throw insertError;
    }

    await admin.rpc('record_trial_started', {
      p_user_id: user.id,
      p_email: email,
      p_paddle_customer_id: null,
      p_environment: environment,
    });

    return new Response(JSON.stringify({ trial: grant }), { headers: corsHeaders });
  } catch (e) {
    console.error('start-no-card-trial error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});