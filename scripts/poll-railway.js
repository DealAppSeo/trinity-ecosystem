require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const bootTimeStr = process.argv[2] || new Date().toISOString();
const BOOT_TIME = new Date(bootTimeStr);
console.log(`Polling for ORCH and SHOFET heartbeats post-${BOOT_TIME.toISOString()}...`);

async function poll() {
  let orchGreen = false;
  let shofetGreen = false;
  const timeoutMs = 300000; // 5 mins
  const startMs = Date.now();

  while (Date.now() - startMs < timeoutMs) {
    const { data: hb } = await supabase
      .from('trinity_heartbeat')
      .select('agent, last_seen')
      .in('agent', ['ORCH', 'trinity-orch', 'SHOFET', 'trinity-shofet']);
      
    if (hb) {
      for (const h of hb) {
        const lastSeen = new Date(h.last_seen);
        if (lastSeen >= BOOT_TIME) {
          if (h.agent.includes('ORCH')) orchGreen = true;
          if (h.agent.includes('SHOFET')) shofetGreen = true;
        }
      }
    }
    
    // Also check trinity_agent_logs just in case heartbeat didn't trigger but logs did
    const { data: logs } = await supabase
      .from('trinity_agent_logs')
      .select('agent, created_at')
      .in('agent', ['ORCH', 'trinity-orch', 'SHOFET', 'trinity-shofet'])
      .gte('created_at', BOOT_TIME.toISOString());
      
    if (logs) {
      for (const l of logs) {
         if (l.agent.includes('ORCH')) orchGreen = true;
         if (l.agent.includes('SHOFET')) shofetGreen = true;
      }
    }

    if (orchGreen && shofetGreen) {
      console.log('✅ BOTH SERVICES ARE GREEN! (trinity-orch and trinity-shofet)');
      process.exit(0);
    }

    console.log(`Still waiting... ORCH: ${orchGreen}, SHOFET: ${shofetGreen}`);
    await new Promise(r => setTimeout(r, 10000));
  }
  
  console.log('❌ TIMEOUT: Services did not come online within 5 minutes.');
  process.exit(1);
}

poll();
