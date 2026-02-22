import { Bookmark } from "lucide-react";

export default function WatchlistTab() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Bookmark className="h-12 w-12 text-muted-foreground mb-4" />
      <h2 className="text-lg font-semibold text-foreground mb-2">Watchlist</h2>
      <p className="text-sm text-muted-foreground">Watchlist coming soon</p>
    </div>
  );
}
