import type { Project } from '@/data/projects';
import { TabsContent } from '@/components/ui/tabs';
import { Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';
import type { RiskHistoryPoint } from './types';


export function RiskHistoryTab({ project, riskHistory }: { project: Project; riskHistory: RiskHistoryPoint[] }) {
  return (
        <TabsContent value="risk-history">
          <div className="glass-panel rounded-xl p-5">
            <h3 className="font-serif text-lg font-semibold mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4" /> Risk Score History
            </h3>
            {riskHistory.length < 2 ? (
              <div className="text-center py-10">
                <Activity className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Not enough data yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Risk score changes are recorded automatically when the project is re-scored.</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
                  <span>Current: <strong className={`${project.riskScore >= 70 ? 'text-red-400' : project.riskScore >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>{project.riskScore}</strong></span>
                  <span>Changes recorded: <strong className="text-foreground">{riskHistory.length}</strong></span>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={riskHistory} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={30} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(210 12% 9%)', border: '1px solid hsl(210 10% 18%)', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => [v, 'Risk Score']}
                    />
                    <ReferenceLine y={70} stroke="hsl(0 72% 51% / 0.4)" strokeDasharray="4 2" label={{ value: 'High', fontSize: 10, fill: 'hsl(0 72% 51% / 0.6)' }} />
                    <ReferenceLine y={40} stroke="hsl(38 92% 50% / 0.4)" strokeDasharray="4 2" label={{ value: 'Med', fontSize: 10, fill: 'hsl(38 92% 50% / 0.6)' }} />
                    <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3, fill: 'hsl(var(--primary))' }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </TabsContent>
  );
}
