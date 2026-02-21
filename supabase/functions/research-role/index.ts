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

    const body = await req.json();
    const action = body.action || "start";
    console.log("research-role called with action:", action, "body:", JSON.stringify(body));

    // ---- ACTION: START ----
    if (action === "start") {
      const { job_title, company_name, job_spec } = body;

      if (!job_title || !company_name) {
        return new Response(
          JSON.stringify({ error: "Job title and company name are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const parallelApiKey = Deno.env.get("PARALLEL_API_KEY");
      console.log("PARALLEL_API_KEY exists:", !!parallelApiKey);

      if (!parallelApiKey) {
        return new Response(
          JSON.stringify({ error: "Parallel API key not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const researchPrompt = `For the role of ${job_title} at ${company_name}: 1) Identify 15-20 specific companies where top talent for this exact role currently works. Include direct competitors, adjacent companies, and research labs. For each company, explain WHY their employees are relevant. 2) Define what Evidence of Exceptional Ability (EEA) looks like for this role - specific publications, conference talks (NeurIPS, ICML, etc), open source projects, patents, awards, GitHub contributions, or other verifiable signals that put someone in the top 5-10% of practitioners. 3) List specific search keywords, skills, and criteria that would identify exceptional candidates for this role. If a full job spec is provided, use it for additional context: ${job_spec || "N/A"}`;

      const requestUrl = "https://api.parallel.ai/v1/tasks/runs";
      const requestBody = JSON.stringify({
        input: researchPrompt,
        processor: "pro-fast",
        task_spec: {
          output_schema: {
            type: "text",
          },
        },
      });

      console.log("Parallel API Request:", {
        url: requestUrl,
        bodyLength: requestBody.length,
      });

      const createRes = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "x-api-key": parallelApiKey,
          "Content-Type": "application/json",
        },
        body: requestBody,
      });

      console.log("Parallel API response status:", createRes.status);

      if (!createRes.ok) {
        const errText = await createRes.text();
        console.error("Parallel API error response:", errText);
        return new Response(
          JSON.stringify({ error: `Parallel API error: ${createRes.status}`, details: errText }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const task = await createRes.json();
      const runId = task.run_id || task.id;
      console.log("Parallel API task created, runId:", runId, "full response:", JSON.stringify(task));

      if (!runId) {
        return new Response(
          JSON.stringify({ error: "No task ID returned from Parallel API", details: JSON.stringify(task) }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Save to research_tasks table
      const { data: row, error: insertError } = await supabase
        .from("research_tasks")
        .insert({
          run_id: runId,
          job_title,
          company_name,
          status: "pending",
          created_by: user.id,
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("Failed to save research task:", insertError.message);
      }

      console.log("Research task saved, dbId:", row?.id);

      return new Response(
        JSON.stringify({ taskId: runId, dbId: row?.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- ACTION: POLL ----
    if (action === "poll") {
      const { run_id } = body;

      if (!run_id) {
        return new Response(
          JSON.stringify({ error: "run_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const parallelApiKey = Deno.env.get("PARALLEL_API_KEY");
      if (!parallelApiKey) {
        return new Response(
          JSON.stringify({ error: "Parallel API key not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pollUrl = `https://api.parallel.ai/v1/tasks/runs/${run_id}`;
      console.log("Polling:", pollUrl);

      const pollRes = await fetch(pollUrl, {
        method: "GET",
        headers: { "x-api-key": parallelApiKey },
      });

      console.log("Poll response status:", pollRes.status);

      if (!pollRes.ok) {
        const errText = await pollRes.text();
        console.error("Poll error response:", errText);
        return new Response(
          JSON.stringify({ status: "error", error: `Poll error: ${pollRes.status}`, details: errText }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pollData = await pollRes.json();
      console.log("Poll status:", pollData.status);

      if (pollData.status === "completed" || pollData.status === "complete") {
        // Fetch the actual result from the /result endpoint
        const resultUrl = `https://api.parallel.ai/v1/tasks/runs/${run_id}/result`;
        console.log("Task completed, fetching result from:", resultUrl);
        const resultRes = await fetch(resultUrl, {
          method: "GET",
          headers: { "x-api-key": parallelApiKey },
        });
        let resultData: any = null;
        let resultText = "";
        if (resultRes.ok) {
          resultData = await resultRes.json();
          // The result may be a string or an object with output/text fields
          if (typeof resultData === "string") {
            resultText = resultData;
          } else {
            resultText = resultData.output || resultData.result || resultData.markdown || resultData.text || "";
            if (typeof resultText !== "string") resultText = JSON.stringify(resultText);
          }
          console.log("Result fetched, text length:", resultText.length, "has basis:", !!resultData?.basis);
        } else {
          const errText = await resultRes.text();
          console.error("Failed to fetch result:", resultRes.status, errText);
        }

        // Update research_tasks row with the full result data
        await supabase
          .from("research_tasks")
          .update({ status: "completed", result: resultData || pollData })
          .eq("run_id", run_id);

        return new Response(
          JSON.stringify({ status: "completed", research_output: resultText, result_data: resultData, ...pollData }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (pollData.status === "failed" || pollData.status === "error") {
        console.error("Research task failed:", JSON.stringify(pollData));

        await supabase
          .from("research_tasks")
          .update({ status: "failed" })
          .eq("run_id", run_id);

        return new Response(
          JSON.stringify({ status: "failed", error: "Research task failed", details: JSON.stringify(pollData) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Still running
      return new Response(
        JSON.stringify({ status: "pending" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("research-role uncaught error:", error.message, error.stack);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
