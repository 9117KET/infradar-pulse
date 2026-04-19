import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTrackedProjects } from '@/hooks/use-tracked-projects';
import { useProjects } from '@/hooks/use-projects';
import { useEntitlements } from '@/hooks/useEntitlements';
import { agentApi } from '@/lib/api/agents';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';
import { isEntitlementOrQuotaError } from '@/lib/billing/functionsErrors';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare, Send, Bot, User, Sparkles } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  taskId?: string;
}

const SUGGESTIONS = [
  "What's my highest-risk project?",
  'Which of my projects are in MENA?',
  'Summarize recent changes in my portfolio.',
  'Which projects are in the Construction stage?',
  'Which sectors am I most exposed to?',
];

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-primary/20' : 'bg-muted/40'}`}>
        {isUser ? <User className="h-3.5 w-3.5 text-primary" /> : <Bot className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      <div className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${isUser ? 'bg-primary/10 text-foreground' : 'bg-muted/30 text-foreground'}`}>
        {msg.content.split('\n').map((line, i) => (
          <span key={i}>{line}{i < msg.content.split('\n').length - 1 && <br />}</span>
        ))}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex gap-3">
      <div className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 bg-muted/40">
        <Bot className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="rounded-xl px-3.5 py-2.5 bg-muted/30 space-y-1.5 min-w-[120px]">
        <Skeleton className="h-2.5 w-32" />
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="h-2.5 w-20" />
      </div>
    </div>
  );
}

export default function PortfolioChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { canUseAi } = useEntitlements();
  const { trackedProjects } = useTrackedProjects();
  const { allProjects } = useProjects();
  const qc = useQueryClient();

  const portfolioProjects = allProjects.filter(p => p.dbId && trackedProjects.some(t => t.project_id === p.dbId));

  // Poll active task
  const { data: activeTask } = useQuery({
    queryKey: ['portfolio-chat-task', activeTaskId],
    queryFn: async () => {
      if (!activeTaskId) return null;
      const { data } = await supabase
        .from('research_tasks')
        .select('*')
        .eq('id', activeTaskId)
        .single();
      return data;
    },
    enabled: !!activeTaskId,
    refetchInterval: (data: any) => {
      const task = data?.state?.data ?? data;
      if (!task) return 2000;
      if (task?.status === 'completed' || task?.status === 'failed') return false;
      return 2000;
    },
  });

  // When task finishes, extract answer and add to messages
  useEffect(() => {
    if (!activeTask) return;
    const status = (activeTask as any).status;
    if (status !== 'completed' && status !== 'failed') return;

    let content = '';
    if (status === 'completed') {
      const result = (activeTask as any).result;
      if (result?.summary) content = result.summary;
      else if (result?.answer) content = result.answer;
      else if (typeof result === 'string') content = result;
      else content = 'Analysis complete. No summary returned.';
    } else {
      content = 'Sorry, the analysis failed. Please try again.';
    }

    setMessages(prev => [...prev, { role: 'assistant', content }]);
    setActiveTaskId(null);
    qc.removeQueries({ queryKey: ['portfolio-chat-task', activeTaskId] });
  }, [(activeTask as any)?.status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTaskId]);

  const buildContext = (userQuery: string) => {
    if (portfolioProjects.length === 0) return userQuery;
    const summary = portfolioProjects.map(p =>
      `${p.name} (${p.country}, ${p.sector}, ${p.stage}, risk=${p.riskScore}, value=${p.value ? `$${(p.value / 1e6).toFixed(0)}M` : 'unknown'})`
    ).join('; ');
    return `[User portfolio: ${summary}]\n\nQuestion: ${userQuery}`;
  };

  const submit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting || activeTaskId) return;

    if (!canUseAi) {
      setUpgradeOpen(true);
      return;
    }

    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    setIsSubmitting(true);

    try {
      const contextualQuery = buildContext(trimmed);
      const result = await agentApi.runUserResearch(contextualQuery);
      if (result?.task_id) {
        setActiveTaskId(result.task_id);
      } else if (result?.summary || result?.answer) {
        setMessages(prev => [...prev, { role: 'assistant', content: result.summary ?? result.answer }]);
      }
    } catch (err: any) {
      if (isEntitlementOrQuotaError(err)) {
        setUpgradeOpen(true);
        setMessages(prev => prev.slice(0, -1)); // remove user msg
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }]);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isThinking = isSubmitting || !!activeTaskId;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-h-[800px]">
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" /> Portfolio Chat
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ask natural language questions about your tracked projects.
          {portfolioProjects.length > 0 && (
            <span className="ml-1">{portfolioProjects.length} project{portfolioProjects.length !== 1 ? 's' : ''} in context.</span>
          )}
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto glass-panel rounded-xl p-4 space-y-4">
        {messages.length === 0 && !isThinking && (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-8">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium mb-1">Ask anything about your portfolio</p>
              <p className="text-xs text-muted-foreground">
                {portfolioProjects.length === 0
                  ? 'Track some projects first to give me context.'
                  : `I have context on ${portfolioProjects.length} project${portfolioProjects.length !== 1 ? 's' : ''} in your portfolio.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  disabled={isThinking || !canUseAi}
                  className="text-xs px-3 py-1.5 rounded-full border border-border/50 bg-muted/20 hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
        {isThinking && <ThinkingBubble />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-2 shrink-0">
        <input
          className="flex-1 bg-muted/20 border border-border/40 rounded-xl px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
          placeholder="Ask about your portfolio..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(input); }}}
          disabled={isThinking}
        />
        <button
          onClick={() => void submit(input)}
          disabled={isThinking || !input.trim()}
          className="h-10 w-10 flex items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </div>
  );
}
