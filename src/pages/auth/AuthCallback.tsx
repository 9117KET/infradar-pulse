// Lands users coming back from email confirmation, magic-link, or
// password-reset emails. Supabase parses the access_token from the URL hash
// automatically; we just route the user based on the recovery vs signup
// flow and on whether they're already onboarded.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { InfradarLogo } from '@/components/InfradarLogo';
import { Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      // Surface any explicit ?error=... from the OAuth/recovery redirect.
      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const errDesc = params.get('error_description') ?? hashParams.get('error_description');
      if (errDesc) {
        setError(errDesc);
        return;
      }

      // Recovery hash → send to reset-password screen. Supabase has already
      // set a recovery session.
      const type = hashParams.get('type');
      if (type === 'recovery') {
        navigate('/auth/reset-password', { replace: true });
        return;
      }

      // Otherwise wait for the session to settle, then route to the app.
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate('/login', { replace: true });
        return;
      }
      // Onboarding decides if profile setup is needed. If not, dashboard.
      navigate('/dashboard', { replace: true });
    })();
  }, [navigate]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background:
          'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(107,216,203,0.06) 0%, hsl(210,15%,6%) 70%)',
      }}
    >
      <div className="glass-panel rounded-xl p-8 w-full max-w-sm text-center">
        <div className="flex items-center gap-2 justify-center mb-4">
          <InfradarLogo size={32} />
          <span className="font-serif text-lg font-semibold tracking-wide">INFRADAR</span>
        </div>
        {error ? (
          <>
            <p className="text-sm text-destructive">Sign-in link error: {error}</p>
            <a href="/login" className="text-xs text-muted-foreground hover:text-primary mt-3 inline-block">
              Back to sign in
            </a>
          </>
        ) : (
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Signing you in…
          </p>
        )}
      </div>
    </div>
  );
}
