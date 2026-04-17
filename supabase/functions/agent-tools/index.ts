import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import * as postgres from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tool Executor Sprint — Created April 5 2026 by Gemini

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    // Fallback logic for local testing if needed
    const sbClient = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { tool, agent_name, task_id, params } = body;

    if (!tool || !agent_name) {
      return new Response(JSON.stringify({ error: 'Missing req parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (tool === 'sql_query') {
      const dbUrl = Deno.env.get('SUPABASE_DB_URL') || Deno.env.get('DATABASE_URL');
      if (!dbUrl) throw new Error("Missing DB URL for direct SQL queries.");
      
      const pool = new postgres.Pool(dbUrl, 3, true);
      const connection = await pool.connect();
      try {
        const result = await connection.queryObject(params.query);
        return new Response(JSON.stringify({ rows: result.rows, success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } finally {
        connection.release();
        await pool.end();
      }
    }

    if (tool === 'web_search') {
      const tavilyKey = Deno.env.get('TAVILY_API_KEY');
      if (!tavilyKey) throw new Error("Missing TAVILY_API_KEY");
      
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: tavilyKey, query: params.query })
      });
      const data = await res.json();
      return new Response(JSON.stringify({ results: data, success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (tool === 'llm_call') {
      const litellmUrl = Deno.env.get('LITELLM_URL') || 'https://trinity-litellm.railway.app';
      const litellmKey = Deno.env.get('LITELLM_MASTER_KEY');
      
      const res = await fetch(`${litellmUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${litellmKey}`
        },
        body: JSON.stringify({
          model: params.model,
          messages: [{ role: 'user', content: params.prompt }],
        })
      });
      const data = await res.json();
      return new Response(JSON.stringify({ completion: data, success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (tool === 'write_artifact') {
      const { error } = await sbClient.from('trinity_artifacts').insert({
        agent: agent_name,
        task_id: task_id,
        artifact_type: params.type || 'text',
        content: params.content,
        filename: params.filename
      });
      if (error) throw new Error(error.message);
      
      return new Response(JSON.stringify({ success: true, message: "Artifact written" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown tool: ${tool}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message, success: false }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
