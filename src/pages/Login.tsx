import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InfradarLogo } from '@/components/InfradarLogo';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
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
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(107,216,203,0.06) 0%, hsl(210,15%,6%) 70%)' }}>
      <div className="glass-panel rounded-xl p-8 w-full max-w-sm teal-glow">
        <div className="flex items-center gap-2 justify-center mb-6">
          <InfradarLogo size={32} />
          <span className="font-serif text-lg font-semibold tracking-wide">INFRADAR</span>
        </div>
        <p className="text-sm text-muted-foreground text-center mb-6">
          {isSignUp ? 'Create your account' : 'Sign in to the intelligence platform'}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Email</label>
            <Input value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="you@company.com" className="bg-black/20" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Password</label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" minLength={6} className="bg-black/20" />
          </div>
          <Button type="submit" className="w-full teal-glow" disabled={loading}>
            {loading ? (isSignUp ? 'Creating account...' : 'Signing in...') : (isSignUp ? 'Create account' : 'Sign in')}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground text-center mt-4">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button onClick={() => setIsSignUp(!isSignUp)} className="text-primary hover:underline">
            {isSignUp ? 'Sign in' : 'Sign up'}
          </button>
        </p>
        <div className="mt-4 pt-4 border-t border-border">
          <Link to="/" className="text-xs text-muted-foreground hover:text-primary block text-center">← Back to home</Link>
        </div>
      </div>
    </div>
  );
}
