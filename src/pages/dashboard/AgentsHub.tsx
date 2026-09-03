import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AgentMonitoring from './AgentMonitoring';
import AgentHealth from './AgentHealth';
import BackfillProgress from './BackfillProgress';

/** Single staff-facing surface for agent operations, health, and backfill progress. */
export default function AgentsHub() {
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab');
  const tab = requestedTab === 'health' || requestedTab === 'backfill' ? requestedTab : 'operations';

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        const next = new URLSearchParams(params);
        if (value === 'operations') next.delete('tab');
        else next.set('tab', value);
        setParams(next, { replace: true });
      }}
      className="space-y-4"
    >
      <TabsList className="bg-muted/60">
        <TabsTrigger value="operations">Operations</TabsTrigger>
        <TabsTrigger value="health">Health</TabsTrigger>
        <TabsTrigger value="backfill">Backfill</TabsTrigger>
      </TabsList>

      <TabsContent value="operations" className="space-y-4">
        <ContactCoveragePanel />
        <AgentMonitoring />
      </TabsContent>
      <TabsContent value="health"><AgentHealth /></TabsContent>
      <TabsContent value="backfill"><BackfillProgress /></TabsContent>
    </Tabs>
  );
}
