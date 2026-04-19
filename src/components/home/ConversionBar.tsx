import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePublicProjectLocations } from '@/hooks/use-public-project-locations';

const STORAGE_KEY = 'infradar_conversion_bar_dismissed';
const MAX_VIEWS = 2;
const DELAY_MS = 15000;

function getViewCount(): number {
  try {
    return parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10);
  } catch {
    return 0;
  }
}

function incrementViewCount() {
  try {
    localStorage.setItem(STORAGE_KEY, String(getViewCount() + 1));
  } catch { /* ignore */ }
}

function markDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, String(MAX_VIEWS));
  } catch { /* ignore */ }
}

export function ConversionBar() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const shown = useRef(false);
  const { locations } = usePublicProjectLocations();

  useEffect(() => {
    // Don't show if user has already dismissed MAX_VIEWS times
    if (getViewCount() >= MAX_VIEWS) return;

    const timer = setTimeout(() => {
      if (shown.current) return;
      shown.current = true;
      setVisible(true);
      incrementViewCount();
    }, DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    markDismissed();
    setTimeout(() => setVisible(false), 300);
  };

  if (!locations.length) return null;

  return (
    <AnimatePresence>
      {visible && !dismissed && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', damping: 24, stiffness: 200 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4"
        >
          <div className="glass-panel-strong rounded-xl border border-primary/20 px-5 py-3.5 flex items-center gap-4 shadow-2xl">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                <span className="text-primary font-bold">{locations.length.toLocaleString()} projects</span> tracked globally — explore the full dataset for free.
              </p>
            </div>
            <Link to="/login" className="shrink-0">
              <Button size="sm" className="teal-glow gap-1.5 text-xs">
                Get access <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
            <button
              onClick={handleDismiss}
              className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
