import { useState, useMemo } from 'react';
import { useAlerts } from '@/hooks/use-alerts';
import { ALERT_CATEGORIES, type AlertCategory } from '@/data/alerts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertTriangle, Brain, CheckCheck, ChevronDown, ChevronUp,
  Shield, TrendingUp, BarChart3, Loader2, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
  PieChart, Pie,
} from 'recharts';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626', high: '#f59e0b', medium: '#3b82f6', low: '#64748b',
};

const CATEGORY_COLORS: Record<string, string> = {
  political: '#8b5cf6', financial: '#f59e0b', regulatory: '#3b82f6', supply_chain: '#ef4444',
  environmental: '#22c55e', construction: '#f97316', stakeholder: '#06b6d4', market: '#ec4899', security: '#64748b',
};

const severityClass: Record<string, string> = {
  critical: 'text-destructive border-destructive/30',
  high: 'text-amber-500 border-amber-500/30',
  medium: 'text-blue-400 border-blue-400/30',
  low: 'text-muted-foreground border-border',
};

const categoryIcon: Record<string, string> = {
  political: '🏛️', financial: '💰', regulatory: '📋', supply_chain: '🚚',
  environmental: '🌍', construction: '🏗️', stakeholder: '👥', market: '📈', security: '🔒',
};

interface IntelBrief {
  patterns: { title: string; category: string; severity: string; description: string; affected_projects?: string[] }[];
  hotspots: { region: string; alert_count?: number; dominant_category?: string; summary: string }[];
  recommendations: { action: string; priority: string; rationale: string }[];
  overall_risk_trend: string;
  summary: string;
}

export default function Alerts() {
  const { alerts, loading, stats, filterByCategory, markAllAsRead } = useAlerts();
  const [selectedCategory, setSelectedCategory] = useState<AlertCategory | 'all'>('all');
  const [brief, setBrief] = useState<IntelBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefOpen, setBriefOpen] = useState(true);

  const filtered = filterByCategory(selectedCategory);

  // Volume over time (last 30 days, grouped by day)
  const volumeByDay = useMemo(() => {
    const days: Record<string, Record<string, number>> = {};
    const now = Date.now();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      days[key] = { critical: 0, high: 0, medium: 0, low: 0 };
    }
    alerts.forEach(a => {
      const d = new Date(a.createdAt);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      if (days[key]) days[key][a.severity] = (days[key][a.severity] || 0) + 1;
    });
    return Object.entries(days).map(([day, sevs]) => ({ day, ...sevs }));
  }, [alerts]);

  // Category distribution for pie
  const categoryDistribution = useMemo(() => {
    return ALERT_CATEGORIES
      .map(c => ({ name: c.label, value: stats.byCategory[c.value] || 0, fill: CATEGORY_COLORS[c.value] || '#64748b' }))
      .filter(c => c.value > 0);
  }, [stats]);

  // Severity distribution for pie
  const severityDistribution = useMemo(() => {
    const sevs = ['critical', 'high', 'medium', 'low'] as const;
    return sevs.map(s => ({
      name: s.charAt(0).toUpperCase() + s.slice(1),
      value: alerts.filter(a => a.severity === s).length,
      fill: SEVERITY_COLORS[s],
    })).filter(s => s.value > 0);
  }, [alerts]);

  const generateBrief = async () => {
    setBriefLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('alert-intelligence');
      if (error) throw new Error(error.message);
      if (data?.brief) {
        setBrief(data.brief);
        setBriefOpen(true);
        toast.success('Intelligence brief generated');
      } else {
        toast.info('No sufficient data for a brief');
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate brief');
    } finally {
      setBriefLoading(false);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
    toast.success('All alerts marked as read');
  };

  const trendIcon = brief?.overall_risk_trend === 'escalating' ? '🔴' : brief?.overall_risk_trend === 'improving' ? '🟢' : '🟡';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-serif text-2xl font-bold">Alerts & Intelligence</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleMarkAllRead} disabled={stats.unread === 0}>
            <CheckCheck className="h-4 w-4 mr-1.5" /> Mark all read
          </Button>
          <Button size="sm" onClick={generateBrief} disabled={briefLoading}>
            {briefLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Brain className="h-4 w-4 mr-1.5" />}
            Generate Intelligence Brief
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass-panel rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <BarChart3 className="h-3.5 w-3.5" /> Total Alerts
          </div>
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">{stats.unread} unread</p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <TrendingUp className="h-3.5 w-3.5" /> Most Active
          </div>
          <p className="text-lg font-bold capitalize">{stats.mostActiveCategory.replace('_', ' ')}</p>
          <p className="text-xs text-muted-foreground">{stats.byCategory[stats.mostActiveCategory] || 0} alerts</p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <div className="flex items-center gap-2 text-destructive text-xs mb-1">
            <AlertTriangle className="h-3.5 w-3.5" /> Critical
          </div>
          <p className="text-2xl font-bold">{stats.critical}</p>
          <p className="text-xs text-muted-foreground">require attention</p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Shield className="h-3.5 w-3.5" /> Risk Trend
          </div>
          <p className="text-lg font-bold">{brief ? `${trendIcon} ${brief.overall_risk_trend}` : '—'}</p>
          <p className="text-xs text-muted-foreground">{brief ? 'AI assessed' : 'Generate brief'}</p>
        </div>
      </div>

      {/* Intelligence Brief */}
      {brief && (
        <Collapsible open={briefOpen} onOpenChange={setBriefOpen}>
          <div className="glass-panel rounded-xl border border-primary/20">
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between p-5 text-left">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  <span className="font-serif font-bold">Intelligence Brief</span>
                  <Badge variant="outline" className="text-[10px]">{trendIcon} {brief.overall_risk_trend}</Badge>
                </div>
                {briefOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-5 pb-5 space-y-5 border-t border-border/50 pt-4">
                <p className="text-sm text-muted-foreground">{brief.summary}</p>

                {/* Patterns */}
                {brief.patterns?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Emerging Patterns</h3>
                    <div className="space-y-2">
                      {brief.patterns.map((p, i) => (
                        <div key={i} className="bg-muted/30 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className={`text-[10px] ${severityClass[p.severity] || ''}`}>{p.severity}</Badge>
                            <span className="text-sm font-medium">{p.title}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{p.description}</p>
                          {p.affected_projects?.length ? (
                            <p className="text-[10px] text-muted-foreground mt-1">Projects: {p.affected_projects.join(', ')}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hotspots */}
                {brief.hotspots?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Regional Hotspots</h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {brief.hotspots.map((h, i) => (
                        <div key={i} className="bg-muted/30 rounded-lg p-3">
                          <p className="text-sm font-medium">{h.region}</p>
                          <p className="text-xs text-muted-foreground">{h.summary}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                {brief.recommendations?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Recommendations</h3>
                    <div className="space-y-2">
                      {brief.recommendations.map((r, i) => (
                        <div key={i} className="flex items-start gap-3 bg-muted/30 rounded-lg p-3">
                          <Badge variant={r.priority === 'immediate' ? 'destructive' : 'outline'} className="text-[10px] shrink-0 mt-0.5">
                            {r.priority.replace('_', ' ')}
                          </Badge>
                          <div>
                            <p className="text-sm font-medium">{r.action}</p>
                            <p className="text-xs text-muted-foreground">{r.rationale}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      {/* Category Filter Bar */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedCategory === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`}
        >
          All ({stats.total})
        </button>
        {ALERT_CATEGORIES.map(c => {
          const count = stats.byCategory[c.value] || 0;
          if (count === 0) return null;
          return (
            <button
              key={c.value}
              onClick={() => setSelectedCategory(c.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedCategory === c.value ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`}
            >
              {categoryIcon[c.value]} {c.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Alert List */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No alerts in this category</p>
        ) : filtered.map(a => (
          <div key={a.id} className={`glass-panel rounded-xl p-5 flex items-start gap-4 ${!a.read ? 'border-primary/20' : ''}`}>
            <AlertTriangle className={`h-5 w-5 mt-0.5 shrink-0 ${a.severity === 'critical' ? 'text-destructive' : a.severity === 'high' ? 'text-amber-500' : 'text-muted-foreground'}`} />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Badge variant="outline" className={`text-[10px] ${severityClass[a.severity]}`}>{a.severity}</Badge>
                <Badge variant="secondary" className="text-[10px]">{categoryIcon[a.category]} {a.category.replace('_', ' ')}</Badge>
                {!a.read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              </div>
              <p className="text-sm font-medium">{a.message}</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-muted-foreground">{a.projectName} · {a.time}</p>
                {a.sourceUrl && (
                  <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <ExternalLink className="h-3 w-3" /> Source
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
