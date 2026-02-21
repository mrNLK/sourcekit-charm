import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Search, Save, Check, FlaskConical, Building2, FileText, ChevronDown, ChevronRight, ArrowRight, Bookmark, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import CandidateCard from "./CandidateCard";

type Mode = "research" | "search" | "enrich";
type ResearchInput = "quick" | "full";
type SearchStatus = "idle" | "creating" | "polling" | "done" | "error";

interface SearchResult {
  id: string;
  name: string;
  url: string;
  description: string;
  source: string;
  company: string;
  role: string;
  enrichmentData?: any;
  autoEnriched?: boolean;
}

interface ResearchData {
  target_companies?: { name: string; rationale: string }[];
  eea_signals?: string[];
  search_criteria?: { keywords: string[]; skills: string[]; filters: string[] };
  raw?: string;
}

function parseResearchOutput(data: any): ResearchData {
  const output = data?.output || data?.result || data?.data || data?.response || "";
  const text = typeof output === "string" ? output : JSON.stringify(output);

  const companies: { name: string; rationale: string }[] = [];
  const eeaSignals: string[] = [];
  const keywords: string[] = [];
  const skills: string[] = [];
  const filters: string[] = [];

  const companySection = text.match(/(?:companies|target companies|1\))[^]*?(?=2\)|evidence of exceptional|eea|$)/i)?.[0] || "";
  const companyLines = companySection.split(/\n/).filter((l: string) => l.trim().length > 5);
  for (const line of companyLines) {
    const match = line.match(/[-•*\d.]+\s*\*?\*?([^:*\n-]+?)\*?\*?\s*[-:–]\s*(.+)/);
    if (match) {
      companies.push({ name: match[1].trim(), rationale: match[2].trim() });
    }
  }

  const eeaSection = text.match(/(?:evidence of exceptional|eea|2\))[^]*?(?=3\)|search keywords|search criteria|$)/i)?.[0] || "";
  const eeaLines = eeaSection.split(/\n/).filter((l: string) => l.trim().match(/^[-•*\d.]/));
  for (const line of eeaLines) {
    const cleaned = line.replace(/^[-•*\d.]+\s*/, "").trim();
    if (cleaned.length > 3) eeaSignals.push(cleaned);
  }

  const searchSection = text.match(/(?:search keywords|search criteria|3\))[^]*$/i)?.[0] || "";
  const searchLines = searchSection.split(/\n/).filter((l: string) => l.trim().match(/^[-•*\d.]/));
  for (const line of searchLines) {
    const cleaned = line.replace(/^[-•*\d.]+\s*/, "").trim();
    if (cleaned.length > 2) keywords.push(cleaned);
  }

  return {
    target_companies: companies.length > 0 ? companies : undefined,
    eea_signals: eeaSignals.length > 0 ? eeaSignals : undefined,
    search_criteria: keywords.length > 0 ? { keywords, skills, filters } : undefined,
    raw: text,
  };
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

function detectSource(url: string): string {
  if (url.includes("linkedin.com")) return "linkedin";
  if (url.includes("github.com")) return "github";
  if (url.includes("twitter.com") || url.includes("x.com")) return "X";
  return "web";
}

function getSourceLabel(source: string): string {
  switch (source) {
    case "linkedin": return "LinkedIn";
    case "github": return "GitHub";
    case "X": return "X";
    default: return "Web";
  }
}

function getSourceBadgeClasses(source: string): string {
  switch (source) {
    case "linkedin": return "bg-primary/20 text-primary";
    case "github": return "bg-muted text-muted-foreground";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function SearchTab() {
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

  // Search state
  const [searchRole, setSearchRole] = useState("");
  const [searchCompany, setSearchCompany] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [searchSkills, setSearchSkills] = useState("");
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [websetId, setWebsetId] = useState<string | null>(null);
  const [enrichingIdx, setEnrichingIdx] = useState<number | null>(null);
  const [enrichedResult, setEnrichedResult] = useState<any>(null);
  const [enrichedIdx, setEnrichedIdx] = useState<number | null>(null);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [savedIdxs, setSavedIdxs] = useState<Set<number>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartRef = useRef<number>(0);

  // Research state
  const [researchInput, setResearchInput] = useState<ResearchInput>("quick");
  const [resJobTitle, setResJobTitle] = useState("");
  const [resCompanyName, setResCompanyName] = useState("");
  const [resJobSpec, setResJobSpec] = useState("");
  const [researching, setResearching] = useState(false);
  const [researchData, setResearchData] = useState<ResearchData | null>(null);
  const [researchRaw, setResearchRaw] = useState<any>(null);
  const [savingResearch, setSavingResearch] = useState(false);
  const [researchSaved, setResearchSaved] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["companies", "eea", "criteria"]));

  const { toast } = useToast();
  const { user } = useAuth();

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
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
        body: { name: name.trim(), company: company.trim(), role: role.trim(), handle: handle.trim() },
      });
      if (error) throw error;
      setResult(data);
    } catch (err: any) {
      toast({ title: "Enrichment failed", description: err.message || "Could not reach the enrichment API.", variant: "destructive" });
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
  const pollWebset = useCallback(async (wsId: string) => {
    const elapsed = Date.now() - pollStartRef.current;
    if (elapsed > 120000) {
      setSearchStatus("error");
      toast({ title: "Search timed out", description: "The search took too long. Try a more specific query.", variant: "destructive" });
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
        const results: SearchResult[] = items.map((item: any) => ({
          id: item.id || crypto.randomUUID(),
          name: item.name || "Unknown",
          url: item.url || "",
          description: item.description || "",
          source: detectSource(item.url || ""),
          company: "",
          role: "",
        }));
        setSearchResults(results);
        setSearchStatus("done");
        return;
      }

      // If webset is complete but no items, show empty
      if (websetStatus === "completed" || websetStatus === "idle") {
        setSearchResults([]);
        setSearchStatus("done");
        toast({ title: "No results", description: "No candidates found. Try different criteria." });
        return;
      }

      // Keep polling
      pollTimerRef.current = setTimeout(() => pollWebset(wsId), 5000);
    } catch (err: any) {
      console.error("Poll error:", err);
      // Retry on transient errors
      pollTimerRef.current = setTimeout(() => pollWebset(wsId), 5000);
    }
  }, [toast]);

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
      toast({ title: "Search failed", description: err.message || "Could not initiate search.", variant: "destructive" });
    }
  };

  const handleEnrichFromSearch = async (candidate: SearchResult, idx: number) => {
    setEnrichingIdx(idx);
    setEnrichedResult(null);
    setEnrichedIdx(null);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-candidate", {
        body: { name: candidate.name, company: candidate.company, role: candidate.role || "", handle: "" },
      });
      if (error) throw error;
      setEnrichedResult(data);
      setEnrichedIdx(idx);
    } catch (err: any) {
      toast({ title: "Enrichment failed", description: err.message || "Could not enrich candidate.", variant: "destructive" });
    } finally {
      setEnrichingIdx(null);
    }
  };

  const handleSaveFromSearch = async (candidate: SearchResult, idx: number) => {
    if (!user) return;
    setSavingIdx(idx);
    const enrichData = enrichedIdx === idx ? enrichedResult : candidate.enrichmentData || null;
    const { error } = await supabase.from("candidates").insert({
      name: candidate.name,
      company: candidate.company || "",
      role: candidate.role || null,
      enrichment_data: enrichData,
      created_by: user.id,
    });
    setSavingIdx(null);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      setSavedIdxs((prev) => new Set(prev).add(idx));
      toast({ title: "Candidate saved to pipeline" });
    }
  };

  // ---- Research mode ----
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

    try {
      const { data, error } = await supabase.functions.invoke("research-role", {
        body: {
          job_title: title || "Role from job spec",
          company_name: companyVal || "Company from job spec",
          job_spec: specVal,
        },
      });
      if (error) throw error;
      setResearchRaw(data);
      setResearchData(parseResearchOutput(data));
    } catch (err: any) {
      toast({ title: "Research failed", description: err.message || "Could not complete research.", variant: "destructive" });
    } finally {
      setResearching(false);
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
      setSearchCompany(researchData.target_companies.slice(0, 3).map((c) => c.name).join(", "));
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
        {([
          { key: "research" as Mode, icon: FlaskConical, label: "Research" },
          { key: "search" as Mode, icon: Search, label: "Search" },
          { key: "enrich" as Mode, icon: Sparkles, label: "Enrich" },
        ]).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium transition-colors ${
              mode === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
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
                  <Label htmlFor="resJobTitle" className="text-xs">Job Title *</Label>
                  <Input id="resJobTitle" value={resJobTitle} onChange={(e) => setResJobTitle(e.target.value)} placeholder="ML Engineer" required className="bg-secondary border-border" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="resCompanyName" className="text-xs">Company Name *</Label>
                  <Input id="resCompanyName" value={resCompanyName} onChange={(e) => setResCompanyName(e.target.value)} placeholder="Anthropic" required className="bg-secondary border-border" />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="resJobSpec" className="text-xs">Full Job Description *</Label>
                <Textarea id="resJobSpec" value={resJobSpec} onChange={(e) => setResJobSpec(e.target.value)} placeholder="Paste the full job description here..." required rows={8} className="bg-secondary border-border text-sm" />
              </div>
            )}
            <Button type="submit" className="w-full glow-accent" size="lg" disabled={researching || (researchInput === "quick" && (!resJobTitle.trim() || !resCompanyName.trim())) || (researchInput === "full" && !resJobSpec.trim())}>
              {researching ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Researching...</>
              ) : (
                <><FlaskConical className="h-4 w-4 mr-2" /> Research Role</>
              )}
            </Button>
          </form>

          {researching && (
            <div className="glass-card p-8 flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">Researching role...</p>
              <p className="text-xs text-muted-foreground">This may take 1-2 minutes</p>
              <div className="w-full max-w-xs h-1 bg-secondary rounded-full overflow-hidden mt-2">
                <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: "60%" }} />
              </div>
            </div>
          )}

          {researchData && !researching && (
            <div className="space-y-3">
              {researchData.target_companies && researchData.target_companies.length > 0 && (
                <div className="glass-card overflow-hidden">
                  <button onClick={() => toggleSection("companies")} className="w-full flex items-center justify-between p-4 text-left">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">Target Companies</span>
                      <span className="text-xs text-muted-foreground">({researchData.target_companies.length})</span>
                    </div>
                    {expandedSections.has("companies") ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {expandedSections.has("companies") && (
                    <div className="px-4 pb-4 space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {researchData.target_companies.map((c, i) => (
                          <div key={i} className="group relative">
                            <span className="inline-block rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-medium text-primary cursor-default">{c.name}</span>
                            {c.rationale && (
                              <div className="hidden group-hover:block absolute z-10 bottom-full left-0 mb-1 p-2 rounded-md bg-popover border border-border shadow-lg max-w-[250px]">
                                <p className="text-xs text-popover-foreground">{c.rationale}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {researchData.eea_signals && researchData.eea_signals.length > 0 && (
                <div className="glass-card overflow-hidden">
                  <button onClick={() => toggleSection("eea")} className="w-full flex items-center justify-between p-4 text-left">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">EEA Signals</span>
                    </div>
                    {expandedSections.has("eea") ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {expandedSections.has("eea") && (
                    <div className="px-4 pb-4 space-y-1.5">
                      {researchData.eea_signals.map((signal, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                          <p className="text-xs text-secondary-foreground">{signal}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {researchData.search_criteria && researchData.search_criteria.keywords.length > 0 && (
                <div className="glass-card overflow-hidden">
                  <button onClick={() => toggleSection("criteria")} className="w-full flex items-center justify-between p-4 text-left">
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">Search Criteria</span>
                    </div>
                    {expandedSections.has("criteria") ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {expandedSections.has("criteria") && (
                    <div className="px-4 pb-4">
                      <div className="flex flex-wrap gap-1.5">
                        {researchData.search_criteria.keywords.map((kw, i) => (
                          <span key={i} className="inline-block rounded-md bg-secondary border border-border px-2 py-1 text-xs text-foreground">{kw}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!researchData.target_companies?.length && !researchData.eea_signals?.length && !researchData.search_criteria?.keywords.length && researchData.raw && (
                <div className="glass-card p-4">
                  <p className="text-xs text-muted-foreground mb-2">Research Output</p>
                  <div className="text-xs text-secondary-foreground whitespace-pre-wrap max-h-96 overflow-y-auto font-mono">{researchData.raw}</div>
                </div>
              )}

              <div className="flex gap-2">
                <Button className="flex-1 glow-accent" onClick={handleFindCandidates}>
                  <ArrowRight className="h-4 w-4 mr-2" /> Find Candidates
                </Button>
                <Button variant="secondary" className="flex-1" onClick={handleSaveResearch} disabled={savingResearch || researchSaved}>
                  {researchSaved ? (
                    <><Check className="h-4 w-4 mr-2" /> Saved</>
                  ) : savingResearch ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
                  ) : (
                    <><Bookmark className="h-4 w-4 mr-2" /> Save Research</>
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
                <Label htmlFor="name" className="text-xs">Name *</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" required className="bg-secondary border-border" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company" className="text-xs">Company *</Label>
                <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Inc" required className="bg-secondary border-border" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="role" className="text-xs">Role</Label>
                <Input id="role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Staff Engineer" className="bg-secondary border-border" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="handle" className="text-xs">GitHub Handle</Label>
                <Input id="handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="janedoe" className="bg-secondary border-border font-mono" />
              </div>
            </div>
            <Button type="submit" className="w-full glow-accent" size="lg" disabled={loading || !name.trim() || !company.trim()}>
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Enriching...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Enrich</>
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
          <form onSubmit={handleSearch} className="glass-card p-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="searchRole" className="text-xs">Role / Title *</Label>
              <Input id="searchRole" value={searchRole} onChange={(e) => setSearchRole(e.target.value)} placeholder="Staff Engineer, Product Manager..." required className="bg-secondary border-border" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="searchCompany" className="text-xs">Company / Industry</Label>
                <Input id="searchCompany" value={searchCompany} onChange={(e) => setSearchCompany(e.target.value)} placeholder="Fintech, Acme Inc..." className="bg-secondary border-border" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="searchLocation" className="text-xs">Location</Label>
                <Input id="searchLocation" value={searchLocation} onChange={(e) => setSearchLocation(e.target.value)} placeholder="San Francisco, Remote..." className="bg-secondary border-border" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="searchSkills" className="text-xs">Skills / Keywords</Label>
              <Input id="searchSkills" value={searchSkills} onChange={(e) => setSearchSkills(e.target.value)} placeholder="React, Python, ML..." className="bg-secondary border-border" />
            </div>
            <Button type="submit" className="w-full glow-accent" size="lg" disabled={isSearching || !searchRole.trim()}>
              {isSearching ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Searching...</>
              ) : (
                <><Search className="h-4 w-4 mr-2" /> Search Candidates</>
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
            <div className="glass-card p-6 text-center">
              <p className="text-sm text-destructive">Search failed. Try again with different criteria.</p>
            </div>
          )}

          {searchStatus === "done" && searchResults.length === 0 && (
            <div className="glass-card p-6 text-center">
              <p className="text-sm text-muted-foreground">No candidates found. Try broader criteria.</p>
            </div>
          )}

          {searchResults.length > 0 && searchStatus === "done" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Found {searchResults.length} candidate{searchResults.length !== 1 ? "s" : ""}
                </p>
              </div>

              {/* Filter chips */}
              <div className="flex gap-1.5 flex-wrap">
                {([
                  { key: "all", label: "All", count: searchResults.length },
                  { key: "linkedin", label: "LinkedIn", count: linkedInCount },
                  { key: "github", label: "GitHub", count: githubCount },
                  { key: "web", label: "Other", count: webCount },
                ]).filter((f) => f.count > 0 || f.key === "all").map(({ key, label, count }) => (
                  <button
                    key={key}
                    onClick={() => setSourceFilter(key)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      sourceFilter === key
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:text-foreground border border-border"
                    }`}
                  >
                    {label} {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
                  </button>
                ))}
              </div>

              {/* Result cards */}
              {filteredResults.map((candidate, filteredIdx) => {
                const idx = searchResults.indexOf(candidate);
                return (
                  <div key={candidate.id || idx}>
                    <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3 hover:border-primary/40 transition-colors">
                      {/* Top row: Avatar + Name + Source badge */}
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-primary">{getInitials(candidate.name)}</span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-foreground truncate">{candidate.name}</h3>
                          {candidate.role && (
                            <p className="text-xs text-muted-foreground truncate">{candidate.role}</p>
                          )}
                        </div>

                        <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${getSourceBadgeClasses(candidate.source)}`}>
                          {getSourceLabel(candidate.source)}
                        </span>
                      </div>

                      {/* Description */}
                      {candidate.description && (
                        <p className="text-xs text-secondary-foreground line-clamp-2 leading-relaxed">
                          {candidate.description.length > 150
                            ? candidate.description.substring(0, 150) + "..."
                            : candidate.description}
                        </p>
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
                            <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Enriching...</>
                          ) : (
                            <><Sparkles className="h-3 w-3 mr-1" /> Enrich</>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 text-xs"
                          disabled={savingIdx === idx || savedIdxs.has(idx)}
                          onClick={() => handleSaveFromSearch(candidate, idx)}
                        >
                          {savedIdxs.has(idx) ? (
                            <><Check className="h-3 w-3 mr-1" /> Saved</>
                          ) : savingIdx === idx ? (
                            <span className="animate-pulse">Saving...</span>
                          ) : (
                            <><Save className="h-3 w-3 mr-1" /> Save</>
                          )}
                        </Button>
                        {candidate.url && (
                          <a
                            href={candidate.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Manual enrichment result */}
                    {enrichedIdx === idx && enrichedResult && (
                      <div className="mt-2">
                        <CandidateCard data={{ name: candidate.name, company: candidate.company, role: candidate.role, enrichment_data: enrichedResult }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
