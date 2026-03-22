const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

async function main() {
    console.log("Waiting 3 minutes for Railway to deploy the skeptical LLM patch...");
    await new Promise(r => setTimeout(r, 3 * 60 * 1000));
    console.log("Railway deploy window passed. Resetting hallucination tasks...");
    const { error } = await s.from('trinity_tasks').update({
        status: 'pending', result: null, claimed_by: null, verify_count: 0, belief: null, disbelief: null, uncertainty: null
    }).eq('task_type', 'hallucination_detection');
    if (error) {
        console.error("Reset error:", error);
        return;
    }
    console.log("Tasks reset successfully. Waiting 20 minutes...");
    
    // Wait 20 mins
    await new Promise(r => setTimeout(r, 20 * 60 * 1000));
    
    console.log("20 minutes elapsed. Querying metrics...");
    const { data: tasks } = await s.from('trinity_tasks').select('*')
        .eq('task_type', 'hallucination_detection')
        .eq('status', 'done')
        .not('belief', 'is', null);

    let caught = 0;
    let totalBelief = 0;
    let totalDisbelief = 0;
    
    for (const t of tasks || []) {
        totalBelief += parseFloat(t.belief) || 0;
        totalDisbelief += parseFloat(t.disbelief) || 0;
        if (parseFloat(t.disbelief) > 0.3) caught++;
    }

    const total = tasks?.length || 0;
    const avgBelief = total > 0 ? (totalBelief / total).toFixed(3) : 0;
    const avgDisbelief = total > 0 ? (totalDisbelief / total).toFixed(3) : 0;

    const report = {
        total,
        avg_belief: avgBelief,
        avg_disbelief: avgDisbelief,
        caught,
        timestamp: new Date().toISOString()
    };
    
    console.log("Results compiled:", report);
    
    await s.from('sprint_reports').insert({
        agent_name: 'ORCH',
        report_type: 'catch_rate_final',
        content: JSON.stringify(report)
    });
    
    console.log("Metrics written to sprint_reports.");
}

main().catch(console.error);
