require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const localHash = require('child_process').execSync('git log --oneline -1').toString().trim();
  
  const { data: logs } = await supabase.from('trinity_agent_logs')
    .select('created_at, action, message, agent')
    .in('agent', ['VERITAS', 'trinity-veritas'])
    .order('created_at', {ascending: false})
    .limit(5);
    
  const { data: hb } = await supabase.from('trinity_heartbeat')
    .select('agent, last_seen, config')
    .in('agent', ['VERITAS', 'trinity-veritas'])
    .order('last_seen', {ascending: false})
    .limit(2);
    
  fs.writeFileSync('diagnostics.json', JSON.stringify({
    q1_local_hash: localHash,
    q2_recent_logs: logs,
    q3_heartbeat: hb
  }, null, 2));
}

run();
