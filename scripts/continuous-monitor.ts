import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { execSync } from 'child_process';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function runMonitor() {
    console.log(`[MONITOR] Running progress report snapshot...`);

    try {
        const { data: doneLastHour } = await supabase.from('trinity_tasks').select('id').eq('status', 'done').gt('updated_at', new Date(Date.now() - 3600000).toISOString());
        const { data: pending } = await supabase.from('trinity_tasks').select('id').eq('status', 'pending');
        const { data: stuck } = await supabase.from('trinity_tasks').select('id').eq('status', 'pending_clarification');
        const { data: caughtTasks } = await supabase.from('trinity_tasks').select('id').eq('task_type', 'hallucination_detection').eq('status', 'done').gt('disbelief', 0.3);
        const { data: traces } = await supabase.from('trinity_agent_logs').select('id').eq('event_type', 'bft_reasoning_trace');

        const payload = {
            timestamp: new Date().toISOString(),
            tasks_done_last_hour: doneLastHour?.length || 0,
            tasks_pending: pending?.length || 0,
            tasks_stuck: stuck?.length || 0,
            hallucination_caught: caughtTasks?.length || 0,
            reasoning_traces_logged: traces?.length || 0,
            latest_commit: execSync('git rev-parse --short HEAD').toString().trim()
        };

        await supabase.from('sprint_reports').insert({
            agent_name: 'ORCH',
            report_type: 'autonomous_progress',
            content: JSON.stringify(payload)
        });

        console.log(`[MONITOR] Inserted telemetry to sprint_reports.`);
        
        execSync(`node scripts/tg.js "📊 Progress report: ${payload.tasks_done_last_hour} done, ${payload.tasks_stuck} stuck, ${payload.hallucination_caught} caught"`);
    } catch (e: any) {
        console.error(`[MONITOR] Error generating report:`, e.message);
    }
}

runMonitor();
setInterval(runMonitor, 45 * 60 * 1000);
