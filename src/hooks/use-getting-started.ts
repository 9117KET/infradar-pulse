import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTrackedProjects } from '@/hooks/use-tracked-projects';
import { useAlertRules } from '@/hooks/use-alert-rules';
import { trackEvent } from '@/lib/analytics';

export interface ChecklistStep {
  id: string;
  label: string;
  desc: string;
  done: boolean;
  action: { label: string; href: string };
}

const LEGACY_DISMISS_KEY = 'infradar_checklist_dismissed';

function legacyDismissed(): boolean {
  try { return localStorage.getItem(LEGACY_DISMISS_KEY) === '1'; } catch { return false; }
}

export function useGettingStarted() {
  const { user, profile, refreshProfile } = useAuth();
  const { trackedProjects } = useTrackedProjects();
  const { rules: alertRules } = useAlertRules();

  const { data: userResearchCount = 0 } = useQuery({
    queryKey: ['user-research-count'],
    queryFn: async () => {
      const { count } = await supabase.from('research_tasks').select('id', { count: 'exact', head: true }).eq('task_type', 'user-research');
      return count || 0;
    },
  });

  const steps = useMemo<ChecklistStep[]>(() => [
    {
      id: 'track', label: 'Track 5 projects', desc: 'Build your portfolio to monitor what matters most.', done: trackedProjects.length >= 5,
      action: { label: 'Browse projects', href: '/dashboard/projects' },
    },
    {
      id: 'alert', label: 'Set up an alert rule', desc: 'Get notified when risk signals match your filters.', done: alertRules.length > 0,
      action: { label: 'Configure alerts', href: '/dashboard/alerts' },
    },
    {
      id: 'research', label: 'Run an AI research query', desc: 'Ask anything about infrastructure projects.', done: userResearchCount > 0,
      action: { label: 'Open Research', href: '/dashboard/research' },
    },
    {
      id: 'profile', label: 'Complete your profile', desc: 'Set your regions and sectors for personalised coverage.', done: !!(profile?.company && profile?.display_name),
      action: { label: 'Edit profile', href: '/dashboard/settings' },
    },
  ], [trackedProjects.length, alertRules.length, userResearchCount, profile]);

  const doneCount = steps.filter(s => s.done).length;
  const allDone = doneCount === steps.length;
  // Legacy localStorage flag counts as dismissed too, so the card never flashes while it's migrated to the DB.
  const dismissed = !!profile?.checklist_dismissed_at || legacyDismissed();

  const setDismissedAt = async (value: string | null) => {
    if (!user) return;
    await supabase.from('profiles').update({ checklist_dismissed_at: value }).eq('id', user.id);
    await refreshProfile();
  };

  const dismiss = async () => {
    await setDismissedAt(new Date().toISOString());
    void trackEvent('checklist_dismissed', { done_count: doneCount }, 'activation');
  };

  const reopen = async () => {
    try { localStorage.removeItem(LEGACY_DISMISS_KEY); } catch { /* ignore */ }
    await setDismissedAt(null);
    void trackEvent('checklist_reopened', { done_count: doneCount }, 'activation');
  };

  // One-time migration: users who dismissed via the old localStorage flag get it persisted to their profile.
  const migrated = useRef(false);
  useEffect(() => {
    if (migrated.current || !user || !profile) return;
    if (!legacyDismissed()) return;
    migrated.current = true;
    void (async () => {
      if (!profile.checklist_dismissed_at) await setDismissedAt(new Date().toISOString());
      try { localStorage.removeItem(LEGACY_DISMISS_KEY); } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile]);

  return { steps, doneCount, allDone, dismissed, dismiss, reopen };
}
