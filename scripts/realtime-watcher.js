require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function watch() {
  const startMs = Date.now();
  const endMs = startMs + 65000;
  const seenLogs = new Set();
  
  console.log("Watching trinity_agent_logs for VERITAS polling/claiming...");
  while(Date.now() < endMs) {
    const { data } = await supabase.from('trinity_agent_logs')
      .select('created_at, action, message, agent')
      .in('agent', ['VERITAS', 'trinity-veritas'])
      .gte('created_at', new Date(startMs).toISOString())
      .order('created_at', {ascending: true});
      
    if (data) {
      for(const log of data) {
         const id = log.created_at + log.message;
         if (!seenLogs.has(id)) {
           seenLogs.add(id);
           console.log(`[LOG] ${log.created_at} | ${log.agent} | ${log.action} | ${log.message}`);
         }
      }
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  
  console.log("\n--- DB QUERY ---");
  const { data: tasks } = await supabase.from('trinity_tasks')
    .select('id, title, status, verification_result, claimed_by, claimed_at, verify_count')
    .in('project_id', ['lie-detection-test', 'evergreen-core'])
    .order('created_at', {ascending: false})
    .limit(5);
    
  console.log(JSON.stringify(tasks, null, 2));
}
watch();
