import { Link } from 'react-router-dom';
import { InfradarLogo } from './InfradarLogo';
import { Button } from '@/components/ui/button';

const PLATFORM_LINKS = [
  { label: 'Explore', href: '/explore' },
  { label: 'Try Ask AI', href: '/ask-demo' },
  { label: 'Snapshot', href: '/snapshot' },
  { label: 'Insights', href: '/insights' },
  { label: 'Services', href: '/services' },
  { label: 'Pricing', href: '/pricing' },
];

const COMPANY_LINKS = [
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'Careers', href: '/careers' },
  { label: 'Press', href: '/press' },
  { label: 'Feedback', href: '/feedback' },
];

const LEGAL_LINKS = [
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Privacy Notice', href: '/privacy' },
  { label: 'Refund Policy', href: '/refund' },
  { label: 'Data Protection', href: '/data-protection' },
];

export function Footer() {
  return (
    <footer className="relative border-t border-border overflow-hidden">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none">
        <span className="font-serif text-[8rem] sm:text-[12rem] font-bold tracking-widest text-white/[0.02]">INFRADARAI</span>
      </div>

      <div className="relative section-fluid py-12 sm:py-16 safe-bottom">
        <div className="grid gap-8 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">

          {/* Brand */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-3">
              <InfradarLogo size={24} />
              <span className="font-serif text-base font-semibold tracking-wide">INFRADARAI</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[220px]">
              Verified infrastructure intelligence for high-stakes decisions across 14 global regions.
            </p>
          </div>

          {/* Platform */}
          <div>
            <h4 className="font-sans text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Platform</h4>
            <ul className="space-y-2.5">
              {PLATFORM_LINKS.map(l => (
                <li key={l.href}>
                  <Link to={l.href} className="text-sm text-muted-foreground hover:text-primary transition-colors">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-sans text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Company</h4>
            <ul className="space-y-2.5">
              {COMPANY_LINKS.map(l => (
                <li key={l.href}>
                  <Link to={l.href} className="text-sm text-muted-foreground hover:text-primary transition-colors">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-sans text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Legal</h4>
            <ul className="space-y-2.5">
              {LEGAL_LINKS.map(l => (
                <li key={l.href}>
                  <Link to={l.href} className="text-sm text-muted-foreground hover:text-primary transition-colors">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Get Started */}
          <div>
            <h4 className="font-sans text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Get Started</h4>
            <div className="flex flex-col gap-3">
              <a href="/#connect">
                <Button className="w-full teal-glow text-sm">Request Demo</Button>
              </a>
              <Link to="/login">
                <Button variant="outline" className="w-full text-sm">Sign in</Button>
              </Link>
              <Link to="/login?mode=signup">
                <Button variant="ghost" className="w-full text-sm text-muted-foreground">Create account</Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} INFRADARAI. All rights reserved.</p>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            {LEGAL_LINKS.map(l => (
              <Link key={l.href} to={l.href} className="text-xs text-muted-foreground hover:text-primary transition-colors">{l.label}</Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
