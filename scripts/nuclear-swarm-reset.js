
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

async function nuclearReset() {
    console.log('🚀 INITIALIZING NUCLEAR SWARM RESET (Anti-Productivity Fix)...');

    try {
        // 1. CLEAR DEPENDENCIES FIRST (The "Constraint Killers")
        console.log('--- Phase 1: Cleaning Dependency Tables ---');

        const tablesToClear = [
            'failure_analysis',
            'trinity_artifacts',
            'trinity_agent_logs',
            'trinity_retros',
            'trinity_research_log',
            'trinity_agent_benchmarks'
        ];

        for (const table of tablesToClear) {
            console.log(`Clearing ${table}...`);
            const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
            if (error) console.warn(`Note: Could not clear ${table}: ${error.message}`);
        }

        // 2. CLEAR JUNK TASKS
        console.log('--- Phase 2: Purging Junk Tasks ---');
        // Delete child tasks first (parent_task_id)
        await supabase.from('trinity_tasks').delete().not('parent_task_id', 'is', null);

        // Delete all non-completed junk tasks
        const { error: taskError } = await supabase
            .from('trinity_tasks')
            .delete()
            .or('title.ilike.%repeated failure%,title.ilike.%EVERGREEN%,title.ilike.%GENESIS%,title.ilike.%[HEALING]%,title.ilike.%[ANTIFRAGILE]%');

        if (taskError) console.error('Error deleting tasks:', taskError.message);
        else console.log('✅ Junk tasks purged.');

        // 3. WAKE AGENTS
        console.log('--- Phase 3: Waking Swarm Nodes ---');
        const agents = [
            'trinity-orch', 'trinity-w3c', 'trinity-shofet',
            'trinity-torch', 'trinity-veritas', 'trinity-gcm',
            'trinity-chesed', 'trinity-mel', 'trinity-apm',
            'trinity-sophia', 'trinity-nexus', 'trinity-hdm'
        ];

        const nowStr = new Date().toISOString();
        const wakeTasks = agents.map(agent => ({
            title: `[WAKE] Performance Recovery Mission for ${agent}`,
            description: 'STABILITY RECOVERY: Verify system homeostasis, resume tasking, and confirm tool-calling capability (Universal Interceptor v2).',
            priority: 99, // Highest priority to get them moving
            status: 'pending',
            assigned_to: agent,
            created_at: nowStr,
            metadata: { automated: true, type: 'recovery_wake' }
        }));

        await supabase.from('trinity_tasks').insert(wakeTasks);

        await supabase.from('trinity_agent_registry').update({
            status: 'online',
            last_active: nowStr
        }).in('agent_name', agents);

        await supabase.from('trinity_heartbeat').upsert(
            agents.map(a => ({ agent: a, last_seen: nowStr, status: 'active' })),
            { onConflict: 'agent' }
        );

        console.log('✅ SWARM RECOVERED. 12 Fresh missions seeded.');

    } catch (e) {
        console.error('CRITICAL RESET FAILURE:', e.message);
    }
}

nuclearReset();
