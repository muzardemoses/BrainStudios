import { useListProductions } from "@workspace/api-client-react";
import { useActiveProduction } from "./ProductionContext";
import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown, Plus, LayoutDashboard } from "lucide-react";

export function Topbar() {
  const { data: productions, isLoading } = useListProductions();
  const { activeProductionId, setActiveProductionId } = useActiveProduction();
  const [, setLocation] = useLocation();

  // Auto-select first production if none selected
  useEffect(() => {
    if (productions && productions.length > 0 && !activeProductionId) {
      setActiveProductionId(productions[0].id);
    }
  }, [productions, activeProductionId, setActiveProductionId]);

  const activeProduction = productions?.find(p => p.id === activeProductionId);

  return (
    <header className="h-16 border-b border-border bg-background/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-10 sticky top-0">
      <div className="flex items-center gap-4">
        {isLoading ? (
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        ) : (
          <div className="relative group">
            <select
              className="appearance-none bg-secondary/50 border border-border text-foreground font-display font-semibold text-lg py-1.5 pl-4 pr-10 rounded-md outline-none cursor-pointer hover:bg-secondary transition-colors"
              value={activeProductionId || ""}
              onChange={(e) => {
                if (e.target.value === "NEW") {
                  setLocation("/new");
                } else {
                  setActiveProductionId(Number(e.target.value));
                }
              }}
            >
              {productions?.map((p) => (
                <option key={p.id} value={p.id} className="bg-card text-foreground">
                  {p.title}
                </option>
              ))}
              <option value="NEW" className="bg-card text-primary font-bold">
                + New Production
              </option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" size={16} />
          </div>
        )}
        
        {activeProduction && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold tracking-wide uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {activeProduction.status}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Link 
          href="/new"
          className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-semibold text-sm transition-all shadow-[0_0_15px_rgba(255,158,0,0.3)] hover:shadow-[0_0_20px_rgba(255,158,0,0.5)]"
        >
          <Plus size={16} />
          INTAKE
        </Link>
      </div>
    </header>
  );
}
