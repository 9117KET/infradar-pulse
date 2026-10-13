import { Badge } from '@/components/ui/badge';
import { TabsContent } from '@/components/ui/tabs';
import { History } from 'lucide-react';
import type { VerificationEntry } from './types';


export function VerificationTab({ verificationLog }: { verificationLog: VerificationEntry[] }) {
  return (
        <TabsContent value="verification">
          <div className="glass-panel rounded-xl p-5">
            <h3 className="font-serif text-lg font-semibold mb-3 flex items-center gap-2"><History className="h-4 w-4" />Verification History</h3>
            <div className="space-y-3">
              {verificationLog.length === 0 && <p className="text-sm text-muted-foreground">No verification changes recorded yet.</p>}
              {verificationLog.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                  <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${entry.action === 'verified' ? 'bg-emerald-500' : 'bg-destructive'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] ${entry.action === 'verified' ? 'text-emerald-500 border-emerald-500/30' : 'text-destructive border-destructive/30'}`}>
                        {entry.action === 'verified' ? 'Verified' : 'Unverified'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleDateString()} {new Date(entry.created_at).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{entry.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
  );
}
