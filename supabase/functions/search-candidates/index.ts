import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// GitHub noise paths to filter out
const GITHUB_NOISE = [
  "/search", "/topics", "/collections", "/orgs", "/repos",
  "/issues", "/pulls", "/explore", "/features", "/marketplace",
  "/settings", "/trending", "/events", "/sponsors", "/login",
  "/signup", "/pricing", "/enterprise", "/about", "/readme",
];

const BOILERPLATE_PATTERNS = [
  /skip to content/i,
  /toggle navigation/i,
  /search or jump to/i,
  /sign in/i,
  /join now/i,
  /navigation menu/i,
  /appearance settings/i,
  /\[sign in\]/i,
  /search code, repositories/i,
  /search clear/i,
  /search syntax tips/i,
  /you signed in with another tab/i,
  /reload to refresh your session/i,
];

function isValidGitHubProfile(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname !== "github.com") return false;
    const path = u.pathname.replace(/^\//, "").replace(/\/$/, "");
    if (!path) return false;
    const segments = path.split("/");
    // Filter known noise paths (first segment is a noise keyword)
    if (GITHUB_NOISE.some((noise) => `/${segments[0]}` === noise)) return false;
    // Allow user profiles (1 segment) and user repos (2 segments)
    if (segments.length > 2) return false;
    return true;
  } catch {
    return false;
  }
}

function isValidLinkedInProfile(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.includes("linkedin.com") && u.pathname.startsWith("/in/");
  } catch {
    return false;
  }
}

function extractNameFromLinkedInUrl(url: string): string {
  try {
    const u = new URL(url);
    const slug = u.pathname.replace("/in/", "").replace(/\/$/, "");
    // Remove trailing hash codes like "john-doe-123abc" -> "john-doe"
    const cleaned = slug.replace(/-[a-f0-9]{6,}$/i, "").replace(/-\d+[a-z]*$/i, "");
    return cleaned
      .split("-")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  } catch {
    return "Unknown";
  }
}

function extractNameFromGitHub(title: string, url: string): string {
  // Try to get a name from the title
  let name = (title || "").trim();
  // Strip common prefixes/suffixes
  name = name.replace(/^GitHub\s*[-–:]\s*/i, "");
  name = name.replace(/\s*[-–:]\s*GitHub$/i, "");
  name = name.replace(/^Search code.*$/i, "");

  if (name && name.length > 1 && !name.toLowerCase().startsWith("search")) {
    return name;
  }

  // Fallback: extract username from URL (first path segment)
  try {
    const u = new URL(url);
    const segments = u.pathname.replace(/^\//, "").replace(/\/$/, "").split("/");
    return segments[0] || "Unknown";
  } catch {
    return "Unknown";
  }
}

function cleanSnippet(text: string | undefined, source: string): string {
  if (!text) return "View profile for details";

  let cleaned = text.trim();

  // Check for boilerplate
  const hasBoilerplate = BOILERPLATE_PATTERNS.some((p) => p.test(cleaned));
  if (hasBoilerplate) {
    // Try to extract meaningful content after boilerplate
    // Split on common separators and find first non-boilerplate segment
    const segments = cleaned.split(/(?:##|#|\n\n|\n)/).filter(Boolean);
    const meaningful = segments.find(
      (s) => s.trim().length > 20 && !BOILERPLATE_PATTERNS.some((p) => p.test(s))
    );
    cleaned = meaningful?.trim() || "View profile for details";
  }

  // For LinkedIn, extract the headline (usually first line)
  if (source === "linkedin" && cleaned.length > 5) {
    const lines = cleaned.split(/\n/).filter((l) => l.trim().length > 3);
    const headline = lines.find(
      (l) => !l.match(/sign in|join now|linkedin/i) && l.trim().length > 5
    );
    if (headline) cleaned = headline.trim();
  }

  // Truncate to 120 chars
  if (cleaned.length > 120) {
    cleaned = cleaned.substring(0, 120).replace(/\s+\S*$/, "") + "...";
  }

  return cleaned || "View profile for details";
}

function detectSource(url: string): string {
  if (url.includes("linkedin.com")) return "linkedin";
  if (url.includes("github.com")) return "github";
  return "other";
}

// Extract tags from GitHub profile text
function extractGitHubTags(text: string): string[] {
  const tags: string[] = [];
  const starsMatch = text.match(/(\d+)\s*stars?/i);
  if (starsMatch) tags.push(`${starsMatch[1]} stars`);
  const followersMatch = text.match(/(\d+)\s*followers?/i);
  if (followersMatch) tags.push(`${followersMatch[1]} followers`);
  const reposMatch = text.match(/(\d+)\s*repositor/i);
  if (reposMatch) tags.push(`${reposMatch[1]} repos`);
  // Language tags
  const langs = ["Python", "JavaScript", "TypeScript", "Rust", "Go", "Java", "C++", "Julia", "R"];
  for (const lang of langs) {
    if (text.includes(lang)) tags.push(lang);
  }
  return tags.slice(0, 5);
}

// Determine confidence: green for clean profile URL, yellow for uncertain
function getConfidence(url: string, source: string): "high" | "medium" | "low" {
  if (source === "linkedin" && isValidLinkedInProfile(url)) return "high";
  if (source === "github" && isValidGitHubProfile(url)) return "high";
  return "medium";
}

interface ExaResult {
  id?: string;
  title?: string;
  url?: string;
  text?: string;
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
      // Build queries - target people profiles specifically
      let linkedInQuery = `${role} profile`;
      if (skills) linkedInQuery += ` ${skills}`;
      if (company) linkedInQuery += ` at ${company}`;
      if (location) linkedInQuery += ` ${location}`;

      // GitHub query: search for people, not repos
      let githubQuery = `${role} portfolio personal profile`;
      if (skills) githubQuery += ` ${skills}`;

      // Run both searches in parallel
      // Use linkedin.com for broader results, then filter to /in/ profiles
      const [linkedInResults, githubResults] = await Promise.all([
        searchExa(exaApiKey, linkedInQuery, ["linkedin.com"], 20, controller.signal),
        searchExa(exaApiKey, githubQuery, ["github.com"], 15, controller.signal),
      ]);

      clearTimeout(timeout);

      console.log(`LinkedIn results: ${linkedInResults.length}, GitHub results: ${githubResults.length}`);
      console.log("LinkedIn URLs:", linkedInResults.map(r => r.url).join(", "));
      console.log("GitHub URLs:", githubResults.map(r => r.url).join(", "));

      // Process and filter results
      const seenUrls = new Set<string>();
      const candidates: any[] = [];

      // Process LinkedIn results
      for (const r of linkedInResults) {
        const url = r.url || "";
        if (!url || seenUrls.has(url)) continue;
        if (!isValidLinkedInProfile(url)) continue;
        seenUrls.add(url);

        const source = "linkedin";
        const name = extractNameFromLinkedInUrl(url);
        const snippet = cleanSnippet(r.text, source);
        const confidence = getConfidence(url, source);

        // Extract headline from LinkedIn text
        let headline = "";
        if (r.text) {
          const lines = r.text.split(/\n/).filter((l) => l.trim().length > 5 && !l.match(/sign in|join|linkedin/i));
          headline = lines[0]?.trim().substring(0, 80) || "";
        }

        candidates.push({
          name,
          company: "",
          role: headline,
          summary: snippet,
          url,
          source,
          confidence,
          tags: [],
          exa_id: r.id || "",
        });
      }

      // Process GitHub results - filter to actual user profiles
      for (const r of githubResults) {
        const url = r.url || "";
        if (!url || seenUrls.has(url)) continue;
        if (!isValidGitHubProfile(url)) continue;
        seenUrls.add(url);

        const source = "github";
        const name = extractNameFromGitHub(r.title || "", url);
        const snippet = cleanSnippet(r.text, source);
        const confidence = getConfidence(url, source);
        const tags = extractGitHubTags(r.text || "");

        candidates.push({
          name,
          company: "",
          role: "",
          summary: snippet,
          url,
          source,
          confidence,
          tags,
          exa_id: r.id || "",
        });
      }

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
