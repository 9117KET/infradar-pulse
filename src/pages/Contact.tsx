import { Link } from 'react-router-dom';
import { Mail, MessageSquare, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Contact() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
        <h1 className="font-serif text-4xl font-bold mb-4">Get in touch</h1>
        <p className="text-muted-foreground mb-12 max-w-lg mx-auto">
          Have questions about InfraRadar? We'd love to hear from you. Choose the option that best fits your needs.
        </p>

        <div className="grid gap-6 sm:grid-cols-3">
          <div className="glass-panel rounded-xl p-6 text-center space-y-3">
            <Mail className="h-8 w-8 text-primary mx-auto" />
            <h3 className="font-serif font-semibold">Email us</h3>
            <p className="text-sm text-muted-foreground">For general inquiries and partnerships</p>
            <a href="mailto:hello@infradar.io">
              <Button variant="outline" size="sm" className="w-full">hello@infradar.io</Button>
            </a>
          </div>
          <div className="glass-panel rounded-xl p-6 text-center space-y-3">
            <MessageSquare className="h-8 w-8 text-primary mx-auto" />
            <h3 className="font-serif font-semibold">Book a demo</h3>
            <p className="text-sm text-muted-foreground">See the platform in action with our team</p>
            <Link to="/#engage">
              <Button size="sm" className="w-full teal-glow">Request demo</Button>
            </Link>
          </div>
          <div className="glass-panel rounded-xl p-6 text-center space-y-3">
            <FileText className="h-8 w-8 text-primary mx-auto" />
            <h3 className="font-serif font-semibold">Documentation</h3>
            <p className="text-sm text-muted-foreground">Learn about our platform features</p>
            <Link to="/services">
              <Button variant="outline" size="sm" className="w-full">View services</Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
