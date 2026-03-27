import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, Clock, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';

const ROLES = ['Investor/Fund', 'Strategy & Research', 'Project Lead', 'Business Development', 'Analyst', 'Other'];
const SIZES = ['1–10', '11–50', '51–200', '201–500', '501–1000', '1000+'];

export function ContactSection() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const data = Object.fromEntries(fd.entries());
    // Save to localStorage as MVP persistence
    const existing = JSON.parse(localStorage.getItem('infradar_waitlist') || '[]');
    existing.push({ ...data, ts: new Date().toISOString() });
    localStorage.setItem('infradar_waitlist', JSON.stringify(existing));
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
      toast({ title: 'You\'re on the list!', description: 'We\'ll be in touch when early access opens.' });
    }, 800);
  };

  if (submitted) {
    return (
      <section id="contact" className="relative py-24">
        <div className="mx-auto max-w-xl px-4 sm:px-6 text-center">
          <div className="glass-panel rounded-xl p-12 teal-glow">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary mx-auto mb-4">
              <Shield className="h-7 w-7" />
            </div>
            <h2 className="font-serif text-2xl font-bold mb-2">You're on the list</h2>
            <p className="text-muted-foreground">We'll reach out when early access opens. In the meantime, explore the demo above.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="contact" className="relative py-24">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(107,216,203,0.06) 0%, transparent 70%)' }} />
      <div className="relative mx-auto max-w-xl px-4 sm:px-6">
        <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary text-center">07 Join the waitlist</div>
        <h2 className="font-serif text-3xl font-bold sm:text-4xl text-center mb-8">Get early access at launch</h2>

        <form onSubmit={handleSubmit} className="glass-panel rounded-xl p-8 space-y-4 teal-glow">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Work email <span className="text-destructive">*</span></label>
            <Input name="email" type="email" required placeholder="you@company.com" className="bg-black/20" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Full name</label>
              <Input name="name" placeholder="Jane Doe" className="bg-black/20" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Company</label>
              <Input name="company" placeholder="Acme Corp" className="bg-black/20" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Role</label>
              <Select name="role">
                <SelectTrigger className="bg-black/20"><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Company size</label>
              <Select name="size">
                <SelectTrigger className="bg-black/20"><SelectValue placeholder="Select size" /></SelectTrigger>
                <SelectContent>{SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Primary interest</label>
            <Input name="interest" placeholder="e.g. MENA energy sector tracking" className="bg-black/20" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Current challenge</label>
            <Textarea name="challenge" placeholder="Tell us about your workflow pain points..." className="bg-black/20" rows={3} />
          </div>
          <Button type="submit" className="w-full teal-glow" disabled={loading}>{loading ? 'Submitting...' : 'Join waitlist'}</Button>

          <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground pt-2">
            <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> No credit card</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> 14-day pilot</span>
            <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Enterprise-grade</span>
          </div>
          <p className="text-[10px] text-center text-muted-foreground">
            By submitting you agree to our <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link> and <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>.
          </p>
        </form>
      </div>
    </section>
  );
}
