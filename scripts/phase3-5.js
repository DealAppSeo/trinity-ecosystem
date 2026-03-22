require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

async function main() {
    console.log("---- PHASE 3: Compile Catch Rate Statistics ----");
    const { data: tasks, error: fetchErr } = await s.from('trinity_tasks')
        .select('*')
        .eq('task_type', 'hallucination_detection')
        .eq('status', 'done')
        .not('belief', 'is', null);

    if (fetchErr) {
        console.error("Fetch Error:", fetchErr);
        return;
    }

    if (!tasks || tasks.length === 0) {
        console.log("No completed tasks found for Phase 3. Are the agents still processing?");
        return;
    }

    let total_completed = tasks.length;
    let sum_belief = 0, sum_disbelief = 0, sum_uncertainty = 0;
    let high_disbelief_count = 0, high_belief_count = 0, high_uncertainty_count = 0;

    tasks.forEach(t => {
        sum_belief += (t.belief || 0);
        sum_disbelief += (t.disbelief || 0);
        sum_uncertainty += (t.uncertainty || 0);
        if (t.disbelief > 0.3) high_disbelief_count++;
        if (t.belief > 0.6) high_belief_count++;
        if (t.uncertainty > 0.5) high_uncertainty_count++;
    });

    const stats = {
        total_completed,
        avg_belief: sum_belief / total_completed,
        avg_disbelief: sum_disbelief / total_completed,
        avg_uncertainty: sum_uncertainty / total_completed,
        high_disbelief_count,
        high_belief_count,
        high_uncertainty_count
    };

    console.log("Phase 3 Stats:", stats);

    const logRes = await s.from('trinity_agent_logs').insert({
        agent_name: 'ANTIGRAVITY',
        event_type: 'catch_rate_summary',
        content: JSON.stringify(stats, null, 2),
        metadata: stats
    });
    
    if (logRes.error && logRes.error.message.includes('column')) {
        console.log("Retrying log without strict schema enforcement mapping...");
        await s.from('trinity_agent_logs').insert({
            agent_name: 'ANTIGRAVITY',
            content: `catch_rate_summary: ${JSON.stringify(stats)}`
        });
    }

    console.log("---- PHASE 5: Demo Script Refinement ----");
    const { data: demoTask, error: p5err } = await s.from('trinity_tasks').select('id, result').eq('id', 141150).single();
    if (p5err) {
        console.error("P5 Fetch Error:", p5err);
        return;
    }

    let script = demoTask.result || "";
    script = script.replace(/@trinity\/trustshell/g, '@hyperdag/trustshell');
    
    script += `\n\n[UPDATED LIVE DEMRICS (PHASE 3)]\nTotal Tasks Evaluated: ${stats.total_completed}\nAverage Belief/Disbelief/Uncertainty: ${stats.avg_belief.toFixed(2)} / ${stats.avg_disbelief.toFixed(2)} / ${stats.avg_uncertainty.toFixed(2)}\nHigh Disbelief Catches: ${stats.high_disbelief_count}\n`;
    
    if (!script.includes('0xc1207')) {
        script += `\n[SPECIFIC INCIDENTS RECORDED]\nFake Hash incident caught: 0xc1207... and 0x44750...\nVerified Real Hash: 0x92be19...\n`;
    }

    const { error: updateErr } = await s.from('trinity_tasks').update({ result: script }).eq('id', 141150);
    if (updateErr) {
        console.error("P5 Update Error:", updateErr);
    } else {
        console.log("Phase 5 Demo Script Updated Successfully.");
    }
}

main();
