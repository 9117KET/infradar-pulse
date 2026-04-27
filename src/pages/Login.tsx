import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InfradarLogo } from '@/components/InfradarLogo';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { checkDisposableEmail, DISPOSABLE_EMAIL_MESSAGE } from '@/lib/disposable-email';
import { lovable } from '@/integrations/lovable';
import { Loader2 } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  // Read referral code from URL if present (e.g. ?ref=ABC123)
  const refCode = new URLSearchParams(location.search).get('ref');

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  const handleGoogle = async () => {
    setOauthLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: `${window.location.origin}/auth/callback`,
      });
      if (result.error) {
        toast({
          title: 'Google sign-in failed',
          description: result.error.message,
          variant: 'destructive',
        });
      }
      // If result.redirected, the browser is now navigating to Google.
      // If tokens were returned inline, AuthProvider will pick up the session.
    } finally {
      setOauthLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isSignUp) {
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

      // 2) Server-side re-check (defense in depth)
      try {
        const { data: validation, error: validationError } = await supabase.functions.invoke(
          'validate-signup-email',
          { body: { email } },
        );
        if (validationError || (validation && validation.ok === false)) {
          const description =
            (validation && typeof validation.message === 'string' && validation.message) ||
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
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: refCode ? { referred_by_code: refCode } : undefined,
        },
      });
      if (error) {
        toast({ title: 'Sign up failed', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Check your email', description: 'We sent you a confirmation link.' });
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast({ title: 'Sign in failed', description: error.message, variant: 'destructive' });
      } else {
        navigate('/dashboard');
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
        <div className="flex items-center gap-2 justify-center mb-6">
          <InfradarLogo size={32} />
          <span className="font-serif text-lg font-semibold tracking-wide">INFRADAR</span>
        </div>
        <p className="text-sm text-muted-foreground text-center mb-6">
          {isSignUp ? 'Create your account' : 'Sign in to the intelligence platform'}
        </p>

        {/* Google OAuth — managed by Lovable Cloud, no extra config needed */}
        <Button
          type="button"
          variant="outline"
          className="w-full mb-4 gap-2"
          onClick={() => void handleGoogle()}
          disabled={oauthLoading || loading}
        >
          {oauthLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.98 10.98 0 0 0 12 23z" fill="#34A853" />
              <path d="M5.84 14.1A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.83z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335" />
            </svg>
          )}
          Continue with Google
        </Button>

        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-2 bg-card text-muted-foreground">or with email</span>
          </div>
        </div>

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
          <Button type="submit" className="w-full teal-glow" disabled={loading || oauthLoading}>
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
