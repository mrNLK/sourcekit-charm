import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Sparkles,
  Search,
  Save,
  Check,
  FlaskConical,
  Building2,
  FileText,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Bookmark,
  ExternalLink,
  LayoutList,
  LayoutGrid,
  RefreshCw,
  Trash2,
  Clock,
  Play,
  AlertTriangle,
  Clipboard,
  Copy,
  X,
  Plus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import CandidateCard from "./CandidateCard";

type Mode = "research" | "search" | "enrich";
type ResearchInput = "quick" | "full";
type SearchStatus = "idle" | "creating" | "polling" | "done" | "error";
type ViewMode = "expanded" | "compact";

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

interface ResearchBasis {
  url?: string;
  title?: string;
}

interface SearchTabProps {
  persistedSearchResults?: SearchResult[];
  onSearchResultsChange?: (results: SearchResult[]) => void;
  persistedResearchData?: ResearchData | null;
  onResearchDataChange?: (data: ResearchData | null) => void;
  persistedResearchRaw?: any;
  onResearchRawChange?: (raw: any) => void;
  persistedSearchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
}

function parseResearchOutput(data: any): ResearchData & { basis?: ResearchBasis[] } {
  const output =
    data?.research_output ||
    data?.result_data?.output ||
    data?.output ||
    data?.result ||
    data?.data ||
    data?.response ||
    "";
  const text = typeof output === "string" ? output : JSON.stringify(output);
  const basis: ResearchBasis[] = Array.isArray(data?.basis)
    ? data.basis
    : Array.isArray(data?.result_data?.basis)
      ? data.result_data.basis
      : [];

  const companies: { name: string; rationale: string }[] = [];
  const eeaSignals: string[] = [];
  const keywords: string[] = [];

  const sections: { title: string; body: string }[] = [];
  const headerPattern = /(?:^|\n)(#{1,3}\s+.+|(?:\d+\)\s*.+))/g;
  let lastIdx = 0;
  let lastTitle = "";
  let match: RegExpExecArray | null;
  const headerMatches: { title: string; start: number; end: number }[] = [];

  while ((match = headerPattern.exec(text)) !== null) {
    headerMatches.push({ title: match[1].trim(), start: match.index, end: match.index + match[0].length });
  }

  for (let i = 0; i < headerMatches.length; i++) {
    if (i > 0) {
      sections.push({ title: lastTitle, body: text.slice(lastIdx, headerMatches[i].start).trim() });
    }
    lastTitle = headerMatches[i].title.replace(/^#{1,3}\s+/, "").replace(/^\d+\)\s*/, "");
    lastIdx = headerMatches[i].end;
  }
  if (headerMatches.length > 0) {
    sections.push({ title: lastTitle, body: text.slice(lastIdx).trim() });
  }

  for (const section of sections) {
    const titleLower = section.title.toLowerCase();
    const lines = section.body.split(/\n/).filter((l: string) => l.trim().length > 3);

    if (titleLower.includes("compan") || titleLower.includes("target")) {
      for (const line of lines) {
        const m = line.match(/[-•*\d.]+\s*\*?\*?([^:*\n]+?)\*?\*?\s*[-:–]\s*(.+)/);
        if (m) {
          companies.push({ name: m[1].trim(), rationale: m[2].trim() });
        } else {
          const bold = line.match(/\*\*([^*]+)\*\*[:\s-]*(.+)?/);
          if (bold) {
            companies.push({ name: bold[1].trim(), rationale: (bold[2] || "").trim() });
          }
        }
      }
    } else if (
      titleLower.includes("eea") ||
      titleLower.includes("evidence") ||
      titleLower.includes("exceptional") ||
      titleLower.includes("signal")
    ) {
      for (const line of lines) {
        const cleaned = line
          .replace(/^[-•*\d.]+\s*/, "")
          .replace(/\*\*/g, "")
          .trim();
        if (cleaned.length > 3) eeaSignals.push(cleaned);
      }
    } else if (
      titleLower.includes("search") ||
      titleLower.includes("keyword") ||
      titleLower.includes("criteria") ||
      titleLower.includes("skill")
    ) {
      for (const line of lines) {
        const cleaned = line
          .replace(/^[-•*\d.]+\s*/, "")
          .replace(/\*\*/g, "")
          .trim();
        if (cleaned.length > 2) keywords.push(cleaned);
      }
    }
  }

  return {
    target_companies: companies.length > 0 ? companies : undefined,
    eea_signals: eeaSignals.length > 0 ? eeaSignals : undefined,
    search_criteria: keywords.length > 0 ? { keywords, skills: [], filters: [] } : undefined,
    raw: text,
    basis: basis.length > 0 ? basis : undefined,
  };
}

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

function nameHash(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function avatarHue(name: string): number {
  return nameHash(name) % 360;
}

function detectSource(url: string, description?: string): string {
  if (url.includes("linkedin.com")) return "linkedin";
  if (!url && description && /linkedin\.com|LinkedIn/i.test(description)) return "linkedin";
  if (url.includes("github.com")) return "github";
  if (url.includes("twitter.com") || url.includes("x.com")) return "X";
  return "web";
}

function getSourceLabel(source: string): string {
  switch (source) {
    case "linkedin":
      return "LinkedIn";
    case "github":
      return "GitHub";
    case "X":
      return "X";
    default:
      return "Web";
  }
}

function getSourceBadgeStyle(source: string): string {
  switch (source) {
    case "linkedin":
      return "bg-[hsl(201,100%,35%)]/20 text-[hsl(201,100%,55%)]";
    case "github":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function extractNameFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("linkedin.com")) {
      const match = u.pathname.match(/\/in\/([^/]+)/);
      if (match) {
        const slug = match[1].replace(/-\w{4,}$/, "");
        return slug
          .split("-")
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
      }
    }
    if (u.hostname.includes("github.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 1) return parts[0];
    }
  } catch {}
  return null;
}

function parseNameFromDescription(desc: string): string {
  if (!desc) return "";
  const isMatch = desc.match(/^([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+is\s+/);
  if (isMatch) return isMatch[1].trim();
  const commaAMatch = desc.match(/^([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?),\s+(?:a|an)\s+/);
  if (commaAMatch) return commaAMatch[1].trim();
  const dashMatch = desc.match(/^([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*[-–|]\s+/);
  if (dashMatch) return dashMatch[1].trim();
  const worksMatch = desc.match(
    /^([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:works|currently|has been|joined|leads|manages|specializes)/,
  );
  if (worksMatch) return worksMatch[1].trim();
  const commaMatch = desc.match(/^([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*,/);
  if (commaMatch) return commaMatch[1].trim();
  const snippet = desc.substring(0, 200);
  const titleContextMatch = snippet.match(
    /([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:is|was|serves as|holds|has)\s+(?:a|an|the)\s+(?:Senior|Staff|Principal|Lead|Head|Chief|Director|VP|Manager|Engineer|Scientist|Researcher)/,
  );
  if (titleContextMatch) return titleContextMatch[1].trim();
  const firstLine = desc.split("\n")[0].trim();
  if (firstLine.length < 60 && /^[A-Z]/.test(firstLine)) {
    const cleaned = firstLine.replace(/[-|:;].*$/, "").trim();
    const words = cleaned.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Z]/.test(w))) {
      return cleaned;
    }
  }
  return "";
}

function parseMetadata(description: string): { title: string; company: string; location: string; headline: string } {
  let title = "";
  let company = "";
  let location = "";
  let headline = "";
  if (!description) return { title, company, location, headline };
  const isAtMatch = description.match(/is\s+(?:a |an )?(.+?)\s+at\s+([^.,:;]+)/i);
  if (isAtMatch) {
    title = isAtMatch[1].trim();
    company = isAtMatch[2].trim();
  }
  if (!title) {
    const atMatch = description.match(/^([^.,:]+?)\s+at\s+([^.,:]+)/i);
    if (atMatch) {
      title = atMatch[1].trim();
      company = atMatch[2].trim();
    }
  }
  if (!title) {
    const commaMatch = description.match(/^([^.]+?),\s+([^.]+)/);
    if (commaMatch && commaMatch[1].length < 60) {
      title = commaMatch[1].trim();
      company = commaMatch[2].trim();
    }
  }
  if (!title) {
    const dashMatch = description.match(/^([^-]+?)\s+-\s+(.+)/);
    if (dashMatch && dashMatch[1].length < 40) {
      company = dashMatch[1].trim();
      title = dashMatch[2].trim();
    }
  }
  const locMatch = description.match(/(?:based in|located in|from)\s+([^.,:;]+)/i);
  if (locMatch) location = locMatch[1].trim();
  const firstLine = description.split(/[.\n]/)[0]?.trim() || "";
  headline = firstLine.length > 120 ? firstLine.substring(0, 120) + "..." : firstLine;
  return { title, company, location, headline };
}

const SIGNAL_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bPhD\b/i, label: "PhD" },
  { pattern: /\bM\.?S\.?\b/i, label: "MS" },
  { pattern: /\bMBA\b/i, label: "MBA" },
  { pattern: /\bMIT\b/, label: "MIT" },
  { pattern: /\bStanford\b/i, label: "Stanford" },
  { pattern: /\bCMU\b|Carnegie Mellon/i, label: "CMU" },
  { pattern: /\bHarvard\b/i, label: "Harvard" },
  { pattern: /\bBerkeley\b/i, label: "Berkeley" },
  { pattern: /\bOxford\b/i, label: "Oxford" },
  { pattern: /\bCambridge\b/i, label: "Cambridge" },
  { pattern: /\bGoogle\b/, label: "Ex-Google" },
  { pattern: /\bMeta\b|\bFacebook\b/, label: "Ex-Meta" },
  { pattern: /\bOpenAI\b/, label: "OpenAI" },
  { pattern: /\bDeepMind\b/, label: "DeepMind" },
  { pattern: /\bApple\b/, label: "Apple" },
  { pattern: /\bAmazon\b/, label: "Amazon" },
  { pattern: /\bMicrosoft\b/, label: "Microsoft" },
  { pattern: /\bNvidia\b/i, label: "NVIDIA" },
  { pattern: /\bmaintainer\b/i, label: "Maintainer" },
  { pattern: /\bcontributor\b/i, label: "Contributor" },
  { pattern: /(\d+)\+?\s*stars/i, label: "GitHub Stars" },
  { pattern: /\bNeurIPS\b/i, label: "NeurIPS" },
  { pattern: /\bICML\b/, label: "ICML" },
  { pattern: /\bfirst[- ]author\b/i, label: "First Author" },
  { pattern: /\bpublication/i, label: "Published" },
  { pattern: /\bY Combinator\b|\bYC\b/, label: "YC" },
  { pattern: /\bfounder\b/i, label: "Founder" },
];

function extractSignals(text: string): string[] {
  const found = new Set<string>();
  for (const { pattern, label } of SIGNAL_PATTERNS) {
    if (pattern.test(text)) found.add(label);
  }
  return Array.from(found).slice(0, 6);
}

function sortResults(results: SearchResult[]): SearchResult[] {
  const order: Record<string, number> = { linkedin: 0, github: 1, X: 2, web: 3 };
  return [...results].sort((a, b) => (order[a.source] ?? 3) - (order[b.source] ?? 3));
}

export default function SearchTab({
  persistedSearchResults,
  onSearchResultsChange,
  persistedResearchData,
  onResearchDataChange,
  persistedResearchRaw,
  onResearchRawChange,
  persistedSearchQuery,
  onSearchQueryChange,
}: SearchTabProps) {
  const [mode, setMode] = useState<Mode>("research");

  // Enrich state
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Search state - restore from persisted props
  const [searchRole, setSearchRole] = useState("");
  const [searchCompany, setSearchCompany] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [searchSkills, setSearchSkills] = useState("");
  const [searchStatus, setSearchStatus] = useState<SearchStatus>(
    persistedSearchResults && persistedSearchResults.length > 0 ? "done" : "idle",
  );
  const [searchResults, setSearchResultsLocal] = useState<SearchResult[]>(persistedSearchResults || []);
  const [websetId, setWebsetId] = useState<string | null>(null);
  const [enrichingIdx, setEnrichingIdx] = useState<number | null>(null);
  const [enrichedResult, setEnrichedResult] = useState<any>(null);
  const [enrichedIdx, setEnrichedIdx] = useState<number | null>(null);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [savedIdxs, setSavedIdxs] = useState<Set<number>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("expanded");
  const [searchCount, setSearchCount] = useState<number>(20);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartRef = useRef<number>(0);

  // Re-enrich confirmation
  const [reEnrichConfirm, setReEnrichConfirm] = useState<number | null>(null);

  // Batch enrich state
  const [batchEnriching, setBatchEnriching] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchSkipped, setBatchSkipped] = useState(0);
  const batchCancelRef = useRef(false);

  // Research state - restore from persisted props
  const [researchInput, setResearchInput] = useState<ResearchInput>("quick");
  const [resJobTitle, setResJobTitle] = useState("");
  const [resCompanyName, setResCompanyName] = useState("");
  const [resJobSpec, setResJobSpec] = useState("");
  const [researching, setResearching] = useState(false);
  const [researchData, setResearchDataLocal] = useState<ResearchData | null>(persistedResearchData || null);
  const [researchRaw, setResearchRawLocal] = useState<any>(persistedResearchRaw || null);
  const [savingResearch, setSavingResearch] = useState(false);
  const [researchSaved, setResearchSaved] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["companies", "eea", "criteria"]));

  // Suggested searches from research
  const [suggestedSearches, setSuggestedSearches] = useState<string[]>([]);

  // Search history state
  const [searchHistory, setSearchHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // Settings defaults
  const [settingsRole, setSettingsRole] = useState("");
  const [settingsCompany, setSettingsCompany] = useState("");

  // Duplicate detection state
  const [duplicateModal, setDuplicateModal] = useState<{
    existing: any;
    newCandidate: SearchResult;
    newIdx: number;
  } | null>(null);

  // Copied LinkedIn URL state
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const { toast } = useToast();
  const { user } = useAuth();

  // Wrapper to sync local and parent state for search results
  const setSearchResults = useCallback(
    (updater: SearchResult[] | ((prev: SearchResult[]) => SearchResult[])) => {
      setSearchResultsLocal((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        onSearchResultsChange?.(next);
        return next;
      });
    },
    [onSearchResultsChange],
  );

  const setResearchData = useCallback(
    (data: ResearchData | null) => {
      setResearchDataLocal(data);
      onResearchDataChange?.(data);
    },
    [onResearchDataChange],
  );

  const setResearchRaw = useCallback(
    (raw: any) => {
      setResearchRawLocal(raw);
      onResearchRawChange?.(raw);
    },
    [onResearchRawChange],
  );

  // Restore search query from persisted
  useEffect(() => {
    if (persistedSearchQuery) {
      setSearchRole(persistedSearchQuery);
    }
  }, []);

  // Cleanup polling on unmount + load search history + load settings
  useEffect(() => {
    loadSearchHistory();
    loadSettings();
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const loadSettings = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("settings")
      .select("key, value")
      .eq("user_id", user.id)
      .in("key", ["target_role", "target_company"]);
    if (data) {
      for (const s of data as any[]) {
        if (s.key === "target_role" && s.value) setSettingsRole(s.value);
        if (s.key === "target_company" && s.value) setSettingsCompany(s.value);
      }
    }
  };

  const loadSearchHistory = async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from("search_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setSearchHistory((data as any[]) || []);
    setLoadingHistory(false);
  };

  const saveSearchHistory = async (params: any, resultCount: number, actionType: string = "search", metadata?: any) => {
    if (!user) return;
    await supabase.from("search_history").insert({
      query_params: params,
      result_count: resultCount,
      created_by: user.id,
      action_type: actionType,
      metadata: metadata || params,
    } as any);
    loadSearchHistory();
  };

  const deleteSearchHistory = async (id: string) => {
    setDeletingHistoryId(id);
    await supabase.from("search_history").delete().eq("id", id);
    setSearchHistory((prev) => prev.filter((h) => h.id !== id));
    setDeletingHistoryId(null);
  };

  const rerunSearch = (params: any) => {
    setSearchRole(params.role || "");
    setSearchCompany(params.company || "");
    setSearchLocation(params.location || "");
    setSearchSkills(params.skills || "");
    setMode("search");
    setTimeout(() => {
      const form = document.getElementById("search-form") as HTMLFormElement;
      if (form) form.requestSubmit();
    }, 100);
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const handleCopyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  // ---- Enrich mode ----
  const handleEnrich = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !company.trim()) return;
    setLoading(true);
    setResult(null);
    setSaved(false);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-candidate", {
        body: {
          name: name.trim(),
          title: role.trim(),
          company: company.trim(),
          linkedin_url: handle.trim(),
          description: "",
        },
      });
      if (error) throw error;
      setResult(data);
    } catch (err: any) {
      toast({
        title: "Enrichment failed",
        description: err.message || "Could not reach the enrichment API.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !result) return;
    setSaving(true);
    const { error } = await supabase.from("candidates").insert({
      name: name.trim(),
      company: company.trim(),
      role: role.trim() || null,
      enrichment_data: result,
      created_by: user.id,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      setSaved(true);
      toast({ title: "Candidate saved to pipeline" });
    }
  };

  // ---- Search mode (Websets) ----
  const pollWebset = useCallback(
    async (wsId: string) => {
      const elapsed = Date.now() - pollStartRef.current;
      if (elapsed > 120000) {
        setSearchStatus("error");
        toast({
          title: "Search timed out",
          description: "The search took too long. Try a more specific query.",
          variant: "destructive",
        });
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke("search-candidates", {
          body: { action: "poll-webset", websetId: wsId },
        });

        if (error) throw error;

        const items = data?.items || [];
        const websetStatus = data?.websetStatus || "unknown";

        if (items.length > 0) {
          const results: SearchResult[] = items.map((item: any) => {
            const url = item.url || "";
            const desc = item.description || "";
            const person = item.person;
            const rawName = item.name || parseNameFromDescription(desc) || extractNameFromUrl(url) || "";
            const meta = parseMetadata(desc);
            const signals = extractSignals(desc);
            return {
              id: item.id || crypto.randomUUID(),
              name: rawName,
              url,
              description: desc,
              source: detectSource(url, desc),
              company: person?.company || meta.company,
              role: person?.position || meta.title,
              location: person?.location || meta.location,
              headline: meta.headline,
              signals,
              pictureUrl: item.pictureUrl || person?.pictureUrl || "",
              duplicate: item.duplicate || false,
            };
          });
          setSearchResults(sortResults(results));
          setSearchStatus("done");
          onSearchQueryChange?.(searchRole);
          saveSearchHistory(
            { role: searchRole, company: searchCompany, location: searchLocation, skills: searchSkills },
            results.length,
          );
          return;
        }

        if (websetStatus === "completed" || websetStatus === "idle") {
          setSearchResults([]);
          setSearchStatus("done");
          toast({ title: "No results", description: "No candidates found. Try different criteria." });
          return;
        }

        pollTimerRef.current = setTimeout(() => pollWebset(wsId), 5000);
      } catch (err: any) {
        console.error("Poll error:", err);
        // Check for auth errors
        if (err.message?.includes("JWT") || err.message?.includes("401") || err.message?.includes("token")) {
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            setSearchStatus("error");
            toast({ title: "Session expired", description: "Please sign in again.", variant: "destructive" });
            return;
          }
        }
        pollTimerRef.current = setTimeout(() => pollWebset(wsId), 5000);
      }
    },
    [toast, searchRole, searchCompany, searchLocation, searchSkills],
  );

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchRole.trim()) return;

    setSearchStatus("creating");
    setSearchResults([]);
    setEnrichedResult(null);
    setEnrichedIdx(null);
    setSourceFilter("all");
    setWebsetId(null);

    try {
      const { data, error } = await supabase.functions.invoke("search-candidates", {
        body: {
          action: "create-webset",
          role: searchRole.trim(),
          company: searchCompany.trim(),
          location: searchLocation.trim(),
          skills: searchSkills.trim(),
          count: searchCount,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const wsId = data?.websetId;
      if (!wsId) throw new Error("No webset ID returned");

      setWebsetId(wsId);
      setSearchStatus("polling");
      pollStartRef.current = Date.now();
      pollTimerRef.current = setTimeout(() => pollWebset(wsId), 3000);
    } catch (err: any) {
      setSearchStatus("error");
      toast({
        title: "Search failed",
        description: err.message || "Could not initiate search.",
        variant: "destructive",
      });
    }
  };

  const handleEnrichFromSearch = async (candidate: SearchResult, idx: number) => {
    // Check if already enriched and show confirmation
    if (candidate.enrichmentData && reEnrichConfirm !== idx) {
      setReEnrichConfirm(idx);
      return;
    }
    setReEnrichConfirm(null);

    setEnrichingIdx(idx);
    setEnrichedResult(null);
    setEnrichedIdx(null);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-candidate", {
        body: {
          name: candidate.name,
          title: candidate.role || "",
          company: candidate.company,
          linkedin_url: candidate.url?.includes("linkedin.com") ? candidate.url : "",
          description: candidate.description || "",
        },
      });
      if (error) throw error;
      setEnrichedResult(data);
      setEnrichedIdx(idx);
      // Update the search results with enrichment data
      setSearchResults((prev) =>
        prev.map((r, i) => (i === idx ? { ...r, enrichmentData: data, autoEnriched: false } : r)),
      );
    } catch (err: any) {
      toast({
        title: "Enrichment failed",
        description: err.message || "Could not enrich candidate.",
        variant: "destructive",
      });
    } finally {
      setEnrichingIdx(null);
    }
  };

  // ---- Batch enrich ----
  const handleBatchEnrich = async () => {
    const toProcess = searchResults.map((r, i) => ({ result: r, idx: i }));
    const unenriched = toProcess.filter(({ result }) => !result.enrichmentData);
    const alreadyEnriched = toProcess.length - unenriched.length;

    if (unenriched.length === 0) {
      toast({ title: "All candidates already enriched" });
      return;
    }

    setBatchEnriching(true);
    setBatchTotal(unenriched.length);
    setBatchProgress(0);
    setBatchSkipped(alreadyEnriched);
    batchCancelRef.current = false;

    for (const { result: candidate, idx } of unenriched) {
      if (batchCancelRef.current) break;
      setBatchProgress((p) => p + 1);
      try {
        const { data, error } = await supabase.functions.invoke("enrich-candidate", {
          body: {
            name: candidate.name,
            title: candidate.role || "",
            company: candidate.company,
            linkedin_url: candidate.url?.includes("linkedin.com") ? candidate.url : "",
            description: candidate.description || "",
          },
        });
        if (!error && data) {
          setSearchResults((prev) =>
            prev.map((r, i) => (i === idx ? { ...r, enrichmentData: data, autoEnriched: true } : r)),
          );
        }
      } catch (err: any) {
        console.error(`Batch enrich failed for ${candidate.name}:`, err);
        toast({
          title: `Enrich failed: ${candidate.name}`,
          description: err.message || "API error",
          variant: "destructive",
        });
      }
      if (!batchCancelRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    setBatchEnriching(false);
  };

  const handleStopBatchEnrich = () => {
    batchCancelRef.current = true;
  };

  const handleSaveFromSearch = async (candidate: SearchResult, idx: number, force = false) => {
    if (!user) return;

    if (!force) {
      const { data: existing } = await supabase
        .from("candidates")
        .select("id, name, company, stage, created_at")
        .ilike("name", candidate.name)
        .ilike("company", candidate.company || "")
        .limit(1);
      if (existing && existing.length > 0) {
        setDuplicateModal({ existing: existing[0], newCandidate: candidate, newIdx: idx });
        return;
      }
    }

    setSavingIdx(idx);
    const enrichData = enrichedIdx === idx ? enrichedResult : candidate.enrichmentData || null;
    const { error } = await supabase.from("candidates").insert({
      name: candidate.name,
      company: candidate.company || "",
      role: candidate.role || null,
      enrichment_data: enrichData,
      created_by: user.id,
      picture_url: candidate.pictureUrl || null,
    } as any);
    setSavingIdx(null);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      setSavedIdxs((prev) => new Set(prev).add(idx));
      toast({ title: "Candidate saved to pipeline" });
    }
  };

  // ---- Research mode (async start + client polling) ----
  const researchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const researchPollCountRef = useRef(0);
  const [researchRunId, setResearchRunId] = useState<string | null>(null);
  const [researchProgress, setResearchProgress] = useState("");

  useEffect(() => {
    return () => {
      if (researchPollRef.current) clearInterval(researchPollRef.current);
    };
  }, []);

  const pollResearch = useCallback(
    async (runId: string) => {
      try {
        const { data, error } = await supabase.functions.invoke("research-role", {
          body: { action: "poll", run_id: runId },
        });
        if (error) throw error;

        researchPollCountRef.current++;
        const count = researchPollCountRef.current;

        if (count < 6) setResearchProgress("Research started...");
        else if (count < 15) setResearchProgress("Analyzing role...");
        else if (count < 30) setResearchProgress("Mapping target companies...");
        else setResearchProgress("Deep research in progress...");

        if (data?.status === "completed") {
          if (researchPollRef.current) clearInterval(researchPollRef.current);
          researchPollRef.current = null;
          setResearching(false);
          setResearchRunId(null);
          setResearchProgress("");
          setResearchRaw(data);
          const parsed = parseResearchOutput(data);
          setResearchData(parsed);
          if (parsed.target_companies?.length) {
            const jobTitle = resJobTitle.trim() || "Engineer";
            const suggestions = parsed.target_companies.slice(0, 5).map((c) => `${jobTitle} at ${c.name}`);
            setSuggestedSearches(suggestions);
          }
          // Log research to search history
          const researchQuery = resJobTitle.trim()
            ? `${resJobTitle.trim()} at ${resCompanyName.trim()}`
            : "Job spec research";
          const rawSummary = parsed.raw ? parsed.raw.substring(0, 500) : "";
          saveSearchHistory({ role: resJobTitle.trim(), company: resCompanyName.trim() }, 0, "research", {
            role: resJobTitle.trim(),
            company: resCompanyName.trim(),
            summary: rawSummary,
          });
          return;
        }

        if (data?.status === "failed") {
          if (researchPollRef.current) clearInterval(researchPollRef.current);
          researchPollRef.current = null;
          setResearching(false);
          setResearchRunId(null);
          setResearchProgress("");
          toast({
            title: "Research failed",
            description: data.error || "The research task failed.",
            variant: "destructive",
          });
          return;
        }

        if (count >= 60) {
          if (researchPollRef.current) clearInterval(researchPollRef.current);
          researchPollRef.current = null;
          setResearching(false);
          setResearchProgress("");
          toast({
            title: "Research timed out",
            description: "The research took too long. Try again or use a simpler query.",
            variant: "destructive",
          });
        }
      } catch (err: any) {
        console.error("Research poll error:", err);
        if (err.message?.includes("JWT") || err.message?.includes("401")) {
          await supabase.auth.refreshSession();
        }
      }
    },
    [toast],
  );

  const handleResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = researchInput === "quick" ? resJobTitle.trim() : "";
    const companyVal = researchInput === "quick" ? resCompanyName.trim() : "";
    const specVal = researchInput === "full" ? resJobSpec.trim() : "";

    if (researchInput === "quick" && (!title || !companyVal)) return;
    if (researchInput === "full" && !specVal) return;

    setResearching(true);
    setResearchData(null);
    setResearchRaw(null);
    setResearchSaved(false);
    setResearchProgress("Starting research...");

    try {
      const { data, error } = await supabase.functions.invoke("research-role", {
        body: {
          action: "start",
          job_title: title || "Role from job spec",
          company_name: companyVal || "Company from job spec",
          job_spec: specVal,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const runId = data.taskId;
      if (!runId) throw new Error("No task ID returned");

      setResearchRunId(runId);
      researchPollCountRef.current = 0;
      researchPollRef.current = setInterval(() => pollResearch(runId), 5000);
    } catch (err: any) {
      setResearching(false);
      setResearchProgress("");
      toast({
        title: "Research failed",
        description: err.message || "Could not start research.",
        variant: "destructive",
      });
    }
  };

  const handleSaveResearch = async () => {
    if (!user || !researchRaw) return;
    setSavingResearch(true);
    const { error } = await supabase.from("role_research").insert({
      job_title: resJobTitle.trim() || "From job spec",
      company_name: resCompanyName.trim() || "From job spec",
      job_spec: resJobSpec.trim() || null,
      research_data: researchRaw,
      created_by: user.id,
    } as any);
    setSavingResearch(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      setResearchSaved(true);
      toast({ title: "Research saved" });
    }
  };

  const handleFindCandidates = () => {
    if (researchData?.search_criteria?.keywords) {
      setSearchSkills(researchData.search_criteria.keywords.slice(0, 5).join(", "));
    }
    if (researchData?.target_companies && researchData.target_companies.length > 0) {
      setSearchCompany(
        researchData.target_companies
          .slice(0, 3)
          .map((c) => c.name)
          .join(", "),
      );
    }
    setSearchRole(resJobTitle.trim() || "");
    setMode("search");
  };

  // Filtered results
  const filteredResults = searchResults.filter((r) => {
    if (sourceFilter === "all") return true;
    return r.source === sourceFilter;
  });

  const linkedInCount = searchResults.filter((r) => r.source === "linkedin").length;
  const githubCount = searchResults.filter((r) => r.source === "github").length;
  const webCount = searchResults.filter((r) => r.source !== "linkedin" && r.source !== "github").length;

  const isSearching = searchStatus === "creating" || searchStatus === "polling";

  const modeDescriptions: Record<Mode, string> = {
    research: "Deep-research a role to find target companies and search criteria",
    search: "Search for candidates by role and criteria",
    enrich: "Enrich candidate profiles from external data",
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Candidate Search</h1>
        <p className="text-sm text-muted-foreground">{modeDescriptions[mode]}</p>
      </div>

      {/* Mode Toggle */}
      <div className="flex rounded-lg border border-border bg-secondary p-1 gap-1">
        {[
          { key: "research" as Mode, icon: FlaskConical, label: "Research" },
          { key: "search" as Mode, icon: Search, label: "Search" },
          { key: "enrich" as Mode, icon: Sparkles, label: "Enrich" },
        ].map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium transition-colors ${
              mode === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ===== RESEARCH MODE ===== */}
      {mode === "research" && (
        <>
          {/* Input type toggle */}
          <div className="flex rounded-md border border-border bg-secondary/50 p-0.5 gap-0.5">
            <button
              onClick={() => setResearchInput("quick")}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                researchInput === "quick"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Building2 className="h-3 w-3" /> Quick
            </button>
            <button
              onClick={() => setResearchInput("full")}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                researchInput === "full"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="h-3 w-3" /> Full Spec
            </button>
          </div>

          <form onSubmit={handleResearch} className="glass-card p-5 space-y-4">
            {researchInput === "quick" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="resJobTitle" className="text-xs">
                    Job Title *
                    {!resJobTitle && settingsRole && <span className="text-primary/60 ml-1">(from Settings)</span>}
                  </Label>
                  <Input
                    id="resJobTitle"
                    value={resJobTitle}
                    onChange={(e) => setResJobTitle(e.target.value)}
                    placeholder={settingsRole || "ML Engineer"}
                    required
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="resCompanyName" className="text-xs">
                    Company *
                    {!resCompanyName && settingsCompany && (
                      <span className="text-primary/60 ml-1">(from Settings)</span>
                    )}
                  </Label>
                  <Input
                    id="resCompanyName"
                    value={resCompanyName}
                    onChange={(e) => setResCompanyName(e.target.value)}
                    placeholder={settingsCompany || "Anthropic"}
                    required
                    className="bg-secondary border-border"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="resJobSpec" className="text-xs">
                  Job Specification *
                </Label>
                <Textarea
                  id="resJobSpec"
                  value={resJobSpec}
                  onChange={(e) => setResJobSpec(e.target.value)}
                  placeholder="Paste the full job spec here..."
                  required
                  className="bg-secondary border-border min-h-[120px] text-xs"
                />
              </div>
            )}
            <Button type="submit" className="w-full glow-accent" size="lg" disabled={researching}>
              {researching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> {researchProgress || "Researching..."}
                </>
              ) : (
                <>
                  <FlaskConical className="h-4 w-4 mr-2" /> Research
                </>
              )}
            </Button>
          </form>

          {/* Research loading */}
          {researching && (
            <div className="glass-card p-8 flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">{researchProgress}</p>
              <p className="text-xs text-muted-foreground">This typically takes 2-4 minutes</p>
              <div className="w-full max-w-xs h-1 bg-secondary rounded-full overflow-hidden mt-2">
                <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: "60%" }} />
              </div>
            </div>
          )}

          {/* Research results */}
          {researchData && !researching && (
            <div className="space-y-3">
              {(() => {
                if (researchData.target_companies || researchData.eea_signals || researchData.search_criteria) {
                  return (
                    <>
                      {researchData.target_companies && researchData.target_companies.length > 0 && (
                        <div className="glass-card p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-primary" />
                            <span className="text-sm font-semibold text-foreground">
                              Target Companies ({researchData.target_companies.length})
                            </span>
                          </div>
                          <div className="space-y-2">
                            {researchData.target_companies.map((c, i) => (
                              <div key={i} className="rounded-lg bg-secondary/60 border border-border px-3 py-2">
                                <p className="text-sm font-semibold text-foreground">{c.name}</p>
                                {c.rationale && <p className="text-xs text-muted-foreground mt-0.5">{c.rationale}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {researchData.eea_signals && researchData.eea_signals.length > 0 && (
                        <div className="glass-card p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <span className="text-sm font-semibold text-foreground">EEA Signals</span>
                          </div>
                          <div className="space-y-1.5">
                            {researchData.eea_signals.map((signal, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                                <p className="text-sm text-secondary-foreground">{signal}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {researchData.search_criteria && researchData.search_criteria.keywords.length > 0 && (
                        <div className="glass-card p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <Search className="h-4 w-4 text-primary" />
                            <span className="text-sm font-semibold text-foreground">Search Criteria</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {researchData.search_criteria.keywords.map((kw, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 rounded-full bg-primary/20 text-primary px-3 py-1 text-xs font-medium"
                              >
                                {kw}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setResearchData((prev) => ({
                                      ...prev,
                                      search_criteria: {
                                        ...prev.search_criteria,
                                        keywords: prev.search_criteria.keywords.filter((_, idx) => idx !== i),
                                      },
                                    }))
                                  }
                                  className="ml-0.5 opacity-50 hover:opacity-100 hover:text-red-400 transition-all cursor-pointer"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                const v = prompt("Add search criterion:");
                                if (v && v.trim())
                                  setResearchData((prev) => ({
                                    ...prev,
                                    search_criteria: {
                                      ...prev.search_criteria,
                                      keywords: [...prev.search_criteria.keywords, v.trim()],
                                    },
                                  }));
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/40 text-primary/60 hover:text-primary hover:border-primary px-3 py-1 text-xs transition-colors cursor-pointer"
                            >
                              <Plus className="h-3 w-3" /> Add
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                }

                return (
                  <div className="glass-card p-5" style={{ minHeight: 400 }}>
                    <p className="text-xs text-muted-foreground mb-3">Research Output</p>
                    <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                      {researchData.raw?.split("\n").map((line, i) => {
                        const trimmed = line.trim();
                        if (!trimmed) return <br key={i} />;
                        if (trimmed.startsWith("### "))
                          return (
                            <p key={i} className="font-semibold text-foreground mt-4 mb-1">
                              {trimmed.replace(/^###\s+/, "")}
                            </p>
                          );
                        if (trimmed.startsWith("## "))
                          return (
                            <p key={i} className="font-bold text-foreground text-base mt-5 mb-1">
                              {trimmed.replace(/^##\s+/, "")}
                            </p>
                          );
                        if (trimmed.startsWith("# "))
                          return (
                            <p key={i} className="font-bold text-foreground text-lg mt-5 mb-2">
                              {trimmed.replace(/^#\s+/, "")}
                            </p>
                          );
                        if (trimmed.match(/^[-•*]\s/))
                          return (
                            <div key={i} className="flex items-start gap-2 ml-2 my-0.5">
                              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                              <span>{trimmed.replace(/^[-•*]\s+/, "").replace(/\*\*([^*]+)\*\*/g, "$1")}</span>
                            </div>
                          );
                        if (trimmed.match(/^\d+[.)]\s/))
                          return (
                            <div key={i} className="flex items-start gap-2 ml-2 my-0.5">
                              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                              <span>{trimmed.replace(/^\d+[.)]\s+/, "").replace(/\*\*([^*]+)\*\*/g, "$1")}</span>
                            </div>
                          );
                        return (
                          <p
                            key={i}
                            className="my-0.5"
                            dangerouslySetInnerHTML={{
                              __html: trimmed.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>"),
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Citations / Basis */}
              {(researchData as any).basis && (researchData as any).basis.length > 0 && (
                <div className="glass-card p-4 space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Sources</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {(researchData as any).basis.map((ref: any, i: number) => (
                      <a
                        key={i}
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <span className="text-muted-foreground">[{i + 1}]</span>
                        {ref.title || new URL(ref.url).hostname}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested Searches from Research */}
              {suggestedSearches.length > 0 && (
                <div className="glass-card p-4 space-y-3">
                  <p className="text-xs font-semibold text-foreground">Suggested Searches</p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedSearches.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          const parts = q.match(/^(.+?)\s+at\s+(.+)$/);
                          if (parts) {
                            setSearchRole(parts[1]);
                            setSearchCompany(parts[2]);
                          } else {
                            setSearchRole(q);
                          }
                          setMode("search");
                          setTimeout(() => {
                            const form = document.getElementById("search-form") as HTMLFormElement;
                            if (form) form.requestSubmit();
                          }, 100);
                        }}
                        className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button className="flex-1 glow-accent" onClick={handleFindCandidates}>
                  <ArrowRight className="h-4 w-4 mr-2" /> Find Candidates
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={handleSaveResearch}
                  disabled={savingResearch || researchSaved}
                >
                  {researchSaved ? (
                    <>
                      <Check className="h-4 w-4 mr-2" /> Saved
                    </>
                  ) : savingResearch ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...
                    </>
                  ) : (
                    <>
                      <Bookmark className="h-4 w-4 mr-2" /> Save Research
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== ENRICH MODE ===== */}
      {mode === "enrich" && (
        <>
          <form onSubmit={handleEnrich} className="glass-card p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs">
                  Name *
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  required
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company" className="text-xs">
                  Company *
                </Label>
                <Input
                  id="company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Inc"
                  required
                  className="bg-secondary border-border"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="role" className="text-xs">
                  Role
                </Label>
                <Input
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Staff Engineer"
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="handle" className="text-xs">
                  GitHub Handle
                </Label>
                <Input
                  id="handle"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="janedoe"
                  className="bg-secondary border-border font-mono"
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full glow-accent"
              size="lg"
              disabled={loading || !name.trim() || !company.trim()}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Enriching...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" /> Enrich
                </>
              )}
            </Button>
          </form>
          {loading && (
            <div className="glass-card p-8 flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Enriching candidate data...</p>
              <p className="text-xs text-muted-foreground">This may take up to 60 seconds</p>
            </div>
          )}
          {result && !loading && (
            <CandidateCard
              data={{ name: name.trim(), company: company.trim(), role: role.trim(), enrichment_data: result }}
              onSave={handleSave}
              isSaved={saved}
              saving={saving}
            />
          )}
        </>
      )}

      {/* ===== SEARCH MODE ===== */}
      {mode === "search" && (
        <>
          <form id="search-form" onSubmit={handleSearch} className="glass-card p-5 space-y-4">
            {/* Result count selector */}
            <div className="flex items-center gap-2">
              <Label className="text-xs shrink-0">Results</Label>
              <select
                value={searchCount}
                onChange={(e) => setSearchCount(Number(e.target.value))}
                className="px-2 py-1 rounded-md text-xs font-medium bg-secondary border border-border text-foreground"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="searchRole" className="text-xs">
                Role / Title *
                {!searchRole && settingsRole && <span className="text-primary/60 ml-1">(from Settings)</span>}
              </Label>
              <Input
                id="searchRole"
                value={searchRole}
                onChange={(e) => setSearchRole(e.target.value)}
                placeholder={settingsRole || "Staff Engineer, Product Manager..."}
                required
                className="bg-secondary border-border"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="searchCompany" className="text-xs">
                  Company / Industry
                </Label>
                <Input
                  id="searchCompany"
                  value={searchCompany}
                  onChange={(e) => setSearchCompany(e.target.value)}
                  placeholder="Fintech, Acme Inc..."
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="searchLocation" className="text-xs">
                  Location
                </Label>
                <Input
                  id="searchLocation"
                  value={searchLocation}
                  onChange={(e) => setSearchLocation(e.target.value)}
                  placeholder="San Francisco, Remote..."
                  className="bg-secondary border-border"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="searchSkills" className="text-xs">
                Skills / Keywords
              </Label>
              <Input
                id="searchSkills"
                value={searchSkills}
                onChange={(e) => setSearchSkills(e.target.value)}
                placeholder="React, Python, ML..."
                className="bg-secondary border-border"
              />
            </div>
            <Button type="submit" className="w-full glow-accent" size="lg" disabled={isSearching || !searchRole.trim()}>
              {isSearching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" /> Search Candidates
                </>
              )}
            </Button>
          </form>

          {/* Progress states */}
          {searchStatus === "creating" && (
            <div className="glass-card p-8 flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">Creating search...</p>
              <p className="text-xs text-muted-foreground">Setting up candidate discovery</p>
            </div>
          )}

          {searchStatus === "polling" && (
            <div className="glass-card p-8 flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">Searching for candidates...</p>
              <p className="text-xs text-muted-foreground">This may take up to 2 minutes</p>
              {websetId && (
                <p className="text-[10px] text-muted-foreground/50 font-mono">webset: {websetId.substring(0, 12)}...</p>
              )}
              <div className="w-full max-w-xs h-1 bg-secondary rounded-full overflow-hidden mt-2">
                <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: "45%" }} />
              </div>
            </div>
          )}

          {searchStatus === "error" && searchResults.length === 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
              <p className="text-sm text-destructive">Search failed. Try again with different criteria.</p>
              <Button
                size="sm"
                variant="outline"
                className="border-destructive/30 text-destructive"
                onClick={() => setSearchStatus("idle")}
              >
                <RefreshCw className="h-3 w-3 mr-1" /> Retry
              </Button>
            </div>
          )}

          {searchStatus === "done" && searchResults.length === 0 && (
            <div className="glass-card p-6 text-center">
              <p className="text-sm text-muted-foreground">No candidates found. Try broadening your search criteria.</p>
            </div>
          )}

          {searchResults.length > 0 && searchStatus === "done" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  Found {searchResults.length} candidate{searchResults.length !== 1 ? "s" : ""}
                </p>
                <div className="flex items-center gap-2">
                  {batchEnriching ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Enriching {batchProgress} of {batchTotal}...
                        {batchSkipped > 0 && ` (skipped ${batchSkipped} already enriched)`}
                      </span>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="text-xs h-7 px-2"
                        onClick={handleStopBatchEnrich}
                      >
                        Stop
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={handleBatchEnrich}>
                      <Sparkles className="h-3 w-3" /> Enrich All
                    </Button>
                  )}
                  <button
                    onClick={() => setViewMode(viewMode === "expanded" ? "compact" : "expanded")}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {viewMode === "expanded" ? (
                      <LayoutList className="h-3.5 w-3.5" />
                    ) : (
                      <LayoutGrid className="h-3.5 w-3.5" />
                    )}
                    {viewMode === "expanded" ? "Compact" : "Expanded"}
                  </button>
                </div>
              </div>

              {/* Filter chips */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {[
                  { key: "all", label: "All", count: searchResults.length },
                  { key: "linkedin", label: "LinkedIn", count: linkedInCount },
                  { key: "github", label: "GitHub", count: githubCount },
                  { key: "web", label: "Other", count: webCount },
                ]
                  .filter((f) => f.count > 0 || f.key === "all")
                  .map(({ key, label, count }) => (
                    <button
                      key={key}
                      onClick={() => setSourceFilter(key)}
                      className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                        sourceFilter === key
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:text-foreground border border-border"
                      }`}
                    >
                      {label} ({count})
                    </button>
                  ))}
              </div>

              {/* Batch enrich progress bar */}
              {batchEnriching && (
                <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${batchTotal > 0 ? (batchProgress / batchTotal) * 100 : 0}%` }}
                  />
                </div>
              )}

              {/* Result cards */}
              {filteredResults.map((candidate, filteredIdx) => {
                const idx = searchResults.indexOf(candidate);
                const hue = avatarHue(candidate.name);
                const titleLine = candidate.role
                  ? `${candidate.role}${candidate.company ? ` @ ${candidate.company}` : ""}`
                  : candidate.company || "";

                return (
                  <div
                    key={candidate.id || idx}
                    className="animate-in fade-in"
                    style={{ animationDelay: `${filteredIdx * 150}ms`, animationFillMode: "both" }}
                  >
                    <div className="rounded-xl border border-border bg-card p-4 space-y-3 hover:border-[hsl(var(--border))]/60 transition-colors">
                      {/* Top row: Avatar + Name + Source badge */}
                      <div className="flex items-start gap-3">
                        {/* Avatar with photo fallback */}
                        {candidate.pictureUrl ? (
                          <img
                            src={candidate.pictureUrl}
                            alt={candidate.name}
                            className="h-10 w-10 rounded-full object-cover shrink-0"
                            onError={(e) => {
                              // Replace with initials on error
                              const target = e.currentTarget;
                              const parent = target.parentElement;
                              if (parent) {
                                const div = document.createElement("div");
                                div.className = "h-10 w-10 rounded-full flex items-center justify-center shrink-0";
                                div.style.backgroundColor = `hsl(${hue}, 60%, 20%)`;
                                const span = document.createElement("span");
                                span.className = "text-sm font-bold";
                                span.style.color = `hsl(${hue}, 70%, 70%)`;
                                span.textContent = getInitials(candidate.name);
                                div.appendChild(span);
                                parent.replaceChild(div, target);
                              }
                            }}
                          />
                        ) : (
                          <div
                            className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `hsl(${hue}, 60%, 20%)` }}
                          >
                            <span className="text-sm font-bold" style={{ color: `hsl(${hue}, 70%, 70%)` }}>
                              {getInitials(candidate.name)}
                            </span>
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          {candidate.name ? (
                            <h3 className="text-base font-bold text-foreground truncate">{candidate.name}</h3>
                          ) : (
                            <h3 className="text-base font-medium text-muted-foreground truncate">Unknown Candidate</h3>
                          )}
                          {!candidate.name && candidate.description && (
                            <p className="text-xs text-muted-foreground/70 truncate">
                              {candidate.description.substring(0, 50)}...
                            </p>
                          )}
                          {titleLine && <p className="text-xs text-muted-foreground truncate">{titleLine}</p>}
                          {candidate.location && (
                            <p className="text-xs text-muted-foreground/70 truncate">{candidate.location}</p>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span
                            className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${getSourceBadgeStyle(candidate.source)}`}
                          >
                            {getSourceLabel(candidate.source)}
                          </span>
                          {candidate.duplicate && (
                            <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-[hsl(48,100%,45%)]/15 text-[hsl(48,100%,50%)] border border-[hsl(48,100%,45%)]/25">
                              In pipeline
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Expanded content */}
                      {viewMode === "expanded" && (
                        <>
                          {candidate.description && (
                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                              {candidate.description.length > 150
                                ? candidate.description.substring(0, 150) + "..."
                                : candidate.description}
                            </p>
                          )}

                          {candidate.signals.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {candidate.signals.map((signal) => (
                                <span
                                  key={signal}
                                  className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-primary/20 text-primary/80 bg-primary/5"
                                >
                                  {signal}
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {/* Re-enrich confirmation */}
                      {reEnrichConfirm === idx && (
                        <div className="rounded-lg bg-secondary/80 border border-border p-3 space-y-2">
                          <p className="text-xs text-foreground">This candidate was already enriched. Re-enrich?</p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="text-xs flex-1"
                              onClick={() => handleEnrichFromSearch(candidate, idx)}
                            >
                              Yes
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="text-xs flex-1"
                              onClick={() => setReEnrichConfirm(null)}
                            >
                              No
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs border-primary/30 text-primary hover:bg-primary/10"
                          disabled={enrichingIdx === idx}
                          onClick={() => handleEnrichFromSearch(candidate, idx)}
                        >
                          {enrichingIdx === idx ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin mr-1" /> Enriching...
                            </>
                          ) : candidate.enrichmentData ? (
                            <>
                              <Check className="h-3 w-3 mr-1" /> Enriched
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3 w-3 mr-1" /> Enrich
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 text-xs"
                          disabled={savingIdx === idx || savedIdxs.has(idx)}
                          onClick={() => handleSaveFromSearch(candidate, idx)}
                        >
                          {savedIdxs.has(idx) ? (
                            <>
                              <Check className="h-3 w-3 mr-1" /> Saved
                            </>
                          ) : savingIdx === idx ? (
                            <span className="animate-pulse">Saving...</span>
                          ) : (
                            <>
                              <Save className="h-3 w-3 mr-1" /> Save
                            </>
                          )}
                        </Button>
                        {candidate.url && (
                          <>
                            <button
                              onClick={() => handleCopyUrl(candidate.url)}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                              title="Copy URL"
                            >
                              {copiedUrl === candidate.url ? (
                                <Check className="h-3 w-3 text-primary" />
                              ) : (
                                <Clipboard className="h-3 w-3" />
                              )}
                            </button>
                            <a
                              href={candidate.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center h-8 px-3 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors gap-1"
                            >
                              <ExternalLink className="h-3 w-3" /> View
                            </a>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Manual enrichment result */}
                    {enrichedIdx === idx && enrichedResult && (
                      <div className="mt-2">
                        <CandidateCard
                          data={{
                            name: candidate.name,
                            company: candidate.company,
                            role: candidate.role,
                            enrichment_data: enrichedResult,
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Search History - collapsible */}
      {searchHistory.length > 0 && (
        <div className="glass-card overflow-hidden">
          <button
            onClick={() => setHistoryExpanded(!historyExpanded)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">History ({searchHistory.length})</span>
            </div>
            {historyExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {historyExpanded && (
            <div className="px-4 pb-4 space-y-2">
              {searchHistory.map((h) => {
                const params = h.query_params || {};
                const meta = h.metadata || params;
                const isResearch = h.action_type === "research";
                const queryText = isResearch
                  ? `${meta.role || ""}${meta.company ? ` at ${meta.company}` : ""}`
                  : [params.role, params.company, params.skills].filter(Boolean).join(", ");
                const truncated = queryText.length > 80 ? queryText.substring(0, 80) + "..." : queryText;
                const timeAgo = getRelativeTime(h.created_at);

                return (
                  <button
                    key={h.id}
                    onClick={() => {
                      if (isResearch) {
                        setResJobTitle(meta.role || "");
                        setResCompanyName(meta.company || "");
                        setMode("research");
                      } else {
                        setSearchRole(params.role || "");
                        setSearchCompany(params.company || "");
                        setSearchLocation(params.location || "");
                        setSearchSkills(params.skills || "");
                        setMode("search");
                        setTimeout(() => {
                          const form = document.getElementById("search-form") as HTMLFormElement;
                          if (form) form.requestSubmit();
                        }, 100);
                      }
                    }}
                    className="w-full flex items-center gap-3 rounded-lg bg-secondary/60 border border-border p-3 text-left hover:border-primary/30 transition-colors"
                  >
                    {isResearch ? (
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{truncated || "Search"}</p>
                      <p className="text-[10px] text-muted-foreground">{timeAgo}</p>
                    </div>
                    {!isResearch && h.result_count > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 shrink-0">
                        {h.result_count}
                      </span>
                    )}
                    {isResearch && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-muted-foreground border border-border shrink-0">
                        Research
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Duplicate Detection Modal */}
      {duplicateModal && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDuplicateModal(null)}
        >
          <div className="glass-card p-6 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[hsl(48,100%,45%)]" />
              <h3 className="text-sm font-bold text-foreground">Possible Duplicate</h3>
            </div>
            <p className="text-xs text-muted-foreground">This candidate may already be in your pipeline:</p>
            <div className="rounded-lg border border-border bg-secondary p-3 space-y-1">
              <p className="text-sm font-semibold text-foreground">{duplicateModal.existing.name}</p>
              <p className="text-xs text-primary font-mono">{duplicateModal.existing.company}</p>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>Stage: {duplicateModal.existing.stage}</span>
                <span>Added: {new Date(duplicateModal.existing.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 text-xs"
                onClick={() => {
                  setDuplicateModal(null);
                  handleSaveFromSearch(duplicateModal.newCandidate, duplicateModal.newIdx, true);
                }}
              >
                Save Anyway
              </Button>
              <Button size="sm" variant="secondary" className="flex-1 text-xs" onClick={() => setDuplicateModal(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
