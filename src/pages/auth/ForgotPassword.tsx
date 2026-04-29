// Forgot-password screen. Sends a reset link to the user's email; they land
// on /auth/reset-password where Supabase has set a recovery session that
// lets them call updateUser({ password }).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InfradarLogo } from '@/components/InfradarLogo';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setLoading(false);
    if (error) {
      // Don't leak whether the address exists — generic success either way.
      console.warn('resetPasswordForEmail error:', error.message);
    }
    setSent(true);
    toast({
      title: 'Check your email',
      description: 'If an account exists for this address, we sent a reset link.',
    });
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
          <span className="font-serif text-lg font-semibold tracking-wide">INFRADARAI</span>
        </div>
        <h1 className="font-serif text-lg text-center mb-1">Reset your password</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">
          We'll send a one-time link to your email.
        </p>

        {sent ? (
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              If <span className="text-foreground">{email}</span> matches an account, a reset
              link is on its way. The link expires in one hour.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                className="bg-black/20"
              />
            </div>
            <Button type="submit" className="w-full teal-glow" disabled={loading || !email}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Send reset link
            </Button>
            <div className="text-center">
              <Link to="/login" className="text-xs text-muted-foreground hover:text-primary">
                ← Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
