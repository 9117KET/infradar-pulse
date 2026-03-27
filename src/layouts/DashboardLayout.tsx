import { useState, useRef, useEffect } from 'react';
import { Navigate, Outlet, useLocation, Link, useNavigate } from 'react-router-dom';
import { InfradarLogo } from '@/components/InfradarLogo';
import { Button } from '@/components/ui/button';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar,
} from '@/components/ui/sidebar';
import { NavLink } from '@/components/NavLink';
import { LayoutDashboard, FolderSearch, BarChart3, Bell, Users, Settings, LogOut, ClipboardCheck, AlertTriangle, Search, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAlerts } from '@/hooks/use-alerts';
import { useProjects } from '@/hooks/use-projects';
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
  const { alerts, markAsRead, markAllAsRead } = useAlerts();
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
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <>
                  <button onClick={markAllAsRead} className="text-[10px] text-primary hover:underline">Mark all read</button>
                  <Badge variant="outline" className="text-[10px] text-primary border-primary/30">{unreadCount} new</Badge>
                </>
              )}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No notifications</p>
            ) : alerts.slice(0, 8).map(a => (
              <button
                key={a.id}
                onClick={() => !a.read && markAsRead(a.id)}
                className={`flex items-start gap-2.5 px-4 py-2.5 border-b border-border/30 hover:bg-white/[0.02] w-full text-left transition-colors ${!a.read ? 'bg-primary/[0.03] cursor-pointer' : 'cursor-default'}`}
              >
                <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${severityColor(a.severity)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-snug truncate">{a.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{a.projectName} · {a.time}</p>
                </div>
                {!a.read && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
              </button>
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

function ProjectSearch() {
  const { projects } = useProjects();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const results = query.trim().length > 0
    ? projects.filter(p => {
        const q = query.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.country.toLowerCase().includes(q) || p.sector.toLowerCase().includes(q) || p.region.toLowerCase().includes(q);
      }).slice(0, 6)
    : [];

  const showDropdown = focused && query.trim().length > 0;

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search projects…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          className="h-8 w-56 rounded-lg border border-border bg-background pl-8 pr-8 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        {query && (
          <button onClick={() => { setQuery(''); setFocused(false); }} className="absolute right-2 top-1/2 -translate-y-1/2">
            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>
      {showDropdown && (
        <div className="absolute left-0 top-10 z-50 w-80 rounded-xl border border-border bg-card shadow-xl">
          {results.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No projects found</p>
          ) : results.map(p => (
            <button
              key={p.id}
              onClick={() => { setQuery(''); setFocused(false); navigate(`/dashboard/projects/${p.id}`); }}
              className="flex items-start gap-3 px-4 py-2.5 w-full text-left hover:bg-white/[0.02] border-b border-border/30 last:border-0"
            >
              <FolderSearch className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{p.name}</p>
                <p className="text-[10px] text-muted-foreground">{p.country} · {p.sector} · {p.region}</p>
              </div>
            </button>
          ))}
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
            <span className="text-sm text-muted-foreground hidden sm:inline">InfraRadar AI — Intelligence Platform</span>
            <div className="ml-auto flex items-center gap-2">
              <ProjectSearch />
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
