import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface CandidateCardProps {
  data: any;
  onSave?: () => void;
  isSaved?: boolean;
  saving?: boolean;
}

function CollapsibleSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-3 text-sm font-semibold text-foreground hover:text-primary transition-colors"
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="pb-3 text-sm text-secondary-foreground">{children}</div>}
    </div>
  );
}

export default function CandidateCard({ data, onSave, isSaved, saving }: CandidateCardProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const enrichment = data.enrichment_data || data;
  const name = data.name || enrichment.name || "Unknown";
  const company = data.company || enrichment.company || "";
  const role = data.role || enrichment.role || "";

  const buildTextSummary = () => {
    const lines = [`${name} — ${company}`];
    if (role) lines.push(`Role: ${role}`);
    if (enrichment.summary) lines.push(`\nSummary: ${enrichment.summary}`);
    if (enrichment.work_history) lines.push(`\nWork History:\n${JSON.stringify(enrichment.work_history, null, 2)}`);
    if (enrichment.github_signal) lines.push(`\nGitHub Signal:\n${JSON.stringify(enrichment.github_signal, null, 2)}`);
    if (enrichment.evidence_of_exceptional_ability) lines.push(`\nEvidence of Exceptional Ability:\n${JSON.stringify(enrichment.evidence_of_exceptional_ability, null, 2)}`);
    if (enrichment.contact_info) lines.push(`\nContact: ${JSON.stringify(enrichment.contact_info, null, 2)}`);
    return lines.join("\n");
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(buildTextSummary());
    setCopied(true);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-card p-5 animate-slide-up space-y-1">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-foreground">{name}</h2>
        <p className="font-mono text-sm text-primary">{company}</p>
        {role && <p className="text-sm text-muted-foreground">{role}</p>}
      </div>

      {enrichment.summary && (
        <CollapsibleSection title="Summary">
          <p className="leading-relaxed">{enrichment.summary}</p>
        </CollapsibleSection>
      )}

      {enrichment.work_history && (
        <CollapsibleSection title="Work History" defaultOpen={false}>
          {Array.isArray(enrichment.work_history) ? (
            <ul className="space-y-2">
              {enrichment.work_history.map((item: any, i: number) => (
                <li key={i} className="font-mono-data text-xs">
                  {typeof item === "string" ? item : JSON.stringify(item)}
                </li>
              ))}
            </ul>
          ) : (
            <pre className="font-mono-data text-xs whitespace-pre-wrap">{JSON.stringify(enrichment.work_history, null, 2)}</pre>
          )}
        </CollapsibleSection>
      )}

      {enrichment.github_signal && (
        <CollapsibleSection title="GitHub Signal" defaultOpen={false}>
          <pre className="font-mono-data text-xs whitespace-pre-wrap">{JSON.stringify(enrichment.github_signal, null, 2)}</pre>
        </CollapsibleSection>
      )}

      {enrichment.evidence_of_exceptional_ability && (
        <CollapsibleSection title="Evidence of Exceptional Ability" defaultOpen={false}>
          {Array.isArray(enrichment.evidence_of_exceptional_ability) ? (
            <ul className="space-y-1 list-disc pl-4">
              {enrichment.evidence_of_exceptional_ability.map((item: any, i: number) => (
                <li key={i} className="text-xs">{typeof item === "string" ? item : JSON.stringify(item)}</li>
              ))}
            </ul>
          ) : (
            <pre className="font-mono-data text-xs whitespace-pre-wrap">{JSON.stringify(enrichment.evidence_of_exceptional_ability, null, 2)}</pre>
          )}
        </CollapsibleSection>
      )}

      {enrichment.contact_info && (
        <CollapsibleSection title="Contact Info" defaultOpen={false}>
          <pre className="font-mono-data text-xs whitespace-pre-wrap">{JSON.stringify(enrichment.contact_info, null, 2)}</pre>
        </CollapsibleSection>
      )}

      <div className="flex gap-2 pt-3">
        {onSave && (
          <Button onClick={onSave} disabled={isSaved || saving} className="flex-1" size="sm">
            {saving ? (
              <span className="animate-pulse-glow">Saving...</span>
            ) : isSaved ? (
              <><Check className="h-4 w-4 mr-1" /> Saved</>
            ) : (
              <><Save className="h-4 w-4 mr-1" /> Save to Pipeline</>
            )}
          </Button>
        )}
        <Button onClick={handleCopy} variant="secondary" size="sm" className="flex-1">
          {copied ? <><Check className="h-4 w-4 mr-1" /> Copied</> : <><Copy className="h-4 w-4 mr-1" /> Copy Profile</>}
        </Button>
      </div>
    </div>
  );
}
