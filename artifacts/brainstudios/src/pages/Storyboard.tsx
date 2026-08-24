import { useActiveProduction } from "@/components/layout/ProductionContext";
import { 
  useListStoryboardFrames, 
  useRegenerateStoryboardFrame, 
  useApproveStoryboardFrame, 
  useToggleStoryboardLock,
  getListStoryboardFramesQueryKey
} from "@workspace/api-client-react";
import { Loader2, AlertCircle, MonitorPlay, RefreshCw, CheckCircle2, Lock, Unlock, Image as ImageIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function StoryboardPage() {
  const { activeProductionId } = useActiveProduction();

  const { data: frames, isLoading, error } = useListStoryboardFrames(activeProductionId || 0, {
    query: {
      enabled: !!activeProductionId,
      queryKey: getListStoryboardFramesQueryKey(activeProductionId || 0)
    }
  });

  if (!activeProductionId) return <div className="p-8 text-center text-muted-foreground">Please select a production.</div>;
  if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  if (error || !frames) return <div className="p-8 text-destructive flex gap-2"><AlertCircle /> Error loading storyboard.</div>;

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300">
      <div className="shrink-0 p-6 border-b border-border bg-card flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-display font-black tracking-tight flex items-center gap-2">
            <MonitorPlay className="text-primary" /> Storyboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Shot-by-shot visual breakdown. Approve frames to lock visual continuity.</p>
        </div>
        <div className="flex gap-4 text-sm font-bold">
          <div className="bg-secondary px-3 py-1 rounded-full border border-border text-muted-foreground">
            {frames.length} SHOTS
          </div>
          <div className="bg-primary/20 px-3 py-1 rounded-full border border-primary text-primary">
            {frames.filter(f => f.status === 'Approved').length} APPROVED
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="flex flex-col gap-12 max-w-5xl mx-auto">
          {frames.map((frame) => (
            <StoryboardFrame key={frame.id} frame={frame} productionId={activeProductionId} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StoryboardFrame({ frame, productionId }: { frame: any, productionId: number }) {
  const queryClient = useQueryClient();
  
  const regenerate = useRegenerateStoryboardFrame({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListStoryboardFramesQueryKey(productionId) }) }
  });
  
  const approve = useApproveStoryboardFrame({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListStoryboardFramesQueryKey(productionId) }) }
  });
  
  const toggleLock = useToggleStoryboardLock({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListStoryboardFramesQueryKey(productionId) }) }
  });

  const isApproved = frame.status === 'Approved';

  return (
    <div className={`flex flex-col md:flex-row gap-6 bg-card border rounded-2xl overflow-hidden transition-all duration-300 ${isApproved ? 'border-primary shadow-[0_0_15px_rgba(255,158,0,0.15)]' : 'border-border'}`}>
      
      {/* Image Side */}
      <div className="w-full md:w-[60%] shrink-0 relative bg-secondary aspect-video flex flex-col items-center justify-center">
        {frame.imageUrl ? (
          <img src={frame.imageUrl} alt={frame.shotNumber} className="w-full h-full object-cover" />
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-2">
            <ImageIcon size={32} className="opacity-50" />
            <span className="font-display font-bold text-sm tracking-widest uppercase">Generating Visual...</span>
          </div>
        )}
        
        {/* Overlays */}
        <div className="absolute top-4 left-4 bg-background/80 backdrop-blur border border-border px-3 py-1 rounded text-xs font-mono font-bold text-foreground">
          SHOT {frame.shotNumber}
        </div>

        {isApproved && (
          <div className="absolute top-4 right-4 bg-primary text-primary-foreground px-3 py-1 rounded font-bold text-xs flex items-center gap-1">
            <CheckCircle2 size={14} /> APPROVED
          </div>
        )}
      </div>

      {/* Details Side */}
      <div className="flex-1 p-6 flex flex-col">
        <div className="space-y-4 flex-1">
          <div>
            <div className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Action</div>
            <p className="text-sm text-foreground leading-relaxed">{frame.description}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Framing</div>
              <p className="text-xs font-mono text-foreground bg-secondary/50 p-2 rounded">{frame.framing}</p>
            </div>
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Camera</div>
              <p className="text-xs font-mono text-foreground bg-secondary/50 p-2 rounded">{frame.cameraMovement}</p>
            </div>
          </div>

          {frame.dialogue && (
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Dialogue Segment</div>
              <p className="text-sm font-serif italic text-muted-foreground border-l-2 border-border pl-3 py-1">"{frame.dialogue}"</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="pt-6 mt-6 border-t border-border/50 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => regenerate.mutate({ id: productionId, frameId: frame.id })}
              disabled={regenerate.isPending || frame.locked}
              className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/80 rounded transition-all disabled:opacity-50"
            >
              <RefreshCw size={14} className={regenerate.isPending ? "animate-spin" : ""} />
              REROLL VISUAL
            </button>
            <button
              onClick={() => toggleLock.mutate({ id: productionId, frameId: frame.id, data: { locked: !frame.locked } })}
              disabled={toggleLock.isPending}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-bold rounded transition-all disabled:opacity-50 ${
                frame.locked 
                  ? "text-primary bg-primary/10 border border-primary/30" 
                  : "text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/80 border border-transparent"
              }`}
            >
              {frame.locked ? <Lock size={14} /> : <Unlock size={14} />}
              {frame.locked ? "LOCKED" : "LOCK"}
            </button>
          </div>

          <button
            onClick={() => approve.mutate({ id: productionId, frameId: frame.id })}
            disabled={approve.isPending || isApproved}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded transition-all disabled:opacity-50 ${
              isApproved 
                ? "bg-primary/20 text-primary border border-primary cursor-default" 
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            <CheckCircle2 size={14} />
            {isApproved ? "APPROVED" : "APPROVE SHOT"}
          </button>
        </div>
      </div>
    </div>
  );
}
