import { useState } from "react";
import { useActiveProduction } from "@/components/layout/ProductionContext";
import { 
  useGetProductionBudget, 
  useGetProductionSchedule, 
  useGetProductionRequirements,
  getGetProductionBudgetQueryKey,
  getGetProductionScheduleQueryKey,
  getGetProductionRequirementsQueryKey
} from "@workspace/api-client-react";
import { Loader2, AlertCircle, Clapperboard, DollarSign, Calendar, Package } from "lucide-react";

export default function ProductionPage() {
  const { activeProductionId } = useActiveProduction();
  const [activeTab, setActiveTab] = useState<'budget' | 'schedule' | 'requirements'>('budget');

  const { data: budget, isLoading: isBudgetLoading } = useGetProductionBudget(activeProductionId || 0, {
    query: { enabled: !!activeProductionId && activeTab === 'budget', queryKey: getGetProductionBudgetQueryKey(activeProductionId || 0) }
  });
  
  const { data: schedule, isLoading: isScheduleLoading } = useGetProductionSchedule(activeProductionId || 0, {
    query: { enabled: !!activeProductionId && activeTab === 'schedule', queryKey: getGetProductionScheduleQueryKey(activeProductionId || 0) }
  });
  
  const { data: requirements, isLoading: isReqLoading } = useGetProductionRequirements(activeProductionId || 0, {
    query: { enabled: !!activeProductionId && activeTab === 'requirements', queryKey: getGetProductionRequirementsQueryKey(activeProductionId || 0) }
  });

  if (!activeProductionId) return <div className="p-8 text-center text-muted-foreground">Please select a production.</div>;

  const tabs = [
    { id: 'budget', label: 'Budget Breakdown', icon: DollarSign },
    { id: 'schedule', label: 'Shooting Schedule', icon: Calendar },
    { id: 'requirements', label: 'Requirements', icon: Package },
  ] as const;

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300">
      <div className="shrink-0 p-6 border-b border-border bg-card">
        <h1 className="text-2xl font-display font-black tracking-tight flex items-center gap-2 mb-6">
          <Clapperboard className="text-primary" /> Production Logistics
        </h1>
        
        <div className="flex gap-2">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md font-bold text-sm transition-all ${
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(255,158,0,0.3)]" 
                    : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          {activeTab === 'budget' && (
            isBudgetLoading ? <LoadingState /> : 
            budget ? <BudgetView budget={budget} /> : <ErrorState />
          )}
          {activeTab === 'schedule' && (
            isScheduleLoading ? <LoadingState /> : 
            schedule ? <ScheduleView schedule={schedule} /> : <ErrorState />
          )}
          {activeTab === 'requirements' && (
            isReqLoading ? <LoadingState /> : 
            requirements ? <RequirementsView requirements={requirements} /> : <ErrorState />
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-primary" size={32} /></div>;
}

function ErrorState() {
  return <div className="p-12 text-destructive flex justify-center items-center gap-2"><AlertCircle /> Failed to load data.</div>;
}

function BudgetView({ budget }: { budget: any }) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: budget.currency || 'USD', maximumFractionDigits: 0 }).format(amount);
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-card border border-border p-6 rounded-2xl flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Estimated Total</div>
          <div className="text-5xl font-display font-black text-foreground">{formatCurrency(budget.total)}</div>
        </div>
        <div className="h-16 w-16 rounded-full border-4 border-primary/20 flex items-center justify-center">
          <DollarSign className="text-primary" size={32} />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-secondary/50 border-b border-border">
              <th className="p-4 text-xs font-bold text-primary uppercase tracking-widest">Category</th>
              <th className="p-4 text-xs font-bold text-primary uppercase tracking-widest w-32 text-right">Amount</th>
              <th className="p-4 text-xs font-bold text-primary uppercase tracking-widest w-24 text-right">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {budget.categories.map((line: any, idx: number) => (
              <tr key={idx} className="hover:bg-secondary/20 transition-colors">
                <td className="p-4 font-medium text-foreground">{line.category}</td>
                <td className="p-4 font-mono text-muted-foreground text-right">{formatCurrency(line.amount)}</td>
                <td className="p-4 font-mono font-bold text-primary text-right">{line.percentage}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScheduleView({ schedule }: { schedule: any[] }) {
  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
      {schedule.map((day, idx) => (
        <div key={idx} className="bg-card border border-border rounded-xl p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-primary" />
          
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-48 shrink-0">
              <div className="text-primary font-bold uppercase tracking-widest text-sm mb-1">DAY {day.day}</div>
              <div className="text-2xl font-display font-black text-foreground">{day.date}</div>
              <div className="text-muted-foreground text-sm mt-2 font-mono flex items-center gap-2">
                <Calendar size={14} /> {day.duration}
              </div>
            </div>
            
            <div className="flex-1 space-y-4">
              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Scene</div>
                <div className="font-medium text-lg">{day.scene}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Location</div>
                  <div className="text-sm font-mono bg-secondary/50 px-2 py-1 rounded inline-block">{day.location}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Time of Day</div>
                  <div className="text-sm font-mono bg-secondary/50 px-2 py-1 rounded inline-block">{day.timeOfDay}</div>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Cast Required</div>
                <div className="text-sm text-foreground">{day.cast}</div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RequirementsView({ requirements }: { requirements: any }) {
  const sections = [
    { key: 'actors', label: 'Cast & Actors' },
    { key: 'extras', label: 'Extras' },
    { key: 'locations', label: 'Locations' },
    { key: 'props', label: 'Props' },
    { key: 'costumes', label: 'Costumes & Wardrobe' },
    { key: 'equipment', label: 'Special Equipment' },
    { key: 'specialEffects', label: 'VFX / SFX' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4 duration-300">
      {sections.map(({ key, label }) => {
        const items = requirements[key] || [];
        if (items.length === 0) return null;
        
        return (
          <div key={key} className="bg-card border border-border rounded-xl p-6 hover-elevate">
            <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2 text-primary">
              <Package size={18} />
              {label}
            </h3>
            <ul className="space-y-2">
              {items.map((item: string, idx: number) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/50 mt-1.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
