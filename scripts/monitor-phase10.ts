import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function monitorLiveMetrics() {
    console.log('📡 Monitoring Phase 10 Live Metrics (Last 12 Hours)...');

    // 1. Check GENESIS Tasks
    const { data: genesisTasks, error: genError } = await supabase
        .from('trinity_tasks')
        .select('title, created_at, assigned_to, metadata')
        .ilike('title', '%GENESIS%')
        .order('created_at', { ascending: false })
        .limit(10);

    if (genError) console.error('❌ Failed to fetch Genesis tasks:', genError.message);
    else {
        console.log(`\n🌱 Genesis Tasks Found: ${genesisTasks?.length}`);
        genesisTasks?.forEach(t => {
            console.log(`   - [${t.assigned_to}] ${t.title} (Source: ${t.metadata?.source || 'Manual'})`);
        });
    }

    // 2. Check SPRINT Tasks
    const { data: sprintTasks, error: sprintError } = await supabase
        .from('trinity_tasks')
        .select('title, status, assigned_to')
        .ilike('title', '%SPRINT%')
        .order('created_at', { ascending: false })
        .limit(10);

    if (sprintError) console.error('❌ Failed to fetch Sprint tasks:', sprintError.message);
    else {
        console.log(`\n🏃 Sprint Activity:`);
        sprintTasks?.forEach(t => {
            console.log(`   - [${t.status}] ${t.title} (${t.assigned_to})`);
        });
    }

    // 3. Check Real Web Scans in Logs
    // We look for logs containing "Scanning:" or "Web Scan"
    const { data: logs, error: logError } = await supabase
        .from('trinity_agent_logs')
        .select('*')
        .or('log_level.eq.info,log_level.eq.warn')
        .ilike('message', '%Scan%')
        .order('created_at', { ascending: false })
        .limit(5);

    if (logError) console.error('❌ Failed to fetch logs:', logError.message);
    else {
        console.log(`\n🔍 Recent Web Scans (Logs):`);
        logs?.forEach(l => {
            console.log(`   - [${l.agent_name}] ${l.message}`);
        });
    }
}

monitorLiveMetrics();
