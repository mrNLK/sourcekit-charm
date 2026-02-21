import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import CandidateCard from "./CandidateCard";

export default function SearchTab() {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Candidate Search</h1>
        <p className="text-sm text-muted-foreground">Enrich candidate profiles from external data</p>
      </div>

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
    </div>
  );
}
