import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUserFromBearer } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const EVENT_NAME_RE = /^[a-z][a-z0-9_]{1,63}$/;
const CATEGORY_RE = /^[a-z][a-z0-9_]{1,31}$/;
const MAX_PROPS_BYTES = 8_000;

function cleanString(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function sanitizeJson(value: unknown, depth = 0): unknown {
  if (depth > 4) return null;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => sanitizeJson(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(key)) continue;
      out[key] = sanitizeJson(child, depth + 1);
    }
    return out;
  }
  return null;
}

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

    const raw = await req.json().catch(() => null);
    if (!raw || typeof raw !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: corsHeaders });
    }

    const body = raw as Record<string, unknown>;
    const eventName = cleanString(body.event_name, 64);
    const eventCategory = cleanString(body.event_category, 32) ?? 'product';
    const sessionId = cleanString(body.session_id, 120);
    const anonymousId = cleanString(body.anonymous_id, 120);
    const pagePath = cleanString(body.page_path, 500);
    const referrer = cleanString(body.referrer, 500);
    const planKey = cleanString(body.plan_key, 80);
    const properties = sanitizeJson(body.properties ?? {}) as Record<string, unknown>;

    if (!eventName || !EVENT_NAME_RE.test(eventName)) {
      return new Response(JSON.stringify({ error: 'Invalid event name' }), { status: 400, headers: corsHeaders });
    }
    if (!CATEGORY_RE.test(eventCategory)) {
      return new Response(JSON.stringify({ error: 'Invalid event category' }), { status: 400, headers: corsHeaders });
    }
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Missing session id' }), { status: 400, headers: corsHeaders });
    }
    if (new TextEncoder().encode(JSON.stringify(properties)).length > MAX_PROPS_BYTES) {
      return new Response(JSON.stringify({ error: 'Properties payload too large' }), { status: 413, headers: corsHeaders });
    }

    const user = await getUserFromBearer(req, supabaseUrl, anonKey).catch(() => null);
    const roles = Array.isArray(body.roles)
      ? body.roles.filter((role): role is string => typeof role === 'string' && ['user', 'researcher', 'admin'].includes(role)).slice(0, 3)
      : [];

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { error } = await admin.from('user_events').insert({
      user_id: user?.id ?? null,
      anonymous_id: anonymousId,
      session_id: sessionId,
      event_name: eventName,
      event_category: eventCategory,
      page_path: pagePath,
      referrer,
      properties,
      plan_key: planKey,
      roles,
      user_agent: cleanString(req.headers.get('user-agent'), 500),
    });

    if (error) throw error;
    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (e) {
    console.error('track-event error:', e);
    return new Response(JSON.stringify({ error: 'Could not track event' }), { status: 500, headers: corsHeaders });
  }
});