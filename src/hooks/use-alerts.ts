import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Alert } from '@/data/alerts';
import { formatDistanceToNow } from 'date-fns';

export function useAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAlerts() {
      setLoading(true);
      const { data } = await supabase
        .from('alerts')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) {
        setAlerts(data.map((a: any) => ({
          id: a.id,
          projectId: a.project_id || '',
          projectName: a.project_name,
          severity: a.severity,
          message: a.message,
          time: formatDistanceToNow(new Date(a.created_at), { addSuffix: true }),
          read: a.read,
        })));
      }
      setLoading(false);
    }

    fetchAlerts();

    const channel = supabase
      .channel('alerts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => {
        fetchAlerts();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const markAsRead = async (id: string) => {
    await supabase.from('alerts').update({ read: true }).eq('id', id);
  };

  const markAllAsRead = async () => {
    await supabase.from('alerts').update({ read: true }).eq('read', false);
  };

  return { alerts, loading, markAsRead, markAllAsRead };
}
