import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InfradarLogo } from '@/components/InfradarLogo';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { checkDisposableEmail, DISPOSABLE_EMAIL_MESSAGE } from '@/lib/disposable-email';
import { getStoredReferralCode } from '@/lib/utm';
import { trackEvent } from '@/lib/analytics';
import { ShieldCheck, Sparkles, Globe } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pilotSeatsLeft, setPilotSeatsLeft] = useState<number | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const refCode = new URLSearchParams(location.search).get('ref')?.toUpperCase() ?? getStoredReferralCode();
  // Preserve `?next=` through login/signup so OAuth consent (and any other
  // deep-link) returns the user to the URL they started from. Only accept
  // same-origin relative paths to avoid open-redirect abuse.
  const rawNext = new URLSearchParams(location.search).get('next');
  const nextPath = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';

  useEffect(() => {
    if (user?.email_confirmed_at) navigate(nextPath, { replace: true });
  }, [user, navigate, nextPath]);

  useEffect(() => {
    (supabase.rpc as any)('get_public_pilot_access_counter', {}).then(
      ({ data }: { data: { remaining_seats?: number } | null }) => {
        if (data?.remaining_seats != null) setPilotSeatsLeft(data.remaining_seats);
      },
    );
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isSignUp) {
      void trackEvent('signup_started', { method: 'email' }, 'auth');
      // 1) Fast client-side disposable-email check
      const localCheck = checkDisposableEmail(email);
      if (localCheck.ok === false) {
        const description =
          localCheck.reason === 'DISPOSABLE_EMAIL'
            ? DISPOSABLE_EMAIL_MESSAGE
            : 'Please enter a valid email address.';
        toast({ title: 'Sign up blocked', description, variant: 'destructive' });
        setLoading(false);
        return;
      }

      // 2) Server-side re-check (defense in depth).
      //    Fail OPEN when the validation service is unavailable: the client-side
      //    check already ran, and Supabase Auth still enforces email format.
      //    Only block when the function explicitly returns ok: false.
      try {
        const { data: validation, error: validationError } = await supabase.functions.invoke(
          'validate-signup-email',
          { body: { email } },
        );
        if (validationError) {
          // Service unavailable (503, network error, etc.) — log and proceed.
          console.warn('[Login] server-side email validation unavailable, proceeding', validationError);
        } else if (validation && validation.ok === false) {
          const description =
            (typeof validation.message === 'string' && validation.message) ||
            DISPOSABLE_EMAIL_MESSAGE;
          toast({ title: 'Sign up blocked', description, variant: 'destructive' });
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error('[Login] disposable-email validation failed', err);
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
          data: refCode ? { referred_by_code: refCode } : undefined,
        },
      });
      if (error) {
        toast({ title: 'Sign up failed', description: error.message, variant: 'destructive' });
      } else {
        void trackEvent('signup_completed', { method: 'email' }, 'auth');
        toast({
          title: 'Check your email',
          description: `We sent a verification link to ${email}. Confirm it once, then sign in with your password anytime.`,
        });
        setIsSignUp(false);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // A user who never clicked their confirmation link is otherwise stuck here
        // with no way back in. Detect that case and re-send the link instead of
        // dead-ending them on a generic error.
        const isUnconfirmed = /not confirmed|email.*confirm/i.test(error.message ?? '');
        if (isUnconfirmed) {
          void supabase.auth.resend({
            type: 'signup',
            email,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
          });
          toast({
            title: 'Email not confirmed',
            description: `We've re-sent the confirmation link to ${email}. Click it, then sign in.`,
          });
        } else {
          toast({ title: 'Sign in failed', description: error.message, variant: 'destructive' });
        }
      } else {
        void trackEvent('login_completed', { method: 'email' }, 'auth');
        navigate(nextPath);
      }
    }
    setLoading(false);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background:
          'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(107,216,203,0.06) 0%, hsl(210,15%,6%) 70%)',
      }}
    >
      <div className="glass-panel rounded-xl p-8 w-full max-w-sm teal-glow">
        <div className="flex items-center gap-2 justify-center mb-4">
          <InfradarLogo size={32} />
          <span className="font-serif text-lg font-semibold tracking-wide">INFRADARAI</span>
        </div>

        {/* Value strip - visible on sign-up, subtle on sign-in */}
        {isSignUp && (
          <div className="mb-5 space-y-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              <span>1,600+ verified projects across 14 global regions</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              <span>AI Q&A from $29/mo - ask anything about the pipeline</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              <span>
                {pilotSeatsLeft != null
                  ? `${pilotSeatsLeft} pilot seats left - 30 days Pro, no card required`
                  : '30-day Pro pilot available, no card required'}
              </span>
            </div>
          </div>
        )}

        <p className="text-sm text-muted-foreground text-center mb-6">
          {isSignUp ? 'Create your account' : 'Sign in to the intelligence platform'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Email</label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              placeholder="you@company.com"
              className="bg-black/20"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium">Password</label>
              {!isSignUp && (
                <Link
                  to="/auth/forgot-password"
                  className="text-xs text-primary hover:underline"
                >
                  Forgot?
                </Link>
              )}
            </div>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              minLength={6}
              className="bg-black/20"
            />
          </div>
          <Button type="submit" className="w-full teal-glow" disabled={loading}>
            {loading
              ? isSignUp
                ? 'Creating account...'
                : 'Signing in...'
              : isSignUp
                ? 'Create account'
                : 'Sign in'}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground text-center mt-4">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-primary hover:underline"
          >
            {isSignUp ? 'Sign in' : 'Sign up'}
          </button>
        </p>
        <div className="mt-4 pt-4 border-t border-border">
          <Link to="/" className="text-xs text-muted-foreground hover:text-primary block text-center">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
