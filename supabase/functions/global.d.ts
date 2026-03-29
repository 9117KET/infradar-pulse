/**
 * Ambient types so editors can analyze Edge Functions without the Deno extension.
 * Runtime is Deno on Supabase; `https://` imports are valid there.
 */
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(
    handler: (request: Request) => Response | Promise<Response>,
  ): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export type SupabaseClient = import("@supabase/supabase-js").SupabaseClient;
  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: Record<string, unknown>,
  ): import("@supabase/supabase-js").SupabaseClient;
}

declare module "https://esm.sh/stripe@17.4.0?target=deno" {
  class Stripe {
    static createFetchHttpClient(): unknown;
    constructor(key: string, options?: Record<string, unknown>);
    checkout: {
      sessions: { create: (p: Record<string, unknown>) => Promise<{ url: string | null }> };
    };
    billingPortal: {
      sessions: { create: (p: Record<string, unknown>) => Promise<{ url: string }> };
    };
    webhooks: {
      constructEvent: (body: string, sig: string | null, secret: string) => Stripe.Event;
    };
    subscriptions: {
      retrieve: (id: string) => Promise<Stripe.Subscription>;
    };
  }
  namespace Stripe {
    interface Subscription {
      id: string;
      status: string;
      customer: string;
      items: { data: Array<{ price?: { id?: string } }> };
      trial_end: number | null;
      current_period_end: number;
      cancel_at_period_end?: boolean;
      metadata?: { supabase_user_id?: string };
    }
    namespace Checkout {
      /** Loose shape for checkout.sessions.create (Stripe SDK types). */
      type SessionCreateParams = Record<string, unknown>;
      interface Session {
        customer?: string | null;
        subscription?: string | null;
        metadata?: { supabase_user_id?: string };
      }
    }
    interface Event {
      type: string;
      data: { object: Subscription | Checkout.Session };
    }
  }
  export default Stripe;
}
