import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { InfradarLogo } from '@/components/InfradarLogo';
import { Button } from '@/components/ui/button';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar,
} from '@/components/ui/sidebar';
import { NavLink } from '@/components/NavLink';
import { LayoutDashboard, FolderSearch, BarChart3, Bell, Users, Settings, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const NAV = [
  { title: 'Overview', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Projects', url: '/dashboard/projects', icon: FolderSearch },
  { title: 'Analytics', url: '/dashboard/analytics', icon: BarChart3 },
  { title: 'Alerts', url: '/dashboard/alerts', icon: Bell },
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
          </header>
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
