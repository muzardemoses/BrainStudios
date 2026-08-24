import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { useCreateProduction } from "@workspace/api-client-react";
import { useActiveProduction } from "@/components/layout/ProductionContext";
import { Loader2, Film, Wand2, Target, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListProductionsQueryKey } from "@workspace/api-client-react";

interface IntakeForm {
  title: string;
  originalIdea: string;
  genre: string;
  tone: string;
  visualStyle: string;
  targetRuntime: number;
  audience: string;
}

export default function NewProduction() {
  const [, setLocation] = useLocation();
  const { setActiveProductionId } = useActiveProduction();
  const queryClient = useQueryClient();
  
  const createProduction = useCreateProduction({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListProductionsQueryKey() });
        setActiveProductionId(data.id);
        setLocation("/");
      }
    }
  });

  const { register, handleSubmit, formState: { errors } } = useForm<IntakeForm>({
    defaultValues: {
      title: "",
      originalIdea: "",
      genre: "Sci-Fi",
      tone: "Dark & Gritty",
      visualStyle: "Cyberpunk neon, high contrast",
      targetRuntime: 120,
      audience: "Adults 18-35",
    }
  });

  const onSubmit = (data: IntakeForm) => {
    createProduction.mutate({ data: {
      ...data,
      targetRuntime: Number(data.targetRuntime)
    } });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <h1 className="text-4xl font-display font-black tracking-tight mb-3 flex items-center gap-3">
          <Wand2 className="text-primary" />
          New Production Intake
        </h1>
        <p className="text-muted-foreground text-lg">
          Feed the AI studio your core vision. Our agents will flesh out the screenplay, cast, and storyboard.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 bg-card border border-border p-8 rounded-2xl shadow-xl">
        
        {/* Core Idea */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-wider mb-4 border-b border-border pb-2">
            <Film size={18} />
            Core Concept
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Working Title</label>
            <input 
              {...register("title", { required: "Title is required" })}
              className="w-full bg-input border border-border rounded-md px-4 py-3 text-foreground text-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-display font-bold"
              placeholder="e.g. Neon Horizon"
            />
            {errors.title && <span className="text-xs text-destructive">{errors.title.message}</span>}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">The Original Idea</label>
            <textarea 
              {...register("originalIdea", { required: "Idea is required" })}
              className="w-full bg-input border border-border rounded-md px-4 py-3 text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all min-h-[120px]"
              placeholder="A detective in 2140 discovers that memory implants are being used to alter history..."
            />
            {errors.originalIdea && <span className="text-xs text-destructive">{errors.originalIdea.message}</span>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Aesthetic */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-wider mb-4 border-b border-border pb-2">
              <Target size={18} />
              Aesthetic & Tone
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Genre</label>
              <input 
                {...register("genre")}
                className="w-full bg-input border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Tone</label>
              <input 
                {...register("tone")}
                className="w-full bg-input border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Visual Style</label>
              <input 
                {...register("visualStyle")}
                className="w-full bg-input border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:border-primary transition-all"
                placeholder="e.g. 16mm film, high contrast, muted colors"
              />
            </div>
          </div>

          {/* Logistics */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-wider mb-4 border-b border-border pb-2">
              <Users size={18} />
              Logistics
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Target Runtime (minutes)</label>
              <input 
                type="number"
                {...register("targetRuntime", { min: 1 })}
                className="w-full bg-input border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Target Audience</label>
              <input 
                {...register("audience")}
                className="w-full bg-input border border-border rounded-md px-4 py-2 text-foreground focus:outline-none focus:border-primary transition-all"
              />
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-border flex justify-end">
          <button 
            type="submit"
            disabled={createProduction.isPending}
            className="flex items-center gap-2 bg-primary text-primary-foreground font-bold px-8 py-3 rounded-md hover:bg-primary/90 transition-all shadow-lg hover:shadow-primary/30 disabled:opacity-50"
          >
            {createProduction.isPending && <Loader2 className="animate-spin" size={18} />}
            CREATE PRODUCTION
          </button>
        </div>
      </form>
    </div>
  );
}
