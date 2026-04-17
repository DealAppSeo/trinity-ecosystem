const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim() || envContent.match(/SUPABASE_URL=(.*)/)?.[1]?.trim();
const envKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(envUrl, envKey);

const tasks = [
  {
    agent_assigned: 'VERITAS',
    task_type: 'overnight_sprint_task',
    status: 'pending',
    priority: 1,
    description: 'Review the last 50 compliance receipts in kya_compliance_receipts. Flag any with missing ZKP proof hashes or null transaction signatures. Write findings to the trinity_agent_logs table.',
    metadata: { task: 'Review the last 50 compliance receipts in kya_compliance_receipts. Flag any with missing ZKP proof hashes or null transaction signatures. Write findings to the trinity_agent_logs table.' }
  },
  {
    agent_assigned: 'NEXUS',
    task_type: 'overnight_sprint_task',
    status: 'pending',
    priority: 1,
    description: 'Monitor the pending_authorizations table. For any pending records older than 10 minutes, escalate by updating status to escalated and writing a sprint report.',
    metadata: { task: 'Monitor the pending_authorizations table. For any pending records older than 10 minutes, escalate by updating status to escalated and writing a sprint report.' }
  },
  {
    agent_assigned: 'TORCH',
    task_type: 'overnight_sprint_task',
    status: 'pending',
    priority: 1,
    description: 'Generate three LinkedIn post drafts about TrustRails KYA infrastructure for institutional AI agent finance. Write to trinity_agent_logs with tag linkedin_content_queue.',
    metadata: { task: 'Generate three LinkedIn post drafts about TrustRails KYA infrastructure for institutional AI agent finance. Write to trinity_agent_logs with tag linkedin_content_queue.' }
  },
  {
    agent_assigned: 'SOPHIA',
    task_type: 'overnight_sprint_task',
    status: 'pending',
    priority: 1,
    description: 'Run a self-audit — list your last 10 completed tasks, their certainty scores, and whether a compliance receipt was generated for each. Write to sprint_reports.',
    metadata: { task: 'Run a self-audit — list your last 10 completed tasks, their certainty scores, and whether a compliance receipt was generated for each. Write to sprint_reports.' }
  }
];

async function run() {
  const { data, error } = await supabase.from('trinity_tasks').insert(tasks);
  if (error) {
    console.error("Error dispatching tasks:", error);
  } else {
    console.log("Tasks successfully dispatched to the swarm!");
  }
}

run();
