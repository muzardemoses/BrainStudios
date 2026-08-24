import { Link, useLocation } from "wouter";
import { 
  Film, 
  BookText, 
  Users, 
  MonitorPlay, 
  Clapperboard, 
  Activity, 
  Settings 
} from "lucide-react";

export function Sidebar() {
  const [location] = useLocation();

  const links = [
    { href: "/", label: "Dashboard", icon: Film },
    { href: "/story", label: "Screenplay", icon: BookText },
    { href: "/characters", label: "Cast Board", icon: Users },
    { href: "/storyboard", label: "Storyboard", icon: MonitorPlay },
    { href: "/production", label: "Production", icon: Clapperboard },
    { href: "/activity", label: "Live Activity", icon: Activity },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside className="w-64 border-r border-border bg-card/50 backdrop-blur-xl flex flex-col h-full shrink-0">
      <div className="h-16 flex items-center px-6 border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-primary font-display font-bold tracking-tight text-xl uppercase">
          <div className="w-6 h-6 rounded-sm bg-primary flex items-center justify-center text-primary-foreground">
            <Film size={14} className="stroke-[3]" />
          </div>
          BRAINSTUDIOS
        </div>
      </div>
      
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        <div className="text-xs font-semibold text-muted-foreground mb-4 mt-2 px-2 uppercase tracking-widest font-display">
          Workspace
        </div>
        {links.map((link) => {
          const isActive = location === link.href;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 hover-elevate ${
                isActive 
                  ? "bg-primary/10 text-primary" 
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <Icon size={18} className={isActive ? "text-primary" : "text-muted-foreground"} />
              {link.label}
              {isActive && (
                <div className="ml-auto w-1 h-4 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border shrink-0">
        <Link 
          href="/sign-in" 
          className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center border border-border">
            <span className="text-xs font-bold text-foreground">DIR</span>
          </div>
          Director Profile
        </Link>
      </div>
    </aside>
  );
}
