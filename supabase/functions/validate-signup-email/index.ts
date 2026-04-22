// Validates an email against the disposable provider blocklist server-side.
// Called by the Login page before signUp() so we never even create an
// auth.users row for a throwaway domain.
import { checkDisposableEmail, DISPOSABLE_EMAIL_MESSAGE } from "../_shared/disposableEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json().catch(() => ({ email: null }));
    const result = checkDisposableEmail(email);

    if (!result.ok) {
      const status = result.reason === "DISPOSABLE_EMAIL" ? 422 : 400;
      const message =
        result.reason === "DISPOSABLE_EMAIL"
          ? DISPOSABLE_EMAIL_MESSAGE
          : "Please enter a valid email address.";
      return new Response(
        JSON.stringify({
          ok: false,
          reason: result.reason,
          domain: result.domain ?? null,
          message,
        }),
        {
          status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, domain: result.domain }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[validate-signup-email] unexpected error", err);
    return new Response(
      JSON.stringify({ ok: false, reason: "INTERNAL_ERROR", message: "Validation failed." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
