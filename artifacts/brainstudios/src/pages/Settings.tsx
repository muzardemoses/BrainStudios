import { useActiveProduction } from "@/components/layout/ProductionContext";
import { useGetProduction, useUpdateProduction, getGetProductionQueryKey } from "@workspace/api-client-react";
import { Loader2, AlertCircle, Settings as SettingsIcon, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useEffect } from "react";

export default function SettingsPage() {
  const { activeProductionId } = useActiveProduction();
  const queryClient = useQueryClient();

  const { data: production, isLoading, error } = useGetProduction(activeProductionId || 0, {
    query: {
      enabled: !!activeProductionId,
      queryKey: getGetProductionQueryKey(activeProductionId || 0)
    }
  });

  const updateProduction = useUpdateProduction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProductionQueryKey(activeProductionId || 0) });
      }
    }
  });

  const { register, handleSubmit, reset, formState: { isDirty } } = useForm();

  useEffect(() => {
    if (production) {
      reset({
        title: production.title,
        genre: production.genre,
        tone: production.tone,
        visualStyle: production.visualStyle,
        targetRuntime: production.targetRuntime,
        audience: production.audience,
        status: production.status,
      });
    }
  }, [production, reset]);

  if (!activeProductionId) return <div className="p-8 text-center text-muted-foreground">Please select a production.</div>;
  if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  if (error || !production) return <div className="p-8 text-destructive flex gap-2"><AlertCircle /> Error loading settings.</div>;

  const onSubmit = (data: any) => {
    updateProduction.mutate({ 
      id: activeProductionId, 
      data: {
        ...data,
        targetRuntime: Number(data.targetRuntime)
      } 
    });
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300">
      <div className="shrink-0 p-6 border-b border-border bg-card">
        <h1 className="text-2xl font-display font-black tracking-tight flex items-center gap-2">
          <SettingsIcon className="text-primary" /> Production Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Configure high-level parameters for this production.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl mx-auto bg-card border border-border rounded-2xl p-8 shadow-xl space-y-8">
          
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-primary uppercase tracking-widest">Working Title</label>
              <input {...register("title")} className="w-full bg-input border border-border px-4 py-3 rounded-md focus:border-primary focus:outline-none font-display font-bold text-lg" />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-primary uppercase tracking-widest">Genre</label>
                <input {...register("genre")} className="w-full bg-input border border-border px-4 py-2 rounded-md focus:border-primary focus:outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-primary uppercase tracking-widest">Tone</label>
                <input {...register("tone")} className="w-full bg-input border border-border px-4 py-2 rounded-md focus:border-primary focus:outline-none" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-primary uppercase tracking-widest">Visual Style</label>
              <input {...register("visualStyle")} className="w-full bg-input border border-border px-4 py-2 rounded-md focus:border-primary focus:outline-none" />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-primary uppercase tracking-widest">Target Runtime (mins)</label>
                <input type="number" {...register("targetRuntime")} className="w-full bg-input border border-border px-4 py-2 rounded-md focus:border-primary focus:outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-primary uppercase tracking-widest">Target Audience</label>
                <input {...register("audience")} className="w-full bg-input border border-border px-4 py-2 rounded-md focus:border-primary focus:outline-none" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-primary uppercase tracking-widest">Production Status</label>
              <select {...register("status")} className="w-full bg-input border border-border px-4 py-2 rounded-md focus:border-primary focus:outline-none appearance-none">
                <option value="Intake">Intake</option>
                <option value="Pre-Production">Pre-Production</option>
                <option value="Production">Production</option>
                <option value="Post-Production">Post-Production</option>
                <option value="Archived">Archived</option>
              </select>
            </div>
          </div>

          <div className="pt-6 border-t border-border flex justify-end">
            <button
              type="submit"
              disabled={!isDirty || updateProduction.isPending}
              className="flex items-center gap-2 bg-primary text-primary-foreground font-bold px-6 py-2.5 rounded-md hover:bg-primary/90 transition-all shadow-lg hover:shadow-primary/30 disabled:opacity-50"
            >
              {updateProduction.isPending ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              SAVE CHANGES
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
