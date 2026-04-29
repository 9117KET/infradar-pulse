import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { InfradarLogo } from './InfradarLogo';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Explore', href: '/explore' },
  { label: 'Insights', href: '/insights' },
  { label: 'Services', href: '/services' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled
          ? 'glass-panel-strong border-b border-white/10'
          : 'bg-transparent border-b border-transparent'
      )}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <InfradarLogo size={28} />
          <span className="font-serif text-lg font-semibold tracking-wide text-foreground">INFRADARAI</span>
        </Link>

        {/* Desktop */}
        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map(l => (
            <Link
              key={l.href}
              to={l.href}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors hover:text-primary',
                pathname === l.href ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link to="/login">
            <Button variant="ghost" size="sm" className="text-muted-foreground">Sign in</Button>
          </Link>
          <Link to="/login">
            <Button size="sm" className="teal-glow">Get Started</Button>
          </Link>
        </div>

        {/* Mobile */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
          </SheetTrigger>
          <SheetContent side="right" className="bg-background border-border w-72">
            <SheetTitle className="sr-only">Navigation menu</SheetTitle>
            <div className="flex flex-col gap-4 pt-8">
              {NAV_LINKS.map(l => (
                <Link key={l.href} to={l.href} onClick={() => setOpen(false)}
                  className={cn('px-3 py-2 text-base font-medium', pathname === l.href ? 'text-primary' : 'text-muted-foreground')}>
                  {l.label}
                </Link>
              ))}
              <hr className="border-border" />
              <Link to="/login" onClick={() => setOpen(false)}>
                <Button variant="ghost" className="w-full justify-start">Sign in</Button>
              </Link>
              <Link to="/login" onClick={() => setOpen(false)}>
                <Button className="w-full teal-glow">Get Started</Button>
              </Link>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  );
}
