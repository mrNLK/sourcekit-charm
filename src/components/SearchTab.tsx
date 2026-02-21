import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Search, Save, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import CandidateCard from "./CandidateCard";

type Mode = "enrich" | "search";

interface SearchResult {
  name: string;
  company: string;
  role: string;
  summary?: string;
}

export default function SearchTab() {
  const [mode, setMode] = useState<Mode>("enrich");

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
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [enrichingIdx, setEnrichingIdx] = useState<number | null>(null);
  const [enrichedResult, setEnrichedResult] = useState<any>(null);
  const [enrichedIdx, setEnrichedIdx] = useState<number | null>(null);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [savedIdxs, setSavedIdxs] = useState<Set<number>>(new Set());

  const { toast } = useToast();
  const { user } = useAuth();

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

  // ---- Search mode ----
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchRole.trim()) return;

    setSearching(true);
    setSearchResults([]);
    setEnrichedResult(null);
    setEnrichedIdx(null);

    try {
      const { data, error } = await supabase.functions.invoke("search-candidates", {
        body: {
          role: searchRole.trim(),
          company: searchCompany.trim(),
          location: searchLocation.trim(),
          skills: searchSkills.trim(),
        },
      });

      if (error) {
        // Check for 404 / not configured
        if (error.message?.includes("search_not_configured") || error.message?.includes("FunctionsHttpError")) {
          toast({
            title: "Search endpoint not configured",
            description: "Search endpoint not configured on backend. Use Enrich mode for now.",
            variant: "destructive",
          });
          return;
        }
        throw error;
      }

      if (data?.error === "search_not_configured") {
        toast({
          title: "Search endpoint not configured",
          description: "Search endpoint not configured on backend. Use Enrich mode for now.",
          variant: "destructive",
        });
        return;
      }

      const results = Array.isArray(data) ? data : data?.results || data?.candidates || [];
      setSearchResults(results);

      if (results.length === 0) {
        toast({ title: "No results", description: "No candidates found for this search." });
      }
    } catch (err: any) {
      toast({
        title: "Search failed",
        description: err.message || "Could not reach the search API.",
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  };

  const handleEnrichFromSearch = async (candidate: SearchResult, idx: number) => {
    setEnrichingIdx(idx);
    setEnrichedResult(null);
    setEnrichedIdx(null);

    try {
      const { data, error } = await supabase.functions.invoke("enrich-candidate", {
        body: {
          name: candidate.name,
          company: candidate.company,
          role: candidate.role || "",
          handle: "",
        },
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

    const enrichData = enrichedIdx === idx ? enrichedResult : null;

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Candidate Search</h1>
        <p className="text-sm text-muted-foreground">
          {mode === "enrich" ? "Enrich candidate profiles from external data" : "Search for candidates by role and criteria"}
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="flex rounded-lg border border-border bg-secondary p-1 gap-1">
        <button
          onClick={() => setMode("enrich")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            mode === "enrich"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="h-4 w-4" />
          Enrich
        </button>
        <button
          onClick={() => setMode("search")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            mode === "search"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Search className="h-4 w-4" />
          Search
        </button>
      </div>

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
              <Input
                id="searchRole"
                value={searchRole}
                onChange={(e) => setSearchRole(e.target.value)}
                placeholder="Staff Engineer, Product Manager..."
                required
                className="bg-secondary border-border"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="searchCompany" className="text-xs">Company / Industry</Label>
                <Input
                  id="searchCompany"
                  value={searchCompany}
                  onChange={(e) => setSearchCompany(e.target.value)}
                  placeholder="Fintech, Acme Inc..."
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="searchLocation" className="text-xs">Location</Label>
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
              <Label htmlFor="searchSkills" className="text-xs">Skills / Keywords</Label>
              <Input
                id="searchSkills"
                value={searchSkills}
                onChange={(e) => setSearchSkills(e.target.value)}
                placeholder="React, Python, ML..."
                className="bg-secondary border-border"
              />
            </div>
            <Button type="submit" className="w-full glow-accent" size="lg" disabled={searching || !searchRole.trim()}>
              {searching ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Searching...</>
              ) : (
                <><Search className="h-4 w-4 mr-2" /> Search Candidates</>
              )}
            </Button>
          </form>

          {searching && (
            <div className="glass-card p-8 flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Searching for candidates...</p>
            </div>
          )}

          {/* Search Results */}
          {searchResults.length > 0 && !searching && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{searchResults.length} result{searchResults.length !== 1 ? "s" : ""} found</p>
              {searchResults.map((candidate, idx) => (
                <div key={idx}>
                  {/* Compact result card */}
                  <div className="glass-card p-4 space-y-3">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">{candidate.name || "Unknown"}</h3>
                      <p className="font-mono text-xs text-primary">{candidate.company || ""}</p>
                      {candidate.role && <p className="text-xs text-muted-foreground">{candidate.role}</p>}
                      {candidate.summary && (
                        <p className="text-xs text-secondary-foreground mt-1 line-clamp-2">{candidate.summary}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1 text-xs"
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
                    </div>
                  </div>

                  {/* Show enriched card inline below the result */}
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
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
