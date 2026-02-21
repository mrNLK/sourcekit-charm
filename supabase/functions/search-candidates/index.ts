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
    // Auth check
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

    const body = await req.json();
    const { action } = body;

    const exaApiKey = Deno.env.get("EXA_API_KEY");
    if (!exaApiKey) {
      return new Response(JSON.stringify({ error: "Exa API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: create-webset - initiates a Websets search and returns the webset ID
    if (action === "create-webset") {
      const { role, company, location, skills } = body;

      if (!role) {
        return new Response(JSON.stringify({ error: "Role/Title is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Build query string
      const queryParts = [role];
      if (company) queryParts.push(company);
      if (location) queryParts.push(location);
      if (skills) queryParts.push(skills);
      const query = queryParts.join(" ");

      // Build criteria array
      const criteria: { description: string }[] = [
        { description: `This person currently works as a ${role} or similar title` },
      ];
      if (company) {
        criteria.push({ description: `This person works at ${company} or a direct competitor` });
      }
      if (location) {
        criteria.push({ description: `This person is based in ${location}` });
      }
      if (skills) {
        criteria.push({ description: `This person has experience with ${skills}` });
      }

      console.log("Creating Exa Webset:", JSON.stringify({ query, criteria }));

      const response = await fetch("https://api.exa.ai/websets", {
        method: "POST",
        headers: {
          "x-api-key": exaApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          search: {
            query,
            count: 20,
            entity: { type: "person" },
            criteria,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Exa Websets API error:", response.status, errorText);
        return new Response(JSON.stringify({ error: `Exa API error: ${response.status}`, details: errorText }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      console.log("Webset created:", data.id, "status:", data.status);

      return new Response(JSON.stringify({ websetId: data.id, status: data.status || "searching" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: poll-webset - fetches items for a given webset ID
    if (action === "poll-webset") {
      const { websetId } = body;

      if (!websetId) {
        return new Response(JSON.stringify({ error: "websetId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // First check webset status
      const statusRes = await fetch(`https://api.exa.ai/websets/${websetId}`, {
        headers: { "x-api-key": exaApiKey, "Content-Type": "application/json" },
      });

      if (!statusRes.ok) {
        const errorText = await statusRes.text();
        return new Response(JSON.stringify({ error: `Exa API error: ${statusRes.status}`, details: errorText }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const statusData = await statusRes.json();

      // Fetch items
      const itemsRes = await fetch(`https://api.exa.ai/websets/${websetId}/items`, {
        headers: { "x-api-key": exaApiKey, "Content-Type": "application/json" },
      });

      if (!itemsRes.ok) {
        const errorText = await itemsRes.text();
        return new Response(JSON.stringify({ error: `Exa items API error: ${itemsRes.status}`, details: errorText }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const itemsData = await itemsRes.json();
      const items = itemsData.data || itemsData.items || [];

      console.log(`Webset ${websetId}: status=${statusData.status}, items=${items.length}`);

      return new Response(JSON.stringify({
        websetStatus: statusData.status || "unknown",
        items: items.map((item: any) => ({
          id: item.id,
          url: item.url || "",
          name: item.properties?.name || "",
          description: item.properties?.description || "",
        })),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use 'create-webset' or 'poll-webset'" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Edge function error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
