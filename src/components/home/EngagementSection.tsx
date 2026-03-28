import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from 'react-router-dom';
import { Mail, Rocket, BellRing, Handshake, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const REGIONS = ['MENA', 'East Africa', 'West Africa'];
const SECTORS = ['Urban Development', 'Digital Infrastructure', 'Renewable Energy', 'Transport', 'Water', 'Energy'];

function NewsletterCard() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!email.trim()) return;
    setLoading(true);
    const { error } = await supabase.from('subscribers' as any).insert({ email: email.trim(), type: 'newsletter' } as any);
    setLoading(false);
    if (error) { toast.error('Something went wrong'); return; }
    setDone(true);
    toast.success('Subscribed to Intel Digest!');
  };

  return (
    <div className="glass-panel rounded-xl p-6 flex flex-col h-full">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-serif text-sm font-semibold">Intel Digest</h3>
          <p className="text-xs text-muted-foreground">Weekly briefing</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-4 flex-1">
        Curated infrastructure intelligence — project updates, risk signals, and market trends delivered weekly.
      </p>
      {done ? (
        <div className="flex items-center gap-2 text-primary text-sm"><Check className="h-4 w-4" /> Subscribed!</div>
      ) : (
        <div className="flex gap-2">
          <Input placeholder="your@email.com" type="email" value={email} onChange={e => setEmail(e.target.value)} className="text-sm h-9" />
          <Button size="sm" className="teal-glow shrink-0" onClick={submit} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Subscribe'}
          </Button>
        </div>
      )}
    </div>
  );
}

function GetStartedCard() {
  return (
    <div className="glass-panel rounded-xl p-6 flex flex-col h-full">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Rocket className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-serif text-sm font-semibold">Get Started Free</h3>
          <p className="text-xs text-muted-foreground">Instant access</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-4 flex-1">
        Create a free account and explore the platform immediately — track projects, set alerts, and access AI research tools.
      </p>
      <Link to="/login">
        <Button className="w-full teal-glow" size="sm">Create free account</Button>
      </Link>
    </div>
  );
}

function AlertSubscriptionCard() {
  const [email, setEmail] = useState('');
  const [region, setRegion] = useState('');
  const [sector, setSector] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!email.trim() || !region || !sector) { toast.error('Please fill all fields'); return; }
    setLoading(true);
    const { error } = await supabase.from('subscribers' as any).insert({
      email: email.trim(),
      type: 'alert',
      preferences: { region, sector },
    } as any);
    setLoading(false);
    if (error) { toast.error('Something went wrong'); return; }
    setDone(true);
    toast.success('Alert subscription created!');
  };

  return (
    <div className="glass-panel rounded-xl p-6 flex flex-col h-full">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <BellRing className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-serif text-sm font-semibold">Custom Alerts</h3>
          <p className="text-xs text-muted-foreground">Region & sector</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-4 flex-1">
        Get notified when new projects or risk signals match your region and sector interests.
      </p>
      {done ? (
        <div className="flex items-center gap-2 text-primary text-sm"><Check className="h-4 w-4" /> Alert set!</div>
      ) : (
        <div className="flex flex-col gap-2">
          <select value={region} onChange={e => setRegion(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Select region</option>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={sector} onChange={e => setSector(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Select sector</option>
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <Input placeholder="your@email.com" type="email" value={email} onChange={e => setEmail(e.target.value)} className="text-sm h-9" />
          <Button size="sm" className="teal-glow" onClick={submit} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Set alert'}
          </Button>
        </div>
      )}
    </div>
  );
}

function DemoRequestCard() {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [useCase, setUseCase] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!email.trim() || !name.trim()) { toast.error('Please provide your name and email'); return; }
    setLoading(true);
    const { error } = await supabase.from('subscribers' as any).insert({
      email: email.trim(),
      name: name.trim(),
      company: company.trim() || null,
      type: 'demo_request',
      preferences: { use_case: useCase },
    } as any);
    setLoading(false);
    if (error) { toast.error('Something went wrong'); return; }
    setDone(true);
    toast.success('Demo request submitted!');
  };

  return (
    <div className="glass-panel rounded-xl p-6 flex flex-col h-full">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Handshake className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-serif text-sm font-semibold">Request a Demo</h3>
          <p className="text-xs text-muted-foreground">Enterprise</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-4 flex-1">
        Schedule a personalized walkthrough with our team. See how Infradar fits your workflow.
      </p>
      {done ? (
        <div className="flex items-center gap-2 text-primary text-sm"><Check className="h-4 w-4" /> Request sent!</div>
      ) : (
        <div className="flex flex-col gap-2">
          <Input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} className="text-sm h-9" />
          <Input placeholder="Company" value={company} onChange={e => setCompany(e.target.value)} className="text-sm h-9" />
          <Input placeholder="your@email.com" type="email" value={email} onChange={e => setEmail(e.target.value)} className="text-sm h-9" />
          <textarea
            placeholder="What are you looking to achieve?"
            value={useCase}
            onChange={e => setUseCase(e.target.value)}
            className="h-16 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none placeholder:text-muted-foreground"
          />
          <Button size="sm" className="teal-glow" onClick={submit} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Request demo'}
          </Button>
        </div>
      )}
    </div>
  );
}

export function EngagementSection() {
  return (
    <section id="connect" className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
          <h2 className="font-serif text-3xl font-bold mb-3">Stay Connected</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Choose how you want to engage with Infradar — subscribe for updates, start exploring, set custom alerts, or talk to our team.
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0 }}>
            <NewsletterCard />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}>
            <GetStartedCard />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}>
            <AlertSubscriptionCard />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 }}>
            <DemoRequestCard />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
