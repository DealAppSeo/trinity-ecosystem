require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkTask() {
  const { data, error } = await supabase
    .from('trinity_tasks')
    .select('id, title, status, claimed_by, started_at, agent_assigned')
    .eq('id', 141112)
    .single();

  if (error) {
    console.error("Query Error:", error);
  } else {
    console.log("Task Data:");
    console.table(data);
  }
}

checkTask();
