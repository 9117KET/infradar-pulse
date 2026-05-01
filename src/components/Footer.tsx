import { Link } from 'react-router-dom';
import { InfradarLogo } from './InfradarLogo';
import { Button } from '@/components/ui/button';

const PRODUCT_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Insights', href: '/insights' },
  { label: 'Services', href: '/services' },
  { label: 'Pricing', href: '/pricing' },
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
      {/* Giant watermark */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none">
        <span className="font-serif text-[8rem] sm:text-[12rem] font-bold tracking-widest text-white/[0.02]">INFRADARAI</span>
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:py-16 sm:px-6 safe-bottom">
        <div className="grid gap-10 sm:gap-12 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <InfradarLogo size={24} />
              <span className="font-serif text-base font-semibold tracking-wide">INFRADARAI</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Verified infrastructure intelligence for high-stakes decisions across 14 global regions.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-sans text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Product</h4>
            <ul className="space-y-2">
              {PRODUCT_LINKS.map(l => (
                <li key={l.href}><Link to={l.href} className="text-sm text-muted-foreground hover:text-primary transition-colors">{l.label}</Link></li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-sans text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Legal</h4>
            <ul className="space-y-2">
              {LEGAL_LINKS.map(l => (
                <li key={l.href}><Link to={l.href} className="text-sm text-muted-foreground hover:text-primary transition-colors">{l.label}</Link></li>
              ))}
            </ul>
          </div>

          {/* CTA */}
          <div>
            <h4 className="font-sans text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Get Started</h4>
            <div className="flex flex-col gap-3">
              <a href="/#connect"><Button className="w-full teal-glow">Subscribe to Updates</Button></a>
              <Link to="/login"><Button variant="outline" className="w-full">Explore platform</Button></Link>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} INFRADARAI. All rights reserved.</p>
          <div className="flex gap-4">
            {LEGAL_LINKS.map(l => (
              <Link key={l.href} to={l.href} className="text-xs text-muted-foreground hover:text-primary transition-colors">{l.label}</Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
