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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { job_title, company_name, job_spec } = await req.json();

    if (!job_title || !company_name) {
      return new Response(
        JSON.stringify({ error: "Job title and company name are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const parallelApiKey = Deno.env.get("PARALLEL_API_KEY");
    if (!parallelApiKey) {
      return new Response(
        JSON.stringify({ error: "Parallel API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const researchPrompt = `For the role of ${job_title} at ${company_name}: 1) Identify 15-20 specific companies where top talent for this exact role currently works. Include direct competitors, adjacent companies, and research labs. For each company, explain WHY their employees are relevant. 2) Define what Evidence of Exceptional Ability (EEA) looks like for this role - specific publications, conference talks (NeurIPS, ICML, etc), open source projects, patents, awards, GitHub contributions, or other verifiable signals that put someone in the top 5-10% of practitioners. 3) List specific search keywords, skills, and criteria that would identify exceptional candidates for this role. If a full job spec is provided, use it for additional context: ${job_spec || "N/A"}`;

    // Create research task
    const createRes = await fetch("https://api.parallel.ai/v1/research", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${parallelApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: researchPrompt,
        processor: "pro",
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      return new Response(
        JSON.stringify({
          error: `Parallel API error: ${createRes.status}`,
          details: errText,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const task = await createRes.json();
    const taskId = task.id;

    if (!taskId) {
      return new Response(
        JSON.stringify({ error: "No task ID returned from Parallel API", details: JSON.stringify(task) }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Poll for completion (max 3 minutes, every 5 seconds)
    const maxAttempts = 36;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 5000));

      const pollRes = await fetch(
        `https://api.parallel.ai/v1/research/${taskId}`,
        {
          headers: {
            Authorization: `Bearer ${parallelApiKey}`,
          },
        }
      );

      if (!pollRes.ok) {
        const errText = await pollRes.text();
        return new Response(
          JSON.stringify({
            error: `Parallel API poll error: ${pollRes.status}`,
            details: errText,
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const pollData = await pollRes.json();

      if (pollData.status === "complete" || pollData.status === "completed") {
        return new Response(JSON.stringify(pollData), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (pollData.status === "failed" || pollData.status === "error") {
        return new Response(
          JSON.stringify({
            error: "Research task failed",
            details: JSON.stringify(pollData),
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Timeout
    return new Response(
      JSON.stringify({ error: "Research timed out after 3 minutes" }),
      {
        status: 504,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
