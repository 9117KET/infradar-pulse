import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AgentMonitoring from './AgentMonitoring';
import AgentHealth from './AgentHealth';

/**
 * Single staff-facing surface for agents.
 * Merges the former /dashboard/agents (operations) and /dashboard/agent-health
 * (health metrics) pages into one page with two tabs.
 */
export default function AgentsHub() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'health' ? 'health' : 'operations';

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => {
        const next = new URLSearchParams(params);
        if (v === 'health') next.set('tab', 'health');
        else next.delete('tab');
        setParams(next, { replace: true });
      }}
      className="space-y-4"
    >
      <TabsList className="bg-muted/60">
        <TabsTrigger value="operations">Operations</TabsTrigger>
        <TabsTrigger value="health">Health</TabsTrigger>
      </TabsList>

      <TabsContent value="operations">
        <AgentMonitoring />
      </TabsContent>
      <TabsContent value="health">
        <AgentHealth />
      </TabsContent>
    </Tabs>
  );
}
