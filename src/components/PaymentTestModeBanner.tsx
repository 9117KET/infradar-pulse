import { useAuth } from '@/contexts/AuthContext';
// DORMANT: const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;
import { getAppEnvironment } from '@/lib/billing/environment';

export function PaymentTestModeBanner() {
  const { hasRole } = useAuth();

  // DORMANT: if (!clientToken?.startsWith('test_')) return null;
  if (getAppEnvironment() !== 'sandbox') return null;
  if (!hasRole('admin') && !hasRole('researcher')) return null;

  return (
    <div className="w-full bg-amber-100 dark:bg-amber-950/40 border-b border-amber-300/50 px-4 py-2 text-center text-xs text-amber-900 dark:text-amber-200">
      Payments are in test mode — checkouts will not charge real cards.
    </div>
  );
}
