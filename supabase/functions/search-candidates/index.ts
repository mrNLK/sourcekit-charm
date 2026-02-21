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

    // Build a natural language query from the fields
    let query = role;
    if (company) query += ` at ${company} companies`;
    if (location) query += ` in ${location}`;
    if (skills) query += ` with ${skills} experience`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${exaApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          type: "neural",
          numResults: 20,
          contents: {
            text: true,
            highlights: true,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        return new Response(
          JSON.stringify({ error: `Exa API error: ${response.status}`, details: errorText }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();

      // Map Exa results to a consistent candidate format
      const candidates = (data.results || []).map((r: any) => ({
        name: r.title || "Unknown",
        company: "",
        role: "",
        summary: r.text ? r.text.substring(0, 300) : "",
        url: r.url || "",
        highlights: r.highlights || [],
        exa_id: r.id || "",
      }));

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
