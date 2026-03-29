import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth, type AppRole } from '@/contexts/AuthContext';
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
import { createPortal } from 'react-dom';

interface TourStep {
  target: string;
  title: string;
  description: string;
  position?: 'right' | 'bottom' | 'left' | 'top';
  minRole?: AppRole;
}

const ALL_STEPS: TourStep[] = [
  { target: 'sidebar-logo', title: 'Welcome to InfraRadar', description: 'This is your command center for infrastructure intelligence across all supported global regions.', position: 'right' },
  { target: 'nav-overview', title: 'Overview Dashboard', description: 'Real-time KPIs, risk heatmaps, and portfolio metrics at a glance.', position: 'right' },
  { target: 'nav-research', title: 'AI Research Hub', description: 'Type any query and watch AI agents research projects in real time with visual progress tracking.', position: 'right' },
  { target: 'nav-projects', title: 'Project Intelligence', description: 'Browse detailed project profiles with verified data, contacts, and evidence sources.', position: 'right' },
  { target: 'nav-geo', title: 'Geo Intelligence', description: 'Interactive maps showing project clusters, investment corridors, and regional insights.', position: 'right' },
  { target: 'nav-evidence', title: 'Evidence & Verification', description: 'Multi-source evidence layers: satellite imagery, filings, news, and partner data.', position: 'right' },
  { target: 'nav-risk', title: 'Risk & Anomaly Signals', description: 'AI-powered risk scoring and anomaly detection across all tracked projects.', position: 'right' },
  { target: 'nav-monitoring', title: 'Real-Time Monitoring', description: 'Live monitoring of project developments, news, and regulatory changes.', position: 'right' },
  { target: 'nav-alerts', title: 'Alert Management', description: 'Configure and manage alerts for critical project changes and risk events.', position: 'right' },
  { target: 'nav-agents', title: 'Intelligence Agents', description: 'Trigger AI research agents (subscription or trial required to run).', position: 'right' },
  { target: 'nav-review', title: 'Review Queue', description: 'Review AI-discovered projects and user-submitted research before publication.', position: 'right', minRole: 'researcher' },
  { target: 'nav-analytics', title: 'Analytics & Reports', description: 'Custom dashboards with exportable reports and trend analysis.', position: 'right' },
  { target: 'nav-insights', title: 'Insights & Briefings', description: 'AI-generated intelligence briefings and sector analysis reports.', position: 'right' },
  { target: 'nav-subscribers', title: 'Subscriber Management', description: 'Manage newsletter subscribers and engagement preferences.', position: 'right', minRole: 'admin' },
  { target: 'nav-users', title: 'User Management', description: 'Manage user accounts, assign roles, and control platform access.', position: 'right', minRole: 'admin' },
  { target: 'nav-settings', title: 'Platform Settings', description: 'Configure your profile, notification preferences, and agent settings.', position: 'right', minRole: 'admin' },
  { target: 'header-search', title: 'Quick Search', description: 'Search projects, alerts, and insights instantly from anywhere in the platform.', position: 'bottom' },
  { target: 'header-notifications', title: 'Notifications', description: 'Real-time alerts for project changes, risk events, and important updates.', position: 'bottom' },
  { target: 'header-profile', title: 'Your Profile', description: 'Access your settings, view your role, and manage your account.', position: 'bottom' },
];

const ROLE_HIERARCHY: Record<AppRole, number> = { user: 0, researcher: 1, admin: 2 };

export function GuidedTour({ onComplete }: { onComplete: () => void }) {
  const { hasRole } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Filter steps based on user role
  const steps = ALL_STEPS.filter(step => {
    if (!step.minRole) return true;
    if (hasRole('admin')) return true;
    const required = ROLE_HIERARCHY[step.minRole];
    for (const r of Object.keys(ROLE_HIERARCHY) as AppRole[]) {
      if (hasRole(r) && ROLE_HIERARCHY[r] >= required) return true;
    }
    return false;
  });

  const step = steps[currentStep];

  const updateTargetRect = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    }
  }, [step]);

  useEffect(() => {
    updateTargetRect();
    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect, true);
    return () => {
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', updateTargetRect, true);
    };
  }, [updateTargetRect]);

  // Scroll element into view
  useEffect(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setTimeout(updateTargetRect, 300);
    }
  }, [step, updateTargetRect]);

  if (!step || !targetRect) return null;

  const padding = 8;
  const cutout = {
    top: targetRect.top - padding,
    left: targetRect.left - padding,
    width: targetRect.width + padding * 2,
    height: targetRect.height + padding * 2,
  };

  // Tooltip positioning
  const pos = step.position || 'right';
  let tooltipStyle: React.CSSProperties = {};
  const gap = 16;
  if (pos === 'right') {
    tooltipStyle = { top: cutout.top, left: cutout.left + cutout.width + gap };
  } else if (pos === 'bottom') {
    tooltipStyle = { top: cutout.top + cutout.height + gap, left: Math.max(16, cutout.left - 100) };
  } else if (pos === 'left') {
    tooltipStyle = { top: cutout.top, right: window.innerWidth - cutout.left + gap };
  } else {
    tooltipStyle = { bottom: window.innerHeight - cutout.top + gap, left: cutout.left };
  }

  // Arrow direction
  const arrowClass = pos === 'right' ? 'left-0 top-4 -translate-x-full border-r-primary/90'
    : pos === 'bottom' ? 'left-8 top-0 -translate-y-full border-b-primary/90'
    : pos === 'left' ? 'right-0 top-4 translate-x-full border-l-primary/90'
    : 'left-8 bottom-0 translate-y-full border-t-primary/90';

  const arrowBorder = pos === 'right' ? 'border-t-transparent border-b-transparent border-l-transparent border-r-8'
    : pos === 'bottom' ? 'border-l-transparent border-r-transparent border-t-transparent border-b-8'
    : pos === 'left' ? 'border-t-transparent border-b-transparent border-r-transparent border-l-8'
    : 'border-l-transparent border-r-transparent border-b-transparent border-t-8';

  const overlay = createPortal(
    <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: 'auto' }}>
      {/* Dark overlay with cutout using clip-path */}
      <div
        className="absolute inset-0 bg-black/70 transition-all duration-300"
        style={{
          clipPath: `polygon(
            0% 0%, 0% 100%, 
            ${cutout.left}px 100%, 
            ${cutout.left}px ${cutout.top}px, 
            ${cutout.left + cutout.width}px ${cutout.top}px, 
            ${cutout.left + cutout.width}px ${cutout.top + cutout.height}px, 
            ${cutout.left}px ${cutout.top + cutout.height}px, 
            ${cutout.left}px 100%, 
            100% 100%, 100% 0%
          )`,
        }}
      />

      {/* Glow ring around highlighted element */}
      <div
        className="absolute rounded-lg ring-2 ring-primary/60 shadow-[0_0_20px_hsl(var(--primary)/0.3)] transition-all duration-300"
        style={{
          top: cutout.top,
          left: cutout.left,
          width: cutout.width,
          height: cutout.height,
        }}
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute z-[10000] w-72 animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
        style={tooltipStyle}
      >
        {/* Arrow */}
        <div className={`absolute w-0 h-0 border-4 ${arrowBorder} ${arrowClass}`} />

        <div className="rounded-xl border border-primary/30 bg-card shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-primary/10 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-medium text-primary">
                Step {currentStep + 1} of {steps.length}
              </span>
            </div>
            <button onClick={onComplete} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-4 py-3.5">
            <h3 className="text-sm font-semibold mb-1">{step.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
          </div>

          {/* Progress bar */}
          <div className="px-4 pb-1">
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="px-4 py-3 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={onComplete}
            >
              Skip tour
            </Button>
            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setCurrentStep(s => s - 1)}
                >
                  <ChevronLeft className="h-3 w-3 mr-1" />
                  Back
                </Button>
              )}
              <Button
                size="sm"
                className="text-xs h-7"
                onClick={() => {
                  if (currentStep < steps.length - 1) {
                    setCurrentStep(s => s + 1);
                  } else {
                    onComplete();
                  }
                }}
              >
                {currentStep < steps.length - 1 ? (
                  <>Next <ChevronRight className="h-3 w-3 ml-1" /></>
                ) : (
                  'Finish tour'
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );

  return overlay;
}
