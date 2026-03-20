require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function upgradeDB() {
  const { data: tasks, error: fetchErr } = await supabase
    .from('trinity_tasks')
    .select('id, agent_assigned, assigned_to')
    .in('project_id', ['evergreen-core', 'system-health', 'lie-detection-test']);

  if (fetchErr) {
    console.error("Fetch DB error:", fetchErr);
    return;
  }

  let updatedCount = 0;
  for (const t of tasks) {
    const cleanAgentAssigned = t.agent_assigned ? t.agent_assigned.replace(/trinity-/i, '').toUpperCase() : null;
    const cleanAssignedTo = t.assigned_to ? t.assigned_to.replace(/trinity-/i, '').toUpperCase() : null;
    
    if (cleanAgentAssigned !== t.agent_assigned || cleanAssignedTo !== t.assigned_to) {
      const { error: upErr } = await supabase
        .from('trinity_tasks')
        .update({
          agent_assigned: cleanAgentAssigned,
          assigned_to: cleanAssignedTo
        })
        .eq('id', t.id);
        
      if (!upErr) updatedCount++;
    }
  }

  console.log(`Updated ${updatedCount} rows in trinity_tasks (uppercase VERITAS formatting)`);
}

upgradeDB();
