export default function Refund() {
  return (
    <div className="py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h1 className="font-serif text-4xl font-bold mb-8">Refund Policy</h1>
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>Last updated: April 2026</p>

          <p>
            This Refund Policy applies to subscriptions to the INFRADARAI platform, operated by Kinlo
            and Glen. Our order process is conducted by our online reseller Paddle.com, which is the
            Merchant of Record for all our orders and handles payments, refunds and returns.
          </p>

          <h2 className="font-serif text-xl font-bold text-foreground pt-4">14-Day Refund Window</h2>
          <p>
            We offer a minimum 14-day refund window for paid INFRADARAI subscription charges. If you
            are not satisfied with the Service, you can request a full refund within 14 days of the
            order date. No exceptions, additional conditions, or specific reason are required.
          </p>

          <h2 className="font-serif text-xl font-bold text-foreground pt-4">Renewals</h2>
          <p>
            Subscription renewals are covered by the same minimum 14-day refund window. If you are
            charged for a renewal you did not intend to keep, request a refund within 14 days of the
            renewal order date through Paddle or by contacting us for assistance.
          </p>

          <h2 className="font-serif text-xl font-bold text-foreground pt-4">How to Request a Refund</h2>
          <p>
            All refunds are processed by Paddle. To request one:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Visit{' '}
              <a className="underline" href="https://paddle.net" target="_blank" rel="noreferrer">paddle.net</a>{' '}
              and look up your order using the email address used at checkout, or
            </li>
            <li>
              Email us at{' '}
              <a className="underline" href="mailto:billing@infradarai.com">billing@infradarai.com</a> with
              your order reference and we will assist with the refund through Paddle.
            </li>
          </ul>
          <p>
            Approved refunds are returned to the original payment method. Processing times depend on
            your bank or card issuer and typically take 3–10 business days to appear on your
            statement.
          </p>

          <h2 className="font-serif text-xl font-bold text-foreground pt-4">Cancellations</h2>
          <p>
            You can cancel your subscription at any time from your account settings or via{' '}
            <a className="underline" href="https://paddle.net" target="_blank" rel="noreferrer">paddle.net</a>.
            Cancellation stops future renewals and takes effect at the end of your current paid
            period; you keep access until that date. Cancelling does not, by itself, trigger a refund.
            Request one separately if eligible.
          </p>

          <h2 className="font-serif text-xl font-bold text-foreground pt-4">Chargebacks and Disputes</h2>
          <p>
            If you have a billing concern, please contact us first so we can resolve it quickly.
            Disputes raised directly with your card issuer (chargebacks) are handled by Paddle and may
            result in suspension of access while the dispute is investigated.
          </p>

          <h2 className="font-serif text-xl font-bold text-foreground pt-4">Statutory Rights</h2>
          <p>
            Nothing in this policy limits any statutory consumer rights you may have under your local
            law, including any right of withdrawal applicable to digital services. Where Paddle's{' '}
            <a className="underline" href="https://www.paddle.com/legal/refund-policy" target="_blank" rel="noreferrer">
              Refund Policy
            </a>{' '}
            grants you stronger rights than this page, those rights apply.
          </p>

          <h2 className="font-serif text-xl font-bold text-foreground pt-4">Contact</h2>
          <p>
            For refund or billing questions, contact Kinlo and Glen at{' '}
            <a className="underline" href="mailto:billing@infradarai.com">billing@infradarai.com</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
