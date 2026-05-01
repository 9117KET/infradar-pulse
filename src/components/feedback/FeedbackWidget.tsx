import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageSquarePlus, X, Bug, Lightbulb, Heart, MessageCircle, Loader2 } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type FeedbackType = 'bug' | 'idea' | 'praise' | 'other';

const TYPE_OPTIONS: { value: FeedbackType; label: string; icon: typeof Bug; color: string }[] = [
  { value: 'bug', label: 'Bug', icon: Bug, color: 'text-red-400' },
  { value: 'idea', label: 'Idea', icon: Lightbulb, color: 'text-amber-400' },
  { value: 'praise', label: 'Praise', icon: Heart, color: 'text-pink-400' },
  { value: 'other', label: 'Other', icon: MessageCircle, color: 'text-primary' },
];

const feedbackSchema = z.object({
  type: z.enum(['bug', 'idea', 'praise', 'other']),
  message: z
    .string()
    .trim()
    .min(3, 'Please share a bit more detail')
    .max(4000, 'Keep it under 4000 characters'),
  email: z
    .string()
    .trim()
    .email('Enter a valid email')
    .max(255)
    .optional()
    .or(z.literal('')),
});

const DISMISS_KEY = 'infradar_feedback_widget_collapsed';

export function FeedbackWidget() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [type, setType] = useState<FeedbackType>('idea');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Restore collapsed state on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setCollapsed(window.localStorage.getItem(DISMISS_KEY) === '1');
  }, []);

  function toggleCollapse(next: boolean) {
    setCollapsed(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, next ? '1' : '0');
    }
  }

  function reset() {
    setType('idea');
    setMessage('');
    setEmail('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = feedbackSchema.safeParse({
      type,
      message,
      email: user?.email ? '' : email,
    });
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
        user_agent:
          typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 1000) : null,
      });

      if (error) throw error;

      toast.success('Thanks! We read every piece of feedback.');
      reset();
      setOpen(false);
    } catch (err) {
      console.error('feedback submit failed', err);
      toast.error('Could not send feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Hide entirely on auth pages and onboarding to avoid friction
  if (
    pathname.startsWith('/auth') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/checkout')
  ) {
    return null;
  }

  return (
    <>
      {/* Floating trigger — sits above the mobile bottom-nav (h≈56px + safe-area) */}
      {!open && (
        <div className="fixed right-4 z-40 flex items-end gap-2 bottom-[calc(1rem+env(safe-area-inset-bottom))] md:bottom-4 mb-16 md:mb-0">
          {collapsed ? (
            <button
              type="button"
              onClick={() => toggleCollapse(false)}
              className="h-11 w-11 rounded-full border border-border/60 bg-card/80 backdrop-blur shadow-lg hover:bg-card transition flex items-center justify-center text-muted-foreground hover:text-foreground touch-target"
              aria-label="Show feedback button"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1 rounded-full border border-border/60 bg-card/90 backdrop-blur shadow-lg pl-3 pr-1 py-1">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition min-h-[2.25rem]"
              >
                <MessageSquarePlus className="h-4 w-4 text-primary" />
                <span className="hidden sm:inline">Feedback</span>
              </button>
              <button
                type="button"
                onClick={() => toggleCollapse(true)}
                className="ml-1 h-7 w-7 rounded-full hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition"
                aria-label="Hide feedback button"
                title="Hide"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed right-4 z-50 w-[min(92vw,380px)] rounded-xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-200 bottom-[calc(1rem+env(safe-area-inset-bottom))] md:bottom-4 mb-16 md:mb-0 max-h-[calc(100dvh-6rem)] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
            <div>
              <div className="font-serif text-base font-semibold">Send feedback</div>
              <div className="text-xs text-muted-foreground">Help us improve Infradar</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-7 w-7 rounded-full hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <div className="grid grid-cols-4 gap-2">
              {TYPE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = type === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs transition',
                      active
                        ? 'border-primary/60 bg-primary/10 text-foreground'
                        : 'border-border/40 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                    )}
                  >
                    <Icon className={cn('h-4 w-4', active ? opt.color : '')} />
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="feedback-message" className="text-xs">
                Your message
              </Label>
              <Textarea
                id="feedback-message"
                placeholder={
                  type === 'bug'
                    ? 'What happened? What did you expect?'
                    : type === 'idea'
                      ? 'What would you love to see?'
                      : 'Tell us what is on your mind…'
                }
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={4000}
                required
              />
              <div className="text-[10px] text-muted-foreground text-right">
                {message.length}/4000
              </div>
            </div>

            {!user?.email && (
              <div className="space-y-1.5">
                <Label htmlFor="feedback-email" className="text-xs">
                  Email (optional, so we can follow up)
                </Label>
                <Input
                  id="feedback-email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={255}
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <p className="text-[10px] text-muted-foreground">
                Sent with: <span className="font-mono">{pathname}</span>
              </p>
              <Button type="submit" size="sm" disabled={submitting || message.trim().length < 3}>
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Sending
                  </>
                ) : (
                  'Send feedback'
                )}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
