import { useEffect, useState } from 'react';
import { Share2, Loader2, Copy, Check, Gift } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useToast } from '@/hooks/use-toast';
import { trackEvent } from '@/lib/analytics';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/**
 * Self-service referral card: share link + copy button + live reward stats.
 *
 * The reward is the growth loop's core: each friend who signs up earns the
 * referrer +3 AI queries/day (capped at +30). Stats come from useEntitlements
 * (live RPC my_referral_summary), so they update in realtime as referrals land.
 *
 * Shown in Settings and on the dashboard Overview for free-tier users.
 */
export function ReferralDashboardCard({ className }: { className?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { qualifiedReferrals, pendingReferrals, referralBonus, refresh } = useEntitlements();
  const [code, setCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    (supabase as any)
      .from('referral_codes')
      .select('code')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }: { data: { code: string } | null }) => {
        if (data?.code) setCode(data.code);
      });
  }, [user]);

  const getOrCreateCode = async () => {
    if (code || !user) return;
    setCreating(true);
    const raw = Array.from(crypto.getRandomValues(new Uint8Array(5)))
      .map((b) => b.toString(36))
      .join('')
      .toUpperCase();
    const { data, error } = await (supabase as any)
      .from('referral_codes')
      .insert({ user_id: user.id, code: raw })
      .select('code')
      .single();
    if (!error && data) setCode(data.code);
    setCreating(false);
  };

  const referralUrl = code ? `https://infradarai.com?ref=${code}` : null;

  const copyLink = () => {
    if (!referralUrl) return;
    navigator.clipboard.writeText(referralUrl).then(() => {
      setCopied(true);
      toast({ title: 'Copied', description: 'Referral link copied to clipboard.' });
      void trackEvent('referral_shared', { code, qualified: qualifiedReferrals }, 'growth');
      setTimeout(() => setCopied(false), 2000);
      void refresh();
    });
  };

  const atCap = referralBonus >= 30;

  return (
    <div className={`glass-panel rounded-xl p-6 space-y-4 ${className ?? ''}`}>
      <h3 className="font-serif text-lg font-semibold flex items-center gap-2">
        <Share2 className="h-5 w-5 text-primary" />
        Earn more daily AI queries
      </h3>
      <p className="text-sm text-muted-foreground">
        Share your link. Every colleague who signs up earns you{' '}
        <span className="font-medium text-foreground">+3 AI queries/day</span> (up to +30).
        They also start with <span className="font-medium text-foreground">+3/day for 14 days</span>.
      </p>

      {code ? (
        <div className="flex gap-2">
          <Input readOnly value={referralUrl ?? ''} className="font-mono text-xs bg-muted/30" />
          <Button variant="outline" size="sm" onClick={copyLink} aria-label="Copy referral link">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" disabled={creating} onClick={() => void getOrCreateCode()}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Share2 className="h-4 w-4 mr-2" />}
          Generate referral link
        </Button>
      )}

      <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-border/40 text-sm">
        <div>
          <div className="text-2xl font-semibold">{qualifiedReferrals}</div>
          <div className="text-xs text-muted-foreground">qualified</div>
        </div>
        {pendingReferrals > 0 && (
          <div>
            <div className="text-2xl font-semibold text-muted-foreground">{pendingReferrals}</div>
            <div className="text-xs text-muted-foreground">pending</div>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-primary">
          <Gift className="h-4 w-4" />
          <span className="font-medium">
            +{referralBonus}/day{atCap ? ' (max)' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

export default ReferralDashboardCard;
