import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export default function Careers() {
  return (
    <div className="py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h1 className="font-serif text-4xl font-bold mb-4">Careers</h1>
        <p className="text-muted-foreground mb-8">We're building the intelligence layer for emerging-market infrastructure. Join us.</p>
        <div className="glass-panel rounded-xl p-8 text-center">
          <p className="text-muted-foreground mb-4">We're not actively hiring at this time, but we're always interested in hearing from exceptional people working at the intersection of data, geospatial intelligence, and emerging markets.</p>
          <Link to="/contact"><Button variant="outline">Get in touch</Button></Link>
        </div>
      </div>
    </div>
  );
}
