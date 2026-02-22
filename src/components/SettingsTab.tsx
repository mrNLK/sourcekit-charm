import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "@/lib/supabase-helpers";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Users, Server, Target, MessageSquare, Save, Check, Loader2, Globe, Key } from "lucide-react";

const SETTING_KEYS = [
  "target_role",
  "target_company",
  "pitch",
  "slack_webhook_url",
  "webhook_url",
  "exa_api_key",
  "parallel_api_key",
] as const;

export default function SettingsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({
    target_role: "",
    target_company: "",
    pitch: "",
    slack_webhook_url: "",
    exa_api_key: "",
    parallel_api_key: "",
    webhook_url: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">App configuration</p>
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
              <Label htmlFor="targetRole" className="text-xs">
                Target Role
              </Label>
              <Input
                id="targetRole"
                value={settings.target_role}
                onChange={(e) => setSettings((s) => ({ ...s, target_role: e.target.value }))}
                placeholder="Staff ML Engineer"
                className="bg-secondary border-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="targetCompany" className="text-xs">
                Target Company
              </Label>
              <Input
                id="targetCompany"
                value={settings.target_company}
                onChange={(e) => setSettings((s) => ({ ...s, target_company: e.target.value }))}
                placeholder="Anthropic"
                className="bg-secondary border-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pitch" className="text-xs">
                One-Line Pitch
              </Label>
              <Input
                id="pitch"
                value={settings.pitch}
                onChange={(e) => setSettings((s) => ({ ...s, pitch: e.target.value }))}
                placeholder="Building the next generation of AI safety tools"
                className="bg-secondary border-border"
              />
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
            <Label htmlFor="slackWebhook" className="text-xs">
              Slack Webhook URL
            </Label>
            <Input
              id="slackWebhook"
              value={settings.slack_webhook_url}
              onChange={(e) => setSettings((s) => ({ ...s, slack_webhook_url: e.target.value }))}
              placeholder="https://hooks.slack.com/services/..."
              className="bg-secondary border-border font-mono text-xs"
            />
          </div>
        )}
      </div>

      {/* Webhook Integration */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Webhook</p>
        </div>
        <p className="text-xs text-muted-foreground">
          POST candidate data to this URL when stage changes to Contacted.
        </p>
        {!loading && (
          <div className="space-y-1.5">
            <Label htmlFor="webhookUrl" className="text-xs">
              Webhook URL
            </Label>
            <Input
              id="webhookUrl"
              value={settings.webhook_url}
              onChange={(e) => setSettings((s) => ({ ...s, webhook_url: e.target.value }))}
              placeholder="https://your-api.com/webhook"
              className="bg-secondary border-border font-mono text-xs"
            />
          </div>
        )}
      </div>

      {/* Save button */}
      {!loading && (
        <Button className="w-full glow-accent" onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...
            </>
          ) : saved ? (
            <>
              <Check className="h-4 w-4 mr-2" /> Saved
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" /> Save Settings
            </>
          )}
        </Button>
      )}

      {/* API Keys */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Key className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">API Keys</p>
        </div>
        <p className="text-xs text-muted-foreground">Required for candidate search and enrichment.</p>
        {!loading && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="exaApiKey" className="text-xs">
                Exa API Key
              </Label>
              <Input
                id="exaApiKey"
                type="password"
                value={settings.exa_api_key}
                onChange={(e) => setSettings((st) => ({ ...st, exa_api_key: e.target.value }))}
                placeholder="exa-xxxxxxxxxxxxxxxx"
                className="bg-secondary border-border font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parallelApiKey" className="text-xs">
                Parallel API Key
              </Label>
              <Input
                id="parallelApiKey"
                type="password"
                value={settings.parallel_api_key}
                onChange={(e) => setSettings((st) => ({ ...st, parallel_api_key: e.target.value }))}
                placeholder="par-xxxxxxxxxxxxxxxx"
                className="bg-secondary border-border font-mono text-xs"
              />
            </div>
          </div>
        )}
      </div>

      {/* Team info */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Users className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">Team</p>
            <p className="text-xs text-muted-foreground">
              All authenticated users share access to the same pipeline data.
            </p>
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
