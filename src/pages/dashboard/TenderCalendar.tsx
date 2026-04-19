import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTrackedProjects } from '@/hooks/use-tracked-projects';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const STAGE_COLORS: Record<string, string> = {
  Planned: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  Tender: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  Awarded: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Financing: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  Construction: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  Completed: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
};

function isoDate(d: Date) {
  return d.toISOString().split('T')[0];
}

export default function TenderCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [scope, setScope] = useState<'all' | 'portfolio'>('all');
  const { trackedProjects } = useTrackedProjects();
  const trackedIds = new Set(trackedProjects.map(t => t.project_id));

  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0);

  const { data: milestones = [], isLoading } = useQuery({
    queryKey: ['tender-calendar', year, month],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_milestones')
        .select('id, title, date, milestone_type, project_id, projects(id, name, sector, stage, country)')
        .gte('date', isoDate(startOfMonth))
        .lte('date', isoDate(endOfMonth))
        .order('date', { ascending: true });
      return data ?? [];
    },
  });

  // Also fetch upcoming milestones (next 60 days) for sidebar
  const { data: upcoming = [] } = useQuery({
    queryKey: ['upcoming-milestones'],
    queryFn: async () => {
      const from = isoDate(today);
      const to = isoDate(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));
      const { data } = await supabase
        .from('project_milestones')
        .select('id, title, date, milestone_type, project_id, projects(id, name, sector, stage, country)')
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: true })
        .limit(30);
      return data ?? [];
    },
  });

  const visibleMilestones = useMemo(() => {
    const ms = (milestones as any[]);
    if (scope === 'portfolio') return ms.filter(m => trackedIds.has(m.project_id));
    return ms;
  }, [milestones, scope, trackedIds]);

  const visibleUpcoming = useMemo(() => {
    const ms = (upcoming as any[]);
    if (scope === 'portfolio') return ms.filter(m => trackedIds.has(m.project_id));
    return ms;
  }, [upcoming, scope, trackedIds]);

  // Map date -> milestones
  const byDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    visibleMilestones.forEach(m => {
      const d = m.date?.split('T')[0];
      if (!d) return;
      if (!map[d]) map[d] = [];
      map[d].push(m);
    });
    return map;
  }, [visibleMilestones]);

  // Build calendar grid
  const firstDow = startOfMonth.getDay();
  const daysInMonth = endOfMonth.getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  };

  const selectedMilestones = selectedDay ? (byDay[selectedDay] ?? []) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" /> Tender Calendar
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Milestones and tender dates across tracked projects.</p>
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(['all', 'portfolio'] as const).map(s => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-1.5 capitalize transition-colors ${scope === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {s === 'all' ? 'All projects' : 'My portfolio'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 glass-panel rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <button onClick={prevMonth} className="p-1.5 rounded hover:bg-muted/30 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold">{MONTHS[month]} {year}</span>
            <button onClick={nextMonth} className="p-1.5 rounded hover:bg-muted/30 transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 text-center">
            {WEEKDAYS.map(d => (
              <div key={d} className="text-[10px] text-muted-foreground py-1 font-medium">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          {isLoading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, idx) => {
                if (!day) return <div key={idx} />;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const events = byDay[dateStr] ?? [];
                const isToday = dateStr === isoDate(today);
                const isSelected = dateStr === selectedDay;
                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                    className={`min-h-[52px] rounded-lg p-1.5 text-left transition-colors relative border ${
                      isSelected ? 'border-primary/60 bg-primary/10' :
                      isToday ? 'border-primary/30 bg-primary/5' :
                      events.length > 0 ? 'border-border/40 bg-muted/20 hover:bg-muted/30' :
                      'border-transparent hover:bg-muted/10'
                    }`}
                  >
                    <span className={`text-[11px] font-medium block ${isToday ? 'text-primary' : 'text-foreground'}`}>{day}</span>
                    {events.slice(0, 2).map((e, i) => (
                      <div key={i} className="h-1.5 w-full rounded-full bg-primary/60 mt-0.5" />
                    ))}
                    {events.length > 2 && <span className="text-[9px] text-muted-foreground">+{events.length - 2}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Selected day events */}
          {selectedDay && (
            <div className="border-t border-border/30 pt-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                {new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              {selectedMilestones.length === 0 ? (
                <p className="text-xs text-muted-foreground">No events on this day.</p>
              ) : selectedMilestones.map((m: any) => {
                const proj = m.projects;
                const stageCls = STAGE_COLORS[proj?.stage] ?? '';
                return (
                  <div key={m.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/20 border border-border/30">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-snug">{m.title}</p>
                      {proj && (
                        <Link to={`/dashboard/projects/${proj.id}`} className="text-[10px] text-primary hover:underline truncate block">
                          {proj.name} - {proj.country}
                        </Link>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {m.milestone_type && <Badge variant="outline" className="text-[9px]">{m.milestone_type}</Badge>}
                      {proj?.stage && <Badge variant="outline" className={`text-[9px] ${stageCls}`}>{proj.stage}</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming sidebar */}
        <div className="glass-panel rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm font-semibold">Upcoming (60 days)</span>
          </div>
          {visibleUpcoming.length === 0 ? (
            <p className="text-xs text-muted-foreground">No upcoming milestones.</p>
          ) : (
            <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
              {visibleUpcoming.map((m: any) => {
                const proj = m.projects;
                const dateObj = new Date(m.date + 'T12:00:00');
                const daysAway = Math.ceil((dateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={m.id} className="p-2.5 rounded-lg border border-border/30 bg-muted/10 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      <span className={`text-[10px] font-medium ${daysAway <= 7 ? 'text-red-400' : daysAway <= 14 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                        {daysAway === 0 ? 'Today' : `${daysAway}d`}
                      </span>
                    </div>
                    <p className="text-xs font-medium leading-snug line-clamp-1">{m.title}</p>
                    {proj && (
                      <Link to={`/dashboard/projects/${proj.id}`} className="text-[10px] text-primary hover:underline block truncate">
                        {proj.name}
                      </Link>
                    )}
                    {m.milestone_type && <Badge variant="outline" className="text-[9px]">{m.milestone_type}</Badge>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
