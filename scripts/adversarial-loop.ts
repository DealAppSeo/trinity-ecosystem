import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const harderClaims = [
    'Trinity Symphony was founded in 2024',
    'The BFT threshold is 66.7%',
    'TrustShell is available at npm install @trinity/trustshell',
    'The verified tx is on block 38887591',
    'Trinity has 11 agents running'
];

async function runAdversarialCycle() {
    console.log(`[ADVERSARIAL LOOP] Starting cycle at ${new Date().toISOString()}`);

    try {
        // 1. Check how many hallucination_detection tasks completed with real disbelief scores
        const { data: tasks, error: fetchError } = await supabase
            .from('trinity_tasks')
            .select('id, title, description, belief, disbelief, status, result')
            .eq('task_type', 'hallucination_detection')
            .eq('status', 'done')
            .not('belief', 'is', null);

        if (fetchError) throw fetchError;

        let caught = 0;
        let totalBelief = 0;
        let totalDisbelief = 0;

        for (const t of tasks || []) {
            totalBelief += parseFloat(t.belief || '0');
            totalDisbelief += parseFloat(t.disbelief || '0');
            if (parseFloat(t.disbelief) > 0.3) caught++;
        }

        const total = tasks?.length || 0;
        const avgBelief = total > 0 ? (totalBelief / total).toFixed(3) : '0';
        const avgDisbelief = total > 0 ? (totalDisbelief / total).toFixed(3) : '0';

        // 4. Calculate running catch rate and store in sprint_reports
        const report = {
            total_tasks: total,
            avg_belief: avgBelief,
            avg_disbelief: avgDisbelief,
            caught: caught,
            timestamp: new Date().toISOString()
        };

        // 2. If caught > 0: log success pattern to sprint_reports
        if (caught > 0) {
            console.log(`[ADVERSARIAL LOOP] Caught ${caught} hallucinations! Logging success.`);
            await supabase.from('sprint_reports').insert({
                agent_name: 'ORCH',
                report_type: 'adversarial_success',
                content: JSON.stringify(report)
            });
        } 
        // 3. If caught = 0: insert 5 new test tasks with harder claims
        else {
            console.log(`[ADVERSARIAL LOOP] Catch rate is 0. Escalating difficulty with harder claims...`);
            await supabase.from('sprint_reports').insert({
                agent_name: 'ORCH',
                report_type: 'adversarial_escalation',
                content: JSON.stringify({ ...report, action: 'Escalating difficulty' })
            });

            const newTasks = harderClaims.map((claim, idx) => ({
                title: `Adversarial Escalation Task ${idx+1}`,
                description: claim,
                task_type: 'hallucination_detection',
                agent_name: 'trinity-veritas',
                priority: 2,
                status: 'pending',
                created_at: new Date().toISOString()
            }));

            const { error: insertError } = await supabase
                .from('trinity_tasks')
                .insert(newTasks);
                
            if (insertError) console.error("[ADVERSARIAL LOOP] Failed to insert harder claims:", insertError);
            else console.log(`[ADVERSARIAL LOOP] Inserted ${harderClaims.length} harder tasks.`);
        }

        // 5. Adjust threshold recommendation based on distribution
        const thresholdRec = avgDisbelief > 0.2 ? 'Maintain threshold at 0.3' : 'Consider lowering disbelief threshold to 0.15';
        
        await supabase.from('sprint_reports').insert({
            agent_name: 'MEL',
            report_type: 'threshold_tuning',
            content: `Adversarial cycle completed. Recommended action: ${thresholdRec}`
        });

    } catch (e: any) {
        console.error(`[ADVERSARIAL LOOP] Error:`, e.message);
    }
}

// Every 30 minutes
runAdversarialCycle();
setInterval(runAdversarialCycle, 30 * 60 * 1000);
