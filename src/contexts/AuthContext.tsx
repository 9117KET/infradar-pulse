import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

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

  const fetchProfile = useCallback(async (uid: string) => {
    setProfileLoading(true);
    // Fetch profile and roles in parallel
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', uid),
    ]);
    setProfile(profileRes.data as UserProfile | null);
    setRoles((rolesRes.data?.map((r: any) => r.role) ?? []) as AppRole[]);
    setProfileLoading(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const hasRole = useCallback((role: AppRole) => roles.includes(role), [roles]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
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
          fetchProfile(session.user.id);
        } else {
          setProfileLoading(false);
        }
      })
      .catch(() => {
        setLoading(false);
        setProfileLoading(false);
      });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const completeTour = useCallback(async () => {
    if (!user) return;
    await supabase.from('profiles').update({ tour_completed: true }).eq('id', user.id);
    setProfile(prev => prev ? { ...prev, tour_completed: true } : prev);
  }, [user]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, profile, profileLoading, roles, hasRole, signOut, refreshProfile, completeTour }}>
      {children}
    </AuthContext.Provider>
  );
}
