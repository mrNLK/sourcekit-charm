import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  console.log("SEARCH-CANDIDATES-V2-DEPLOYED", new Date().toISOString());

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

    const body = await req.json();
    const { action } = body;

    const exaApiKey = Deno.env.get("EXA_API_KEY");
    if (!exaApiKey) {
      return new Response(JSON.stringify({ error: "Exa API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create-webset") {
      const { role, company, location, skills } = body;

      if (!role) {
        return new Response(JSON.stringify({ error: "Role/Title is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const queryParts = [role];
      if (company) queryParts.push(company);
      if (location) queryParts.push(location);
      if (skills) queryParts.push(skills);
      const query = queryParts.join(" ");

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
      console.log("Request URL: https://api.exa.ai/websets/v0/websets");

      const response = await fetch("https://api.exa.ai/websets/v0/websets", {
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

      console.log("Create response status:", response.status);

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

    if (action === "poll-webset") {
      const { websetId } = body;

      if (!websetId) {
        return new Response(JSON.stringify({ error: "websetId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const statusUrl = `https://api.exa.ai/websets/v0/websets/${websetId}`;
      console.log("Polling webset status:", statusUrl);
      const statusRes = await fetch(statusUrl, {
        headers: { "x-api-key": exaApiKey, "Content-Type": "application/json" },
      });
      console.log("Status response:", statusRes.status);

      if (!statusRes.ok) {
        const errorText = await statusRes.text();
        console.error("Exa status API error:", statusRes.status, errorText);
        return new Response(JSON.stringify({ error: `Exa API error: ${statusRes.status}`, details: errorText }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const statusData = await statusRes.json();

      const itemsUrl = `https://api.exa.ai/websets/v0/websets/${websetId}/items`;
      console.log("Fetching items:", itemsUrl);
      const itemsRes = await fetch(itemsUrl, {
        headers: { "x-api-key": exaApiKey, "Content-Type": "application/json" },
      });
      console.log("Items response:", itemsRes.status);

      if (!itemsRes.ok) {
        const errorText = await itemsRes.text();
        console.error("Exa items API error:", itemsRes.status, errorText);
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
        items: items.map((item: any) => {
          const desc = item.properties?.description || item.description || "";

          // Log all available property keys for debugging
          const propKeys = item.properties ? Object.keys(item.properties) : [];
          if (propKeys.length > 0) {
            console.log(`Item ${item.id} properties keys:`, propKeys, JSON.stringify(item.properties));
          }

          // Extract name: try item fields first, then enrichment properties
          let name = item.properties?.name || item.name || "";
          
          // Also check other potential name fields in properties
          if (!name && item.properties) {
            name = item.properties.title || item.properties.full_name || item.properties.person_name || "";
          }

          if (!name && desc) {
            // Pattern 1: "Name is a Title"
            const isMatch = desc.match(/^([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+is\s+/);
            if (isMatch) {
              name = isMatch[1].trim();
            }
            // Pattern 2: "Name, a/an Title"
            if (!name) {
              const commaAMatch = desc.match(/^([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?),\s+(?:a|an)\s+/);
              if (commaAMatch) name = commaAMatch[1].trim();
            }
            // Pattern 3: "Name - Title" or "Name | Title"
            if (!name) {
              const dashMatch = desc.match(/^([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*[-–|]\s+/);
              if (dashMatch) name = dashMatch[1].trim();
            }
            // Pattern 4: "Name works/currently/leads/manages..."
            if (!name) {
              const worksMatch = desc.match(/^([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:works|currently|has been|joined|leads|manages|specializes)/);
              if (worksMatch) name = worksMatch[1].trim();
            }
            // Pattern 5: "Name, Title" (simple comma)
            if (!name) {
              const commaMatch = desc.match(/^([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*,/);
              if (commaMatch) name = commaMatch[1].trim();
            }
            // Pattern 6: Name anywhere in first 200 chars with title context
            if (!name) {
              const snippet = desc.substring(0, 200);
              const titleContextMatch = snippet.match(/([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:is|was|serves as|holds|has)\s+(?:a|an|the)\s+(?:Senior|Staff|Principal|Lead|Head|Chief|Director|VP|Manager|Engineer|Scientist|Researcher)/);
              if (titleContextMatch) name = titleContextMatch[1].trim();
            }
            // Pattern 7: Short capitalized first line
            if (!name) {
              const firstLine = desc.split("\n")[0].trim();
              if (firstLine.length < 60 && /^[A-Z]/.test(firstLine)) {
                const cleaned = firstLine.replace(/[-|:;].*$/, "").trim();
                const words = cleaned.split(/\s+/);
                if (words.length >= 2 && words.length <= 4 && words.every((w: string) => /^[A-Z]/.test(w))) {
                  name = cleaned;
                }
              }
            }
          }

          // Extract URL from description if item.url is empty
          let url = item.url || "";
          if (!url && desc) {
            const linkedinMatch = desc.match(/linkedin\.com\/in\/[a-zA-Z0-9-]+/);
            if (linkedinMatch) url = "https://" + linkedinMatch[0];
          }

          return {
            id: item.id || crypto.randomUUID(),
            url,
            name,
            description: desc,
            highlights: item.highlights || [],
            source: item.sourceUrl || url || "",
          };
        }),
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
