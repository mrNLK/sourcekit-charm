import { useState } from "react";
import BottomTabs from "@/components/BottomTabs";
import SearchTab from "@/components/SearchTab";
import PipelineTab from "@/components/PipelineTab";
import SettingsTab from "@/components/SettingsTab";

export default function Index() {
  const [activeTab, setActiveTab] = useState<"search" | "pipeline" | "settings">("search");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md px-4 py-3">
        <h1 className="text-lg font-bold tracking-tight text-foreground">
          Source<span className="text-primary">Kit</span>
        </h1>
      </header>

      <main className="px-4 py-4 pb-24 max-w-lg mx-auto">
        {activeTab === "search" && <SearchTab />}
        {activeTab === "pipeline" && <PipelineTab />}
        {activeTab === "settings" && <SettingsTab />}
      </main>

      <BottomTabs activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
