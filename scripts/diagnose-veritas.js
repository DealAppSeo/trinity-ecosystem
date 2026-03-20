require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function diagnose() {
  console.log("=== Q1: GIT HASH ===");
  try {
    const localHash = execSync('git log --oneline -1').toString().trim();
    console.log("Local Commit:", localHash);
  } catch(e) {
    console.log("Git error:", e.message);
  }

  console.log("\\n=== Q2: IS VERITAS POLLING? (trinity_logs) ===");
  // Note: Some previous tables were 'trinity_agent_logs', but query strictly asks for 'trinity_logs'
  const { data: logs, error: lErr } = await supabase
    .from('trinity_logs') // or whichever exists
    .select('created_at, event_type, details, agent_name')
    .in('agent_name', ['VERITAS', 'trinity-veritas'])
    .order('created_at', { ascending: false })
    .limit(5);

  if (lErr) {
    console.log("Error querying trinity_logs (might not exist):", lErr.message);
    
    console.log("Fallback to trinity_agent_logs:");
    const { data: aLogs } = await supabase.from('trinity_agent_logs')
      .select('created_at, action, message, agent')
      .in('agent', ['VERITAS', 'trinity-veritas'])
      .order('created_at', { ascending: false })
      .limit(5);
    console.table(aLogs);
  } else {
    console.table(logs);
  }

  console.log("\\n=== Q3: WHAT DOES TRINITY-VERITAS THINK ITS NAME IS? ===");
  const { data: hb, error: hErr } = await supabase
    .from('trinity_heartbeat')
    .select('agent, last_seen, config')
    .in('agent', ['VERITAS', 'trinity-veritas'])
    .order('last_seen', { ascending: false })
    .limit(2);
    
  if (hb && hb.length > 0) {
    console.log("Heartbeat data provides the exact internal name:");
    console.table(hb);
  } else {
    console.log("No heartbeat found for VERITAS or trinity-veritas.");
  }
}

diagnose();
