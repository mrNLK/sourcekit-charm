import { useState, useEffect } from "react";
import { Clock, Search, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface HistoryEntry {
  id: string;
  query_params: any;
  action_type: string;
  result_count: number;
  created_at: string;
}

export default function HistoryTab() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("search_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setHistory(data);
    setLoading(false);
  };

  const deleteEntry = async (id: string) => {
    await (supabase as any).from("search_history").delete().eq("id", id);
    setHistory((prev) => prev.filter((h) => h.id !== id));
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Clock className="h-12 w-12 text-muted-foreground mb-4 animate-pulse" />
        <p className="text-sm text-muted-foreground">Loading history...</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Clock className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">No Search History</h2>
        <p className="text-sm text-muted-foreground">Your past searches will appear here after you run a search.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Search History</h2>
        <button
          onClick={loadHistory}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>
      {history.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-accent/5 transition-colors group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {entry.query_params?.role || entry.query_params?.query || "Search"}
                {entry.query_params?.company ? ` at ${entry.query_params.company}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDate(entry.created_at)}
                {entry.result_count > 0 ? ` \u00b7 ${entry.result_count} results` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={() => deleteEntry(entry.id)}
            className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-destructive transition-all"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
