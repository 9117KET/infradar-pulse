import { LayoutDashboard, FolderSearch, Bell, Sparkles, Settings } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAlerts } from '@/hooks/use-alerts';

const ITEMS = [
  { label: 'Overview', to: '/dashboard', icon: LayoutDashboard, end: true },
  { label: 'Projects', to: '/dashboard/projects', icon: FolderSearch },
  { label: 'Ask AI', to: '/dashboard/ask', icon: Sparkles },
  { label: 'Alerts', to: '/dashboard/alerts', icon: Bell, badge: true },
  { label: 'Settings', to: '/dashboard/settings', icon: Settings },
];

/**
 * Sticky bottom-tab bar for the dashboard on phones.
 * Only rendered on viewports < md (768px). Uses safe-area inset.
 */
export function MobileBottomNav() {
  const { pathname } = useLocation();
  const { alerts } = useAlerts();
  const unread = alerts.filter(a => !a.read).length;

  return (
    <nav
      role="navigation"
      aria-label="Primary"
      className={cn(
        'md:hidden fixed bottom-0 inset-x-0 z-40',
        'glass-panel-strong border-t border-border',
        'pb-[env(safe-area-inset-bottom)]'
      )}
    >
      <ul className="grid grid-cols-5">
        {ITEMS.map(item => {
          const Icon = item.icon;
          const active = item.end
            ? pathname === item.to
            : pathname === item.to || pathname.startsWith(item.to + '/');
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 py-2 min-h-[3.25rem] touch-target',
                  'text-[10px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {item.badge && unread > 0 && (
                    <span className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </span>
                <span className="leading-none">{item.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
