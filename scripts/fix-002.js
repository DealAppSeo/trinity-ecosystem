require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function runFix() {
  console.log('Running FIX-002 Database Updates...');
  
  // 1. Archive 140900 permanently
  const { error: e1 } = await supabase.from('trinity_tasks').update({ status: 'archived' }).eq('id', 140900);
  if (e1) {
    console.error('Error archiving 140900:', e1.message);
  } else {
    console.log('Successfully archived task 140900 in DB');
  }

  // 2. Insert FIX-002 record
  const { error: e2 } = await supabase.from('trinity_fixes').insert({
    fix_id: 'FIX-002',
    title: 'Dual Codebase Polling Conflict',
    severity: 'CRITICAL',
    status: 'deployed',
    root_cause: 'Two separate agent codebases running simultaneously: shared/constitutional-agent-base.js and lib/ConstitutionalAgent.ts. The lib/ version explicitly fetches pending_clarification status which the shared/ version does not. Task 140900 had status pending_clarification making it visible only to lib/ agents. claimHistory Map had no permanent blacklist threshold so agents retried indefinitely.',
    symptom: 'All agents log Task 140900 already claimed in infinite loop despite task being archived in DB. 278k Supabase requests per 24 hours.',
    wrong_approaches: JSON.stringify([
      { "approach": "Archive task in DB", "why_failed": "lib/ agents still fetched it via pending_clarification status filter" },
      { "approach": "Restart agents", "why_failed": "Same code redeployed, same behavior" },
      { "approach": "Add .neq archived filter", "why_failed": "Wrong approach - blacklist not whitelist" }
    ]),
    correct_fix: 'Remove pending_clarification from all active status whitelists in lib/ConstitutionalAgent.ts and lib/ConstitutionalAgentV4.js. Add permanent blacklist to claimHistory after 3 failures.',
    files_changed: JSON.stringify([
      { "file": "lib/ConstitutionalAgent.ts", "lines": "508, 770" },
      { "file": "lib/ConstitutionalAgentV4.js", "line": "400" },
      { "file": "shared/constitutional-agent-base.js", "lines": "1332, 1343" }
    ]),
    lesson: 'When two codebases coexist, status definitions MUST be imported from a single canonical source. Never hardcode status strings in polling queries. Always import from nomenclature-constitution.',
    prevention: 'All status lists must import from nomenclature-constitution.ts ACTIVE_TASK_STATUSES. No hardcoded status strings anywhere in codebase. claimHistory must have permanent blacklist threshold.',
    time_lost_hours: 2,
    patent_relevance: true
  });

  if (e2) {
    console.error('Error inserting FIX-002:', e2.message);
  } else {
    console.log('Successfully inserted FIX-002 to trinity_fixes');
  }
}

runFix();
