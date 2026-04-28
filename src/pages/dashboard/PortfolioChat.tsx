import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTrackedProjects } from '@/hooks/use-tracked-projects';
import { useProjects } from '@/hooks/use-projects';
import { useEntitlements } from '@/hooks/useEntitlements';
import { agentApi } from '@/lib/api/agents';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';
import { isEntitlementOrQuotaError } from '@/lib/billing/functionsErrors';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { MessageSquare, Send, Bot, User, Sparkles, Briefcase, AlertTriangle } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'What is my highest-risk project and why?',
  'Summarize my portfolio exposure by region and sector.',
  'Which projects need stakeholder follow-up?',
  'What are the top 3 next actions for this portfolio?',
  'Which projects have weak evidence or confidence signals?',
];

function extractFunctionError(err: unknown): string {
  const fallback = 'Portfolio chat failed. Please try again.';
  const error = err as { message?: string; context?: { status?: number; json?: () => Promise<unknown> } };
  const msg = error?.message || fallback;
  if (msg.includes('non-2xx status code')) return fallback;
  return msg;
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-primary/20' : 'bg-muted/40'}`}>
        {isUser ? <User className="h-3.5 w-3.5 text-primary" /> : <Bot className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      <div className={`max-w-[86%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${isUser ? 'bg-primary/10 text-foreground' : 'bg-muted/30 text-foreground'}`}>
        {isUser ? (
          <p>{msg.content}</p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-strong:text-foreground prose-table:text-xs prose-th:border-border prose-td:border-border">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        )}
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
      <div className="rounded-xl px-3.5 py-2.5 bg-muted/30 space-y-1.5 min-w-[160px]">
        <Skeleton className="h-2.5 w-36" />
        <Skeleton className="h-2.5 w-28" />
        <Skeleton className="h-2.5 w-32" />
      </div>
    </div>
  );
}

export default function PortfolioChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { canUseAi, loading: entitlementLoading, refresh: refreshEntitlements } = useEntitlements();
  const { trackedProjects, isLoading: trackedLoading } = useTrackedProjects();
  const { allProjects, loading: projectsLoading } = useProjects();

  const trackedIds = new Set(trackedProjects.map(t => t.project_id));
  const portfolioProjects = allProjects.filter(p => p.dbId && trackedIds.has(p.dbId));
  const isLoadingPortfolio = entitlementLoading || trackedLoading || projectsLoading;
  const hasTrackedButNotLoaded = trackedProjects.length > 0 && portfolioProjects.length === 0 && projectsLoading;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSubmitting]);

  const submit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting || isLoadingPortfolio) return;

    if (!canUseAi) {
      setUpgradeOpen(true);
      return;
    }

    const nextMessages: Message[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setIsSubmitting(true);

    try {
      const result = await agentApi.runPortfolioChat(nextMessages);
      const answer = typeof result?.answer === 'string' && result.answer.trim()
        ? result.answer
        : 'I could not generate a portfolio answer from the available data. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
      await refreshEntitlements();
    } catch (err: unknown) {
      if (isEntitlementOrQuotaError(err)) {
        setUpgradeOpen(true);
        setMessages(prev => prev.slice(0, -1));
        return;
      }
      const description = extractFunctionError(err);
      toast.error('Portfolio chat failed', { description });
      setMessages(prev => [...prev, { role: 'assistant', content: `I could not complete that analysis. ${description}` }]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = !isSubmitting && !isLoadingPortfolio && input.trim().length >= 3;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-h-[800px]">
      <div className="mb-4 shrink-0 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" /> Portfolio Chat
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ask intelligence questions about tracked projects, risk exposure, evidence gaps, and next actions.
            {!isLoadingPortfolio && portfolioProjects.length > 0 && (
              <span className="ml-1">{portfolioProjects.length} project{portfolioProjects.length !== 1 ? 's' : ''} in context.</span>
            )}
          </p>
        </div>
        {portfolioProjects.length > 0 && (
          <div className="hidden sm:flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <Briefcase className="h-3.5 w-3.5 text-primary" /> Live portfolio context
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto glass-panel rounded-xl p-4 space-y-4">
        {isLoadingPortfolio && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
            <Sparkles className="h-6 w-6 text-primary" />
            <div className="w-full max-w-sm space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5 mx-auto" />
              <Skeleton className="h-3 w-2/3 mx-auto" />
            </div>
          </div>
        )}

        {!isLoadingPortfolio && portfolioProjects.length === 0 && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-8 text-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Briefcase className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Track projects to unlock portfolio intelligence</p>
              <p className="text-xs text-muted-foreground max-w-md">
                Add projects to My Portfolio, then ask about risk concentration, stakeholder follow-up, evidence quality, and recommended actions.
              </p>
            </div>
          </div>
        )}

        {!isLoadingPortfolio && hasTrackedButNotLoaded && messages.length === 0 && (
          <div className="flex items-center justify-center h-full gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-primary" /> Loading tracked project details…
          </div>
        )}

        {!isLoadingPortfolio && portfolioProjects.length > 0 && messages.length === 0 && !isSubmitting && (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-8">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium mb-1">Ask anything about your portfolio</p>
              <p className="text-xs text-muted-foreground">
                I have context on {portfolioProjects.length} tracked project{portfolioProjects.length !== 1 ? 's' : ''}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-2xl">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => void submit(s)}
                  disabled={isSubmitting || !canUseAi}
                  className="text-xs px-3 py-1.5 rounded-full border border-border/50 bg-muted/20 hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => <MessageBubble key={`${msg.role}-${i}`} msg={msg} />)}
        {isSubmitting && <ThinkingBubble />}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 flex gap-2 shrink-0">
        <input
          className="flex-1 bg-muted/20 border border-border/40 rounded-xl px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-60"
          placeholder={portfolioProjects.length === 0 ? 'Track projects first...' : 'Ask about your portfolio...'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(input); }}}
          disabled={isSubmitting || isLoadingPortfolio || portfolioProjects.length === 0}
        />
        <button
          onClick={() => void submit(input)}
          disabled={!canSubmit || portfolioProjects.length === 0}
          className="h-10 w-10 flex items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          title="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </div>
  );
}
