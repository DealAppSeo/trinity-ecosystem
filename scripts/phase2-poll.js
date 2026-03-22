require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkTasks() {
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60000).toISOString();
    const { data, error } = await s.from('trinity_tasks')
        .select('agent_name, status, belief, disbelief, uncertainty, updated_at')
        .eq('task_type', 'hallucination_detection')
        .gte('updated_at', fifteenMinsAgo)
        .order('updated_at', { ascending: false })
        .limit(10);
    
    if (error) {
        console.error("Query Error:", error);
        return false;
    }
    console.log("Check Output:", data);
    return data && data.length > 0 && data.some(d => d.belief !== null || d.disbelief !== null);
}

async function resetTasks() {
    console.log('[POLL] No recent results. Executing reset query...');
    const { error } = await s.from('trinity_tasks')
        .update({ status: 'pending', result: null, claimed_by: null, verify_count: 0 })
        .eq('task_type', 'hallucination_detection');
    if (error) console.error("Reset Error:", error);
}

async function logProgress(message) {
    await s.from('sprint_reports').insert({
        autonomous_session_march20: message,
    });
    console.log(`[PHASE 2 LOG]: ${message}`);
}

async function main() {
    console.log('[POLL] Waiting 3 minutes for Railway compile and deployment...');
    await wait(180000);
    console.log('[POLL] Railway deployment expected complete. Starting Phase 2 checks...');

    let found = false;
    for (let i = 0; i < 5; i++) {
        console.log(`[POLL] Loop ${i+1}/5 - Checking for recent BFT verifications...`);
        found = await checkTasks();
        if (found) break;
        await wait(120000); 
    }

    if (!found) {
        await resetTasks();
        for (let i = 0; i < 5; i++) {
            console.log(`[POLL] Post-Reset Loop ${i+1}/5 - Checking for BFT verifications...`);
            found = await checkTasks();
            if (found) break;
            await wait(120000);
        }
    }

    if (found) {
        console.log('[PHASE 2] SUCCESS: Adversarial routing is firing correctly!');
        await logProgress("Phase 2 Complete: Adversarial routing verified. Agents are scoring hallucination_detection tasks via verifyPeerTask.");
    } else {
        console.log('[PHASE 2] FAILED: No tasks routed within 20 minutes.');
        await logProgress("Phase 2 Timeout: Agents failed to process hallucination task verify peer routes within 20 minutes.");
    }
}

main();
