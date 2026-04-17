/**
 * MCP A2A Gateway — Agent-to-Agent Communication Bridge
 * Routes messages between Trinity Symphony agents via Supabase.
 * Exposes A2A protocol endpoints for agent discovery and messaging.
 */
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 8010;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'mcp-a2a-gateway', version: '1.0.0', supabase: !!supabase });
});

// A2A Agent Discovery — list registered agents
app.get('/agents', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'No Supabase connection' });

  const { data, error } = await supabase
    .from('repid_credentials')
    .select('email, erc8004_token_id, repid_score, credential_type')
    .eq('credential_type', 'DBT');

  if (error) return res.status(500).json({ error: error.message });

  const agents = (data || []).map(a => ({
    id: a.erc8004_token_id,
    email: a.email,
    name: a.email.split('@')[0].toUpperCase(),
    repid: a.repid_score,
    card_url: `https://qnnpjhlxljtqyigedwkb.supabase.co/functions/v1/agent-card`,
  }));

  res.json({ agents, count: agents.length });
});

// A2A Agent Card — get specific agent
app.get('/agents/:id/.well-known/agent-card.json', async (req, res) => {
  // Proxy to the agent-card Edge Function
  try {
    const resp = await fetch('https://qnnpjhlxljtqyigedwkb.supabase.co/functions/v1/agent-card');
    const card = await resp.json();
    res.json(card);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// A2A Send Message — agent-to-agent dispatch
app.post('/agents/:id/message', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'No Supabase connection' });

  const { from, subject, content, priority } = req.body;
  const toAgent = req.params.id;

  const { data, error } = await supabase
    .from('ai_dispatch')
    .insert({
      from_ai: from || 'external',
      to_ai: toAgent,
      subject: subject || 'A2A Message',
      content: content || '',
      priority: priority || 50,
      requires_response: true,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ delivered: true, dispatch_id: data?.id, to: toAgent });
});

// A2A Task — create a task for an agent
app.post('/agents/:id/task', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'No Supabase connection' });

  const { title, description, priority } = req.body;
  const agent = req.params.id;

  const { data, error } = await supabase
    .from('trinity_tasks')
    .insert({
      title: title || 'A2A Task',
      description: description || '',
      assigned_to: agent,
      status: 'pending',
      priority: priority || 70,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ created: true, task_id: data?.id, assigned_to: agent });
});

// MCP Tool Catalog
app.get('/mcp/tools', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'No Supabase connection' });

  const { data } = await supabase
    .from('agent_mcp_catalog')
    .select('mcp_name, mcp_url, category, use_case, priority');

  res.json({ tools: data || [], count: (data || []).length });
});

app.listen(PORT, () => {
  console.log(`MCP A2A Gateway listening on port ${PORT}`);
  console.log(`Supabase: ${supabase ? 'connected' : 'NOT CONNECTED'}`);
});
