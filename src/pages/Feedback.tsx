import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { z } from 'zod';
import { Bug, Lightbulb, Heart, MessageCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type FeedbackType = 'bug' | 'idea' | 'praise' | 'other';

const TYPE_OPTIONS: { value: FeedbackType; label: string; icon: typeof Bug; color: string; hint: string }[] = [
  { value: 'bug', label: 'Bug', icon: Bug, color: 'text-red-400', hint: 'Something is broken or behaving unexpectedly.' },
  { value: 'idea', label: 'Idea', icon: Lightbulb, color: 'text-amber-400', hint: 'A feature, dataset, or workflow you would love.' },
  { value: 'praise', label: 'Praise', icon: Heart, color: 'text-pink-400', hint: 'Tell us what is working well.' },
  { value: 'other', label: 'Other', icon: MessageCircle, color: 'text-primary', hint: 'Anything else on your mind.' },
];

const schema = z.object({
  type: z.enum(['bug', 'idea', 'praise', 'other']),
  message: z.string().trim().min(3, 'Please share a bit more detail').max(4000),
  email: z.string().trim().email('Enter a valid email').max(255).optional().or(z.literal('')),
});

export default function FeedbackPage() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [type, setType] = useState<FeedbackType>('idea');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Feedback | Infradar';
    return () => { document.title = prevTitle; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ type, message, email: user?.email ? '' : email });
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
      toast.error(first ?? 'Please check the form');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('feedback').insert({
        user_id: user?.id ?? null,
        email: user?.email ?? (parsed.data.email || null),
        type: parsed.data.type,
        message: parsed.data.message,
        page: pathname,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 1000) : null,
      });
      if (error) throw error;
      setSubmitted(true);
      setMessage('');
      setEmail('');
    } catch (err) {
      console.error(err);
      toast.error('Could not send feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="py-16 sm:py-20">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <header className="mb-10 text-center">
          <h1 className="font-serif text-4xl sm:text-5xl font-bold mb-3">Tell us what you think</h1>
          <p className="text-muted-foreground">
            Bugs, feature ideas, missing data, or simply what you love. Every message is read by the team.
          </p>
        </header>

        {submitted ? (
          <div className="rounded-xl border border-border/50 bg-card/40 p-8 text-center backdrop-blur">
            <h2 className="font-serif text-2xl font-bold mb-2">Thanks for the feedback</h2>
            <p className="text-muted-foreground mb-6">
              We will look into it. If you left an email, we may follow up directly.
            </p>
            <Button variant="outline" onClick={() => setSubmitted(false)}>Send another</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-xl border border-border/50 bg-card/40 p-6 sm:p-8 backdrop-blur space-y-6">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Type</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                {TYPE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = type === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setType(opt.value)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-sm transition',
                        active
                          ? 'border-primary/60 bg-primary/10 text-foreground'
                          : 'border-border/40 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                      )}
                    >
                      <Icon className={cn('h-5 w-5', active ? opt.color : '')} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {TYPE_OPTIONS.find((o) => o.value === type)?.hint}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Your message</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                maxLength={4000}
                placeholder="Be as specific as you can. Steps, expected vs actual, links — all helpful."
                required
              />
              <div className="text-[11px] text-muted-foreground text-right">{message.length}/4000</div>
            </div>

            {!user?.email && (
              <div className="space-y-2">
                <Label htmlFor="email">Email (optional)</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={255}
                />
                <p className="text-[11px] text-muted-foreground">Only used to follow up on your feedback.</p>
              </div>
            )}

            <Button type="submit" disabled={submitting || message.trim().length < 3} className="w-full sm:w-auto">
              {submitting ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending</>) : 'Send feedback'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
