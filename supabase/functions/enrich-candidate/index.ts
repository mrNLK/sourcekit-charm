import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
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

    const { name, title, company, linkedin_url, description, role, handle } = await req.json();

    const candidateName = name || "Unknown";
    const candidateTitle = title || role || "";
    const candidateCompany = company || "";
    const candidateDescription = description || "";
    const candidateLinkedin = linkedin_url || handle || "";

    // Phase 1: 3 parallel Exa searches for real-world context
    const exaApiKey = Deno.env.get("EXA_API_KEY");
    let exaContext = "";

    if (exaApiKey && candidateName !== "Unknown") {
      try {
        const exaSearch = (query: string, numResults: number, maxChars: number) =>
          fetch("https://api.exa.ai/search", {
            method: "POST",
            headers: { "x-api-key": exaApiKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              query, type: "auto", numResults,
              contents: { text: { maxCharacters: maxChars } },
            }),
          });

        const searches = await Promise.all([
          exaSearch(candidateLinkedin || `"${candidateName}" ${candidateCompany}`, 3, 1000),
          exaSearch(`"${candidateName}" (paper OR publication OR arxiv OR conference OR proceedings)`, 3, 800),
          exaSearch(`"${candidateName}" (github.com OR opensource OR "open source" OR contributor)`, 3, 800),
        ]);

        const [profileRes, pubsRes, githubRes] = await Promise.all(
          searches.map(r => r.ok ? r.json() : { results: [] })
        );

        const formatResults = (data: any, label: string) => {
          const results = data.results || [];
          if (!results.length) return "";
          return `\n${label}:\n` + results
            .map((r: any) => `- [${r.title}](${r.url}): ${r.text || ""}`)
            .join("\n");
        };

        exaContext = [
          formatResults(profileRes, "Profile results"),
          formatResults(pubsRes, "Publications and research"),
          formatResults(githubRes, "Open source and GitHub"),
        ].filter(Boolean).join("\n");

        const totalResults = (profileRes.results?.length || 0) + (pubsRes.results?.length || 0) + (githubRes.results?.length || 0);
        console.log(`Exa 3-search returned ${totalResults} total results for "${candidateName}" (profile: ${profileRes.results?.length || 0}, pubs: ${pubsRes.results?.length || 0}, github: ${githubRes.results?.length || 0})`);
      } catch (exaErr) {
        console.warn("Exa search error:", exaErr);
      }
    }

    // Phase 2: LLM synthesis
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are an expert talent researcher. Given information about a candidate, produce a structured enrichment profile. Be factual and concise. Only include information you can reasonably infer from the provided data. Do not fabricate details. When score_signals fields are true, you MUST cite the specific evidence from the web search results. Add a new field evidence as an object with the same keys as score_signals, where each value is a string citing the specific URL or finding that supports the signal. Empty string if no evidence found.`;

    const userPrompt = `Analyze this candidate and return structured enrichment data.

Candidate:
- Name: ${candidateName}
- Title: ${candidateTitle}
- Company: ${candidateCompany}
- LinkedIn: ${candidateLinkedin}
- Description: ${candidateDescription}${exaContext}

Return the enrichment using the provided tool.`;

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
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_enrichment",
              description: "Return structured enrichment data for a candidate.",
              parameters: {
                type: "object",
                properties: {
                  summary: {
                    type: "string",
                    description: "2-3 sentence professional summary of the candidate.",
                  },
                  key_achievements: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of notable achievements, awards, or accomplishments.",
                  },
                  skills: {
                    type: "array",
                    items: { type: "string" },
                    description: "Technical and domain skills.",
                  },
                  experience_years: {
                    type: "number",
                    description: "Estimated years of professional experience. Use 0 if unknown.",
                  },
                  education: {
                    type: "string",
                    description: "Highest education level and institution if known.",
                  },
                  publications: {
                    type: "array",
                    items: { type: "string" },
                    description: "Notable publications or research papers. Empty array if none known.",
                  },
                  score_signals: {
                    type: "object",
                    properties: {
                      has_phd: { type: "boolean" },
                      top_company: { type: "boolean", description: "Worked at a FAANG or top-tier tech company." },
                      has_publications: { type: "boolean" },
                      open_source: { type: "boolean", description: "Notable open source contributions." },
                      conference_speaker: { type: "boolean", description: "Spoke at or published in major conferences." },
                      has_patents: { type: "boolean" },
                      leadership_role: { type: "boolean", description: "Held VP, Director, CTO, Founder, or similar title." },
                      top_university: { type: "boolean", description: "Attended MIT, Stanford, CMU, Berkeley, or similar." },
                    },
                    required: ["has_phd", "top_company", "has_publications", "open_source", "conference_speaker", "has_patents", "leadership_role", "top_university"],
                    additionalProperties: false,
                  },
                  evidence: {
                    type: "object",
                    description: "For each score_signal that is true, cite the specific URL or finding. Empty string if no evidence.",
                    properties: {
                      has_phd: { type: "string" },
                      top_company: { type: "string" },
                      has_publications: { type: "string" },
                      open_source: { type: "string" },
                      conference_speaker: { type: "string" },
                      has_patents: { type: "string" },
                      leadership_role: { type: "string" },
                      top_university: { type: "string" },
                    },
                  },
                },
                required: ["summary", "key_achievements", "skills", "experience_years", "education", "publications", "score_signals", "evidence"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_enrichment" } },
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
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI enrichment failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "AI did not return structured data" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let enrichment: any;
    try {
      enrichment = JSON.parse(toolCall.function.arguments);
    } catch (parseErr) {
      console.error("Failed to parse tool call arguments:", toolCall.function.arguments);
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(enrichment), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("enrich-candidate error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
