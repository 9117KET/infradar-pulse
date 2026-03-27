import { useState, useRef, useEffect } from 'react';
import { Navigate, Outlet, useLocation, Link } from 'react-router-dom';
import { InfradarLogo } from '@/components/InfradarLogo';
import { Button } from '@/components/ui/button';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar,
} from '@/components/ui/sidebar';
import { NavLink } from '@/components/NavLink';
import { LayoutDashboard, FolderSearch, BarChart3, Bell, Users, Settings, LogOut, ClipboardCheck, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAlerts } from '@/hooks/use-alerts';
import { Badge } from '@/components/ui/badge';

const NAV = [
  { title: 'Overview', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Projects', url: '/dashboard/projects', icon: FolderSearch },
  { title: 'Analytics', url: '/dashboard/analytics', icon: BarChart3 },
  { title: 'Alerts', url: '/dashboard/alerts', icon: Bell },
  { title: 'Review Queue', url: '/dashboard/review', icon: ClipboardCheck },
  { title: 'Users', url: '/dashboard/users', icon: Users },
  { title: 'Settings', url: '/dashboard/settings', icon: Settings },
];

function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { signOut } = useAuth();

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-sidebar">
      <SidebarContent>
        <div className="flex items-center gap-2 px-4 py-4">
          <InfradarLogo size={24} />
          {!collapsed && <div><div className="text-xs font-semibold tracking-wide">InfraRadar AI</div><div className="text-[10px] text-muted-foreground">Intelligence Platform</div></div>}
        </div>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map(item => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.url === '/dashboard'} className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <div className="mt-auto p-4">
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />{!collapsed && 'Sign out'}
          </Button>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

function NotificationBell() {
  const { alerts } = useAlerts();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unreadCount = alerts.filter(a => !a.read).length;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const severityColor = (s: string) =>
    s === 'critical' ? 'text-destructive' : s === 'high' ? 'text-amber-500' : 'text-muted-foreground';

  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="icon" className="relative h-8 w-8" onClick={() => setOpen(!open)}>
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="outline" className="text-[10px] text-primary border-primary/30">{unreadCount} new</Badge>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No notifications</p>
            ) : alerts.slice(0, 8).map(a => (
              <div key={a.id} className={`flex items-start gap-2.5 px-4 py-2.5 border-b border-border/30 hover:bg-white/[0.02] ${!a.read ? 'bg-primary/[0.03]' : ''}`}>
                <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${severityColor(a.severity)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-snug truncate">{a.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{a.projectName} · {a.time}</p>
                </div>
                {!a.read && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
              </div>
            ))}
          </div>
          <Link
            to="/dashboard/alerts"
            onClick={() => setOpen(false)}
            className="block text-center text-xs text-primary py-2.5 hover:underline border-t border-border"
          >
            View all alerts
          </Link>
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-12 flex items-center border-b border-border px-4">
            <SidebarTrigger className="mr-4" />
            <span className="text-sm text-muted-foreground">InfraRadar AI — Intelligence Platform</span>
            <div className="ml-auto">
              <NotificationBell />
            </div>
          </header>
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
