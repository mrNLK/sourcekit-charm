import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, X, Send, Loader2, ArrowRight, Tag, Mail, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Candidate {
  id: string;
  name: string;
  company: string;
  role: string | null;
  stage: string;
  score: number | null;
  tags: string[] | null;
  enrichment_data: any;
}

interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  actions?: ParsedAction[];
}

interface ParsedAction {
  type: "bulk_stage_change" | "bulk_add_tags" | "generate_bulk_outreach";
  data: any;
  executed?: boolean;
}

interface PipelineChatProps {
  candidates: Candidate[];
  selectedIds: Set<string>;
  onBulkMove: (ids: string[], stage: string) => Promise<void>;
  onBulkTag: (ids: string[], tags: string[]) => Promise<void>;
  onOutreach: (candidate: Candidate) => void;
}

const STAGE_LABELS: Record<string, string> = {
  sourced: "Sourced",
  contacted: "Contacted",
  responded: "Responded",
  screen: "Screen",
  offer: "Offer",
};

const SUGGESTIONS = [
  "Compare the selected candidates",
  "Who are the strongest candidates?",
  "Move top scorers to Screen",
  "Tag selected as #priority",
  "Summarize the pipeline",
];

export default function PipelineChat({
  candidates,
  selectedIds,
  onBulkMove,
  onBulkTag,
  onOutreach,
}: PipelineChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const executeAction = useCallback(async (action: ParsedAction) => {
    try {
      if (action.type === "bulk_stage_change") {
        await onBulkMove(action.data.candidate_ids, action.data.target_stage);
        toast({ title: `Moved ${action.data.candidate_ids.length} candidates to ${STAGE_LABELS[action.data.target_stage] || action.data.target_stage}` });
      } else if (action.type === "bulk_add_tags") {
        await onBulkTag(action.data.candidate_ids, action.data.tags);
        toast({ title: `Added ${action.data.tags.length} tags to ${action.data.candidate_ids.length} candidates` });
      } else if (action.type === "generate_bulk_outreach") {
        const ids = action.data.candidate_ids as string[];
        for (const id of ids) {
          const c = candidates.find((x) => x.id === id);
          if (c) onOutreach(c);
        }
      }
      action.executed = true;
      setMessages((prev) => [...prev]); // force re-render
    } catch (err: any) {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    }
  }, [candidates, onBulkMove, onBulkTag, onOutreach, toast]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    const allMessages = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const selectedArr = Array.from(selectedIds);

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pipeline-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: allMessages,
            candidates: candidates.map((c) => ({
              id: c.id,
              name: c.name,
              company: c.company,
              role: c.role,
              stage: c.stage,
              score: c.score,
              tags: c.tags,
              enrichment_data: c.enrichment_data
                ? { skills: c.enrichment_data.skills, summary: c.enrichment_data.summary?.slice(0, 200) }
                : null,
            })),
            selectedIds: selectedArr,
          }),
        }
      );

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: "Request failed" }));
        throw new Error(errData.error || `HTTP ${resp.status}`);
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let assistantContent = "";
      let toolCalls: ToolCall[] = [];
      let toolCallArgs: Record<number, string> = {};
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;

            // Text content
            if (delta.content) {
              assistantContent += delta.content;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) =>
                    i === prev.length - 1 ? { ...m, content: assistantContent } : m
                  );
                }
                return [...prev, { role: "assistant", content: assistantContent }];
              });
            }

            // Tool calls
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (tc.id) {
                  // New tool call
                  toolCalls[idx] = {
                    id: tc.id,
                    function: { name: tc.function?.name || "", arguments: "" },
                  };
                  toolCallArgs[idx] = "";
                }
                if (tc.function?.arguments) {
                  toolCallArgs[idx] = (toolCallArgs[idx] || "") + tc.function.arguments;
                  if (toolCalls[idx]) {
                    toolCalls[idx].function.arguments = toolCallArgs[idx];
                  }
                }
              }
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Parse tool calls into actions
      const actions: ParsedAction[] = [];
      for (const tc of toolCalls) {
        if (!tc) continue;
        try {
          const args = JSON.parse(tc.function.arguments);
          actions.push({
            type: tc.function.name as ParsedAction["type"],
            data: args,
          });
        } catch {
          console.error("Failed to parse tool call args:", tc.function.arguments);
        }
      }

      // Update final message with actions
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1
              ? { ...m, content: assistantContent || (actions.length > 0 ? "Here are the actions I suggest:" : ""), actions: actions.length > 0 ? actions : undefined }
              : m
          );
        }
        return [
          ...prev,
          {
            role: "assistant",
            content: assistantContent || (actions.length > 0 ? "Here are the actions I suggest:" : "No response received."),
            actions: actions.length > 0 ? actions : undefined,
          },
        ];
      });
    } catch (err: any) {
      toast({
        title: "Chat error",
        description: err.message,
        variant: "destructive",
      });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err.message}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case "bulk_stage_change": return <ArrowRight className="h-3.5 w-3.5" />;
      case "bulk_add_tags": return <Tag className="h-3.5 w-3.5" />;
      case "generate_bulk_outreach": return <Mail className="h-3.5 w-3.5" />;
      default: return null;
    }
  };

  const getActionLabel = (action: ParsedAction) => {
    switch (action.type) {
      case "bulk_stage_change":
        return `Move ${action.data.candidate_ids?.length || 0} to ${STAGE_LABELS[action.data.target_stage] || action.data.target_stage}`;
      case "bulk_add_tags":
        return `Add ${(action.data.tags || []).join(", ")} to ${action.data.candidate_ids?.length || 0} candidates`;
      case "generate_bulk_outreach":
        return `Generate outreach for ${action.data.candidate_ids?.length || 0} candidates`;
      default:
        return "Unknown action";
    }
  };

  return (
    <>
      {/* Toggle button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-4 z-40 h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:scale-105 transition-transform glow-accent"
          title="AI Assistant"
        >
          <MessageSquare className="h-5 w-5" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[480px] max-h-[calc(100vh-8rem)] glass-card flex flex-col glow-accent animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">AI Assistant</span>
              {selectedIds.size > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/15 text-primary">
                  {selectedIds.size} selected
                </span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-3 pt-2">
                <p className="text-xs text-muted-foreground text-center">
                  Ask me to compare, summarize, tag, or take action on your candidates.
                  {selectedIds.size > 0
                    ? ` ${selectedIds.size} candidates selected.`
                    : " Select candidates for bulk actions."}
                </p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-secondary text-muted-foreground border border-border hover:text-foreground hover:border-primary/30 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "text-sm",
                  msg.role === "user"
                    ? "ml-8 bg-primary/10 text-foreground rounded-lg rounded-br-sm px-3 py-2"
                    : "mr-4 text-foreground"
                )}
              >
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <MessageSquare className="h-3 w-3 text-primary" />
                    <span className="text-[10px] font-semibold text-primary">SourceKit AI</span>
                  </div>
                )}
                <div className="whitespace-pre-wrap text-xs leading-relaxed">
                  {msg.content}
                </div>
                {/* Action cards */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {msg.actions.map((action, j) => (
                      <button
                        key={j}
                        onClick={() => !action.executed && executeAction(action)}
                        disabled={action.executed}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left",
                          action.executed
                            ? "bg-primary/5 text-muted-foreground cursor-default"
                            : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
                        )}
                      >
                        {getActionIcon(action.type)}
                        <span className="flex-1">{getActionLabel(action)}</span>
                        {action.executed && (
                          <span className="text-[10px] text-primary">Done</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Thinking...</span>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-3 py-2 border-t border-border shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(input);
              }}
              className="flex gap-2"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about candidates..."
                disabled={isLoading}
                className="flex-1 px-3 py-2 rounded-lg text-xs bg-secondary border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
              />
              <Button
                type="submit"
                size="icon"
                disabled={isLoading || !input.trim()}
                className="h-8 w-8 shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
