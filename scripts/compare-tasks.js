require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function compareTasks() {
  console.log("=== QUERY 1: TEST TASKS (141112 - 141116) ===");
  const { data: testTasks, error: err1 } = await supabase
    .from('trinity_tasks')
    .select('id, title, status, assigned_to, agent_assigned, task_type, priority')
    .in('id', [141112, 141113, 141114, 141115, 141116])
    .order('id', { ascending: true });

  if (err1) console.error("Query 1 Error:", err1);
  else console.table(testTasks);

  console.log("\\n=== QUERY 2: TASK 140900 ===");
  const { data: activeTask, error: err2 } = await supabase
    .from('trinity_tasks')
    .select('id, title, status, assigned_to, agent_assigned, task_type, priority')
    .eq('id', 140900)
    .single();

  if (err2) console.error("Query 2 Error:", err2);
  else console.table([activeTask]);

  const fs = require('fs');
  fs.writeFileSync('task_compare.json', JSON.stringify({ testTasks, activeTask }, null, 2));
}

compareTasks();
