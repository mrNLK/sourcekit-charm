import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Loader2, Search, Trash2, ChevronDown, ChevronUp, Download, Share2,
  ArrowRight, X, Plus, SortDesc, MessageSquare, Tag, Copy, Check, RefreshCw,
  ExternalLink, Shield, ArrowLeft, User, GraduationCap, Briefcase, Clock,
  BookOpen, Award, Code, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  picture_url?: string | null;
}

interface OutreachRecord {
  id: string;
  message: string;
  created_at: string;
  created_by: string;
}

// --- Webhook helper ---
async function fireWebhookIfContacted(candidate: Candidate, userId: string) {
  try {
    const { data: setting } = await supabase
      .from("settings")
      .select("value")
      .eq("user_id", userId)
      .eq("key", "webhook_url")
      .maybeSingle();
    const url = (setting as any)?.value;
    if (!url) return;
    const linkedinUrl = candidate.enrichment_data?.contact_info?.linkedin || "";
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: candidate.name,
        title: candidate.role,
        company: candidate.company,
        linkedin_url: linkedinUrl,
        score: candidate.score,
        enrichment_data: candidate.enrichment_data,
        stage: candidate.stage,
        notes: candidate.notes,
        tags: candidate.tags,
      }),
    });
  } catch (err) {
    console.error("Webhook error:", err);
  }
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

function AvatarImg({ src, name, size = 8 }: { src?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const hue = avatarHue(name);
  const sizeClass = size === 8 ? "h-8 w-8" : size === 12 ? "h-12 w-12" : "h-10 w-10";
  const textSize = size === 8 ? "text-[10px]" : size === 12 ? "text-sm" : "text-xs";

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sizeClass} rounded-full object-cover shrink-0`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center shrink-0`}
      style={{ backgroundColor: `hsl(${hue}, 60%, 20%)` }}
    >
      <span className={`${textSize} font-bold`} style={{ color: `hsl(${hue}, 70%, 70%)` }}>
        {getInitials(name)}
      </span>
    </div>
  );
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
  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  // Detail panel
  const [detailId, setDetailId] = useState<string | null>(null);
  // Outreach history
  const [outreachHistory, setOutreachHistory] = useState<OutreachRecord[]>([]);
  const [loadingOutreachHistory, setLoadingOutreachHistory] = useState(false);
  const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null);
  const notesTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchCandidates = async (retry = true) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("candidates")
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      // Retry once on auth errors
      if (retry && (error.message?.includes("JWT") || error.code === "PGRST301")) {
        const { error: refreshErr } = await supabase.auth.refreshSession();
        if (!refreshErr) { fetchCandidates(false); return; }
      }
      toast({ title: "Error loading candidates", description: error.message, variant: "destructive" });
    } else {
      const list = (data as Candidate[]) || [];
      const updated = list.map((c) => {
        if (c.score === null && c.enrichment_data) {
          const score = computeScore(c.enrichment_data);
          supabase.from("candidates").update({ score } as any).eq("id", c.id).then(() => {});
          return { ...c, score };
        }
        return c;
      });
      setCandidates(updated);
      const nm: Record<string, string> = {};
      for (const c of updated) nm[c.id] = c.notes || "";
      setNotesMap(nm);
    }
  };

  useEffect(() => { fetchCandidates(); }, []);

  // Load outreach history when detail panel opens
  useEffect(() => {
    if (detailId) {
      loadOutreachHistory(detailId);
    }
  }, [detailId]);

  const loadOutreachHistory = async (candidateId: string) => {
    setLoadingOutreachHistory(true);
    const { data } = await supabase
      .from("outreach_history")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false });
    setOutreachHistory((data as OutreachRecord[]) || []);
    setLoadingOutreachHistory(false);
  };

  const saveOutreachMessage = async (candidateId: string, message: string) => {
    if (!user) return;
    await supabase.from("outreach_history").insert({
      candidate_id: candidateId,
      message,
      created_by: user.id,
    } as any);
    if (detailId === candidateId) {
      loadOutreachHistory(candidateId);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("candidates").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      setCandidates((prev) => prev.filter((c) => c.id !== id));
      setDeleteId(null);
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      toast({ title: "Candidate removed" });
    }
  };

  const handleStageChange = async (id: string, newStage: string) => {
    const { error } = await supabase.from("candidates").update({ stage: newStage } as any).eq("id", id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      setCandidates((prev) => prev.map((c) => c.id === id ? { ...c, stage: newStage } : c));
      if (newStage === "contacted" && user) {
        const candidate = candidates.find((c) => c.id === id);
        if (candidate) fireWebhookIfContacted({ ...candidate, stage: newStage }, user.id);
      }
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
    let targetRole = "", targetCompany = "", pitch = "";
    if (user) {
      const { data: settings } = await supabase
        .from("settings").select("key, value").eq("user_id", user.id)
        .in("key", ["target_role", "target_company", "pitch"]);
      if (settings) {
        for (const s of settings as any[]) {
          if (s.key === "target_role") targetRole = s.value || "";
          if (s.key === "target_company") targetCompany = s.value || "";
          if (s.key === "pitch") pitch = s.value || "";
        }
      }
    }
    const enrichText = candidate.enrichment_data ? JSON.stringify(candidate.enrichment_data) : "";
    const signals: string[] = [];
    if (/google/i.test(enrichText)) signals.push("Google experience");
    if (/phd/i.test(enrichText)) signals.push("PhD");
    if (/open.?source|github/i.test(enrichText)) signals.push("Open source work");
    if (/publication|paper/i.test(enrichText)) signals.push("Published research");
    try {
      const { data, error } = await supabase.functions.invoke("generate-outreach", {
        body: { name: candidate.name, title: candidate.role || "", company: candidate.company, signals, targetRole, targetCompany, pitch, enrichment_data: candidate.enrichment_data || undefined },
      });
      if (error) throw error;
      const message = data.message || "Failed to generate message.";
      setOutreachModal({ id: candidate.id, message, loading: false });
      // Save to outreach history
      if (message && message !== "Failed to generate message.") {
        saveOutreachMessage(candidate.id, message);
      }
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
    const { data: settings } = await supabase.from("settings").select("value").eq("user_id", user.id).eq("key", "slack_webhook_url").maybeSingle();
    const webhookUrl = (settings as any)?.value;
    if (!webhookUrl) { toast({ title: "Set up Slack in Settings first.", variant: "destructive" }); return; }
    const linkedinUrl = candidate.enrichment_data?.contact_info?.linkedin || "";
    const payload = {
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*${candidate.name}* | ${candidate.role || "Unknown"} at ${candidate.company}\nScore: ${candidate.score ?? "N/A"}/100 | Stage: ${STAGE_LABELS[candidate.stage as Stage] || candidate.stage}\n${linkedinUrl}` } },
        { type: "context", elements: [{ type: "mrkdwn", text: "Shared from SourceKit" }] },
      ],
    };
    try {
      const res = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      toast({ title: "Shared to Slack" });
    } catch { toast({ title: "Failed to share", variant: "destructive" }); }
  };

  const buildCsvRows = (list: Candidate[]) => {
    const header = ["Name", "Company", "Title", "Score", "LinkedIn URL", "Stage", "Tags", "Notes", "Date Added"];
    const rows = list.map((c) => {
      const linkedinUrl = c.enrichment_data?.contact_info?.linkedin || "";
      return [c.name, c.company, c.role || "", c.score?.toString() || "", linkedinUrl, STAGE_LABELS[c.stage as Stage] || c.stage, (c.tags || []).join(", "), (c.notes || "").replace(/[\n\r,]/g, " "), new Date(c.created_at).toLocaleDateString()];
    });
    return [header, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
  };

  const downloadCsv = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    downloadCsv(buildCsvRows(filtered), `sourcekit-pipeline-${new Date().toISOString().split("T")[0]}.csv`);
    toast({ title: "CSV exported" });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const toggleSelectAllInStage = (stage: string) => {
    const idsInStage = filtered.filter((c) => c.stage === stage).map((c) => c.id);
    const allSelected = idsInStage.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const n = new Set(prev);
      for (const id of idsInStage) { if (allSelected) n.delete(id); else n.add(id); }
      return n;
    });
  };

  const handleBulkMove = async (targetStage: string) => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await supabase.from("candidates").update({ stage: targetStage } as any).eq("id", id);
    }
    setCandidates((prev) => prev.map((c) => selectedIds.has(c.id) ? { ...c, stage: targetStage } : c));
    if (targetStage === "contacted" && user) {
      for (const id of ids) {
        const c = candidates.find((x) => x.id === id);
        if (c) fireWebhookIfContacted({ ...c, stage: targetStage }, user.id);
      }
    }
    toast({ title: `Moved ${ids.length} candidates to ${STAGE_LABELS[targetStage as Stage] || targetStage}` });
    setSelectedIds(new Set());
  };

  const handleBulkExport = () => {
    const selected = candidates.filter((c) => selectedIds.has(c.id));
    downloadCsv(buildCsvRows(selected), `sourcekit-selected-${new Date().toISOString().split("T")[0]}.csv`);
    toast({ title: `Exported ${selected.length} candidates` });
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await supabase.from("candidates").delete().eq("id", id);
    }
    setCandidates((prev) => prev.filter((c) => !selectedIds.has(c.id)));
    toast({ title: `Deleted ${ids.length} candidates` });
    setSelectedIds(new Set());
    setBulkDeleteConfirm(false);
  };

  const allTags = Array.from(new Set(candidates.flatMap((c) => c.tags || [])));

  const stageCounts: Record<string, number> = {};
  for (const s of STAGES) stageCounts[s] = 0;
  for (const c of candidates) stageCounts[c.stage] = (stageCounts[c.stage] || 0) + 1;

  const filtered = candidates.filter((c) => {
    const q = filter.toLowerCase();
    const matchesText = !q || c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q) || (c.role || "").toLowerCase().includes(q) || (c.tags || []).some((t) => t.toLowerCase().includes(q));
    const matchesStage = !activeStage || c.stage === activeStage;
    const matchesTags = activeTags.size === 0 || (c.tags || []).some((t) => activeTags.has(t));
    return matchesText && matchesStage && matchesTags;
  });

  const sorted = sortByScore
    ? [...filtered].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    : filtered;

  const nextStage = (current: string): string | null => {
    const idx = STAGES.indexOf(current as Stage);
    if (idx < 0 || idx >= STAGES.length - 1) return null;
    return STAGES[idx + 1];
  };

  const detailCandidate = detailId ? candidates.find((c) => c.id === detailId) : null;

  // --- Detail Panel ---
  if (detailId && !detailCandidate) {
    // Loading skeleton while candidate data resolves
    return (
      <div className="animate-slide-up space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setDetailId(null)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="h-12 w-12 rounded-full bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-40 bg-muted animate-pulse rounded" />
            <div className="h-3 w-28 bg-muted animate-pulse rounded" />
          </div>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-card p-4 space-y-2">
            <div className="h-3 w-24 bg-muted animate-pulse rounded" />
            <div className="h-4 w-full bg-muted animate-pulse rounded" />
            <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (detailCandidate) {
    const c = detailCandidate;
    const enrichment = c.enrichment_data || {};
    const scoreColor = c.score !== null ? getScoreColor(c.score) : undefined;
    const linkedinUrl = enrichment.contact_info?.linkedin || "";

    return (
      <div className="animate-slide-up space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => setDetailId(null)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <AvatarImg src={c.picture_url} name={c.name} size={12} />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground truncate">{c.name}</h1>
            <p className="text-sm font-mono text-primary">{c.role || ""} {c.role && c.company ? "at" : ""} {c.company}</p>
          </div>
          {c.score !== null && (
            <div className="h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ backgroundColor: `${scoreColor}20`, color: scoreColor }}>
              {c.score}
            </div>
          )}
        </div>

        {/* Actions row */}
        <div className="flex gap-2">
          {linkedinUrl && (
            <a href={linkedinUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="text-xs gap-1"><ExternalLink className="h-3 w-3" /> LinkedIn</Button>
            </a>
          )}
          <select
            value={c.stage}
            onChange={(e) => handleStageChange(c.id, e.target.value)}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-secondary border border-border text-foreground"
          >
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
        </div>

        {/* Enrichment summary */}
        {enrichment.summary && (
          <div className="glass-card p-4 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-primary" /> Summary</p>
            <p className="text-sm text-secondary-foreground leading-relaxed">{enrichment.summary}</p>
          </div>
        )}

        {/* EEA Signals */}
        {enrichment.score_signals && (
          <div className="glass-card p-4 space-y-3">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-primary" /> EEA Signals</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(enrichment.score_signals as Record<string, boolean>).map(([key, val]) => (
                <span key={key} className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium border", val ? "bg-primary/15 text-primary border-primary/25" : "bg-secondary text-muted-foreground/50 border-border line-through")}>
                  {key.replace(/_/g, " ").replace(/\bhas\b/g, "").trim()}
                </span>
              ))}
            </div>
            {enrichment.evidence && Object.values(enrichment.evidence as Record<string, string>).some((v) => v) && (
              <div className="space-y-1.5 pt-2 border-t border-border">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Evidence</p>
                {Object.entries(enrichment.evidence as Record<string, string>).filter(([, v]) => v).map(([key, val]) => (
                  <div key={key} className="flex items-start gap-2 text-xs">
                    <span className="text-primary font-medium shrink-0">{key.replace(/_/g, " ").replace(/\bhas\b/g, "").trim()}</span>
                    {val.startsWith("http") ? (
                      <a href={val} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground truncate flex items-center gap-1">
                        {val.replace(/https?:\/\/(www\.)?/, "").split("/").slice(0, 2).join("/")}<ExternalLink className="h-2.5 w-2.5 shrink-0" />
                      </a>
                    ) : <span className="text-muted-foreground truncate">{val}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Skills */}
        {enrichment.skills && Array.isArray(enrichment.skills) && enrichment.skills.length > 0 && (
          <div className="glass-card p-4 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Code className="h-3.5 w-3.5 text-primary" /> Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {enrichment.skills.map((s: string, i: number) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-secondary-foreground border border-border">{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Key Achievements */}
        {enrichment.key_achievements && Array.isArray(enrichment.key_achievements) && enrichment.key_achievements.length > 0 && (
          <div className="glass-card p-4 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Award className="h-3.5 w-3.5 text-primary" /> Key Achievements</p>
            <ul className="space-y-1 list-disc pl-4">
              {enrichment.key_achievements.map((a: string, i: number) => <li key={i} className="text-xs text-secondary-foreground">{a}</li>)}
            </ul>
          </div>
        )}

        {/* Publications */}
        {enrichment.publications && Array.isArray(enrichment.publications) && enrichment.publications.length > 0 && (
          <div className="glass-card p-4 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5 text-primary" /> Publications</p>
            <ul className="space-y-1 list-disc pl-4">
              {enrichment.publications.map((p: any, i: number) => <li key={i} className="text-xs text-secondary-foreground">{typeof p === "string" ? p : p.title || JSON.stringify(p)}</li>)}
            </ul>
          </div>
        )}

        {/* Education + Experience */}
        <div className="grid grid-cols-2 gap-2">
          {enrichment.education && (
            <div className="glass-card p-4 space-y-1">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><GraduationCap className="h-3.5 w-3.5 text-primary" /> Education</p>
              <p className="text-xs text-secondary-foreground">{typeof enrichment.education === "string" ? enrichment.education : JSON.stringify(enrichment.education)}</p>
            </div>
          )}
          {enrichment.experience_years != null && (
            <div className="glass-card p-4 space-y-1">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5 text-primary" /> Experience</p>
              <p className="text-xs text-secondary-foreground">{enrichment.experience_years} years</p>
            </div>
          )}
        </div>

        {/* Outreach */}
        <div className="glass-card p-4 space-y-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5 text-primary" /> Outreach</p>
          {outreachModal?.id === c.id && !outreachModal.loading ? (
            <div className="space-y-2">
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{outreachModal.message}</p>
              <div className="flex gap-2">
                <Button size="sm" className="text-xs flex-1" onClick={async () => { await navigator.clipboard.writeText(outreachModal.message); setCopiedOutreach(true); toast({ title: "Copied" }); setTimeout(() => setCopiedOutreach(false), 2000); }}>
                  {copiedOutreach ? <><Check className="h-3 w-3 mr-1" /> Copied</> : <><Copy className="h-3 w-3 mr-1" /> Copy</>}
                </Button>
                <Button size="sm" variant="outline" className="text-xs flex-1" onClick={handleRegenerateOutreach}><RefreshCw className="h-3 w-3 mr-1" /> Regenerate</Button>
              </div>
            </div>
          ) : outreachModal?.id === c.id && outreachModal.loading ? (
            <div className="flex items-center gap-2 py-3"><Loader2 className="h-4 w-4 animate-spin text-primary" /><span className="text-xs text-muted-foreground">Generating...</span></div>
          ) : (
            <Button size="sm" variant="outline" className="text-xs w-full" onClick={() => handleOutreach(c)} disabled={!c.enrichment_data}>
              <MessageSquare className="h-3.5 w-3.5 mr-1" /> Generate Outreach
            </Button>
          )}
        </div>

        {/* Outreach History */}
        <div className="glass-card p-4 space-y-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-primary" /> Outreach History ({outreachHistory.length})
          </p>
          {loadingOutreachHistory ? (
            <div className="flex items-center gap-2 py-2"><Loader2 className="h-3 w-3 animate-spin text-primary" /><span className="text-xs text-muted-foreground">Loading...</span></div>
          ) : outreachHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">No outreach messages generated yet.</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {outreachHistory.map((oh) => (
                <div key={oh.id} className="rounded-lg bg-secondary/60 border border-border p-3 space-y-1.5">
                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{oh.message}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(oh.created_at).toLocaleDateString()} {new Date(oh.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(oh.message);
                        setCopiedHistoryId(oh.id);
                        toast({ title: "Copied" });
                        setTimeout(() => setCopiedHistoryId(null), 2000);
                      }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copiedHistoryId === oh.id ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="glass-card p-4 space-y-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Notes</p>
          <Textarea value={notesMap[c.id] || ""} onChange={(e) => handleNotesChange(c.id, e.target.value)} placeholder="Add notes..." className="bg-secondary border-border text-sm min-h-[60px]" rows={3} />
        </div>

        {/* Tags */}
        <div className="glass-card p-4 space-y-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {(c.tags || []).map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                {tag}
                <button onClick={() => handleRemoveTag(c.id, tag)} className="hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
              </span>
            ))}
            {showTagInput === c.id ? (
              <form onSubmit={(e) => { e.preventDefault(); handleAddTag(c.id); }} className="inline-flex">
                <input autoFocus value={tagInput[c.id] || ""} onChange={(e) => setTagInput((prev) => ({ ...prev, [c.id]: e.target.value }))} onBlur={() => { handleAddTag(c.id); setShowTagInput(null); }} placeholder="#tag" className="w-20 px-2 py-0.5 rounded-full text-[10px] bg-secondary border border-border text-foreground outline-none focus:border-primary font-mono" />
              </form>
            ) : (
              <button onClick={() => setShowTagInput(c.id)} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-muted-foreground border border-border hover:text-foreground"><Plus className="h-2.5 w-2.5" /> Add</button>
            )}
          </div>
        </div>

        {/* Timeline */}
        <div className="glass-card p-4 space-y-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-primary" /> Timeline</p>
          <div className="space-y-2 pl-3 border-l border-border">
            <div className="text-xs text-secondary-foreground">
              <span className="text-muted-foreground">Added:</span> {new Date(c.created_at).toLocaleDateString()} {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            {c.enrichment_data && (
              <div className="text-xs text-secondary-foreground">
                <span className="text-muted-foreground">Enriched:</span> Data available
              </div>
            )}
            <div className="text-xs text-secondary-foreground">
              <span className="text-muted-foreground">Stage:</span> {STAGE_LABELS[c.stage as Stage] || c.stage}
            </div>
          </div>
        </div>

        {/* Delete */}
        <Button variant="destructive" size="sm" className="w-full text-xs" onClick={() => { handleDelete(c.id); setDetailId(null); }}>
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove Candidate
        </Button>
      </div>
    );
  }

  // --- Main Kanban/List View ---
  return (
    <div className="space-y-4 pb-20">
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
        <button onClick={() => setActiveStage(null)} className={cn("px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors", !activeStage ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground border border-border hover:text-foreground")}>
          All ({candidates.length})
        </button>
        {STAGES.map((s) => (
          <button key={s} onClick={() => setActiveStage(activeStage === s ? null : s)} className={cn("px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors", activeStage === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground border border-border hover:text-foreground")}>
            {STAGE_LABELS[s]} ({stageCounts[s] || 0})
          </button>
        ))}
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {allTags.map((tag) => (
            <button key={tag} onClick={() => setActiveTags((prev) => { const n = new Set(prev); if (n.has(tag)) n.delete(tag); else n.add(tag); return n; })} className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors", activeTags.has(tag) ? "bg-primary/20 text-primary border border-primary/30" : "bg-secondary text-muted-foreground border border-border hover:text-foreground")}>
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Filter + Sort */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name, company, role, tags..." className="pl-9 bg-secondary border-border" />
        </div>
        <Button variant={sortByScore ? "default" : "outline"} size="sm" onClick={() => setSortByScore(!sortByScore)} className="gap-1 text-xs shrink-0">
          <SortDesc className="h-3.5 w-3.5" /> Score
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : sorted.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground text-sm">
          {candidates.length === 0 ? "No candidates saved yet. Search and enrich to get started." : "No candidates match your filter."}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Select all for active stage */}
          {activeStage && (
            <label className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              <Checkbox
                checked={filtered.filter((c) => c.stage === activeStage).every((c) => selectedIds.has(c.id)) && filtered.filter((c) => c.stage === activeStage).length > 0}
                onCheckedChange={() => toggleSelectAllInStage(activeStage)}
              />
              Select all {STAGE_LABELS[activeStage as Stage]}
            </label>
          )}

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
                    <button onClick={() => setExpandedId(null)} className="w-full flex items-center justify-between glass-card p-4">
                      <span className="text-sm font-semibold text-foreground">Collapse</span>
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    </button>
                    {c.score !== null && (
                      <div className="flex items-center gap-2 px-1">
                        <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: `${scoreColor}20`, color: scoreColor }}>{c.score}</div>
                        <span className="text-xs text-muted-foreground">EEA Score</span>
                      </div>
                    )}
                    <div className="flex gap-1.5 px-1 py-1 overflow-x-auto">
                      {STAGES.map((s) => (
                        <button key={s} onClick={() => handleStageChange(c.id, s)} className={cn("px-2.5 py-1 rounded-md text-[10px] font-medium whitespace-nowrap transition-colors", c.stage === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground border border-border")}>{STAGE_LABELS[s]}</button>
                      ))}
                    </div>
                    <CandidateCard data={c} />
                    {c.enrichment_data?.score_signals && (
                      <div className="glass-card p-4 space-y-3">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><Shield className="h-3.5 w-3.5 text-primary" /> EEA Signals</div>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(c.enrichment_data.score_signals as Record<string, boolean>).map(([key, val]) => (
                            <span key={key} className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium border", val ? "bg-primary/15 text-primary border-primary/25" : "bg-secondary text-muted-foreground/50 border-border line-through")}>{key.replace(/_/g, " ").replace(/\bhas\b/g, "").trim()}</span>
                          ))}
                        </div>
                        {c.enrichment_data.evidence && Object.values(c.enrichment_data.evidence as Record<string, string>).some((v) => v) && (
                          <div className="space-y-1.5 pt-1 border-t border-border">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Evidence</p>
                            {Object.entries(c.enrichment_data.evidence as Record<string, string>).filter(([, v]) => v).map(([key, val]) => (
                              <div key={key} className="flex items-start gap-2 text-xs">
                                <span className="text-primary font-medium shrink-0">{key.replace(/_/g, " ").replace(/\bhas\b/g, "").trim()}</span>
                                {val.startsWith("http") ? (
                                  <a href={val} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground truncate flex items-center gap-1">{val.replace(/https?:\/\/(www\.)?/, "").split("/").slice(0, 2).join("/")}<ExternalLink className="h-2.5 w-2.5 shrink-0" /></a>
                                ) : <span className="text-muted-foreground truncate">{val}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="glass-card p-4 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><MessageSquare className="h-3.5 w-3.5" /> Notes</div>
                      <Textarea value={notesMap[c.id] || ""} onChange={(e) => handleNotesChange(c.id, e.target.value)} placeholder="Add notes about this candidate..." className="bg-secondary border-border text-sm min-h-[60px]" rows={3} />
                    </div>
                    <div className="glass-card p-4 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><Tag className="h-3.5 w-3.5" /> Tags</div>
                      <div className="flex flex-wrap gap-1.5">
                        {(c.tags || []).map((tag) => (
                          <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">{tag}<button onClick={() => handleRemoveTag(c.id, tag)} className="hover:text-destructive"><X className="h-2.5 w-2.5" /></button></span>
                        ))}
                        {showTagInput === c.id ? (
                          <form onSubmit={(e) => { e.preventDefault(); handleAddTag(c.id); }} className="inline-flex">
                            <input autoFocus value={tagInput[c.id] || ""} onChange={(e) => setTagInput((prev) => ({ ...prev, [c.id]: e.target.value }))} onBlur={() => { handleAddTag(c.id); setShowTagInput(null); }} placeholder="#tag" className="w-20 px-2 py-0.5 rounded-full text-[10px] bg-secondary border border-border text-foreground outline-none focus:border-primary font-mono" />
                          </form>
                        ) : (
                          <button onClick={() => setShowTagInput(c.id)} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-muted-foreground border border-border hover:text-foreground"><Plus className="h-2.5 w-2.5" /> Add</button>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      {c.enrichment_data && <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => handleOutreach(c)}><MessageSquare className="h-3.5 w-3.5 mr-1" /> Write Outreach</Button>}
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => handleShareToSlack(c)}><Share2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="destructive" size="sm" className="text-xs" onClick={() => setDeleteId(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedIds.has(c.id)}
                      onCheckedChange={() => toggleSelect(c.id)}
                      className="shrink-0"
                    />
                    <button
                      className="flex-1 glass-card p-4 text-left transition-colors hover:border-primary/30"
                      onClick={() => setExpandedId(c.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <AvatarImg src={c.picture_url} name={c.name} size={8} />
                          {c.score !== null && (
                            <div className="h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ backgroundColor: `${scoreColor}20`, color: scoreColor }}>{c.score}</div>
                          )}
                          <div className="min-w-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); setDetailId(c.id); }}
                              className="font-semibold text-foreground truncate hover:text-primary transition-colors text-left"
                            >
                              {c.name}
                            </button>
                            <p className="font-mono text-xs text-primary">{c.company}</p>
                            {c.role && <p className="text-xs text-muted-foreground">{c.role}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-muted-foreground border border-border">{STAGE_LABELS[c.stage as Stage] || c.stage}</span>
                          {next && (
                            <button onClick={(e) => { e.stopPropagation(); handleStageChange(c.id, next); }} className="p-1 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title={`Move to ${STAGE_LABELS[next as Stage]}`}>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      {(c.tags || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {(c.tags || []).slice(0, 4).map((tag) => (
                            <span key={tag} className="px-1.5 py-0 rounded text-[9px] font-medium bg-primary/5 text-primary/60">{tag}</span>
                          ))}
                        </div>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-40 glass-card p-3 glow-accent flex items-center justify-between gap-2 animate-slide-up">
          <span className="text-xs font-semibold text-foreground shrink-0">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2 overflow-x-auto">
            <select
              defaultValue=""
              onChange={(e) => { if (e.target.value) handleBulkMove(e.target.value); e.target.value = ""; }}
              className="px-2 py-1.5 rounded-md text-xs font-medium bg-secondary border border-border text-foreground"
            >
              <option value="" disabled>Move to...</option>
              {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </select>
            <Button size="sm" variant="outline" className="text-xs shrink-0" onClick={handleBulkExport}>
              <Download className="h-3 w-3 mr-1" /> Export
            </Button>
            {bulkDeleteConfirm ? (
              <div className="flex gap-1">
                <Button size="sm" variant="destructive" className="text-xs" onClick={handleBulkDelete}>Confirm</Button>
                <Button size="sm" variant="secondary" className="text-xs" onClick={() => setBulkDeleteConfirm(false)}>Cancel</Button>
              </div>
            ) : (
              <Button size="sm" variant="destructive" className="text-xs shrink-0" onClick={() => setBulkDeleteConfirm(true)}>
                <Trash2 className="h-3 w-3 mr-1" /> Delete
              </Button>
            )}
            <button onClick={() => setSelectedIds(new Set())} className="p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {/* Outreach Modal */}
      {outreachModal && !detailId && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOutreachModal(null)}>
          <div className="glass-card p-6 w-full max-w-md space-y-4 glow-accent" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Outreach Message</h3>
              <button onClick={() => setOutreachModal(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            {outreachModal.loading ? (
              <div className="flex flex-col items-center gap-3 py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /><p className="text-xs text-muted-foreground">Generating message...</p></div>
            ) : (
              <>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{outreachModal.message}</p>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 text-xs" onClick={async () => { await navigator.clipboard.writeText(outreachModal.message); setCopiedOutreach(true); toast({ title: "Copied to clipboard" }); setTimeout(() => setCopiedOutreach(false), 2000); }}>
                    {copiedOutreach ? <><Check className="h-3 w-3 mr-1" /> Copied</> : <><Copy className="h-3 w-3 mr-1" /> Copy</>}
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={handleRegenerateOutreach}><RefreshCw className="h-3 w-3 mr-1" /> Regenerate</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
