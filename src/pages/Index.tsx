import { useState } from "react";
import BottomTabs from "@/components/BottomTabs";
import SearchTab from "@/components/SearchTab";
import PipelineTab from "@/components/PipelineTab";
import SettingsTab from "@/components/SettingsTab";

interface SearchResult {
  id: string;
  name: string;
  url: string;
  description: string;
  source: string;
  company: string;
  role: string;
  location: string;
  headline: string;
  signals: string[];
  enrichmentData?: any;
  autoEnriched?: boolean;
  pictureUrl?: string;
  duplicate?: boolean;
}

interface ResearchData {
  target_companies?: { name: string; rationale: string }[];
  eea_signals?: string[];
  search_criteria?: { keywords: string[]; skills: string[]; filters: string[] };
  raw?: string;
}

export default function Index() {
  const [activeTab, setActiveTab] = useState<"search" | "pipeline" | "settings">("search");

  // Lifted state for SearchTab persistence across tab switches
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [researchData, setResearchData] = useState<ResearchData | null>(null);
  const [researchRaw, setResearchRaw] = useState<any>(null);
  const [activeSearchQuery, setActiveSearchQuery] = useState("");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md px-4 py-3">
        <h1 className="text-lg font-bold tracking-tight text-foreground">
          Source<span className="text-primary">Kit</span>
        </h1>
      </header>

      <main className="px-4 py-4 pb-24 max-w-lg mx-auto">
        {activeTab === "search" && (
          <SearchTab
            persistedSearchResults={searchResults}
            onSearchResultsChange={setSearchResults}
            persistedResearchData={researchData}
            onResearchDataChange={setResearchData}
            persistedResearchRaw={researchRaw}
            onResearchRawChange={setResearchRaw}
            persistedSearchQuery={activeSearchQuery}
            onSearchQueryChange={setActiveSearchQuery}
          />
        )}
        {activeTab === "pipeline" && <PipelineTab />}
        {activeTab === "settings" && <SettingsTab />}
      </main>

      <BottomTabs activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
