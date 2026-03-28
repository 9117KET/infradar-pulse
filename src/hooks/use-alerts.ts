import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Alert, AlertCategory } from '@/data/alerts';
import { formatDistanceToNow } from 'date-fns';

export interface AlertStats {
  total: number;
  unread: number;
  critical: number;
  byCategory: Record<string, number>;
  mostActiveCategory: string;
}

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
          category: (a.category || 'market') as AlertCategory,
          message: a.message,
          time: formatDistanceToNow(new Date(a.created_at), { addSuffix: true }),
          read: a.read,
          sourceUrl: a.source_url || undefined,
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

  const stats: AlertStats = (() => {
    const byCategory: Record<string, number> = {};
    let unread = 0;
    let critical = 0;
    for (const a of alerts) {
      byCategory[a.category] = (byCategory[a.category] || 0) + 1;
      if (!a.read) unread++;
      if (a.severity === 'critical') critical++;
    }
    const mostActiveCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]?.[0] || 'market';
    return { total: alerts.length, unread, critical, byCategory, mostActiveCategory };
  })();

  const filterByCategory = (category: AlertCategory | 'all') => {
    if (category === 'all') return alerts;
    return alerts.filter(a => a.category === category);
  };

  const markAsRead = async (id: string) => {
    await supabase.from('alerts').update({ read: true }).eq('id', id);
  };

  const markAllAsRead = async () => {
    await supabase.from('alerts').update({ read: true }).eq('read', false);
  };

  return { alerts, loading, stats, filterByCategory, markAsRead, markAllAsRead };
}
