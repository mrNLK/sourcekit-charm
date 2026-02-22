import { Clock } from "lucide-react";

export default function HistoryTab() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Clock className="h-12 w-12 text-muted-foreground mb-4" />
      <h2 className="text-lg font-semibold text-foreground mb-2">Search History</h2>
      <p className="text-sm text-muted-foreground">Search history coming soon</p>
    </div>
  );
}
