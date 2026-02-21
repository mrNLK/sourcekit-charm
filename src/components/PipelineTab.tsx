import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Loader2, Search, Trash2, ChevronDown, ChevronUp, Download, Share2,
  ArrowRight, X, Plus, SortDesc, MessageSquare, Tag, Copy, Check, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import CandidateCard from "./CandidateCard";
import { computeScore, getScoreColor } from "@/lib/scoring";
import { cn } from "@/lib/utils";

const STAGES = ["sourced", "contacted", "responded", "screen", "offer"] as const;
type Stage = typeof STAGES[number];

const STAGE_LABELS: Record<Stage, string> = {
  sourced: "Sourced",
  contacted: "Contacted",
  responded: "Responded",
  screen: "Screen",
  offer: "Offer",
};

interface Candidate {
  id: string;
  name: string;
  company: string;
  role: string | null;
  enrichment_data: any;
  created_at: string;
  created_by: string;
  stage: string;
  score: number | null;
  notes: string | null;
  tags: string[] | null;
}

export default function PipelineTab() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [sortByScore, setSortByScore] = useState(false);
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [tagInput, setTagInput] = useState<Record<string, string>>({});
  const [showTagInput, setShowTagInput] = useState<string | null>(null);
  const [outreachModal, setOutreachModal] = useState<{ id: string; message: string; loading: boolean } | null>(null);
  const [copiedOutreach, setCopiedOutreach] = useState(false);
  const notesTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchCandidates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("candidates")
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast({ title: "Error loading candidates", description: error.message, variant: "destructive" });
    } else {
      const list = (data as Candidate[]) || [];
      // Compute scores for candidates with enrichment data but no score
      const updated = list.map((c) => {
        if (c.score === null && c.enrichment_data) {
          const score = computeScore(c.enrichment_data);
          // Fire-and-forget score update
          supabase.from("candidates").update({ score } as any).eq("id", c.id).then(() => {});
          return { ...c, score };
        }
        return c;
      });
      setCandidates(updated);
      // Initialize notes map
      const nm: Record<string, string> = {};
      for (const c of updated) nm[c.id] = c.notes || "";
      setNotesMap(nm);
    }
  };

  useEffect(() => { fetchCandidates(); }, []);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("candidates").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      setCandidates((prev) => prev.filter((c) => c.id !== id));
      setDeleteId(null);
      toast({ title: "Candidate removed" });
    }
  };

  const handleStageChange = async (id: string, newStage: string) => {
    const { error } = await supabase.from("candidates").update({ stage: newStage } as any).eq("id", id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      setCandidates((prev) => prev.map((c) => c.id === id ? { ...c, stage: newStage } : c));
    }
  };

  const handleNotesChange = (id: string, value: string) => {
    setNotesMap((prev) => ({ ...prev, [id]: value }));
    if (notesTimerRef.current[id]) clearTimeout(notesTimerRef.current[id]);
    notesTimerRef.current[id] = setTimeout(async () => {
      await supabase.from("candidates").update({ notes: value || null } as any).eq("id", id);
      setCandidates((prev) => prev.map((c) => c.id === id ? { ...c, notes: value || null } : c));
    }, 500);
  };

  const handleAddTag = async (id: string) => {
    const raw = (tagInput[id] || "").trim().toLowerCase().replace(/^#/, "");
    if (!raw) return;
    const tag = `#${raw}`;
    const candidate = candidates.find((c) => c.id === id);
    if (!candidate) return;
    const current = candidate.tags || [];
    if (current.includes(tag)) return;
    const newTags = [...current, tag];
    const { error } = await supabase.from("candidates").update({ tags: newTags } as any).eq("id", id);
    if (!error) {
      setCandidates((prev) => prev.map((c) => c.id === id ? { ...c, tags: newTags } : c));
      setTagInput((prev) => ({ ...prev, [id]: "" }));
    }
  };

  const handleRemoveTag = async (id: string, tag: string) => {
    const candidate = candidates.find((c) => c.id === id);
    if (!candidate) return;
    const newTags = (candidate.tags || []).filter((t) => t !== tag);
    const { error } = await supabase.from("candidates").update({ tags: newTags.length > 0 ? newTags : null } as any).eq("id", id);
    if (!error) {
      setCandidates((prev) => prev.map((c) => c.id === id ? { ...c, tags: newTags.length > 0 ? newTags : null } : c));
    }
  };

  const handleOutreach = async (candidate: Candidate) => {
    setOutreachModal({ id: candidate.id, message: "", loading: true });
    setCopiedOutreach(false);

    // Get role context from settings
    let targetRole = "";
    let targetCompany = "";
    let pitch = "";
    if (user) {
      const { data: settings } = await supabase
        .from("settings")
        .select("key, value")
        .eq("user_id", user.id)
        .in("key", ["target_role", "target_company", "pitch"]);
      if (settings) {
        for (const s of settings as any[]) {
          if (s.key === "target_role") targetRole = s.value || "";
          if (s.key === "target_company") targetCompany = s.value || "";
          if (s.key === "pitch") pitch = s.value || "";
        }
      }
    }

    // Parse signals from enrichment
    const enrichText = candidate.enrichment_data ? JSON.stringify(candidate.enrichment_data) : "";
    const signals: string[] = [];
    if (/google/i.test(enrichText)) signals.push("Google experience");
    if (/phd/i.test(enrichText)) signals.push("PhD");
    if (/open.?source|github/i.test(enrichText)) signals.push("Open source work");
    if (/publication|paper/i.test(enrichText)) signals.push("Published research");

    try {
      const { data, error } = await supabase.functions.invoke("generate-outreach", {
        body: {
          name: candidate.name,
          title: candidate.role || "",
          company: candidate.company,
          signals,
          targetRole,
          targetCompany,
          pitch,
        },
      });
      if (error) throw error;
      setOutreachModal({ id: candidate.id, message: data.message || "Failed to generate message.", loading: false });
    } catch (err: any) {
      toast({ title: "Outreach generation failed", description: err.message, variant: "destructive" });
      setOutreachModal(null);
    }
  };

  const handleRegenerateOutreach = async () => {
    if (!outreachModal) return;
    const candidate = candidates.find((c) => c.id === outreachModal.id);
    if (candidate) handleOutreach(candidate);
  };

  const handleShareToSlack = async (candidate: Candidate) => {
    if (!user) return;
    const { data: settings } = await supabase
      .from("settings")
      .select("value")
      .eq("user_id", user.id)
      .eq("key", "slack_webhook_url")
      .maybeSingle();

    const webhookUrl = (settings as any)?.value;
    if (!webhookUrl) {
      toast({ title: "Set up Slack in Settings first.", variant: "destructive" });
      return;
    }

    const linkedinUrl = candidate.enrichment_data?.contact_info?.linkedin || "";
    const payload = {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${candidate.name}* | ${candidate.role || "Unknown"} at ${candidate.company}\nScore: ${candidate.score ?? "N/A"}/100 | Stage: ${STAGE_LABELS[candidate.stage as Stage] || candidate.stage}\n${linkedinUrl}`,
          },
        },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: "Shared from SourceKit" }],
        },
      ],
    };

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      toast({ title: "Shared to Slack" });
    } catch {
      toast({ title: "Failed to share", variant: "destructive" });
    }
  };

  const handleExportCsv = () => {
    const rows = filtered.map((c) => {
      const linkedinUrl = c.enrichment_data?.contact_info?.linkedin || "";
      return [
        c.name,
        c.company,
        c.role || "",
        c.score?.toString() || "",
        linkedinUrl,
        STAGE_LABELS[c.stage as Stage] || c.stage,
        (c.tags || []).join(", "),
        (c.notes || "").replace(/[\n\r,]/g, " "),
        new Date(c.created_at).toLocaleDateString(),
      ];
    });

    const header = ["Name", "Company", "Title", "Score", "LinkedIn URL", "Stage", "Tags", "Notes", "Date Added"];
    const csv = [header, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sourcekit-pipeline-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported" });
  };

  // Unique tags across all candidates
  const allTags = Array.from(new Set(candidates.flatMap((c) => c.tags || [])));

  // Stage counts
  const stageCounts: Record<string, number> = {};
  for (const s of STAGES) stageCounts[s] = 0;
  for (const c of candidates) stageCounts[c.stage] = (stageCounts[c.stage] || 0) + 1;

  // Filter pipeline
  const filtered = candidates.filter((c) => {
    const q = filter.toLowerCase();
    const matchesText = !q || c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q) || (c.role || "").toLowerCase().includes(q);
    const matchesStage = !activeStage || c.stage === activeStage;
    const matchesTags = activeTags.size === 0 || (c.tags || []).some((t) => activeTags.has(t));
    return matchesText && matchesStage && matchesTags;
  });

  // Sort
  const sorted = sortByScore
    ? [...filtered].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    : filtered;

  const nextStage = (current: string): string | null => {
    const idx = STAGES.indexOf(current as Stage);
    if (idx < 0 || idx >= STAGES.length - 1) return null;
    return STAGES[idx + 1];
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Pipeline</h1>
          <p className="text-sm text-muted-foreground">{candidates.length} saved candidates</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1 text-xs">
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </div>

      {/* Stage pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setActiveStage(null)}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
            !activeStage ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground border border-border hover:text-foreground"
          )}
        >
          All ({candidates.length})
        </button>
        {STAGES.map((s) => (
          <button
            key={s}
            onClick={() => setActiveStage(activeStage === s ? null : s)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
              activeStage === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground border border-border hover:text-foreground"
            )}
          >
            {STAGE_LABELS[s]} ({stageCounts[s] || 0})
          </button>
        ))}
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => {
                setActiveTags((prev) => {
                  const next = new Set(prev);
                  if (next.has(tag)) next.delete(tag);
                  else next.add(tag);
                  return next;
                });
              }}
              className={cn(
                "px-2.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors",
                activeTags.has(tag)
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-secondary text-muted-foreground border border-border hover:text-foreground"
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Filter + Sort */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name, company, role..." className="pl-9 bg-secondary border-border" />
        </div>
        <Button
          variant={sortByScore ? "default" : "outline"}
          size="sm"
          onClick={() => setSortByScore(!sortByScore)}
          className="gap-1 text-xs shrink-0"
        >
          <SortDesc className="h-3.5 w-3.5" /> Score
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground text-sm">
          {candidates.length === 0 ? "No candidates saved yet. Search and enrich to get started." : "No candidates match your filter."}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((c) => {
            const next = nextStage(c.stage);
            const scoreColor = c.score !== null ? getScoreColor(c.score) : undefined;

            return (
              <div key={c.id} className="relative">
                {deleteId === c.id ? (
                  <div className="glass-card p-4 flex items-center justify-between animate-slide-up">
                    <span className="text-sm text-foreground">Delete {c.name}?</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(c.id)}>Delete</Button>
                      <Button size="sm" variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : expandedId === c.id ? (
                  <div className="animate-slide-up space-y-1">
                    <button
                      onClick={() => setExpandedId(null)}
                      className="w-full flex items-center justify-between glass-card p-4"
                    >
                      <span className="text-sm font-semibold text-foreground">Collapse</span>
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    </button>

                    {/* Score badge in expanded */}
                    {c.score !== null && (
                      <div className="flex items-center gap-2 px-1">
                        <div
                          className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ backgroundColor: `${scoreColor}20`, color: scoreColor }}
                        >
                          {c.score}
                        </div>
                        <span className="text-xs text-muted-foreground">EEA Score</span>
                      </div>
                    )}

                    {/* Stage move */}
                    <div className="flex gap-1.5 px-1 py-1 overflow-x-auto">
                      {STAGES.map((s) => (
                        <button
                          key={s}
                          onClick={() => handleStageChange(c.id, s)}
                          className={cn(
                            "px-2.5 py-1 rounded-md text-[10px] font-medium whitespace-nowrap transition-colors",
                            c.stage === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground border border-border"
                          )}
                        >
                          {STAGE_LABELS[s]}
                        </button>
                      ))}
                    </div>

                    <CandidateCard data={c} />

                    {/* Notes section */}
                    <div className="glass-card p-4 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <MessageSquare className="h-3.5 w-3.5" /> Notes
                      </div>
                      <Textarea
                        value={notesMap[c.id] || ""}
                        onChange={(e) => handleNotesChange(c.id, e.target.value)}
                        placeholder="Add notes about this candidate..."
                        className="bg-secondary border-border text-sm min-h-[60px]"
                        rows={3}
                      />
                    </div>

                    {/* Tags section */}
                    <div className="glass-card p-4 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Tag className="h-3.5 w-3.5" /> Tags
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(c.tags || []).map((tag) => (
                          <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                            {tag}
                            <button onClick={() => handleRemoveTag(c.id, tag)} className="hover:text-destructive">
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        ))}
                        {showTagInput === c.id ? (
                          <form
                            onSubmit={(e) => { e.preventDefault(); handleAddTag(c.id); }}
                            className="inline-flex"
                          >
                            <input
                              autoFocus
                              value={tagInput[c.id] || ""}
                              onChange={(e) => setTagInput((prev) => ({ ...prev, [c.id]: e.target.value }))}
                              onBlur={() => { handleAddTag(c.id); setShowTagInput(null); }}
                              placeholder="#tag"
                              className="w-20 px-2 py-0.5 rounded-full text-[10px] bg-secondary border border-border text-foreground outline-none focus:border-primary font-mono"
                            />
                          </form>
                        ) : (
                          <button
                            onClick={() => setShowTagInput(c.id)}
                            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-muted-foreground border border-border hover:text-foreground"
                          >
                            <Plus className="h-2.5 w-2.5" /> Add
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1.5">
                      {c.enrichment_data && (
                        <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => handleOutreach(c)}>
                          <MessageSquare className="h-3.5 w-3.5 mr-1" /> Write Outreach
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => handleShareToSlack(c)}>
                        <Share2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="destructive" size="sm" className="text-xs" onClick={() => setDeleteId(c.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="w-full glass-card p-4 text-left transition-colors hover:border-primary/30"
                    onClick={() => setExpandedId(c.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Score circle */}
                        {c.score !== null && (
                          <div
                            className="h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                            style={{ backgroundColor: `${scoreColor}20`, color: scoreColor }}
                          >
                            {c.score}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{c.name}</p>
                          <p className="font-mono text-xs text-primary">{c.company}</p>
                          {c.role && <p className="text-xs text-muted-foreground">{c.role}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-muted-foreground border border-border">
                          {STAGE_LABELS[c.stage as Stage] || c.stage}
                        </span>
                        {next && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleStageChange(c.id, next); }}
                            className="p-1 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                            title={`Move to ${STAGE_LABELS[next as Stage]}`}
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                    {/* Tag pills in collapsed view */}
                    {(c.tags || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(c.tags || []).slice(0, 4).map((tag) => (
                          <span key={tag} className="px-1.5 py-0 rounded text-[9px] font-medium bg-primary/5 text-primary/60">{tag}</span>
                        ))}
                      </div>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Outreach Modal */}
      {outreachModal && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOutreachModal(null)}>
          <div className="glass-card p-6 w-full max-w-md space-y-4 glow-accent" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Outreach Message</h3>
              <button onClick={() => setOutreachModal(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            {outreachModal.loading ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">Generating message...</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{outreachModal.message}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={async () => {
                      await navigator.clipboard.writeText(outreachModal.message);
                      setCopiedOutreach(true);
                      toast({ title: "Copied to clipboard" });
                      setTimeout(() => setCopiedOutreach(false), 2000);
                    }}
                  >
                    {copiedOutreach ? <><Check className="h-3 w-3 mr-1" /> Copied</> : <><Copy className="h-3 w-3 mr-1" /> Copy</>}
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={handleRegenerateOutreach}>
                    <RefreshCw className="h-3 w-3 mr-1" /> Regenerate
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
