import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '@/lib/analytics';

export function AnalyticsCapture() {
  const location = useLocation();

  useEffect(() => {
    void trackPageView(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  return null;
}