
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testPermissions() {
    console.log('--- 🛡️ Testing Permissions for Agent Claim ---');
    console.log(`URL: ${url}`);

    const clients = [
        { name: 'ANON_CLIENT', client: createClient(url, anonKey) },
    ];

    if (serviceKey) {
        clients.push({ name: 'SERVICE_CLIENT', client: createClient(url, serviceKey) });
    } else {
        console.warn('⚠️ No SERVICE_ROLE_KEY found in .env.local');
    }

    for (const { name, client } of clients) {
        console.log(`\nTesting with ${name}...`);

        // 1. Try to fetch a pending task
        const { data: task, error: fetchError } = await client
            .from('trinity_tasks')
            .select('id, title')
            .eq('status', 'pending')
            .limit(1)
            .maybeSingle();

        if (fetchError) {
            console.error(`  ❌ ${name} failed to fetch pending tasks:`, fetchError.message);
            continue;
        }

        if (!task) {
            console.log(`  ℹ️ ${name}: No pending tasks found to test with.`);
            continue;
        }

        console.log(`  ✅ ${name} found task ${task.id}: "${task.title}"`);

        // 2. Try to CLAIM it
        console.log(`  Attempting to CLAIM task ${task.id}...`);
        const { data: updated, error: updateError } = await client
            .from('trinity_tasks')
            .update({
                status: 'doing',
                claimed_by: `trinity-test-${name}`
            })
            .eq('id', task.id)
            .eq('status', 'pending')
            .select();

        if (updateError) {
            console.error(`  ❌ ${name} CLAME FAILED (Error):`, updateError.message);
        } else if (!updated || updated.length === 0) {
            console.error(`  ❌ ${name} CLAIM FAILED (RLS Silent Block or already claimed).`);
        } else {
            console.log(`  ✅ ${name} CLAIM SUCCESSFUL!`);
            // Rollback
            await client.from('trinity_tasks').update({ status: 'pending', claimed_by: null }).eq('id', task.id);
        }
    }
}

testPermissions();
