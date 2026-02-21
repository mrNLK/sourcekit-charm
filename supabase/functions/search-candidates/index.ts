import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildLinkedInQuery(role: string, company?: string, location?: string, skills?: string): string {
  let q = role;
  if (skills) q += ` ${skills}`;
  if (company) q += ` at ${company}`;
  if (location) q += ` ${location}`;
  return q;
}

function buildGitHubQuery(role: string, skills?: string): string {
  let q = role;
  if (skills) q += ` ${skills}`;
  return q;
}

function detectSource(url: string): string {
  if (url.includes("linkedin.com")) return "linkedin";
  if (url.includes("github.com")) return "github";
  if (url.includes("scholar.google.com")) return "scholar";
  if (url.includes("twitter.com") || url.includes("x.com")) return "twitter";
  return "other";
}

function cleanName(title: string, source: string): string {
  let name = title || "Unknown";
  if (source === "linkedin") {
    name = name.replace(/\s*[\-\|–]\s*LinkedIn.*$/i, "").trim();
    // Remove trailing role descriptions like "- Staff Engineer at Google"
    name = name.replace(/\s*[\-–]\s+.*$/, "").trim();
  }
  if (source === "github") {
    // GitHub titles are often "username (Full Name)" or "Full Name"
    name = name.replace(/^GitHub\s*-\s*/i, "").trim();
    // Remove repo-style titles
    name = name.replace(/^Search code.*$/i, "").trim() || name;
  }
  return name || "Unknown";
}

interface ExaResult {
  id?: string;
  title?: string;
  url?: string;
  text?: string;
  highlights?: string[];
}

async function searchExa(
  apiKey: string,
  query: string,
  domains: string[],
  numResults: number,
  signal: AbortSignal
): Promise<ExaResult[]> {
  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      type: "neural",
      numResults,
      includeDomains: domains,
      contents: { text: true },
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Exa API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.results || [];
}

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

    const { role, company, location, skills } = await req.json();

    if (!role) {
      return new Response(JSON.stringify({ error: "Role/Title is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const exaApiKey = Deno.env.get("EXA_API_KEY");
    if (!exaApiKey) {
      return new Response(JSON.stringify({ error: "Exa API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      // Run LinkedIn and GitHub searches in parallel
      const linkedInQuery = buildLinkedInQuery(role, company, location, skills);
      const githubQuery = buildGitHubQuery(role, skills);

      const [linkedInResults, githubResults] = await Promise.all([
        searchExa(exaApiKey, linkedInQuery, ["linkedin.com/in"], 20, controller.signal),
        searchExa(exaApiKey, githubQuery, ["github.com"], 10, controller.signal),
      ]);

      clearTimeout(timeout);

      // Merge results: LinkedIn first, then GitHub, dedup by URL
      const seenUrls = new Set<string>();
      const candidates: any[] = [];

      const processResult = (r: ExaResult) => {
        const url = r.url || "";
        if (!url || seenUrls.has(url)) return;
        seenUrls.add(url);

        const source = detectSource(url);
        const name = cleanName(r.title || "", source);

        candidates.push({
          name,
          company: "",
          role: "",
          summary: r.text ? r.text.substring(0, 300) : "",
          url,
          source,
          exa_id: r.id || "",
        });
      };

      // LinkedIn first for priority
      for (const r of linkedInResults) processResult(r);
      for (const r of githubResults) processResult(r);

      return new Response(JSON.stringify(candidates), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (fetchError: any) {
      clearTimeout(timeout);
      if (fetchError.name === "AbortError") {
        return new Response(JSON.stringify({ error: "Exa API timed out (60s)" }), {
          status: 504,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw fetchError;
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
