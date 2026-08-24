import { useState, useEffect } from "react";
import { useActiveProduction } from "@/components/layout/ProductionContext";
import { useGetProductionStory, useUpdateScene, useRegenerateScene, getGetProductionStoryQueryKey } from "@workspace/api-client-react";
import { Loader2, AlertCircle, BookText, Clapperboard, Save, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

export default function StoryPage() {
  const { activeProductionId } = useActiveProduction();
  
  const { data: story, isLoading, error } = useGetProductionStory(activeProductionId || 0, {
    query: {
      enabled: !!activeProductionId,
      queryKey: getGetProductionStoryQueryKey(activeProductionId || 0)
    }
  });

  const [activeSceneId, setActiveSceneId] = useState<number | null>(null);

  if (!activeProductionId) {
    return <div className="p-8 text-center text-muted-foreground">Please select a production.</div>;
  }
  if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  if (error || !story) return <div className="p-8 text-destructive flex gap-2"><AlertCircle /> Error loading story.</div>;

  const activeScene = activeSceneId ? story.scenes.find(s => s.id === activeSceneId) : null;

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300">
      {/* Header */}
      <div className="shrink-0 p-6 border-b border-border bg-card">
        <h1 className="text-2xl font-display font-black tracking-tight mb-2 flex items-center gap-2">
          <BookText className="text-primary" /> Screenplay
        </h1>
        <p className="text-muted-foreground font-mono text-sm max-w-4xl">{story.logline}</p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Acts & Scenes */}
        <div className="w-80 shrink-0 border-r border-border bg-background overflow-y-auto p-4 space-y-6">
          {story.acts.map(act => (
            <div key={act.id} className="space-y-2">
              <div className="text-xs font-bold text-primary uppercase tracking-widest px-2">{act.title}</div>
              <div className="space-y-1">
                {story.scenes.filter(s => s.actId === act.id).map(scene => (
                  <button
                    key={scene.id}
                    onClick={() => setActiveSceneId(scene.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm font-mono transition-all ${
                      activeSceneId === scene.id 
                        ? "bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20" 
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Clapperboard size={14} className={activeSceneId === scene.id ? "opacity-100" : "opacity-50"} />
                      <span className="truncate">{scene.heading}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Right Pane: Editor */}
        <div className="flex-1 bg-secondary/20 overflow-y-auto relative p-8">
          {activeScene ? (
            <SceneEditor scene={activeScene} productionId={activeProductionId} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <BookText size={48} className="mb-4 opacity-20" />
              <p>Select a scene from the left to view and edit.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SceneEditor({ scene, productionId }: { scene: any, productionId: number }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, formState: { isDirty } } = useForm({
    defaultValues: {
      heading: scene.heading,
      description: scene.description,
      dialogue: scene.dialogue,
      location: scene.location,
      time: scene.time
    }
  });

  // Reset form when scene changes
  useEffect(() => {
    reset({
      heading: scene.heading,
      description: scene.description,
      dialogue: scene.dialogue,
      location: scene.location,
      time: scene.time
    });
  }, [scene, reset]);

  const updateScene = useUpdateScene({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProductionStoryQueryKey(productionId) });
      }
    }
  });

  const regenerateScene = useRegenerateScene({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProductionStoryQueryKey(productionId) });
      }
    }
  });

  const onSubmit = (data: any) => {
    updateScene.mutate({ id: productionId, sceneId: scene.id, data });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl mx-auto space-y-6 bg-card border border-border p-8 rounded-xl shadow-lg">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-border">
        <div className="font-mono text-sm text-muted-foreground flex items-center gap-2">
          <span className="px-2 py-1 bg-secondary rounded text-foreground">SCENE {scene.sceneNumber}</span>
          <span className="uppercase">{scene.status}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => regenerateScene.mutate({ id: productionId, sceneId: scene.id })}
            disabled={regenerateScene.isPending}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground border border-border rounded hover:bg-secondary transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} className={regenerateScene.isPending ? "animate-spin" : ""} />
            AI REWRITE
          </button>
          <button
            type="submit"
            disabled={!isDirty || updateScene.isPending}
            className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            <Save size={14} />
            SAVE CHANGES
          </button>
        </div>
      </div>

      <div className="space-y-8 font-mono">
        <div className="flex gap-4">
          <div className="flex-1 space-y-2">
            <label className="text-xs font-sans font-bold text-primary uppercase tracking-widest">Heading</label>
            <input 
              {...register("heading")} 
              className="w-full bg-input border border-border px-3 py-2 rounded focus:outline-none focus:border-primary text-sm uppercase font-bold" 
            />
          </div>
          <div className="w-1/4 space-y-2">
            <label className="text-xs font-sans font-bold text-primary uppercase tracking-widest">Time</label>
            <input 
              {...register("time")} 
              className="w-full bg-input border border-border px-3 py-2 rounded focus:outline-none focus:border-primary text-sm uppercase" 
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-sans font-bold text-primary uppercase tracking-widest">Action / Description</label>
          <textarea 
            {...register("description")} 
            className="w-full bg-input border border-border px-3 py-3 rounded focus:outline-none focus:border-primary text-sm min-h-[150px] leading-relaxed" 
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-sans font-bold text-primary uppercase tracking-widest">Dialogue</label>
          <textarea 
            {...register("dialogue")} 
            className="w-full bg-input border border-border px-3 py-3 rounded focus:outline-none focus:border-primary text-sm min-h-[250px] leading-relaxed whitespace-pre-wrap" 
          />
        </div>
      </div>
    </form>
  );
}
