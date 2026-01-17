import 'dotenv/config';
import * as dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// 1. FORCE LOAD ENV
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runProof() {
    console.log('--- [TRINITY ⚡ RAW PRODUCTION PROOF] ---');

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(url, key);

    // 1. Inject Task (Filling required fields)
    console.log('[PROOF] Injecting task...');
    const { data: task, error: tErr } = await supabase.from('trinity_tasks').insert({
        title: '[PROOF] Raw Production Test ' + Date.now(),
        description: 'Test description to satisfy not-null constraints.',
        status: 'pending',
        priority: 1000,
        task_type: 'research'
    }).select().single();

    if (tErr) {
        console.error('❌ Task Injection Failed:', tErr.message);
        return;
    }
    console.log(`[PROOF] ✅ Task injected: ${task.id}`);

    // 2. Attempt Artifact Save (Holy Grail Schema)
    console.log('[PROOF] Attempting Artifact Save...');
    const { error: aErr } = await supabase.from('trinity_artifacts').insert({
        task_id: task.id,
        title: `Proof Artifact ${task.id}`,
        content: 'Proof content.',
        artifact_type: 'text',
        creator_agent: 'trinity-shofet'
    });

    if (aErr) {
        console.warn(`❌ Artifact Save BLOCKED (Likely RLS): ${aErr.message}`);
    } else {
        console.log(`✅ SUCCESS! Artifact created.`);
    }

    // 3. Update Task
    console.log('[PROOF] Updating task...');
    const { error: updErr } = await supabase.from('trinity_tasks').update({
        status: 'completed',
        result: 'Success'
    }).eq('id', task.id);

    if (updErr) {
        console.error('❌ Task update failed:', updErr.message);
    } else {
        console.log('✅ Task marked COMPLETED.');
    }
}

runProof();
