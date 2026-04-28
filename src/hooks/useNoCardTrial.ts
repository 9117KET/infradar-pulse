import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getPaddleEnvironment } from '@/lib/paddle';
import { trackEvent } from '@/lib/analytics';

export function useNoCardTrial() {
  const [loading, setLoading] = useState(false);

  const startTrial = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('start-no-card-trial', {
        body: { environment: getPaddleEnvironment() },
      });
      if (error) throw new Error(error.message || 'Could not start trial.');
      if (data?.error) throw new Error(data.error);
      void trackEvent('trial_started', { environment: getPaddleEnvironment() }, 'monetization');
      return data?.trial as { starts_at: string; ends_at: string; status: string } | undefined;
    } finally {
      setLoading(false);
    }
  };

  return { startTrial, loading };
}