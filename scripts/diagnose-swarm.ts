import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function diagnoseSwarm() {
    console.log('🩺 Trinity Swarm Diagnostic');
    console.log('==========================================');

    // 1. Check Heartbeats
    console.log('\n💓 Heartbeats (Activity Check)');
    const { data: heartbeats, error: hbError } = await supabase
        .from('trinity_heartbeat')
        .select('*')
        .order('last_seen', { ascending: false });

    if (hbError) console.error('❌ Error fetching heartbeats:', hbError.message);
    else if (!heartbeats || heartbeats.length === 0) console.log('⚠️  No heartbeats found. SWARM MAY BE DEAD.');
    else {
        const now = new Date();
        heartbeats.forEach(hb => {
            const diff = now.getTime() - new Date(hb.last_seen).getTime();
            const mins = (diff / 60000).toFixed(1);
            const status = diff < 300000 ? '🟢 LIVE' : '🔴 STALE'; // 5 min threshold
            console.log(`${status} ${hb.agent.padEnd(20)} ${mins} mins ago`);
        });
    }

    // 2. Check Runtime Errors
    console.log('\n💥 Recent Runtime Errors (Last 5)');
    const { data: errors, error: errError } = await supabase
        .from('trinity_runtime_errors')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (errError) console.error('❌ Error fetching errors:', errError.message);
    else if (!errors || errors.length === 0) console.log('✨ No recent errors.');
    else {
        errors.forEach(e => {
            console.log(`[${e.severity}] ${e.agent_name}: ${e.error_message.substring(0, 80)}...`);
        });
    }

    // 3. Check & Force Start Sprint Task
    console.log('\n🏃 Sprint Task Status');
    const { data: tasks, error: taskError } = await supabase
        .from('trinity_tasks')
        .select('*')
        .ilike('title', '%SPRINT%Generate 200%')
        .single();

    if (taskError && taskError.code !== 'PGRST116') console.error('❌ Error looking for sprint task:', taskError.message);
    else if (!tasks) console.log('⚠️  Sprint Task NOT FOUND.');
    else {
        console.log(`Task found: [${tasks.status}] ${tasks.title} (Assigned: ${tasks.assigned_to})`);

        if (tasks.status === 'pending' || tasks.status === 'todo') {
            console.log('⚡ Sprint is PENDING. Attempting FORCE START...');
            const { error: updateError } = await supabase
                .from('trinity_tasks')
                .update({
                    status: 'in_progress',
                    assigned_to: 'trinity-sophia',
                    started_at: new Date().toISOString()
                })
                .eq('id', tasks.id);

            if (updateError) console.error('❌ Failed to force start:', updateError.message);
            else console.log('✅ FORCE START SUCCESSFUL. Assigned to trinity-sophia.');
        } else {
            console.log('✅ Sprint already in progress.');
        }
    }
}

diagnoseSwarm();
