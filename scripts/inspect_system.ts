
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load ENV
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectSystem() {
    console.log('🔍 Inspecting System State...\n');

    // 1. Check Agents (Why is Gamma missing?)
    const { data: agents } = await supabase.from('trinity_agent_registry').select('*');
    console.log(`\n🤖 Registered Agents (${agents?.length || 0}):`);
    agents?.forEach(a => console.log(`   - ${a.agent_name} [${a.status}] (Rep: ${a.reputation_score})`));

    // 2. Check the "test" task
    const { data: tasks } = await supabase
        .from('trinity_tasks')
        .select('*')
        .ilike('title', '%test%')
        .limit(1);

    if (tasks && tasks.length > 0) {
        const t = tasks[0];
        console.log(`\n📋 Task 'test':`);
        console.log(`   ID: ${t.id}`);
        console.log(`   Status: ${t.status}`);
        console.log(`   Assigned To: ${t.assigned_to}`);
        console.log(`   Created At: ${t.created_at}`);

        // 3. Check if any bids exist for it?
        // Note: task_id is now BIGINT in the new table, but task.id is UUID?
        // Wait, if the DB schema for Tasks uses UUID for ID, and we made Bids use BIGINT... that's a FK mismatch!
        // The previous error "Key columns "task_id" and "id" are of incompatible types: uuid and bigint" suggested tasks.id was BIGINT?
        // Or did I misinterpret?
        // User said: "Key columns "task_id" and "id" are of incompatible types: uuid and bigint."
        // Usually this means `references trinity_tasks(id)` found `id` is BIGINT, but `task_id` (UUID) didn't match.
        // OR `id` is UUID and `task_id` (BIGINT) didn't match.
        // I assumed Tasks.ID is BIGINT.
        // Let's verify the type of Tasks.ID here.

        console.log(`   ID Type: ${typeof t.id}`);
    } else {
        console.log('\n⚠️ Task "test" not found.');
    }
}

inspectSystem();
