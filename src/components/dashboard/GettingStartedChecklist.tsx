import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronUp, Circle, PartyPopper, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGettingStarted } from '@/hooks/use-getting-started';

export function GettingStartedChecklist() {
  const { steps, doneCount, allDone, dismissed, dismiss } = useGettingStarted();
  const [open, setOpen] = useState(true);

  if (dismissed) return null;

  if (allDone) {
    return (
      <div className="glass-panel rounded-xl border border-primary/20 px-5 py-4 flex items-center gap-4">
        <PartyPopper className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">You're all set — getting started complete!</p>
          <p className="text-xs text-muted-foreground">Your portfolio, alerts, and research workflow are ready to go.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void dismiss()}>Dismiss</Button>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-xl border border-primary/20 overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {steps.map(s => (
              <div key={s.id} className={`h-2 w-2 rounded-full ${s.done ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
            ))}
          </div>
          <span className="text-sm font-medium">Getting started</span>
          <span className="text-xs text-muted-foreground">{doneCount}/{steps.length} complete</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); void dismiss(); }}
            className="p-1 rounded text-muted-foreground hover:text-foreground"
            aria-label="Dismiss checklist"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>
      {open && (
        <div className="border-t border-border/30 divide-y divide-border/20">
          {steps.map(step => (
            <div key={step.id} className="flex items-center gap-4 px-5 py-3">
              {step.done
                ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                : <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${step.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{step.label}</p>
                <p className="text-xs text-muted-foreground">{step.desc}</p>
              </div>
              {!step.done && (
                <Link to={step.action.href} className="text-xs text-primary hover:underline shrink-0">{step.action.label} →</Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
