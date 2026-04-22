const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken?.startsWith('test_')) return null;

  return (
    <div className="w-full bg-amber-100 dark:bg-amber-950/40 border-b border-amber-300/50 px-4 py-2 text-center text-xs text-amber-900 dark:text-amber-200">
      Payments are in test mode in the preview.{' '}
      <a
        href="https://docs.lovable.dev/features/payments#test-and-live-environments"
        target="_blank"
        rel="noopener noreferrer"
        className="underline font-medium"
      >
        Read more
      </a>
    </div>
  );
}
