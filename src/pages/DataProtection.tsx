export default function DataProtection() {
  return (
    <div className="py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h1 className="font-serif text-4xl font-bold mb-8">Data Protection</h1>
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>Infradar takes data protection seriously. Our infrastructure is designed to meet the requirements of GDPR and regional data protection regulations.</p>
          <h2 className="font-serif text-xl font-bold text-foreground pt-4">Technical Measures</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>End-to-end TLS 1.3 encryption for all data in transit</li>
            <li>AES-256 encryption for data at rest</li>
            <li>Role-based access controls with audit logging</li>
            <li>Regular penetration testing and vulnerability assessments</li>
          </ul>
          <h2 className="font-serif text-xl font-bold text-foreground pt-4">Data Residency</h2>
          <p>We offer regional data residency options for enterprise clients requiring data to remain within specific jurisdictions.</p>
        </div>
      </div>
    </div>
  );
}
