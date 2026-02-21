import { Search, Users, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomTabsProps {
  activeTab: "search" | "pipeline" | "settings";
  onTabChange: (tab: "search" | "pipeline" | "settings") => void;
}

const tabs = [
  { id: "search" as const, label: "Search", icon: Search },
  { id: "pipeline" as const, label: "Pipeline", icon: Users },
  { id: "settings" as const, label: "Settings", icon: Settings },
];

export default function BottomTabs({ activeTab, onTabChange }: BottomTabsProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md safe-area-bottom">
      <div className="mx-auto flex max-w-lg">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors",
              activeTab === tab.id
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-5 w-5" />
            <span className="font-medium">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
