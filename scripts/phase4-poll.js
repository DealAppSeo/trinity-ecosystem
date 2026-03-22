require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkTasks() {
    const fifteenMinsAgo = new Date(Date.now() - 25 * 60000).toISOString();
    const { data, error } = await s.from('trinity_tasks')
        .select('agent_name, status, result, updated_at')
        .eq('task_type', 'hallucination_detection')
        .gte('updated_at', fifteenMinsAgo)
        .order('updated_at', { ascending: false })
        .limit(10);
    
    if (error) {
        console.error("Query Error:", error);
        return false;
    }
    console.log("Check Output:", data);
    return data && data.length > 0 && data.some(d => d.result && d.result.includes('Adversarial verification complete'));
}

async function logProgress(message) {
    await s.from('sprint_reports').insert({
        autonomous_session_march20: message, // Or whichever column is available
    });
    console.log(`[PHASE 4 LOG]: ${message}`);
}

async function main() {
    console.log('[POLL] Waiting 3 minutes for Railway compile and deployment...');
    await wait(180000);
    console.log('[POLL] Railway deployment expected complete. Starting Phase 4 checks...');

    let found = false;
    // 10 loops of 2 minutes = 20 minutes
    for (let i = 0; i < 10; i++) {
        console.log(`[POLL] Loop ${i+1}/10 - Checking for AdversarialVerifier bypass...`);
        found = await checkTasks();
        if (found) break;
        await wait(120000); 
    }

    if (found) {
        console.log('[PHASE 4] SUCCESS: Adversarial verification hook bypass is working!');
        await logProgress("Phase 4 Complete: Hook bypass verified. AdversarialVerifierAgent successfully processed hallucination tasks over 20 minutes.");
    } else {
        console.log('[PHASE 4] FAILED: No tasks routed within 20 minutes.');
        await logProgress("Phase 4 Timeout: Agents failed to process hallucination task routes within 20 minutes.");
    }
}

main();
