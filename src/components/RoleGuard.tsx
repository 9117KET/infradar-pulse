import { Navigate } from 'react-router-dom';
import { useAuth, type AppRole } from '@/contexts/AuthContext';

interface RoleGuardProps {
  requiredRole: AppRole;
  children: React.ReactNode;
}

export function RoleGuard({ requiredRole, children }: RoleGuardProps) {
  const { hasRole, loading, profileLoading } = useAuth();

  if (loading || profileLoading) {
    return <div className="min-h-[200px] flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  }

  // Admin has access to everything
  if (hasRole('admin')) return <>{children}</>;

  // Researcher has access to researcher + user routes
  if (requiredRole === 'researcher' && hasRole('researcher')) return <>{children}</>;
  if (requiredRole === 'user' && (hasRole('user') || hasRole('researcher'))) return <>{children}</>;

  return <Navigate to="/dashboard" replace />;
}
