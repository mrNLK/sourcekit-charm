import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, candidates, selectedIds } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build candidate context for the system prompt
    const candidateList = (candidates || []).map((c: any) => {
      const selected = selectedIds?.includes(c.id) ? " [SELECTED]" : "";
      const skills = c.enrichment_data?.skills?.slice(0, 5)?.join(", ") || "unknown";
      const score = c.score !== null ? c.score : "unscored";
      return `- ${c.name}${selected} | ${c.role || "Unknown role"} @ ${c.company} | Stage: ${c.stage} | Score: ${score} | Skills: ${skills} | Tags: ${(c.tags || []).join(", ") || "none"}`;
    }).join("\n");

    const selectedCount = selectedIds?.length || 0;

    const systemPrompt = `You are SourceKit AI, a recruiting assistant embedded in a candidate pipeline tool. You help users work with their candidate lists.

You have access to the following tools to perform bulk actions on candidates. Always use tools when the user wants to take action. You can combine text responses with tool calls.

CURRENT PIPELINE (${candidates?.length || 0} candidates, ${selectedCount} selected):
${candidateList || "No candidates in pipeline."}

GUIDELINES:
- Be concise and direct. No recruiter-speak.
- Never use em dashes.
- When comparing candidates, use specific data points (scores, skills, experience).
- When the user says "these" or "selected", refer to candidates marked [SELECTED].
- If no candidates are selected and user wants bulk actions, suggest they select candidates first.
- For outreach, generate short, human messages (under 100 words each).
- For summaries, highlight key differentiators between candidates.
- When suggesting stage changes, explain your reasoning briefly.`;

    const tools = [
      {
        type: "function",
        function: {
          name: "bulk_stage_change",
          description: "Move one or more candidates to a new pipeline stage. Use when user asks to advance, move, or change stage of candidates.",
          parameters: {
            type: "object",
            properties: {
              candidate_ids: { type: "array", items: { type: "string" }, description: "IDs of candidates to move" },
              target_stage: { type: "string", enum: ["sourced", "contacted", "responded", "screen", "offer"], description: "Target pipeline stage" },
              reason: { type: "string", description: "Brief reason for the move" },
            },
            required: ["candidate_ids", "target_stage"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "bulk_add_tags",
          description: "Add tags to one or more candidates. Tags should start with #.",
          parameters: {
            type: "object",
            properties: {
              candidate_ids: { type: "array", items: { type: "string" }, description: "IDs of candidates to tag" },
              tags: { type: "array", items: { type: "string" }, description: "Tags to add (e.g. #priority, #senior)" },
            },
            required: ["candidate_ids", "tags"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "generate_bulk_outreach",
          description: "Generate personalized outreach messages for multiple candidates at once.",
          parameters: {
            type: "object",
            properties: {
              candidate_ids: { type: "array", items: { type: "string" }, description: "IDs of candidates to generate outreach for" },
              context: { type: "string", description: "Additional context for outreach (role, company, pitch)" },
            },
            required: ["candidate_ids"],
            additionalProperties: false,
          },
        },
      },
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        tools,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings > Workspace > Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stream the response back
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error: any) {
    console.error("pipeline-chat error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
