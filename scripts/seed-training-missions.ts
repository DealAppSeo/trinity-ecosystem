import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const AGENTS = [
    'trinity-orch', 'trinity-w3c', 'trinity-shofet',
    'trinity-torch', 'trinity-veritas', 'trinity-gcm',
    'trinity-chesed', 'trinity-mel', 'trinity-apm',
    'trinity-sophia', 'trinity-nexus', 'trinity-hdm'
];

async function seed() {
    console.log('🚀 Seeding 12 Training Missions...');

    const now = new Date().toISOString();
    const tasks = AGENTS.map(agent => ({
        title: `[TRAINING] Neural Alignment: ${agent.replace('trinity-', '').toUpperCase()}`,
        description: `Mission directive: Synchronize local knowledge graph with the latest Trinity Protocol (v8.1). Verify connectivity, report status, and standby for higher-tier orchestration.`,
        priority: 90,
        status: 'pending',
        assigned_to: agent,
        created_at: now,
        task_type: 'training'
    }));

    const { error } = await supabase.from('trinity_tasks').insert(tasks);

    if (error) {
        console.error('❌ Seeding failed:', error.message);
    } else {
        console.log('✅ 12 Training Missions successfully seeded. Monitoring swarm pickup...');
    }
}

seed();
