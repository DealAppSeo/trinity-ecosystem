require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function runQueries() {
  console.log("=== QUERY 1: CURRENT QUEUE BY AGENT ===");
  // Emulating the SQL grouping query since supabase-js lacks native GROUP BY
  const { data: allActive, error: e1 } = await supabase
    .from('trinity_tasks')
    .select('id, assigned_to, agent_assigned, status, task_type')
    .not('status', 'in', '("completed","archived","failed","cancelled","verified")');
    
  if (e1) {
    console.error(e1);
  } else {
    const groups = {};
    for (const t of allActive) {
      const key = `${t.assigned_to}|${t.agent_assigned}|${t.status}|${t.task_type}`;
      if (!groups[key]) {
        groups[key] = {
          assigned_to: t.assigned_to,
          agent_assigned: t.agent_assigned,
          status: t.status,
          task_type: t.task_type,
          task_count: 0,
          task_ids: []
        };
      }
      groups[key].task_count++;
      groups[key].task_ids.push(t.id);
    }
    
    let result1 = Object.values(groups);
    // Sort array_agg
    result1.forEach(g => g.task_ids.sort((a,b) => a - b));
    // ORDER BY assigned_to, status
    result1.sort((a, b) => {
      const aVal = a.assigned_to || '';
      const bVal = b.assigned_to || '';
      if (aVal < bVal) return -1;
      if (aVal > bVal) return 1;
      if (a.status < b.status) return -1;
      if (a.status > b.status) return 1;
      return 0;
    });
    
    // Dump to JSON
    fs.writeFileSync('query1.json', JSON.stringify(result1, null, 2));
    console.log(`Query 1 completed: ${result1.length} groups found.`);
  }

  console.log("\n=== QUERY 2: SPECIFIC TASK COMPARISON ===");
  const { data: q2, error: e2 } = await supabase
    .from('trinity_tasks')
    .select('id, title, status, assigned_to, agent_assigned, agent_name, task_type, priority, is_real, use_acp, claimed_by, project_id, pipeline_stage')
    .in('id', [140900, 141112, 141113, 141114, 141115, 141116])
    .order('id', { ascending: true });

  if (e2) {
    console.error(e2);
  } else {
    fs.writeFileSync('query2.json', JSON.stringify(q2, null, 2));
    console.log(`Query 2 completed: ${q2.length} rows fetched.`);
  }
}

runQueries();
