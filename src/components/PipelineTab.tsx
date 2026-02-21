import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import CandidateCard from "./CandidateCard";
import { cn } from "@/lib/utils";

interface Candidate {
  id: string;
  name: string;
  company: string;
  role: string | null;
  enrichment_data: any;
  created_at: string;
  created_by: string;
}

export default function PipelineTab() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();
  const touchStartX = useRef(0);
  const touchDeltaX = useRef<Record<string, number>>({});

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
      setCandidates((data as Candidate[]) || []);
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

  const filtered = candidates.filter((c) => {
    const q = filter.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q) || (c.role || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Pipeline</h1>
        <p className="text-sm text-muted-foreground">{candidates.length} saved candidates</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name, company, role..." className="pl-9 bg-secondary border-border" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground text-sm">
          {candidates.length === 0 ? "No candidates saved yet. Search and enrich to get started." : "No candidates match your filter."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
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
                <div className="animate-slide-up">
                  <button
                    onClick={() => setExpandedId(null)}
                    className="w-full flex items-center justify-between glass-card p-4 mb-1"
                  >
                    <span className="text-sm font-semibold text-foreground">Collapse</span>
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <CandidateCard data={c} />
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full mt-1"
                    onClick={() => setDeleteId(c.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Remove from Pipeline
                  </Button>
                </div>
              ) : (
                <button
                  className="w-full glass-card p-4 text-left transition-colors hover:border-primary/30"
                  onClick={() => setExpandedId(c.id)}
                  onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
                  onTouchEnd={(e) => {
                    const delta = e.changedTouches[0].clientX - touchStartX.current;
                    if (delta < -80) setDeleteId(c.id);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{c.name}</p>
                      <p className="font-mono text-xs text-primary">{c.company}</p>
                      {c.role && <p className="text-xs text-muted-foreground">{c.role}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString()}
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
