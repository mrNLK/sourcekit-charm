import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "@/lib/supabase-helpers";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  LogOut,
  Users,
  Server,
  Target,
  MessageSquare,
  Save,
  Check,
  Loader2,
  Globe,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Zap,
  Search,
  Sparkles,
  FlaskConical,
  Kanban,
  ArrowRight,
} from "lucide-react";

const SETTING_KEYS = [
  "target_role",
  "target_company",
  "pitch",
  "slack_webhook_url",
  "webhook_url",
] as const;

interface ApiStatus {
  exa: "checking" | "ok" | "error" | "idle";
  github: "checking" | "ok" | "error" | "idle";
  parallel: "checking" | "ok" | "error" | "idle";
}

export default function SettingsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({
    target_role: "",
    target_company: "",
    pitch: "",
    slack_webhook_url: "",
    webhook_url: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>({
    exa: "idle",
    github: "idle",
    parallel: "idle",
  });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase.from("settings").select("key, value").eq("user_id", user.id);
      if (data) {
        const map: Record<string, string> = { ...settings };
        for (const row of data as any[]) {
          if (row.key in map) map[row.key] = row.value || "";
        }
        setSettings(map);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);

    for (const key of SETTING_KEYS) {
      const value = settings[key] || null;
      const { error } = await supabase
        .from("settings")
        .upsert({ user_id: user.id, key, value, updated_at: new Date().toISOString() } as any, {
          onConflict: "user_id,key",
        });
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setSaved(true);
    toast({ title: "Settings saved" });
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogout = async () => {
    const { error } = await signOut();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const checkApis = async () => {
    setApiStatus({ exa: "checking", github: "checking", parallel: "checking" });

    // Check Exa API via a minimal search
    try {
      const { data, error } = await supabase.functions.invoke("search-candidates", {
        body: { action: "create-webset", role: "test", count: 1 },
      });
      if (error || data?.error) {
        setApiStatus((prev) => ({ ...prev, exa: "error" }));
      } else {
        setApiStatus((prev) => ({ ...prev, exa: "ok" }));
      }
    } catch {
      setApiStatus((prev) => ({ ...prev, exa: "error" }));
    }

    // Check Parallel API via research
    try {
      const { data, error } = await supabase.functions.invoke("research-role", {
        body: { action: "start", job_title: "test", company_name: "test" },
      });
      if (error && !data?.taskId) {
        setApiStatus((prev) => ({ ...prev, parallel: "error" }));
      } else {
        setApiStatus((prev) => ({ ...prev, parallel: "ok" }));
      }
    } catch {
      setApiStatus((prev) => ({ ...prev, parallel: "error" }));
    }

    // Check GitHub token via enrich
    try {
      const { data, error } = await supabase.functions.invoke("enrich-candidate", {
        body: { name: "test", company: "test", title: "", linkedin_url: "", description: "" },
      });
      if (error) {
        setApiStatus((prev) => ({ ...prev, github: "error" }));
      } else {
        setApiStatus((prev) => ({ ...prev, github: "ok" }));
      }
    } catch {
      setApiStatus((prev) => ({ ...prev, github: "error" }));
    }
  };

  const statusIcon = (status: ApiStatus[keyof ApiStatus]) => {
    switch (status) {
      case "checking":
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case "ok":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const statusLabel = (status: ApiStatus[keyof ApiStatus]) => {
    switch (status) {
      case "checking":
        return "Checking...";
      case "ok":
        return "Connected";
      case "error":
        return "Not working";
      default:
        return "Not checked";
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">App configuration and API status</p>
      </div>

      {/* How It Works */}
      <div className="glass-card p-5 space-y-4 border border-primary/20">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">How SourceKit Works</p>
        </div>
        <p className="text-xs text-muted-foreground">
          SourceKit finds exceptional engineering candidates from the open internet. Here's the full workflow:
        </p>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0 mt-0.5">1</div>
            <div>
              <div className="flex items-center gap-2">
                <FlaskConical className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Research a Role</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Enter a job title and company (e.g. "Staff ML Engineer" at "Anthropic"). The Parallel API deep-researches
                the role and returns target companies, EEA signals, and search keywords. Takes 2-4 minutes.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-center">
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
          </div>
          <div className="flex items-start gap-3">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0 mt-0.5">2</div>
            <div>
              <div className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Search for Candidates</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                The Exa API searches LinkedIn, GitHub, personal blogs, and the open web to find real people matching your
                criteria. You can pull any candidate from the internet.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-center">
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
          </div>
          <div className="flex items-start gap-3">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0 mt-0.5">3</div>
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Enrich Profiles</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Click "Enrich" on any candidate to pull detailed info — publications, open source contributions,
                career history — and get an EEA (Evidence of Exceptional Ability) score.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-center">
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
          </div>
          <div className="flex items-start gap-3">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0 mt-0.5">4</div>
            <div>
              <div className="flex items-center gap-2">
                <Kanban className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Track in Pipeline</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Save candidates to your pipeline: Sourced → Contacted → Responded → Screen → Offer.
                Generate personalized outreach messages based on their real achievements.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* API Status */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">API Status</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={checkApis}
            disabled={apiStatus.exa === "checking"}
            className="h-7 text-xs"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${apiStatus.exa === "checking" ? "animate-spin" : ""}`} />
            Check All
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Verify that all API integrations are connected. Keys are stored securely in Supabase secrets.
        </p>
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg bg-secondary/60 border border-border px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium text-foreground">Exa API</p>
                <p className="text-[10px] text-muted-foreground">Candidate search across the internet</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {statusIcon(apiStatus.exa)}
              <span className={`text-[10px] ${apiStatus.exa === "ok" ? "text-green-500" : apiStatus.exa === "error" ? "text-red-500" : "text-muted-foreground"}`}>
                {statusLabel(apiStatus.exa)}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-secondary/60 border border-border px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium text-foreground">GitHub Token</p>
                <p className="text-[10px] text-muted-foreground">Profile enrichment and open source data</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {statusIcon(apiStatus.github)}
              <span className={`text-[10px] ${apiStatus.github === "ok" ? "text-green-500" : apiStatus.github === "error" ? "text-red-500" : "text-muted-foreground"}`}>
                {statusLabel(apiStatus.github)}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-secondary/60 border border-border px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium text-foreground">Parallel API</p>
                <p className="text-[10px] text-muted-foreground">Deep role research and analysis</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {statusIcon(apiStatus.parallel)}
              <span className={`text-[10px] ${apiStatus.parallel === "ok" ? "text-green-500" : apiStatus.parallel === "error" ? "text-red-500" : "text-muted-foreground"}`}>
                {statusLabel(apiStatus.parallel)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Role Context */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Target className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Role Context</p>
        </div>
        <p className="text-xs text-muted-foreground">Used for outreach message generation.</p>

        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="targetRole" className="text-xs">Target Role</Label>
              <Input id="targetRole" value={settings.target_role} onChange={(e) => setSettings((s) => ({ ...s, target_role: e.target.value }))} placeholder="Staff ML Engineer" className="bg-secondary border-border" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="targetCompany" className="text-xs">Target Company</Label>
              <Input id="targetCompany" value={settings.target_company} onChange={(e) => setSettings((s) => ({ ...s, target_company: e.target.value }))} placeholder="Anthropic" className="bg-secondary border-border" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pitch" className="text-xs">One-Line Pitch</Label>
              <Input id="pitch" value={settings.pitch} onChange={(e) => setSettings((s) => ({ ...s, pitch: e.target.value }))} placeholder="Building the next generation of AI safety tools" className="bg-secondary border-border" />
            </div>
          </div>
        )}
      </div>

      {/* Slack Integration */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Slack Integration</p>
        </div>
        <p className="text-xs text-muted-foreground">Add a webhook URL to share candidates to a Slack channel.</p>
        {!loading && (
          <div className="space-y-1.5">
            <Label htmlFor="slackWebhook" className="text-xs">Slack Webhook URL</Label>
            <Input id="slackWebhook" value={settings.slack_webhook_url} onChange={(e) => setSettings((s) => ({ ...s, slack_webhook_url: e.target.value }))} placeholder="https://hooks.slack.com/services/..." className="bg-secondary border-border font-mono text-xs" />
          </div>
        )}
      </div>

      {/* Webhook Integration */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Webhook</p>
        </div>
        <p className="text-xs text-muted-foreground">POST candidate data to this URL when stage changes to Contacted.</p>
        {!loading && (
          <div className="space-y-1.5">
            <Label htmlFor="webhookUrl" className="text-xs">Webhook URL</Label>
            <Input id="webhookUrl" value={settings.webhook_url} onChange={(e) => setSettings((s) => ({ ...s, webhook_url: e.target.value }))} placeholder="https://your-api.com/webhook" className="bg-secondary border-border font-mono text-xs" />
          </div>
        )}
      </div>

      {/* Save button */}
      {!loading && (
        <Button className="w-full glow-accent" onClick={handleSave} disabled={saving}>
          {saving ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>) : saved ? (<><Check className="h-4 w-4 mr-2" /> Saved</>) : (<><Save className="h-4 w-4 mr-2" /> Save Settings</>)}
        </Button>
      )}

      {/* Team info */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Users className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">Team</p>
            <p className="text-xs text-muted-foreground">All authenticated users share access to the same pipeline data.</p>
          </div>
        </div>
      </div>

      {/* Account */}
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
