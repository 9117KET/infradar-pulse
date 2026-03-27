import { useState } from 'react';
import { useInsights, type Insight } from '@/hooks/use-insights';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sparkles, Eye, EyeOff, Trash2, Loader2, BookOpen, PenLine } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function InsightsManagement() {
  const { data: insights = [], isLoading } = useInsights(false);
  const [generating, setGenerating] = useState(false);
  const [topic, setTopic] = useState('');
  const queryClient = useQueryClient();

  const generateInsight = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-insight', {
        body: { topic: topic.trim() || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Insight generated! Review it below and publish when ready.');
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      setTopic('');
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate insight');
    } finally {
      setGenerating(false);
    }
  };

  const togglePublish = async (insight: Insight) => {
    const { error } = await (supabase.from('insights' as any).update({ published: !insight.published }).eq('id', insight.id) as any);
    if (error) { toast.error('Failed to update'); return; }
    toast.success(insight.published ? 'Unpublished' : 'Published');
    queryClient.invalidateQueries({ queryKey: ['insights'] });
  };

  const deleteInsight = async (id: string) => {
    const { error } = await (supabase.from('insights' as any).delete().eq('id', id) as any);
    if (error) { toast.error('Failed to delete'); return; }
    toast.success('Deleted');
    queryClient.invalidateQueries({ queryKey: ['insights'] });
  };

  const published = insights.filter(i => i.published).length;
  const drafts = insights.filter(i => !i.published).length;

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-bold">Insights Management</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" />Total</div>
            <CardTitle className="text-2xl">{insights.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" />Published</div>
            <CardTitle className="text-2xl">{published}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5"><PenLine className="h-3.5 w-3.5" />Drafts</div>
            <CardTitle className="text-2xl">{drafts}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="glass-panel border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Generate AI Insight</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            type="text"
            placeholder="Optional topic (leave blank for AI to choose based on latest data)…"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <Button onClick={generateInsight} disabled={generating} size="sm" className="teal-glow">
            {generating ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Generating…</> : <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Generate Insight</>}
          </Button>
        </CardContent>
      </Card>

      <Card className="glass-panel border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
          ) : insights.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No insights yet. Generate one above!</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Title</TableHead>
                  <TableHead>Tag</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {insights.map(i => (
                  <TableRow key={i.id} className="border-border/50">
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm truncate max-w-[300px]">{i.title}</p>
                        {i.ai_generated && <span className="text-[10px] text-amber-500">AI Generated</span>}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{i.tag}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={i.published ? 'default' : 'outline'} className={`text-xs ${i.published ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : ''}`}>
                        {i.published ? 'Published' : 'Draft'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{format(new Date(i.created_at), 'MMM d, yyyy')}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => togglePublish(i)} title={i.published ? 'Unpublish' : 'Publish'}>
                          {i.published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteInsight(i.id)} title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
