import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import { getStoredUtmParams, clearUtmParams } from '@/lib/utm';
import { trackEvent } from '@/lib/analytics';

export type AppRole = 'user' | 'researcher' | 'admin';

export interface UserProfile {
  id: string;
  display_name: string;
  company: string;
  role: string;
  regions: string[];
  sectors: string[];
  stages: string[];
  onboarded: boolean;
  tour_completed: boolean;
  email_alerts: boolean;
  weekly_digest: boolean;
  critical_only: boolean;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profile: UserProfile | null;
  profileLoading: boolean;
  roles: AppRole[];
  hasRole: (role: AppRole) => boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  completeTour: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({
  user: null, session: null, loading: true,
  profile: null, profileLoading: true,
  roles: [], hasRole: () => false,
  signOut: async () => {}, refreshProfile: async () => {}, completeTour: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const fetchedProfileFor = useRef<string | null>(null);
  const claimedPilotFor = useRef<string | null>(null);

  const fetchProfile = useCallback(async (uid: string, force = false) => {
    if (!force && fetchedProfileFor.current === uid) return;
    fetchedProfileFor.current = uid;
    setProfileLoading(true);
    // Fetch profile and roles in parallel
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', uid),
    ]);
    const profileData = profileRes.data as (UserProfile & { acq_source?: string | null; referred_by_code?: string | null }) | null;
    // One-time attribution write: if profile has no source yet but we captured UTMs, persist them
    if (profileData && !profileData.acq_source) {
      const utms = getStoredUtmParams();
      if (utms && Object.keys(utms).length > 0) {
        const referralCode = utms.referred_by_code;
        const { referred_by_code: _ref, ...profileAttribution } = utms;
        await supabase.from('profiles').update(profileAttribution as Record<string, string>).eq('id', uid);
        if (referralCode && !profileData.referred_by_code) {
          await supabase.rpc('claim_referral_signup' as never, { p_code: referralCode } as never);
        }
        clearUtmParams();
      }
    }
    setProfile(profileData as UserProfile | null);
    setRoles((rolesRes.data?.map((r: { role: AppRole }) => r.role) ?? []) as AppRole[]);
    setProfileLoading(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id, true);
  }, [user, fetchProfile]);

  const hasRole = useCallback((role: AppRole) => roles.includes(role), [roles]);

  const claimPilotAccess = useCallback(async (currentUser: User) => {
    if (claimedPilotFor.current === currentUser.id) return;
    claimedPilotFor.current = currentUser.id;
    const { data } = await (supabase.rpc as any)('claim_own_pilot_access', {
      p_email: currentUser.email ?? null,
      p_environment: 'live',
    });
    if (data?.granted && data?.reason === 'created') {
      void trackEvent('pilot_access_granted', { seat_number: data.seat_number, ends_at: data.ends_at }, 'monetization');
      void supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'pilot-access-granted',
          recipientEmail: currentUser.email,
          idempotencyKey: `pilot-access-granted:${currentUser.id}:${data.seat_number ?? 'seat'}`,
          templateData: {
            email: currentUser.email,
            seatNumber: data.seat_number ?? null,
            endsAt: data.ends_at,
            durationDays: data.duration_days ?? 30,
          },
        },
      });
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        void claimPilotAccess(session.user);
        fetchProfile(session.user.id);
      } else {
        fetchedProfileFor.current = null;
        claimedPilotFor.current = null;
        setProfile(null);
        setRoles([]);
        setProfileLoading(false);
      }
    });

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        if (session?.user) {
          void claimPilotAccess(session.user);
          fetchProfile(session.user.id);
        } else {
          fetchedProfileFor.current = null;
          claimedPilotFor.current = null;
          setProfileLoading(false);
        }
      })
      .catch(() => {
        setLoading(false);
        setProfileLoading(false);
      });

    return () => subscription.unsubscribe();
  }, [claimPilotAccess, fetchProfile]);

  const completeTour = useCallback(async () => {
    if (!user) return;
    await supabase.from('profiles').update({ tour_completed: true }).eq('id', user.id);
    setProfile(prev => prev ? { ...prev, tour_completed: true } : prev);
  }, [user]);

  const signOut = async () => {
    await trackEvent('logout_clicked', { source: 'auth_context' }, 'auth');
    await supabase.auth.signOut();
    fetchedProfileFor.current = null;
    setProfile(null);
    setRoles([]);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, profile, profileLoading, roles, hasRole, signOut, refreshProfile, completeTour }}>
      {children}
    </AuthContext.Provider>
  );
}
