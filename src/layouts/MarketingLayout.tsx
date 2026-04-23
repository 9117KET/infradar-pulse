import { useLocation } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { ConversionBar } from '@/components/home/ConversionBar';
import { PaymentTestModeBanner } from '@/components/PaymentTestModeBanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FeedbackWidget } from '@/components/feedback/FeedbackWidget';

export default function MarketingLayout() {
  const { pathname } = useLocation();
  const showConversionBar = pathname === '/';

  return (
    <div className="min-h-screen flex flex-col">
      <PaymentTestModeBanner />
      <Navbar />
      <main className="flex-1 pt-16">
        <ErrorBoundary key={pathname} variant="inline">
          <Outlet />
        </ErrorBoundary>
      </main>
      <Footer />
      {showConversionBar && <ConversionBar />}
      <FeedbackWidget />
    </div>
  );
}

