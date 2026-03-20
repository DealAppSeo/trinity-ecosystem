require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data: task, error } = await supabase.from('trinity_tasks').insert({
    title: 'TEST: Correct Polling Query Detection',
    assigned_to: 'trinity-veritas', // Matches .or(\`assigned_to.eq.\${this.name}...\`)
    status: 'pending',              // Matches .eq('status', 'pending')
    task_type: 'research',
    priority: 90,                   // Ensure it's treated as critical
    description: 'Testing the EXACT where conditions discovered in constitutional-agent-base.js',
    project_id: 'evergreen-core'
  }).select('id').single();

  if (error) {
    console.error("Insert failed:", error);
  } else {
    console.log("INSERTED_TASK_ID=" + task.id);
  }
}

run();
