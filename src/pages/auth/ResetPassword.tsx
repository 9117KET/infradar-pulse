// Lands the user from the password-reset email link. Supabase has already set
// a `recovery` session by the time this page renders (handled in
// AuthCallback). Here we just collect a new password and call updateUser.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InfradarLogo } from '@/components/InfradarLogo';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Confirm we have a recovery session before showing the form. If a user
  // hits this URL directly without a token, kick them back to /login.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      setHasSession(!!data.session);
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (password.length < 8) {
      toast({ title: 'Password too short', description: 'Use at least 8 characters.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast({ title: 'Could not update password', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Password updated', description: 'You are now signed in.' });
    navigate('/dashboard', { replace: true });
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
        <h1 className="font-serif text-lg text-center mb-6">Choose a new password</h1>

        {hasSession === false ? (
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              This reset link is invalid or expired. Request a new one from the sign-in page.
            </p>
            <Button asChild variant="outline" className="w-full">
              <a href="/auth/forgot-password">Request a new link</a>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">New password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="••••••••"
                className="bg-black/20"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Confirm password</label>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                placeholder="••••••••"
                className="bg-black/20"
              />
            </div>
            <Button type="submit" className="w-full teal-glow" disabled={loading || hasSession === null}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Update password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
