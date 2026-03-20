require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkFleet() {
  console.log("=== FLEET ACTIVITY REPORT ===");
  // We use `agent` instead of `agent_name` based on previous trinity_agent_logs schema
  // We'll use the Supabase JS rpc or just raw sql if we can't group easily via JS builder
  
  // Since supabase-js doesn't natively support group by without rpc, we fetch large chunks and aggregate in JS or use RPC if it exists.
  // Actually, we can just fetch the latest log for all distinct agents by checking recent logs.
  // A cleaner way is using Supabase's REST endpoints or just fetch all and group in memory if it's small enough, otherwise let's just use Postgrest JS trick or just fetch MAX created_at per known agent.
  
  const knownAgents = [
    'trinity-veritas', 'VERITAS', 'trinity-torch', 'TORCH', 'trinity-hdm', 'HDM',
    'trinity-gcm', 'GCM', 'trinity-mel', 'MEL', 'trinity-w3c', 'W3C', 'trinity-apm', 'APM',
    'trinity-nexus', 'NEXUS', 'trinity-chesed', 'CHESED'
  ];

  const results = [];
  const cutoffDate = new Date('2026-03-10T00:00:00Z');

  for (const agent of knownAgents) {
    const { data: latest } = await supabase
      .from('trinity_agent_logs')
      .select('created_at')
      .eq('agent', agent)
      .order('created_at', { ascending: false })
      .limit(1);

    if (latest && latest.length > 0) {
      const { count } = await supabase
        .from('trinity_agent_logs')
        .select('*', { count: 'exact', head: true })
        .eq('agent', agent);

      const lastSeen = new Date(latest[0].created_at);
      results.push({
        agent_name: agent,
        last_seen: lastSeen,
        total_logs: count || 0,
        status: lastSeen < cutoffDate ? 'DEAD' : 'ACTIVE'
      });
    }
  }

  // Sort by last_seen desc
  results.sort((a, b) => b.last_seen - a.last_seen);
  
  console.table(results);
  
  console.log("\\n=== HEALTH ENDPOINT CHECK ===");
  const healthUrl = "https://trinity-veritas-production.up.railway.app/health";
  console.log(`Pinging: ${healthUrl}`);
  try {
    const res = await fetch(healthUrl);
    const body = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(`Body: ${body}`);
    
    if (res.status === 200 && results.find(r => r.agent_name.includes('VERITAS') && r.status === 'DEAD')) {
      console.log("\\nCRITICAL BUG DETECTED: The /health endpoint returned 200 OK while the agent's polling loop is DEAD (no logs since before March 10). The health endpoint is lying to UptimeRobot.");
    }
  } catch(e) {
    console.log(`Failed to reach endpoint: ${e.message}`);
  }
}

checkFleet();
