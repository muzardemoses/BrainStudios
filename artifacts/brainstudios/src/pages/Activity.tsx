import { useActiveProduction } from "@/components/layout/ProductionContext";
import { useListProductionActivity, useSendDirectorMessage, getListProductionActivityQueryKey } from "@workspace/api-client-react";
import { Loader2, AlertCircle, Activity, MessageSquare, Send, CheckCircle2, Clock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useEffect, useRef } from "react";

export default function ActivityPage() {
  const { activeProductionId } = useActiveProduction();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: activities, isLoading, error } = useListProductionActivity(
    activeProductionId || 0,
    { limit: 50 },
    {
      query: {
        enabled: !!activeProductionId,
        queryKey: getListProductionActivityQueryKey(activeProductionId || 0, { limit: 50 }),
        refetchInterval: 5000 // Poll every 5s for demo
      }
    }
  );

  const sendMessage = useSendDirectorMessage({
    mutation: {
      onSuccess: () => {
        reset({ message: "" });
        queryClient.invalidateQueries({ queryKey: getListProductionActivityQueryKey(activeProductionId || 0, { limit: 50 }) });
      }
    }
  });

  const { register, handleSubmit, reset } = useForm({ defaultValues: { message: "" } });

  // Auto-scroll to bottom when new activities arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activities]);

  if (!activeProductionId) return <div className="p-8 text-center text-muted-foreground">Please select a production.</div>;
  if (isLoading && !activities) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  if (error) return <div className="p-8 text-destructive flex gap-2"><AlertCircle /> Error loading activity feed.</div>;

  const onSubmit = (data: { message: string }) => {
    if (!data.message.trim()) return;
    sendMessage.mutate({ id: activeProductionId, data: { message: data.message } });
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300">
      <div className="shrink-0 p-6 border-b border-border bg-card flex justify-between items-center z-10">
        <div>
          <h1 className="text-2xl font-display font-black tracking-tight flex items-center gap-2">
            <Activity className="text-primary" /> Live Workstream
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor the AI studio agents. Give high-level direction.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20 uppercase tracking-widest">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          Agents Active
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-3xl mx-auto space-y-6">
          {activities?.length === 0 ? (
            <div className="text-center text-muted-foreground py-12 italic">Studio is idle.</div>
          ) : (
            activities?.map((event) => (
              <ActivityEvent key={event.id} event={event} />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 p-6 bg-card border-t border-border z-10">
        <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl mx-auto relative">
          <div className="absolute top-1/2 -translate-y-1/2 left-4 text-primary">
            <MessageSquare size={20} />
          </div>
          <input
            {...register("message")}
            placeholder="Give the Director's note... (e.g. 'Make the tone much darker', 'Change the setting to Tokyo')"
            className="w-full bg-input border border-border rounded-full pl-12 pr-24 py-4 text-foreground font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-lg"
            autoComplete="off"
            disabled={sendMessage.isPending}
          />
          <button
            type="submit"
            disabled={sendMessage.isPending}
            className="absolute top-1/2 -translate-y-1/2 right-2 bg-primary text-primary-foreground p-2 rounded-full hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {sendMessage.isPending ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
          </button>
        </form>
      </div>
    </div>
  );
}

function ActivityEvent({ event }: { event: any }) {
  const state = String(event.status).toLowerCase();
  const isComplete = state === 'completed';
  const isFailed = state === 'failed' || state === 'error';
  const isPending = state === 'running' || state === 'queued' || state === 'waiting';

  return (
    <div className={`flex gap-4 p-5 rounded-xl border ${isComplete ? 'bg-secondary/30 border-border/50' : isFailed ? 'bg-destructive/10 border-destructive/30' : 'bg-card border-primary/30 shadow-[0_0_15px_rgba(255,158,0,0.1)]'}`}>
      <div className="shrink-0 mt-1">
        {isComplete ? (
          <CheckCircle2 className="text-muted-foreground" size={20} />
        ) : isFailed ? (
          <AlertCircle className="text-destructive" size={20} />
        ) : (
          <Loader2 className="text-primary animate-spin" size={20} />
        )}
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-bold text-primary uppercase tracking-widest bg-primary/10 px-2 py-0.5 rounded">
            {event.agentType} AGENT
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
            <Clock size={12} /> {new Date(event.createdAt).toLocaleTimeString()}
          </div>
        </div>
        <div className={`font-medium ${isComplete ? 'text-foreground' : 'text-primary'}`}>
          {event.label}
        </div>
        {event.detail && (
          <div className="text-sm text-muted-foreground font-mono bg-background/50 p-3 rounded-md border border-border/50">
            {event.detail}
          </div>
        )}
        
        {isPending && event.progress > 0 && (
          <div className="w-full bg-secondary rounded-full h-1.5 mt-4 overflow-hidden">
            <div 
              className="bg-primary h-1.5 rounded-full transition-all duration-500 ease-out" 
              style={{ width: `${event.progress}%` }} 
            />
          </div>
        )}
      </div>
    </div>
  );
}
