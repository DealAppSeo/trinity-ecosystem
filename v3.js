require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data: q1 } = await supabase.from('trinity_tasks').select('agent_assigned').eq('project_id', 'evergreen-core');
  const grouped = {};
  if (q1) {
    q1.forEach(r => {
      const a = r.agent_assigned || 'NULL';
      grouped[a] = (grouped[a] || 0) + 1;
    });
  }
  console.log('GROUPED EVERGREEN TASKS:\n' + JSON.stringify(grouped, null, 2));
  
  const { data: details } = await supabase.from('trinity_tasks').select('id, title, agent_assigned, status').eq('project_id', 'evergreen-core').order('id');
  console.log('EVERGREEN TASK DETAILS:\n' + JSON.stringify(details, null, 2));
}
run();
