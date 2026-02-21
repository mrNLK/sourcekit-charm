import { useAuth } from "@/hooks/useAuth";
import { signOut } from "@/lib/supabase-helpers";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Users, Server } from "lucide-react";

export default function SettingsTab() {
  const { user } = useAuth();
  const { toast } = useToast();

  const handleLogout = async () => {
    const { error } = await signOut();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">App configuration</p>
      </div>

      <div className="glass-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Server className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">Enrichment API</p>
            <p className="text-xs text-muted-foreground font-mono">Configured via backend secret</p>
            <p className="text-xs text-muted-foreground mt-1">
              The enrichment API URL is securely stored as a backend secret and used by the server-side function.
            </p>
          </div>
        </div>
      </div>

      <div className="glass-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Users className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">Team</p>
            <p className="text-xs text-muted-foreground">All authenticated users share access to the same pipeline data.</p>
          </div>
        </div>
      </div>

      <div className="glass-card p-5 space-y-3">
        <p className="text-sm text-muted-foreground">Signed in as</p>
        <p className="text-sm font-mono text-foreground truncate">{user?.email}</p>
        <Button variant="destructive" className="w-full" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" /> Sign Out
        </Button>
      </div>
    </div>
  );
}
