import { useActiveProduction } from "@/components/layout/ProductionContext";
import { useGetProductionOverview, useStartProduction, getGetProductionOverviewQueryKey, getListProductionActivityQueryKey } from "@workspace/api-client-react";
import { Film, Clapperboard, MonitorPlay, Users, Sparkles, AlertCircle, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Home() {
  const { activeProductionId } = useActiveProduction();
  const queryClient = useQueryClient();
  
  const { data: overview, isLoading, error } = useGetProductionOverview(activeProductionId || 0, {
    query: {
      enabled: !!activeProductionId,
      queryKey: getGetProductionOverviewQueryKey(activeProductionId || 0)
    }
  });

  const startProduction = useStartProduction({
    mutation: {
      onSuccess: () => {
        if (activeProductionId) {
          queryClient.invalidateQueries({ queryKey: getGetProductionOverviewQueryKey(activeProductionId) });
          queryClient.invalidateQueries({ queryKey: getListProductionActivityQueryKey(activeProductionId) });
        }
      }
    }
  });

  if (!activeProductionId) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center text-muted-foreground p-8">
        <Clapperboard size={64} className="mb-4 opacity-20" />
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">No Production Selected</h2>
        <p>Select a production from the top bar or create a new one to begin.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center text-destructive p-8">
        <AlertCircle size={48} className="mb-4" />
        <h2 className="text-xl font-bold mb-2">Error Loading Production</h2>
        <p className="text-muted-foreground">Unable to fetch production details.</p>
      </div>
    );
  }

  const { production } = overview;
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Hero Header */}
      <div className="relative rounded-2xl overflow-hidden bg-card border border-border shadow-2xl p-8 flex flex-col justify-end min-h-[300px]">
        {production.keyVisual && (
          <div 
            className="absolute inset-0 z-0 opacity-40 mix-blend-overlay bg-cover bg-center"
            style={{ backgroundImage: `url(${production.keyVisual})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-transparent z-0" />
        
        <div className="relative z-10 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="px-3 py-1 bg-primary/20 text-primary border border-primary/30 rounded-full text-xs font-bold uppercase tracking-wider">
                {production.genre}
              </span>
              <span className="px-3 py-1 bg-secondary text-secondary-foreground border border-border rounded-full text-xs font-bold uppercase tracking-wider">
                {production.tone}
              </span>
            </div>
            <h1 className="text-5xl font-display font-black tracking-tight mb-2 text-foreground drop-shadow-lg">
              {production.title}
            </h1>
            <p className="text-lg text-muted-foreground max-w-3xl leading-relaxed">
              {production.originalIdea}
            </p>
          </div>
          
          <div className="shrink-0 flex flex-col items-end">
            {['intake', 'draft'].includes(production.status.toLowerCase()) ? (
              <button 
                onClick={() => startProduction.mutate({ id: production.id })}
                disabled={startProduction.isPending}
                className="flex items-center gap-2 bg-primary text-primary-foreground font-bold px-6 py-3 rounded-lg hover:bg-primary/90 transition-all shadow-[0_0_20px_rgba(255,158,0,0.3)] hover:shadow-[0_0_30px_rgba(255,158,0,0.6)] disabled:opacity-50"
              >
                {startProduction.isPending ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                COMMENCE PRODUCTION
              </button>
            ) : (
              <div className="text-right">
                <div className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Status</div>
                <div className="text-xl font-display font-bold text-primary flex items-center gap-2 justify-end">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  {production.status}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          icon={<BookText size={24} className="text-chart-1" />}
          label="Screenplay"
          value={`${Math.round(overview.screenplayCompletion * 100)}%`}
          subtext={`${overview.scenesGenerated} scenes generated`}
        />
        <MetricCard 
          icon={<Users size={24} className="text-chart-2" />}
          label="Cast Board"
          value={overview.charactersGenerated.toString()}
          subtext="Characters profiled"
        />
        <MetricCard 
          icon={<MonitorPlay size={24} className="text-chart-3" />}
          label="Storyboard"
          value={`${Math.round(overview.storyboardProgress * 100)}%`}
          subtext="Frames generated"
        />
        <MetricCard 
          icon={<Clapperboard size={24} className="text-chart-4" />}
          label="Est. Budget"
          value={formatCurrency(overview.estimatedBudget)}
          subtext={`${overview.shootingDays} shooting days`}
        />
      </div>

      {/* Latest Activity Summary */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-display font-bold mb-4 flex items-center gap-2">
          <Activity size={20} className="text-primary" />
          Latest Studio Activity
        </h3>
        {overview.latestActivity ? (
          <div className="p-4 bg-secondary/50 rounded-lg border border-border/50 text-muted-foreground font-mono text-sm">
            {overview.latestActivity}
          </div>
        ) : (
          <div className="p-4 bg-secondary/50 rounded-lg border border-border/50 text-muted-foreground italic text-sm">
            No activity recorded yet.
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, subtext }: { icon: React.ReactNode, label: string, value: string, subtext: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 hover-elevate transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="p-3 bg-secondary rounded-lg border border-border/50">
          {icon}
        </div>
      </div>
      <div>
        <div className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
        <div className="text-3xl font-display font-black text-foreground mb-1">{value}</div>
        <div className="text-sm text-muted-foreground">{subtext}</div>
      </div>
    </div>
  );
}

import { BookText, Activity } from "lucide-react";
