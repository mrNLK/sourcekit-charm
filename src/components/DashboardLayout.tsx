import { useState, useEffect } from "react";
import { Search, Clock, Kanban, Bookmark, Settings, LogOut, Zap, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

export type DashboardTab = "search" | "history" | "pipeline" | "watchlist" | "settings";

interface DashboardLayoutProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  children: React.ReactNode;
}

const navItems = [
  { id: "search" as const, label: "New Search", icon: Search },
  { id: "history" as const, label: "History", icon: Clock },
  { id: "pipeline" as const, label: "Pipeline", icon: Kanban },
  { id: "watchlist" as const, label: "Watchlist", icon: Bookmark },
  { id: "settings" as const, label: "Settings", icon: Settings },
];

export default function DashboardLayout({ activeTab, onTabChange, children }: DashboardLayoutProps) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on tab change
  useEffect(() => {
    setMobileOpen(false);
  }, [activeTab]);

  // Close on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5 border-b border-sidebar-border">
        <Zap className="h-5 w-5 text-primary" />
        <span className="text-lg font-bold tracking-tight text-foreground">
          Source<span className="text-primary">Kit</span>
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              activeTab === item.id
                ? "bg-primary/10 text-primary"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Divider + bottom section */}
      <div className="border-t border-sidebar-border px-3 py-4 space-y-2">
        {user?.email && (
          <p className="px-3 text-xs text-muted-foreground truncate">
            {user.email}
          </p>
        )}
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      {!isMobile && (
        <aside className="w-64 shrink-0 bg-card border-r border-border fixed inset-y-0 left-0 z-30">
          {sidebarContent}
        </aside>
      )}

      {/* Mobile hamburger button */}
      {isMobile && (
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed top-3 left-3 z-50 p-2 rounded-lg bg-card border border-border text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/* Mobile sidebar overlay */}
      {isMobile && mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border animate-slide-up">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Main content */}
      <main className={cn(
        "flex-1 min-h-screen",
        !isMobile && "ml-64"
      )}>
        <div className="p-6 max-w-5xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
