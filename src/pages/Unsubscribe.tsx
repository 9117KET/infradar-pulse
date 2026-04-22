import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Mail } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type State =
  | { status: 'loading' }
  | { status: 'valid' }
  | { status: 'already' }
  | { status: 'invalid'; reason: string }
  | { status: 'submitting' }
  | { status: 'success' }
  | { status: 'error'; reason: string };

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ status: 'invalid', reason: 'Missing unsubscribe token in URL.' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON_KEY } },
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.valid === true) {
          setState({ status: 'valid' });
        } else if (data.reason === 'already_unsubscribed') {
          setState({ status: 'already' });
        } else {
          setState({
            status: 'invalid',
            reason: data.error || 'This link is invalid or has expired.',
          });
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Unsubscribe validation failed', err);
        setState({
          status: 'invalid',
          reason: 'We could not validate this link. Please try again later.',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleConfirm = async () => {
    if (!token) return;
    setState({ status: 'submitting' });
    try {
      const { data, error } = await supabase.functions.invoke(
        'handle-email-unsubscribe',
        { body: { token } },
      );
      if (error) throw error;
      if (data?.success) {
        setState({ status: 'success' });
      } else if (data?.reason === 'already_unsubscribed') {
        setState({ status: 'already' });
      } else {
        setState({
          status: 'error',
          reason: data?.error || 'We could not process your unsubscribe.',
        });
      }
    } catch (err) {
      console.error('Unsubscribe failed', err);
      setState({
        status: 'error',
        reason: 'We could not process your unsubscribe. Please try again.',
      });
    }
  };

  return (
    <section className="relative py-24 min-h-[70vh]">
      <div className="mx-auto max-w-md px-4 sm:px-6">
        <div className="glass-panel rounded-xl p-8 text-center space-y-5">
          <div className="flex justify-center">
            <Mail className="h-10 w-10 text-primary" />
          </div>
          <h1 className="font-serif text-2xl font-bold">Email preferences</h1>

          {state.status === 'loading' && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Validating your link…
            </div>
          )}

          {state.status === 'valid' && (
            <>
              <p className="text-sm text-muted-foreground">
                Click the button below to unsubscribe from Infradar emails. You can resubscribe at
                any time from your account settings.
              </p>
              <Button onClick={handleConfirm} className="w-full teal-glow">
                Confirm unsubscribe
              </Button>
            </>
          )}

          {state.status === 'submitting' && (
            <Button disabled className="w-full">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…
            </Button>
          )}

          {state.status === 'success' && (
            <>
              <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">
                You have been unsubscribed. We are sorry to see you go.
              </p>
              <Link to="/">
                <Button variant="outline" className="w-full">Return home</Button>
              </Link>
            </>
          )}

          {state.status === 'already' && (
            <>
              <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">
                This email address has already been unsubscribed.
              </p>
              <Link to="/">
                <Button variant="outline" className="w-full">Return home</Button>
              </Link>
            </>
          )}

          {(state.status === 'invalid' || state.status === 'error') && (
            <>
              <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
              <p className="text-sm text-muted-foreground">{state.reason}</p>
              <Link to="/contact">
                <Button variant="outline" className="w-full">Contact support</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
