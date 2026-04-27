import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { captureUtmParams } from '@/lib/utm';

/**
 * Invisible component placed inside the Router. Captures UTM params
 * from the URL on any navigation and stores them in sessionStorage
 * for first-touch attribution. Must be rendered inside <BrowserRouter>.
 */
export function UtmCapture() {
  const location = useLocation();
  useEffect(() => {
    captureUtmParams();
  }, [location.search]);
  return null;
}
