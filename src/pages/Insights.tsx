import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const POSTS = [
  { title: 'Why satellite verification changes infrastructure due diligence', tag: 'Verification', date: 'Mar 2026', excerpt: 'How commercial satellite imagery is closing the gap between filed reports and ground truth in MENA megaprojects.' },
  { title: 'Early warning signals: predicting delay before it compounds', tag: 'Risk', date: 'Feb 2026', excerpt: 'A framework for scoring delay risk across multi-billion dollar African infrastructure corridors.' },
  { title: 'MENA vs East Africa: diverging infrastructure trajectories', tag: 'Region', date: 'Jan 2026', excerpt: 'Comparing capital flows, project velocity, and verification density across the two fastest-moving regions.' },
];

const STATS = [
  { value: '50,000+', label: 'Projects tracked' },
  { value: '$9.18T', label: 'Active pipeline' },
  { value: 'Early warning', label: 'Delay prediction' },
  { value: 'Human-in-the-loop', label: 'Data verification' },
];

export default function Insights() {
  return (
    <div className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h1 className="font-serif text-4xl font-bold mb-4">Insights</h1>
        <p className="text-muted-foreground max-w-2xl mb-12">Research, analysis, and perspectives on infrastructure intelligence across MENA and Africa.</p>

        <div className="grid gap-6 md:grid-cols-3 mb-16">
          {POSTS.map((p, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              className="glass-panel rounded-xl p-6 hover:border-primary/30 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className="border-primary/30 text-primary text-xs">{p.tag}</Badge>
                <span className="text-xs text-muted-foreground">{p.date}</span>
              </div>
              <h3 className="font-serif text-lg font-semibold mb-2">{p.title}</h3>
              <p className="text-sm text-muted-foreground">{p.excerpt}</p>
            </motion.div>
          ))}
        </div>

        <div className="glass-panel rounded-xl p-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center mb-12">
          {STATS.map(s => (
            <div key={s.label}>
              <div className="text-2xl font-serif font-bold text-primary">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <a href="/#contact"><Button className="teal-glow">Join the waitlist</Button></a>
        </div>
      </div>
    </div>
  );
}
