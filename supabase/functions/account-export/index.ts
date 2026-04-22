// Returns a JSON bundle of the signed-in user's data for self-service export.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
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
    if (!user) return new Response(JSON.stringify({ error: 'Sign in required' }), { status: 401, headers: corsHeaders });

    const admin = createClient(supabaseUrl, serviceKey);

    const [
      { data: profile },
      { data: roles },
      { data: subs },
      { data: tracked },
      { data: savedSearches },
      { data: alertRules },
      { data: usage },
    ] = await Promise.all([
      admin.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      admin.from('user_roles').select('role').eq('user_id', user.id),
      admin.from('subscriptions').select('*').eq('user_id', user.id),
      admin.from('tracked_projects').select('*').eq('user_id', user.id),
      admin.from('saved_searches').select('*').eq('user_id', user.id),
      admin.from('alert_rules').select('*').eq('user_id', user.id),
      admin.from('usage_counters').select('*').eq('user_id', user.id),
    ]);

    const bundle = {
      exported_at: new Date().toISOString(),
      user: { id: user.id, email: user.email },
      profile,
      roles: roles?.map((r) => r.role) ?? [],
      subscriptions: subs ?? [],
      tracked_projects: tracked ?? [],
      saved_searches: savedSearches ?? [],
      alert_rules: alertRules ?? [],
      usage_counters: usage ?? [],
    };

    return new Response(JSON.stringify(bundle, null, 2), {
      headers: { ...corsHeaders, 'Content-Disposition': `attachment; filename="infradar-account-${user.id}.json"` },
    });
  } catch (e) {
    console.error('account-export error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
