import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Alert, AlertCategory } from '@/data/alerts';
import { ALERT_CATEGORIES } from '@/data/alerts';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useEntitlements } from './useEntitlements';
import { getReadRowCap } from '@/lib/billing/readCaps';

export interface AlertStats {
  total: number;
  unread: number;
  critical: number;
  byCategory: Record<string, number>;
  mostActiveCategory: string;
}

const SUPABASE_PAGE_SIZE = 1000;
const MAX_UNCAPPED_ALERT_PAGES = 100;

type AlertRow = {
  id: string;
  project_id: string | null;
  project_name: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: AlertCategory | null;
  message: string;
  created_at: string;
  read: boolean;
  source_url: string | null;
};

function mapAlertRow(a: AlertRow): Alert {
  return {
    id: a.id,
    projectId: a.project_id || '',
    projectName: a.project_name,
    severity: a.severity,
    category: (a.category || 'market') as AlertCategory,
    message: a.message,
    time: formatDistanceToNow(new Date(a.created_at), { addSuffix: true }),
    createdAt: a.created_at,
    read: a.read,
    sourceUrl: a.source_url || undefined,
  };
}

export function useAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [stats, setStats] = useState<AlertStats>({ total: 0, unread: 0, critical: 0, byCategory: {}, mostActiveCategory: 'market' });
  const { plan, staffBypass, isAnonymous, loading: entLoading } = useEntitlements();

  // Anonymous viewers (public marketing) get the same view as before; signed-in
  // users hit the plan-based row cap mirroring EXPORT_ROW_CAPS so they can't
  // sidestep export limits by scraping the dashboard.
  const rowCap = isAnonymous ? 0 : getReadRowCap(plan, staffBypass);

  useEffect(() => {
    let mounted = true;

    async function fetchAlerts() {
      if (entLoading) return;
      setLoading(true);

      try {
        const [{ count: totalCount }, { count: unreadCount }, { count: criticalCount }, ...categoryCounts] = await Promise.all([
          supabase.from('alerts').select('id', { count: 'exact', head: true }),
          supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('read', false),
          supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('severity', 'critical'),
          ...ALERT_CATEGORIES.map(c => supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('category', c.value)),
        ]);

        let rows: AlertRow[] = [];
        if (rowCap > 0) {
          const { data, error } = await supabase
            .from('alerts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(rowCap);
          if (error) throw error;
          rows = data ?? [];
        } else {
          let from = 0;
          for (let i = 0; i < MAX_UNCAPPED_ALERT_PAGES; i++) {
            const { data, error } = await supabase
              .from('alerts')
              .select('*')
              .order('created_at', { ascending: false })
              .range(from, from + SUPABASE_PAGE_SIZE - 1);
            if (error) throw error;
            if (!data?.length) break;
            rows.push(...data);
            if (data.length < SUPABASE_PAGE_SIZE) break;
            from += SUPABASE_PAGE_SIZE;
          }
        }

        if (!mounted) return;

        const byCategory: Record<string, number> = {};
        ALERT_CATEGORIES.forEach((c, index) => {
          byCategory[c.value] = categoryCounts[index]?.count ?? 0;
        });
        const mostActiveCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]?.[0] || 'market';

        setTotalAvailable(totalCount ?? rows.length);
        setStats({
          total: totalCount ?? rows.length,
          unread: unreadCount ?? rows.filter((a) => !a.read).length,
          critical: criticalCount ?? rows.filter((a) => a.severity === 'critical').length,
          byCategory,
          mostActiveCategory,
        });
        setAlerts(rows.map(mapAlertRow));
      } catch (error) {
        if (mounted) toast.error(error instanceof Error ? error.message : 'Failed to load alerts');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchAlerts();

    const channel = supabase
      .channel('alerts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => {
        if (mounted) fetchAlerts();
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [entLoading, rowCap]);

  const filterByCategory = (category: AlertCategory | 'all') => {
    if (category === 'all') return alerts;
    return alerts.filter(a => a.category === category);
  };

  const markAsRead = async (id: string) => {
    const { error } = await supabase.from('alerts').update({ read: true }).eq('id', id);
    if (error) toast.error('Failed to mark alert as read');
  };

  const markAllAsRead = async () => {
    const { error } = await supabase.from('alerts').update({ read: true }).eq('read', false);
    if (error) toast.error('Failed to mark all alerts as read');
  };

  const truncated = rowCap > 0 && totalAvailable > rowCap;

  return {
    alerts,
    loading,
    stats,
    filterByCategory,
    markAsRead,
    markAllAsRead,
    truncated,
    totalAvailable,
    rowCap,
  };
}
