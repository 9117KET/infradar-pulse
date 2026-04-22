// Persistent banner shown above the dashboard when the user has not verified
// their email yet. The server-side usage gate blocks AI/exports/insights for
// these users, so without this banner they'd get a confusing 403. Includes a
// "Resend email" button.
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Mail, Loader2 } from 'lucide-react';

export function EmailVerificationBanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  // Don't render until we have a user object. email_confirmed_at is set the
  // moment they click the link in their inbox; refresh on next page load.
  if (!user) return null;
  if (user.email_confirmed_at) return null;

  const resend = async () => {
    if (!user.email) return;
    setSending(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: user.email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSending(false);
    if (error) {
      toast({ title: 'Could not resend', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Verification email sent', description: `Check ${user.email}.` });
    }
  };

  return (
    <div className="w-full bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 text-sm flex items-center justify-center gap-3 flex-wrap">
      <Mail className="h-4 w-4 text-amber-500 shrink-0" />
      <span className="text-foreground">
        Confirm your email to unlock AI, exports, and full insight reads. Check{' '}
        <span className="font-medium">{user.email}</span> for the verification link.
      </span>
      <Button size="sm" variant="outline" onClick={() => void resend()} disabled={sending}>
        {sending ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : null}
        Resend email
      </Button>
    </div>
  );
}
