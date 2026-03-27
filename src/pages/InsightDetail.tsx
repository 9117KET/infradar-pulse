import { useParams, Link } from 'react-router-dom';
import { useInsight } from '@/hooks/use-insights';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Clock, User, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export default function InsightDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: insight, isLoading, error } = useInsight(slug || '');

  if (isLoading) {
    return (
      <div className="py-20 text-center">
        <div className="animate-pulse text-muted-foreground">Loading article…</div>
      </div>
    );
  }

  if (error || !insight) {
    return (
      <div className="py-20 text-center">
        <h1 className="font-serif text-2xl font-bold mb-4">Article not found</h1>
        <Link to="/insights" className="text-primary hover:underline">← Back to Insights</Link>
      </div>
    );
  }

  return (
    <div className="py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Link to="/insights" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" /> Back to Insights
        </Link>

        <div className="flex items-center gap-3 mb-4">
          <Badge variant="outline" className="border-primary/30 text-primary text-xs">{insight.tag}</Badge>
          {insight.ai_generated && <Badge variant="outline" className="border-amber-500/30 text-amber-500 text-xs">AI Generated</Badge>}
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl font-bold mb-4 leading-tight">{insight.title}</h1>

        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-8 pb-8 border-b border-border">
          <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> {insight.author}</span>
          <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {format(new Date(insight.created_at), 'MMM d, yyyy')}</span>
          <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {insight.reading_time_min} min read</span>
        </div>

        <div className="prose prose-invert prose-sm max-w-none
          prose-headings:font-serif prose-headings:text-foreground
          prose-p:text-muted-foreground prose-p:leading-relaxed
          prose-strong:text-foreground
          prose-li:text-muted-foreground
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        ">
          {insight.content.split('\n').map((line, i) => {
            if (line.startsWith('## ')) return <h2 key={i}>{line.slice(3)}</h2>;
            if (line.startsWith('### ')) return <h3 key={i}>{line.slice(4)}</h3>;
            if (line.startsWith('- **')) {
              const match = line.match(/^- \*\*(.+?)\*\*:?\s*(.*)/);
              if (match) return <li key={i}><strong>{match[1]}</strong>{match[2] ? `: ${match[2]}` : ''}</li>;
            }
            if (line.startsWith('- ')) return <li key={i}>{line.slice(2)}</li>;
            if (line.match(/^\d+\.\s/)) return <li key={i}>{line.replace(/^\d+\.\s/, '')}</li>;
            if (line.trim() === '') return <br key={i} />;
            return <p key={i}>{line}</p>;
          })}
        </div>
      </div>
    </div>
  );
}
