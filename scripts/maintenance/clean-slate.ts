import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!url || !serviceKey) {
    console.error('❌ Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(url, serviceKey);

const MISSIONS = [
    { title: '[ORCHESTRATION] Swarm Health Verification Loop', description: 'Monitor all agents for heartbeat stability and task-claim consistency. Flag any zombies.', assigned_to: 'trinity-orch', priority: 90, task_type: 'infrastructure' },
    { title: '[TRUTH] RepID Formula Validation', description: 'Verify the RepID calculation logic against recent agent history. Ensure φ-scaling is applied.', assigned_to: 'trinity-veritas', priority: 85, task_type: 'analysis' },
    { title: '[GOVERNANCE] Directives Compliance Audit', description: 'Audit the last 100 log entries for alignment with the CONSTITUTION.md core values.', assigned_to: 'trinity-shofet', priority: 80, task_type: 'audit' },
    { title: '[DESIGN] High-Fidelity UI Component Prototype', description: 'Implement the Glassmorphism card components for the new Founders Command Center.', assigned_to: 'trinity-mel', priority: 95, task_type: 'design' },
    { title: '[CODE] Vector Search Optimization for RAG', description: 'Improve retrieval precision by implementating a custom semantic reranker for agent wisdom.', assigned_to: 'trinity-hdm', priority: 85, task_type: 'code' },
    { title: '[RESEARCH] Deep Research: Autonomous DAOs', description: 'Conduct a Tavily search on current best-practices for AI-governed DAOs in 2026.', assigned_to: 'trinity-sophia', priority: 75, task_type: 'research' }
];

async function main() {
    console.log('--- [TRINITY CLEAN SLATE] ---');

    // 1. Wipe dependent tables first
    console.log('🧹 Purging failure logs and artifacts...');
    await supabase.from('failure_analysis').delete().neq('id', -1);
    await supabase.from('trinity_artifacts').delete().neq('id', -1);
    await supabase.from('trinity_agent_benchmarks').delete().neq('id', -1);

    // 2. Wipe all tasks
    console.log('🧹 Purging all existing tasks...');
    const { error: delErr } = await supabase.from('trinity_tasks').delete().neq('id', -1);
    if (delErr) {
        console.error('❌ Purge failed:', delErr.message);
        return;
    }
    console.log('✅ Tasks purged.');

    // 2. Clear Registry Status (Optional but helpful)
    console.log('🔄 Resetting agent registry status...');
    await supabase.from('trinity_agent_registry').update({ status: 'idle' }).neq('agent_name', '');

    // 3. Reseed
    console.log(`🌱 Seeding ${MISSIONS.length} priority missions...`);
    const { error: seedErr } = await supabase.from('trinity_tasks').insert(MISSIONS.map(m => ({
        ...m,
        status: m.assigned_to ? 'pending' : 'pending',
        created_at: new Date().toISOString()
    })));

    if (seedErr) {
        console.error('❌ Seeding failed:', seedErr.message);
    } else {
        console.log('✅ Missions seeded successfully!');
    }

    console.log('--- [CLEAN SLATE COMPLETE] ---');
}

main();
