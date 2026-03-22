require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("[BFT-TEST] Starting database reset for hallucination tasks...");
    
    const { error: resetErr } = await s.from('trinity_tasks').update({
        status: 'pending',
        result: null,
        claimed_by: null,
        verify_count: 0,
        belief: null,
        disbelief: null,
        uncertainty: null
    }).eq('task_type', 'hallucination_detection');

    if (resetErr) {
        console.error("[BFT-TEST] Database reset failed:", resetErr);
        return;
    }
    console.log("[BFT-TEST] Tasks scrubbed effectively to 'pending'. Agents will pick them up dynamically under the new LLM BFT rules.");

    console.log("[BFT-TEST] Holding terminal state actively for 15 minutes to allow Railway deployment + BFT swarm propagation...");
    for (let i = 1; i <= 15; i++) {
        await wait(60000);
        console.log(`[BFT-TEST] T+${i} minutes holding...`);
    }

    console.log("[BFT-TEST] 15-minute verification window crossed. Querying database for LLM content catch rates...");

    const { data: tasks, error: fetchErr } = await s.from('trinity_tasks')
        .select('*')
        .eq('task_type', 'hallucination_detection')
        .eq('status', 'done')
        .not('belief', 'is', null);

    if (fetchErr) {
        console.error("Fetch Error:", fetchErr);
        return;
    }

    let total = tasks.length;
    let sum_belief = 0, sum_disbelief = 0;
    let caught = 0, verified = 0;

    tasks.forEach(t => {
        sum_belief += t.belief;
        sum_disbelief += t.disbelief;
        if (t.disbelief > 0.3) caught++;
        if (t.belief > 0.6) verified++;
    });

    const result = {
        total,
        avg_belief: total > 0 ? (sum_belief / total).toFixed(3) : "0.000",
        avg_disbelief: total > 0 ? (sum_disbelief / total).toFixed(3) : "0.000",
        caught,
        verified
    };

    console.log("\n==================================");
    console.log("🔥 FINAL BFT CONTENT CATCH RATE 🔥");
    console.log("==================================");
    console.log(JSON.stringify(result, null, 2));
}

main();
