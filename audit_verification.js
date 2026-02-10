
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function auditVerification() {
    console.log('--- AUDITING VERIFICATION LOOP ---');

    // 1. Get Done Tasks
    const { data: doneTasks, error: doneError } = await supabase
        .from('trinity_tasks')
        .select('id, title, status, verify_count, verified_by, claimed_by')
        .in('status', ['done', 'completed'])
        .limit(10);

    if (doneError) console.error('Done Fetch Error:', doneError);
    else {
        console.log(`\n[DONE MISSIONS]: ${doneTasks.length}`);
        doneTasks.forEach(t => {
            console.log(`ID: ${t.id} | Title: ${t.title}`);
            console.log(`   - VerifyCount: ${t.verify_count} | Verifiers: ${JSON.stringify(t.verified_by)}`);
            console.log(`   - CompletedBy: ${t.claimed_by}`);
        });
    }

    // 2. Check if any agents are currently working on a [VERIFY] task
    const { data: activeVerifications, error: activeError } = await supabase
        .from('trinity_tasks')
        .select('id, title, claimed_by, status')
        .ilike('title', '%[VERIFY]%')
        .in('status', ['doing', 'in_progress', 'running']);

    if (activeError) console.error('Active Verify Error:', activeError);
    else {
        console.log(`\n[ACTIVE VERIFICATION TASKS]: ${activeVerifications.length}`);
        activeVerifications.forEach(v => {
            console.log(`- ${v.title} owned by ${v.claimed_by}`);
        });
    }
}

auditVerification();
