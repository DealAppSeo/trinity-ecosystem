require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data: verify } = await supabase.from('trinity_tasks').select('id, title, agent_assigned, status').eq('project_id', 'evergreen-core');
  console.log('EVERGREEN TASKS:');
  console.table(verify);
}
run();
