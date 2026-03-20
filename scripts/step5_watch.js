require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const TASK_ID = 141113;

async function watchLogs() {
  console.log(`[START] Watching trinity_agent_logs for Task ID ${TASK_ID} for 90 seconds...`);
  const endTime = Date.now() + 90000;
  const seenLogs = new Set();
  
  while (Date.now() < endTime) {
    const { data } = await supabase
      .from('trinity_agent_logs')
      .select('agent, action, message, created_at')
      .ilike('message', \`%\${TASK_ID}%\`)
      .order('created_at', { ascending: true });
      
    if (data) {
      data.forEach(log => {
        const logId = log.created_at + log.message;
        if (!seenLogs.has(logId)) {
          seenLogs.add(logId);
          console.log(\`[\${log.created_at}] [\${log.agent}] [\${log.action}] \${log.message}\`);
        }
      });
    }
    
    // Also check trinity_tasks status directly 
    const { data: tData } = await supabase.from('trinity_tasks').select('status, claimed_by').eq('id', TASK_ID).single();
    if (tData && tData.claimed_by && !seenLogs.has('claimed')) {
      seenLogs.add('claimed');
      console.log(\`✅ TASK DB SHOWS CLAIMED BY: \${tData.claimed_by} | STATUS: \${tData.status}\`);
    }

    await new Promise(res => setTimeout(res, 10000));
  }
  console.log("[DONE] 90-second log watch complete.");
}

watchLogs();
