import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Handshake, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import { toast } from 'sonner';

type SubscriberInsert = Database['public']['Tables']['subscribers']['Insert'];

export function EngagementSection() {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [useCase, setUseCase] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!email.trim() || !name.trim()) {
      toast.error('Please provide your name and email');
      return;
    }
    setLoading(true);
    const row: SubscriberInsert = {
      email: email.trim(),
      name: name.trim(),
      company: company.trim() || null,
      type: 'demo_request',
      preferences: { use_case: useCase } as Json,
    };
    const { error } = await supabase.from('subscribers').insert(row);
    setLoading(false);
    if (error) { toast.error('Something went wrong'); return; }
    setDone(true);
    toast.success("Demo request submitted! We'll be in touch shortly.");
  };

  return (
    <section id="connect" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="font-serif text-3xl font-bold sm:text-4xl mb-4">Request a Demo</h2>
          <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Schedule a personalized walkthrough with our team and see how Infradar fits your workflow.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="mx-auto max-w-lg"
        >
          <div className="glass-panel rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center">
                <Handshake className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-semibold">Book a walkthrough</h3>
                <p className="text-xs text-muted-foreground">Enterprise & team plans</p>
              </div>
            </div>

            {done ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="h-6 w-6 text-primary" />
                </div>
                <p className="font-medium">Request received!</p>
                <p className="text-sm text-muted-foreground">We'll reach out within one business day.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="Your name *"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="text-sm h-10"
                  />
                  <Input
                    placeholder="Company"
                    value={company}
                    onChange={e => setCompany(e.target.value)}
                    className="text-sm h-10"
                  />
                </div>
                <Input
                  placeholder="Work email *"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="text-sm h-10"
                />
                <textarea
                  placeholder="What are you looking to achieve? (optional)"
                  value={useCase}
                  onChange={e => setUseCase(e.target.value)}
                  className="h-20 rounded-md border border-input bg-background px-3 py-2.5 text-sm resize-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <Button
                  className="teal-glow w-full h-10 mt-1"
                  onClick={submit}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Request demo'}
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
