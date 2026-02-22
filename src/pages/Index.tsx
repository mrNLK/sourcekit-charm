import { useState } from "react";
import DashboardLayout, { type DashboardTab } from "@/components/DashboardLayout";
import SearchTab from "@/components/SearchTab";
import PipelineTab from "@/components/PipelineTab";
import SettingsTab from "@/components/SettingsTab";
import HistoryTab from "@/components/HistoryTab";
import WatchlistTab from "@/components/WatchlistTab";

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
  const [activeTab, setActiveTab] = useState<DashboardTab>("search");

  // Lifted state for SearchTab persistence across tab switches
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [researchData, setResearchData] = useState<ResearchData | null>(null);
  const [researchRaw, setResearchRaw] = useState<any>(null);
  const [activeSearchQuery, setActiveSearchQuery] = useState("");

  return (
    <DashboardLayout activeTab={activeTab} onTabChange={setActiveTab}>
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
      {activeTab === "history" && <HistoryTab />}
      {activeTab === "pipeline" && <PipelineTab />}
      {activeTab === "watchlist" && <WatchlistTab />}
      {activeTab === "settings" && <SettingsTab />}
    </DashboardLayout>
  );
}
