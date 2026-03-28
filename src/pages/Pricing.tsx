import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Shield, Clock, Users } from 'lucide-react';

export default function Pricing() {
  return (
    <div className="py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
        <h1 className="font-serif text-4xl font-bold mb-4">Pricing</h1>
        <p className="text-muted-foreground max-w-xl mx-auto mb-12">
          Infradar pricing is tailored to your scope—regions covered, seats needed, and integration requirements. Start with a pilot to see the value first.
        </p>

        <div className="glass-panel rounded-xl p-10 teal-glow mb-8">
          <h2 className="font-serif text-2xl font-bold mb-4">Tailored to your needs</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Every deployment is scoped to your coverage requirements, team size, and data integration needs. We offer a 14-day pilot program so you can evaluate with real signals.
          </p>
          <div className="flex flex-wrap justify-center gap-6 mb-8 text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Enterprise-grade security</span>
            <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> 14-day pilot program</span>
            <span className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Dedicated onboarding</span>
          </div>
          <div className="flex gap-4 justify-center">
            <a href="/#connect"><Button className="teal-glow">Request pricing</Button></a>
            <Link to="/login"><Button variant="outline">Get Started</Button></Link>
          </div>
        </div>
      </div>
    </div>
  );
}
