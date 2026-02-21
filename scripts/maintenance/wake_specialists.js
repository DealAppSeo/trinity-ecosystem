const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function wakeSpecialists() {
    console.log('--- WAKING SPECIALIST AGENTS ---');
    const specialists = ['trinity-chesed', 'trinity-nexus', 'trinity-sophia'];

    for (const agent of specialists) {
        console.log(`Sending wake signal to ${agent}...`);

        // 1. Update Registry Status
        const { error: regError } = await supabase
            .from('trinity_agent_registry')
            .update({ status: 'online', last_active: new Date().toISOString() })
            .eq('agent_name', agent);

        if (regError) console.error(`Error updating registry for ${agent}:`, regError.message);

        // 2. Insert Heartbeat
        const { error: hbError } = await supabase
            .from('trinity_heartbeat')
            .insert({
                agent: agent,
                status: 'awakened: Wake signal received. Initializing sub-systems.',
                last_seen: new Date().toISOString()
            });

        if (hbError) console.error(`Error inserting heartbeat for ${agent}:`, hbError.message);
        else console.log(`[SUCCESS] ${agent} awakened.`);
    }

    // 3. Insert a test task for them to pick up
    const { error: taskError } = await supabase
        .from('trinity_tasks')
        .insert({
            title: '[STABILITY] Specialized System Check',
            description: 'Perform a deep diagnostic of your specialized sub-systems and confirm operational readiness.',
            status: 'pending',
            priority: 10,
            assigned_to: 'trinity-orch', // Orchestrator handles delegation usually
            task_type: 'maintenance',
            metadata: { automated: true, target: 'specialists' }
        });

    if (taskError) console.error('Error seeding stability task:', taskError.message);
    else console.log('[SUCCESS] Stability task seeded.');
}

wakeSpecialists();
