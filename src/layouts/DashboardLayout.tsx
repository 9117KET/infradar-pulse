import { useState, useRef, useEffect } from 'react';
import { Navigate, Outlet, useLocation, Link, useNavigate } from 'react-router-dom';
import { InfradarLogo } from '@/components/InfradarLogo';
import { Button } from '@/components/ui/button';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar,
} from '@/components/ui/sidebar';
import { NavLink } from '@/components/NavLink';
import { LayoutDashboard, FolderSearch, Bell, Users, Settings, LogOut, ClipboardCheck, AlertTriangle, Search, X, ListChecks, BookOpen, Activity, Globe, ShieldCheck, BarChart3, Bot, User, Shield, ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAlerts } from '@/hooks/use-alerts';
import { useProjects } from '@/hooks/use-projects';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import type { AppRole } from '@/contexts/AuthContext';

type NavItem = { title: string; url: string; icon: any; minRole?: AppRole };
type NavGroup = { label: string; minRole?: AppRole; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Core',
    items: [
      { title: 'Overview', url: '/dashboard', icon: LayoutDashboard },
      { title: 'Research', url: '/dashboard/research', icon: Search },
      { title: 'Projects', url: '/dashboard/projects', icon: FolderSearch },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { title: 'Geo Intelligence', url: '/dashboard/geo', icon: Globe },
      { title: 'Evidence & Verification', url: '/dashboard/evidence', icon: ShieldCheck },
      { title: 'Risk Signals', url: '/dashboard/risk', icon: AlertTriangle },
    ],
  },
  {
    label: 'Operations',
    minRole: 'researcher',
    items: [
      { title: 'Monitoring', url: '/dashboard/monitoring', icon: Activity },
      { title: 'Alerts', url: '/dashboard/alerts', icon: Bell },
      { title: 'Agents', url: '/dashboard/agents', icon: Bot },
      { title: 'Review Queue', url: '/dashboard/review', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { title: 'Analytics & Reports', url: '/dashboard/analytics-reports', icon: BarChart3 },
      { title: 'Insights', url: '/dashboard/insights', icon: BookOpen },
    ],
  },
  {
    label: 'Admin',
    minRole: 'admin',
    items: [
      { title: 'Subscribers', url: '/dashboard/subscribers', icon: ListChecks },
      { title: 'Users', url: '/dashboard/users', icon: Users },
      { title: 'Settings', url: '/dashboard/settings', icon: Settings },
    ],
  },
];

const ROLE_HIERARCHY: Record<AppRole, number> = { user: 0, researcher: 1, admin: 2 };

function meetsMinRole(hasRole: (r: AppRole) => boolean, minRole?: AppRole): boolean {
  if (!minRole) return true;
  // Admin always passes
  if (hasRole('admin')) return true;
  const required = ROLE_HIERARCHY[minRole];
  for (const r of Object.keys(ROLE_HIERARCHY) as AppRole[]) {
    if (hasRole(r) && ROLE_HIERARCHY[r] >= required) return true;
  }
  return false;
}

function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { signOut, hasRole } = useAuth();

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-sidebar">
      <SidebarContent>
        <div className="flex items-center gap-2 px-4 py-4">
          <InfradarLogo size={24} />
          {!collapsed && <div><div className="text-xs font-semibold tracking-wide">InfraRadar AI</div><div className="text-[10px] text-muted-foreground">Intelligence Platform</div></div>}
        </div>
        {NAV_GROUPS.map(group => {
          if (!meetsMinRole(hasRole, group.minRole)) return null;
          const visibleItems = group.items.filter(item => meetsMinRole(hasRole, item.minRole));
          if (visibleItems.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleItems.map(item => (
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
          );
        })}
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

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin: { label: 'Admin', color: 'bg-destructive/10 text-destructive border-destructive/30' },
  researcher: { label: 'Researcher', color: 'bg-primary/10 text-primary border-primary/30' },
  user: { label: 'User', color: 'bg-muted text-muted-foreground border-border' },
};

function ProfileMenu() {
  const { profile, roles, signOut, hasRole } = useAuth();
  const navigate = useNavigate();
  const topRole = hasRole('admin') ? 'admin' : hasRole('researcher') ? 'researcher' : 'user';
  const roleInfo = ROLE_LABELS[topRole];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="flex items-center gap-2 h-8 px-2">
          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-xs font-medium hidden md:inline max-w-[100px] truncate">
            {profile?.display_name || 'Account'}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">{profile?.display_name || 'User'}</p>
            {profile?.company && <p className="text-xs text-muted-foreground">{profile.company}</p>}
            <Badge variant="outline" className={`text-[10px] w-fit ${roleInfo.color}`}>
              <Shield className="mr-1 h-2.5 w-2.5" />
              {roleInfo.label}
            </Badge>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Role-specific items */}
        {hasRole('admin') && (
          <>
            <DropdownMenuItem onClick={() => navigate('/dashboard/users')}>
              <Users className="mr-2 h-4 w-4" /> User Management
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/dashboard/subscribers')}>
              <ListChecks className="mr-2 h-4 w-4" /> Subscribers
            </DropdownMenuItem>
          </>
        )}
        {(hasRole('researcher') || hasRole('admin')) && (
          <DropdownMenuItem onClick={() => navigate('/dashboard/review')}>
            <ClipboardCheck className="mr-2 h-4 w-4" /> Review Queue
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/dashboard/settings')}>
          <Settings className="mr-2 h-4 w-4" /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function DashboardLayout() {
  const { user, loading, profile, profileLoading } = useAuth();

  if (loading || profileLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  }

  if (!user) return <Navigate to="/login" replace />;
  if (profile && !profile.onboarded) return <Navigate to="/onboarding" replace />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-12 flex items-center border-b border-border px-4">
            <SidebarTrigger className="mr-4" />
            <span className="text-sm text-muted-foreground hidden sm:inline">InfraRadar AI — Intelligence Platform</span>
            <div className="ml-auto flex items-center gap-3">
              <ProjectSearch />
              <NotificationBell />
              <ProfileMenu />
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
