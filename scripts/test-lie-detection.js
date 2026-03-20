require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runTest() {
  console.log("1. Inserting TEST lie detection task...");
  const { data: task, error: err } = await supabase.from('trinity_tasks').insert({
    assigned_to: 'VERITAS',
    agent_assigned: 'VERITAS',
    agent_name: 'VERITAS',
    status: 'pending',
    requires_consensus: true,
    result: 'The verified tx hash is 0xFAKEHASH123',
    title: 'TEST: Lie Detection Verification',
    description: 'Verifying system effectively spawns the review process.',
    project_id: 'evergreen-core',
    task_type: 'research', // Ensures 'isCritical' evaluates to true
    priority: 90
  }).select('*').single();

  if (err || !task) {
    console.error("Insert failed:", err);
    process.exit(1);
  }

  const taskId = task.id;
  console.log(`Task inserted successfully with ID: ${taskId}`);
  
  console.log("2. Waiting 60 seconds (giving agents polling time to process and verify)...");
  await new Promise(resolve => setTimeout(resolve, 60000));

  console.log("3. Querying trinity_tasks for the specific verification logic...");
  
  // Checking for child [VERIFY] tasks
  const { data: verifyTasks } = await supabase.from('trinity_tasks').select('*')
    .ilike('title', '[VERIFY]%')
    .contains('metadata', { parent_task_id: taskId });
    
  const spawnedVerify = verifyTasks && verifyTasks.length > 0;
  console.log(`- Was a [VERIFY] child task spawned? ${spawnedVerify ? 'YES' : 'NO'}`);

  // Checking if the original task was failed/challenged via verification
  const { data: updatedTask } = await supabase.from('trinity_tasks').select('*').eq('id', taskId).single();
  const isApprovedFalse = updatedTask && updatedTask.verification_result === 'CHALLENGED';
  console.log(`- Was isApproved = false? ${isApprovedFalse ? 'YES' : 'NO'}`);

  // Checking if the [REORG] task was fired
  const { data: reorgTasks } = await supabase.from('trinity_tasks').select('*')
    .eq('task_type', 'critique')
    .ilike('title', '[REORG]%')
    .contains('metadata', { disputed_task_id: taskId });
    
  const spawnedReorg = reorgTasks && reorgTasks.length > 0;
  console.log(`- Was a [REORG] veto task created? ${spawnedReorg ? 'YES' : 'NO'}`);

  console.log("4. Querying trinity_agent_logs regarding the task id...");
  const { data: logs } = await supabase.from('trinity_agent_logs').select('*')
    .eq('task_id', String(taskId));

  if (logs && logs.length > 0) {
    logs.forEach(l => console.log(`  [${l.action}] ${l.message}`));
  } else {
    console.log("  No logs found referencing this task entirely.");
  }

  console.log("\n5. Conclusion:");
  if (spawnedVerify && (isApprovedFalse || spawnedReorg)) {
    console.log("PASS: veto fired, verification processed, and written to DB! \nEvidence: REORG/Verify logs present.");
  } else {
    console.log("FAIL: nothing happened or conditions were not met.");
  }
}

runTest();
