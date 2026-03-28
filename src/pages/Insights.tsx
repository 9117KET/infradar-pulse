import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useInsights } from '@/hooks/use-insights';
import { format } from 'date-fns';
import { Clock, ArrowRight } from 'lucide-react';

const STATS = [
  { value: '50,000+', label: 'Projects tracked' },
  { value: '$9.18T', label: 'Active pipeline' },
  { value: 'Early warning', label: 'Delay prediction' },
  { value: 'Human-in-the-loop', label: 'Data verification' },
];

export default function Insights() {
  const { data: insights = [], isLoading } = useInsights(true);

  return (
    <div className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h1 className="font-serif text-4xl font-bold mb-4">Insights</h1>
        <p className="text-muted-foreground max-w-2xl mb-12">Research, analysis, and perspectives on infrastructure intelligence across MENA and Africa.</p>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground animate-pulse">Loading insights…</div>
        ) : insights.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No published insights yet.</div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3 mb-16">
            {insights.map((p, i) => (
              <motion.div key={p.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <Link
                  to={`/insights/${p.slug}`}
                  className="glass-panel rounded-xl p-6 hover:border-primary/30 transition-colors block h-full group"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline" className="border-primary/30 text-primary text-xs">{p.tag}</Badge>
                    <span className="text-xs text-muted-foreground">{format(new Date(p.created_at), 'MMM yyyy')}</span>
                  </div>
                  <h3 className="font-serif text-lg font-semibold mb-2 group-hover:text-primary transition-colors">{p.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{p.excerpt}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {p.reading_time_min} min read</span>
                    <span className="flex items-center gap-1 text-primary opacity-0 group-hover:opacity-100 transition-opacity">Read <ArrowRight className="h-3 w-3" /></span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        <div className="glass-panel rounded-xl p-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center mb-12">
          {STATS.map(s => (
            <div key={s.label}>
              <div className="text-2xl font-serif font-bold text-primary">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link to="/login"><Button className="teal-glow">Get Started Free</Button></Link>
        </div>
      </div>
    </div>
  );
}
