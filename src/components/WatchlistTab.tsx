import { useState, useEffect } from "react";
import { Bookmark, Search, RotateCcw, Trash2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface WatchlistEntry {
  id: string;
  name: string;
  company: string;
  role: string;
  url: string;
  notes: string;
  created_at: string;
}

export default function WatchlistTab() {
  const [items, setItems] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", role: "", url: "", notes: "" });

  useEffect(() => {
    loadWatchlist();
  }, []);

  const loadWatchlist = async () => {
    setLoading(true);
    const { data } = await (supabase as any).from("watchlist").select("*").order("created_at", { ascending: false });
    if (data) setItems(data);
    setLoading(false);
  };

  const addItem = async () => {
    if (!form.name.trim()) return;
    await (supabase as any).from("watchlist").insert([form]);
    setForm({ name: "", company: "", role: "", url: "", notes: "" });
    setShowAdd(false);
    loadWatchlist();
  };

  const removeItem = async (id: string) => {
    await (supabase as any).from("watchlist").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Bookmark className="h-12 w-12 text-muted-foreground mb-4 animate-pulse" />
        <p className="text-sm text-muted-foreground">Loading watchlist...</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Watchlist</h2>
        <div className="flex gap-2">
          <button
            onClick={loadWatchlist}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
          >
            + Add
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="p-4 rounded-lg border border-border bg-card space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Name *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground"
            />
            <input
              placeholder="Company"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              className="px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground"
            />
            <input
              placeholder="Role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground"
            />
            <input
              placeholder="LinkedIn URL"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              className="px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground"
            />
          </div>
          <input
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowAdd(false)}
              className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={addItem}
              className="text-xs bg-primary text-primary-foreground px-4 py-1.5 rounded-md hover:bg-primary/90"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {items.length === 0 && !showAdd ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Bookmark className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">No Watchlist Items</h2>
          <p className="text-sm text-muted-foreground">Add candidates you want to track over time.</p>
        </div>
      ) : (
        items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-accent/5 transition-colors group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Bookmark className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {item.name}
                  {item.company ? ` at ${item.company}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.role || "No role specified"}
                  {item.notes ? ` \u2022 ${item.notes}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-muted-foreground hover:text-primary"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <button
                onClick={() => removeItem(item.id)}
                className="p-1.5 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
