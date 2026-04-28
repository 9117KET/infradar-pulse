import { supabase } from '@/integrations/supabase/client';
import { getStoredUtmParams } from '@/lib/utm';

const ANON_KEY = 'infradarai_anon_id';
const SESSION_KEY = 'infradarai_session_id';

export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined | string[]>;

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export function getAnalyticsIds() {
  let anonymousId = localStorage.getItem(ANON_KEY);
  if (!anonymousId) {
    anonymousId = id('anon');
    localStorage.setItem(ANON_KEY, anonymousId);
  }
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = id('session');
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return { anonymousId, sessionId };
}

function safePath() {
  return `${window.location.pathname}${window.location.search}`.slice(0, 500);
}

export async function trackEvent(
  eventName: string,
  properties: AnalyticsProperties = {},
  eventCategory = 'product',
) {
  try {
    const { anonymousId, sessionId } = getAnalyticsIds();
    const { data: { session } } = await supabase.auth.getSession();
    const utm = getStoredUtmParams();
    await supabase.functions.invoke('track-event', {
      body: {
        event_name: eventName,
        event_category: eventCategory,
        anonymous_id: anonymousId,
        session_id: sessionId,
        page_path: safePath(),
        referrer: document.referrer || null,
        properties: { ...utm, ...properties },
      },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    });
  } catch {
    // Product analytics must never block the app experience.
  }
}

export function trackPageView(path = safePath()) {
  return trackEvent('page_viewed', { path }, 'navigation');
}