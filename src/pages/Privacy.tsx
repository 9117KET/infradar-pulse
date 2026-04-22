export default function Privacy() {
  return (
    <div className="py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h1 className="font-serif text-4xl font-bold mb-8">Privacy Notice</h1>
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>Last updated: April 2026</p>

          <p>
            This Privacy Notice describes how Kinlo and Glen ("Kinlo and Glen", "we", "us"), trading
            as Infradar, collects and processes personal data when you use the Infradar platform and
            related services (the "Service"). Kinlo and Glen is the data controller responsible for
            your personal data.
          </p>

          <h2 className="font-serif text-xl font-bold text-foreground pt-4">1. Personal Data We Collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Account data:</strong> name, email address, company, job role, password (hashed).</li>
            <li><strong>Profile and preferences:</strong> regions, sectors, stages, alert and digest settings.</li>
            <li><strong>Content you submit:</strong> saved searches, tracked projects, notes, support messages.</li>
            <li><strong>Usage and telemetry:</strong> pages visited, features used, queries run, timestamps.</li>
            <li><strong>Device and connection data:</strong> IP address, browser, operating system, device identifiers.</li>
            <li><strong>Authentication data:</strong> session tokens and, where you choose Google sign-in, your Google account identifier and email.</li>
            <li><strong>Subscription and billing metadata:</strong> plan, status, renewal dates, invoice references. Card and payment details are collected and held by Paddle, not by us.</li>
          </ul>

          <h2 className="font-serif text-xl font-bold text-foreground pt-4">2. Purposes and Legal Bases</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Providing the Service</strong> (account creation, authentication, delivering intelligence, alerts and dashboards) — performance of a contract with you.</li>
            <li><strong>Billing and subscription management</strong> via our Merchant of Record — performance of a contract and compliance with legal obligations.</li>
            <li><strong>Security, fraud prevention and abuse detection</strong> — legitimate interests in keeping the Service safe.</li>
            <li><strong>Product improvement and analytics</strong> — legitimate interests in understanding usage and improving features.</li>
            <li><strong>Customer support</strong> — performance of a contract and legitimate interests in responding to your requests.</li>
            <li><strong>Marketing communications and digests</strong> — your consent, which you can withdraw at any time via your settings or unsubscribe links.</li>
            <li><strong>Compliance with law</strong> — legal obligation, where applicable.</li>
          </ul>

          <h2 className="font-serif text-xl font-bold text-foreground pt-4">3. How We Share Your Data</h2>
          <p>We do not sell your personal data. We share it only with the following categories of recipients:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Paddle (Merchant of Record).</strong> Our order process is conducted by our online
              reseller Paddle.com Market Ltd and its affiliates ("Paddle"). Paddle is the Merchant of
              Record for all our orders and acts as a separate controller for payment, billing, tax,
              fraud screening, refund and chargeback processing. See{' '}
              <a className="underline" href="https://www.paddle.com/legal/privacy" target="_blank" rel="noreferrer">paddle.com/legal/privacy</a>.
            </li>
            <li><strong>Cloud and infrastructure providers</strong> (hosting, database, storage, email delivery, error monitoring) acting as our processors.</li>
            <li><strong>Analytics and product telemetry providers</strong> acting as our processors.</li>
            <li><strong>Authentication providers</strong> (e.g. Google, where you choose to sign in with Google).</li>
            <li><strong>Professional advisers</strong> such as lawyers, accountants and auditors, where necessary.</li>
            <li><strong>Authorities and regulators</strong> where we are required to disclose by law or to protect our rights.</li>
            <li><strong>Successors</strong> in the event of a merger, acquisition or asset sale, subject to equivalent protections.</li>
          </ul>

          <h2 className="font-serif text-xl font-bold text-foreground pt-4">4. International Transfers</h2>
          <p>
            Your data may be processed in countries outside your own, including outside the UK and EEA.
            Where this happens, we rely on appropriate safeguards such as the European Commission's
            Standard Contractual Clauses, the UK International Data Transfer Addendum, or adequacy
            decisions, as applicable.
          </p>

          <h2 className="font-serif text-xl font-bold text-foreground pt-4">5. Data Retention</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Account data:</strong> retained while your account is active and for up to 24 months after closure, unless a longer period is required by law.</li>
            <li><strong>Subscription and billing records:</strong> retained for up to 7 years to meet tax, accounting and audit obligations.</li>
            <li><strong>Usage logs and telemetry:</strong> typically retained for up to 13 months in identifiable form, then aggregated or deleted.</li>
            <li><strong>Support correspondence:</strong> retained for up to 36 months after the issue is resolved.</li>
            <li><strong>Marketing data:</strong> retained until you withdraw consent or unsubscribe.</li>
          </ul>
          <p>When personal data is no longer needed, we delete or anonymise it.</p>

          <h2 className="font-serif text-xl font-bold text-foreground pt-4">6. Your Rights</h2>
          <p>
            Subject to applicable law (including the UK GDPR and EU GDPR where relevant), you have the
            right to:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Access the personal data we hold about you.</li>
            <li>Request rectification of inaccurate or incomplete data.</li>
            <li>Request erasure of your data ("right to be forgotten").</li>
            <li>Restrict or object to certain processing, including direct marketing.</li>
            <li>Receive your data in a portable format and ask us to transmit it to another controller.</li>
            <li>Withdraw consent at any time, without affecting the lawfulness of processing already carried out.</li>
            <li>Lodge a complaint with your local data protection supervisory authority.</li>
          </ul>
          <p>
            We will respond to verified rights requests within one month, extendable by a further two
            months for complex requests. To exercise any of these rights, contact us at{' '}
            <a className="underline" href="mailto:privacy@infradar.io">privacy@infradar.io</a>.
          </p>

          <h2 className="font-serif text-xl font-bold text-foreground pt-4">7. Security</h2>
          <p>
            We use appropriate technical and organisational measures to protect personal data, including
            TLS 1.3 in transit, encryption at rest, role-based access controls, audit logging, and
            regular security reviews. No system is perfectly secure, and you are responsible for keeping
            your account credentials confidential.
          </p>

          <h2 className="font-serif text-xl font-bold text-foreground pt-4">8. Cookies</h2>
          <p>
            We use essential cookies and similar technologies needed to authenticate your session,
            remember preferences, and keep the Service secure. We may also use limited analytics cookies
            to understand usage. You can manage cookies through your browser settings; disabling
            essential cookies may break parts of the Service.
          </p>

          <h2 className="font-serif text-xl font-bold text-foreground pt-4">9. Changes to This Notice</h2>
          <p>
            We may update this Privacy Notice from time to time. Material changes will be communicated
            through the Service or by email, where appropriate.
          </p>

          <h2 className="font-serif text-xl font-bold text-foreground pt-4">10. Contact</h2>
          <p>
            For privacy enquiries, write to Kinlo and Glen at{' '}
            <a className="underline" href="mailto:privacy@infradar.io">privacy@infradar.io</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
