import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Loader2, Trash2, X, Plus, MessageSquare, Copy, Check, RefreshCw,
  ExternalLink, Shield, ArrowLeft, User, GraduationCap, Briefcase, Clock,
  BookOpen, Award, Code, Globe, Link, Bookmark, CheckCircle2, XCircle, Tag, Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getScoreColor } from "@/lib/scoring";
import { cn } from "@/lib/utils";

const STAGES = ["sourced", "contacted", "responded", "screen", "offer"] as const;
type Stage = typeof STAGES[number];
const STAGE_LABELS: Record<Stage, string> = {
  sourced: "Sourced", contacted: "Contacted", responded: "Responded", screen: "Screen", offer: "Offer",
};

const SIGNAL_LABELS: Record<string, string> = {
  has_phd: "PhD Holder",
  top_company: "Top Company Experience",
  has_publications: "Published Research",
  open_source: "Open Source Contributor",
  conference_speaker: "Conference Speaker",
  has_patents: "Patent Holder",
  leadership_role: "Leadership Role",
  top_university: "Top University",
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
  webhook_status?: string | null;
  webhook_error?: string | null;
}

interface CandidateNote {
  id: string;
  candidate_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

interface TimelineEvent {
  id: string;
  type: "stage_change" | "outreach" | "added";
  created_at: string;
  from_stage?: string;
  to_stage?: string;
  message?: string;
}

interface CandidateProfileProps {
  candidate: Candidate;
  onBack: () => void;
  onStageChange: (id: string, stage: string) => void;
  onDelete: (id: string) => void;
  onOutreach: (candidate: Candidate) => void;
  onTagAdd: (id: string) => void;
  onTagRemove: (id: string, tag: string) => void;
  tagInput: Record<string, string>;
  setTagInput: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  showTagInput: string | null;
  setShowTagInput: React.Dispatch<React.SetStateAction<string | null>>;
  outreachModal: { id: string; message: string; loading: boolean } | null;
  copiedOutreach: boolean;
  onCopyOutreach: () => void;
  onRegenerateOutreach: () => void;
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
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("");
}

function nameHash(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash);
}

function AvatarImg({ src, name, size = 20 }: { src?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const hue = nameHash(name) % 360;
  const sizeClass = size === 20 ? "h-20 w-20" : size === 12 ? "h-12 w-12" : "h-10 w-10";
  const textSize = size === 20 ? "text-2xl" : size === 12 ? "text-sm" : "text-xs";

  if (src && !failed) {
    return <img src={src} alt={name} className={`${sizeClass} rounded-full object-cover shrink-0`} onError={() => setFailed(true)} />;
  }
  return (
    <div className={`${sizeClass} rounded-full flex items-center justify-center shrink-0`} style={{ backgroundColor: `hsl(${hue}, 60%, 20%)` }}>
      <span className={`${textSize} font-bold`} style={{ color: `hsl(${hue}, 70%, 70%)` }}>{getInitials(name)}</span>
    </div>
  );
}

export default function CandidateProfile({
  candidate: c, onBack, onStageChange, onDelete, onOutreach,
  onTagAdd, onTagRemove, tagInput, setTagInput, showTagInput, setShowTagInput,
  outreachModal, copiedOutreach, onCopyOutreach, onRegenerateOutreach,
}: CandidateProfileProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const enrichment = c.enrichment_data || {};
  const scoreColor = c.score !== null ? getScoreColor(c.score) : undefined;
  const linkedinUrl = enrichment.contact_info?.linkedin || "";

  // Notes state
  const [candidateNotes, setCandidateNotes] = useState<CandidateNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  // Timeline state
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [timelineLimit, setTimelineLimit] = useState(20);
  const [totalTimelineCount, setTotalTimelineCount] = useState(0);

  // Outreach history
  const [outreachHistory, setOutreachHistory] = useState<any[]>([]);
  const [loadingOutreachHistory, setLoadingOutreachHistory] = useState(false);
  const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null);

  // Escape key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onBack(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onBack]);

  // Load data on mount
  useEffect(() => {
    loadCandidateNotes();
    loadTimeline();
    loadOutreachHistory();
  }, [c.id]);

  const loadCandidateNotes = async () => {
    setLoadingNotes(true);
    const { data } = await supabase.from("candidate_notes").select("*").eq("candidate_id", c.id).order("created_at", { ascending: false });
    setCandidateNotes((data as CandidateNote[]) || []);
    setLoadingNotes(false);
  };

  const addNote = async () => {
    if (!user || !newNoteText.trim()) return;
    setAddingNote(true);
    const { error } = await supabase.from("candidate_notes").insert({ candidate_id: c.id, user_id: user.id, content: newNoteText.trim() } as any);
    setAddingNote(false);
    if (error) { toast({ title: "Failed to add note", description: error.message, variant: "destructive" }); }
    else { setNewNoteText(""); loadCandidateNotes(); }
  };

  const deleteNote = async (noteId: string) => {
    const { error } = await supabase.from("candidate_notes").delete().eq("id", noteId);
    if (!error) { loadCandidateNotes(); toast({ title: "Note deleted" }); }
  };

  const loadTimeline = async () => {
    setLoadingTimeline(true);
    const [stageRes, outreachRes] = await Promise.all([
      supabase.from("stage_changes").select("*").eq("candidate_id", c.id).order("created_at", { ascending: false }),
      supabase.from("outreach_history").select("*").eq("candidate_id", c.id).order("created_at", { ascending: false }),
    ]);
    const stageEvents: TimelineEvent[] = ((stageRes.data as any[]) || []).map((sc) => ({
      id: sc.id, type: "stage_change" as const, created_at: sc.created_at, from_stage: sc.from_stage, to_stage: sc.to_stage,
    }));
    const outreachEvents: TimelineEvent[] = ((outreachRes.data as any[]) || []).map((oh) => ({
      id: oh.id, type: "outreach" as const, created_at: oh.created_at, message: oh.message,
    }));
    const allEvents = [...stageEvents, ...outreachEvents];
    if (stageEvents.length === 0) {
      allEvents.push({ id: "added", type: "added", created_at: c.created_at });
    }
    allEvents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (stageEvents.length > 0) {
      allEvents.push({ id: "added", type: "added", created_at: c.created_at });
    }
    setTotalTimelineCount(allEvents.length);
    setTimelineEvents(allEvents);
    setLoadingTimeline(false);
  };

  const loadOutreachHistory = async () => {
    setLoadingOutreachHistory(true);
    const { data } = await supabase.from("outreach_history").select("*").eq("candidate_id", c.id).order("created_at", { ascending: false });
    setOutreachHistory(data || []);
    setLoadingOutreachHistory(false);
  };

  const copyLinkedin = async () => {
    if (!linkedinUrl) return;
    await navigator.clipboard.writeText(linkedinUrl);
    toast({ title: "LinkedIn URL copied" });
  };

  return (
    <div className="animate-slide-up space-y-6 max-w-3xl mx-auto">
      {/* HEADER */}
      <div className="flex items-start gap-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors mt-1">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <AvatarImg src={c.picture_url} name={c.name} size={20} />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-foreground">{c.name}</h1>
          <p className="text-sm font-mono text-primary mt-0.5">
            {c.role || ""}{c.role && c.company ? " at " : ""}{c.company}
          </p>
          {linkedinUrl && (
            <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mt-1 transition-colors">
              <ExternalLink className="h-3 w-3" /> LinkedIn Profile
            </a>
          )}
        </div>
        {c.score !== null && (
          <div className="h-14 w-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0" style={{ backgroundColor: `${scoreColor}20`, color: scoreColor }}>
            {c.score}
          </div>
        )}
      </div>

      {/* ACTION BUTTONS */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => onOutreach(c)} disabled={!c.enrichment_data}>
          <MessageSquare className="h-3.5 w-3.5" /> Generate Outreach
        </Button>
        <Button size="sm" variant="outline" className="text-xs gap-1.5">
          <Bookmark className="h-3.5 w-3.5" /> Add to Watchlist
        </Button>
        {linkedinUrl && (
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={copyLinkedin}>
            <Link className="h-3.5 w-3.5" /> Copy LinkedIn
          </Button>
        )}
        <select
          value={c.stage}
          onChange={(e) => onStageChange(c.id, e.target.value)}
          className="px-3 py-1.5 rounded-md text-xs font-medium bg-secondary border border-border text-foreground"
        >
          {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
        </select>
      </div>

      {/* AI SUMMARY */}
      <div className="glass-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <User className="h-4 w-4 text-primary" /> About
        </h2>
        {enrichment.summary ? (
          <p className="text-sm text-secondary-foreground leading-relaxed">{enrichment.summary}</p>
        ) : (
          <div className="text-sm text-muted-foreground">
            Enrich this candidate to see AI summary.
          </div>
        )}
      </div>

      {/* INSIGHTS */}
      {(enrichment.experience_years != null || enrichment.education || (enrichment.publications && enrichment.publications.length > 0)) && (
        <div className="glass-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" /> Insights
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {enrichment.experience_years != null && (
              <div className="flex items-center gap-2.5 p-3 rounded-lg bg-secondary/60 border border-border">
                <Briefcase className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{enrichment.experience_years} years</p>
                  <p className="text-[10px] text-muted-foreground">Experience</p>
                </div>
              </div>
            )}
            {enrichment.education && (
              <div className="flex items-center gap-2.5 p-3 rounded-lg bg-secondary/60 border border-border">
                <GraduationCap className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {typeof enrichment.education === "string" ? enrichment.education : Array.isArray(enrichment.education) ? enrichment.education[0] : JSON.stringify(enrichment.education)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Education</p>
                </div>
              </div>
            )}
            {enrichment.publications && enrichment.publications.length > 0 && (
              <div className="flex items-center gap-2.5 p-3 rounded-lg bg-secondary/60 border border-border">
                <BookOpen className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{enrichment.publications.length} publication{enrichment.publications.length !== 1 ? "s" : ""}</p>
                  <p className="text-[10px] text-muted-foreground">Research</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SKILLS */}
      {enrichment.skills && Array.isArray(enrichment.skills) && enrichment.skills.length > 0 && (
        <div className="glass-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Code className="h-4 w-4 text-primary" /> Skills
          </h2>
          <div className="flex flex-wrap gap-2">
            {enrichment.skills.map((s: string, i: number) => (
              <span key={i} className="bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-medium">{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* EEA SIGNALS */}
      {enrichment.score_signals && (
        <div className="glass-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> Evidence of Exceptional Ability
          </h2>
          <div className="space-y-2">
            {Object.entries(enrichment.score_signals as Record<string, boolean>).map(([key, val]) => {
              const evidenceText = enrichment.evidence?.[key] || "";
              const truncatedEvidence = evidenceText.length > 100 ? evidenceText.slice(0, 100) + "..." : evidenceText;
              const isUrl = evidenceText.startsWith("http");

              return (
                <div key={key} className={cn("flex items-start gap-3 p-2.5 rounded-lg", val ? "bg-primary/5" : "bg-secondary/40")}>
                  {val ? (
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-xs font-medium", val ? "text-foreground" : "text-muted-foreground/50")}>
                      {SIGNAL_LABELS[key] || key.replace(/_/g, " ")}
                    </p>
                    {evidenceText && val && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {isUrl ? (
                          <a href={evidenceText} target="_blank" rel="noopener noreferrer" className="hover:text-primary inline-flex items-center gap-1 transition-colors">
                            {evidenceText.replace(/https?:\/\/(www\.)?/, "").split("/").slice(0, 2).join("/")}
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        ) : truncatedEvidence}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KEY ACHIEVEMENTS */}
      {enrichment.key_achievements && Array.isArray(enrichment.key_achievements) && enrichment.key_achievements.length > 0 && (
        <div className="glass-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" /> Key Achievements
          </h2>
          <ul className="space-y-2">
            {enrichment.key_achievements.map((a: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-secondary-foreground">
                <span className="text-primary mt-1.5 text-[6px]">●</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* OUTREACH */}
      <div className="glass-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" /> Outreach
        </h2>
        {outreachModal?.id === c.id && !outreachModal.loading ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{outreachModal.message}</p>
            <div className="flex gap-2">
              <Button size="sm" className="text-xs flex-1" onClick={onCopyOutreach}>
                {copiedOutreach ? <><Check className="h-3 w-3 mr-1" /> Copied</> : <><Copy className="h-3 w-3 mr-1" /> Copy</>}
              </Button>
              <Button size="sm" variant="outline" className="text-xs flex-1" onClick={onRegenerateOutreach}>
                <RefreshCw className="h-3 w-3 mr-1" /> Regenerate
              </Button>
            </div>
          </div>
        ) : outreachModal?.id === c.id && outreachModal.loading ? (
          <div className="flex items-center gap-2 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Generating...</span>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="text-xs w-full" onClick={() => onOutreach(c)} disabled={!c.enrichment_data}>
            <MessageSquare className="h-3.5 w-3.5 mr-1" /> Generate Outreach
          </Button>
        )}

        {/* Outreach history */}
        {!loadingOutreachHistory && outreachHistory.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground">Previous ({outreachHistory.length})</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {outreachHistory.map((oh: any) => (
                <div key={oh.id} className="rounded-lg bg-secondary/60 border border-border p-3 space-y-1.5">
                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{oh.message}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">{getRelativeTime(oh.created_at)}</span>
                    <button onClick={async () => { await navigator.clipboard.writeText(oh.message); setCopiedHistoryId(oh.id); toast({ title: "Copied" }); setTimeout(() => setCopiedHistoryId(null), 2000); }} className="text-muted-foreground hover:text-foreground transition-colors">
                      {copiedHistoryId === oh.id ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* TIMELINE */}
      <div className="glass-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" /> Timeline
        </h2>
        {loadingTimeline ? (
          <div className="flex items-center gap-2 py-2"><Loader2 className="h-3 w-3 animate-spin text-primary" /><span className="text-xs text-muted-foreground">Loading...</span></div>
        ) : (
          <div className="space-y-2 pl-3 border-l-2 border-border">
            {timelineEvents.slice(0, timelineLimit).map((evt) => {
              const stageColor = evt.to_stage
                ? evt.to_stage === "offer" ? "hsl(var(--primary))"
                : evt.to_stage === "screen" ? "hsl(48, 100%, 50%)"
                : evt.to_stage === "responded" ? "hsl(200, 100%, 50%)"
                : evt.to_stage === "contacted" ? "hsl(280, 70%, 60%)"
                : "hsl(var(--muted-foreground))"
                : "hsl(var(--primary))";

              return (
                <div key={evt.id} className="relative flex items-start gap-2 -ml-[7px]">
                  <div className="h-3 w-3 rounded-full shrink-0 mt-0.5 border-2 border-background" style={{ backgroundColor: evt.type === "outreach" ? "hsl(var(--primary))" : evt.type === "added" ? "hsl(var(--muted-foreground))" : stageColor }} />
                  <div className="flex-1 min-w-0">
                    {evt.type === "stage_change" && (
                      <p className="text-xs text-secondary-foreground">
                        Moved from <span className="font-medium text-foreground">{STAGE_LABELS[evt.from_stage as Stage] || evt.from_stage}</span> to <span className="font-medium text-foreground">{STAGE_LABELS[evt.to_stage as Stage] || evt.to_stage}</span>
                      </p>
                    )}
                    {evt.type === "outreach" && <p className="text-xs text-secondary-foreground flex items-center gap-1"><MessageSquare className="h-3 w-3 text-primary" /> Outreach generated</p>}
                    {evt.type === "added" && <p className="text-xs text-secondary-foreground">Added to pipeline</p>}
                    <p className="text-[10px] text-muted-foreground">{getRelativeTime(evt.created_at)}</p>
                  </div>
                </div>
              );
            })}
            {totalTimelineCount > timelineLimit && (
              <button onClick={() => setTimelineLimit((l) => l + 20)} className="text-xs text-primary hover:underline ml-2">
                Show more ({totalTimelineCount - timelineLimit} remaining)
              </button>
            )}
          </div>
        )}
      </div>

      {/* NOTES */}
      <div className="glass-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> Notes ({candidateNotes.length})
        </h2>
        <div className="flex gap-2">
          <Textarea
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            placeholder="Add a note..."
            className="bg-secondary border-border text-sm min-h-[40px] flex-1"
            rows={2}
            onFocus={(e) => { e.currentTarget.style.minHeight = "60px"; }}
            onBlur={(e) => { if (!newNoteText) e.currentTarget.style.minHeight = "40px"; }}
          />
          <Button size="sm" className="text-xs shrink-0 self-end" onClick={addNote} disabled={addingNote || !newNoteText.trim()}>
            {addingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />} Add
          </Button>
        </div>
        {loadingNotes ? (
          <div className="flex items-center gap-2 py-2"><Loader2 className="h-3 w-3 animate-spin text-primary" /><span className="text-xs text-muted-foreground">Loading...</span></div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {candidateNotes.map((note) => (
              <div key={note.id} className="rounded-lg bg-secondary/60 border border-border p-3 space-y-1">
                <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{note.content}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{getRelativeTime(note.created_at)}</span>
                  <button onClick={() => deleteNote(note.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Delete note">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TAGS */}
      <div className="glass-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Tag className="h-4 w-4" /> Tags
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {(c.tags || []).map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
              {tag}
              <button onClick={() => onTagRemove(c.id, tag)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
            </span>
          ))}
          {showTagInput === c.id ? (
            <form onSubmit={(e) => { e.preventDefault(); onTagAdd(c.id); }} className="inline-flex">
              <input autoFocus value={tagInput[c.id] || ""} onChange={(e) => setTagInput((prev) => ({ ...prev, [c.id]: e.target.value }))} onBlur={() => { onTagAdd(c.id); setShowTagInput(null); }} placeholder="#tag" className="w-24 px-2.5 py-1 rounded-full text-xs bg-secondary border border-border text-foreground outline-none focus:border-primary font-mono" />
            </form>
          ) : (
            <button onClick={() => setShowTagInput(c.id)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-secondary text-muted-foreground border border-border hover:text-foreground">
              <Plus className="h-3 w-3" /> Add
            </button>
          )}
        </div>
      </div>

      {/* DELETE */}
      <Button variant="destructive" size="sm" className="w-full text-xs" onClick={() => { onDelete(c.id); onBack(); }}>
        <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove Candidate
      </Button>
    </div>
  );
}
