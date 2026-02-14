
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function diagnose() {
    console.log('--- DIAGNOSING MISSIONS ---');
    const { data: missions, error: mError } = await supabase
        .from('trinity_tasks')
        .select('id, title, status, verify_count, verified_by')
        .in('status', ['done', 'verified', 'completed']);

    if (mError) {
        console.error('Mission error:', mError);
    } else {
        missions.forEach(m => {
            const verifiers = m.verified_by || [];
            console.log(`Mission: ${m.title} | ID: ${m.id}`);
            console.log(`  Status: ${m.status}`);
            console.log(`  Verify Count (DB): ${m.verify_count}`);
            console.log(`  Verifiers Count (Array): ${verifiers.length}`);
            console.log(`  Verifiers: ${verifiers.join(', ')}`);

            if (verifiers.length >= 2 && m.status !== 'verified') {
                console.warn(`  ⚠️ ALERT: Mission has ${verifiers.length} verifiers but status is ${m.status}!`);
            }
        });
    }

    console.log('\n--- DIAGNOSING AGENTS ---');
    const { data: agents, error: aError } = await supabase
        .from('trinity_agent_registry')
        .select('agent_name, status, last_active, squad');

    if (aError) {
        console.error('Agent error:', aError);
    } else {
        agents.forEach(a => {
            const lastActive = a.last_active ? new Date(a.last_active) : null;
            const ageInMins = lastActive ? (Date.now() - lastActive.getTime()) / 60000 : Infinity;
            console.log(`Agent: ${a.agent_name} | Squad: ${a.squad} | Status: ${a.status}`);
            console.log(`  Last Active: ${a.last_active || 'NEVER'} (${ageInMins.toFixed(1)} mins ago)`);
            if (ageInMins > 5) {
                console.warn(`  ⚠️ ALERT: Agent is stale (> 5 mins)!`);
            }
        });
    }
}

diagnose();
