import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSprint() {
    console.log('🔍 CHECKING PRO_TOOL_VALIDATION SPRINT...');

    const { data: tasks, error } = await supabase
        .from('trinity_tasks')
        .select('*')
        .contains('metadata', { sprint: 'PRO_TOOL_VALIDATION' })
        .order('id', { ascending: false });

    if (error) {
        console.error('❌ Query failed:', error.message);
        return;
    }

    if (!tasks || tasks.length === 0) {
        console.log('⚠️ No validation tasks found.');
        return;
    }

    tasks.forEach(task => {
        console.log(`[${task.status.toUpperCase()}] ID: ${task.id} | ${task.title} | Claimed By: ${task.claimed_by || 'Unclaimed'}`);
    });

    const { data: agents } = await supabase
        .from('trinity_heartbeat')
        .select('*')
        .gt('last_heartbeat', new Date(Date.now() - 300000).toISOString()); // Last 5 mins

    console.log('\n🤖 ACTIVE AGENTS (Last 5 mins):');
    if (!agents || agents.length === 0) {
        console.log('   (No active agents found)');
    } else {
        agents.forEach(a => console.log(`   - ${a.agent_name} (${a.status})`));
    }
}

checkSprint();
