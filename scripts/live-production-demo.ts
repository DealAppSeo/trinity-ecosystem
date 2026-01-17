import 'dotenv/config';
import * as dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { ConstitutionalAgent } from '../lib/agent/ConstitutionalAgent';

// 1. FORCE LOAD ENV
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runDemo() {
    console.log('--- [TRINITY 🚀 LIVE PRODUCTION DEMO] ---');
    console.log('Objective: Prove production code can execute, complete, and save artifacts.');

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(url, key);

    // 1. Inject a dedicated High-Priority Demo Task
    const demoId = `DEMO-${Date.now().toString().slice(-4)}`;
    console.log(`[DEMO] 🔨 Injecting Dedicated Task: ${demoId}`);

    const { data: task, error: injectError } = await supabase.from('trinity_tasks').insert({
        title: `[PROD-DEMO] Artifact Proof of Life (${demoId})`,
        description: "Analyze the current ecosystem stability and produce a 1-paragraph sustainability report.",
        task_type: 'research',
        assigned_to: 'trinity-shofet',
        status: 'pending',
        priority: 1000,
        is_real: true
    }).select().single();

    if (injectError) {
        console.error('❌ Failed to inject demo task:', injectError.message);
        return;
    }

    console.log(`[DEMO] ✅ Task Injected: ${task.id} (BigInt)`);

    // 2. Instantiate and Run Agent for ONE task only
    console.log(`[DEMO] 🤖 Booting trinity-shofet (PROD MODE)...`);
    const agent = new ConstitutionalAgent({ name: 'trinity-shofet' });

    console.log(`[DEMO] 🏃 Manually claiming and processing task: ${task.id}`);

    try {
        await agent.syncState();

        const { error: claimError } = await supabase
            .from('trinity_tasks')
            .update({ status: 'in_progress', claimed_by: agent.name, started_at: new Date().toISOString() })
            .eq('id', task.id);

        if (claimError) throw new Error(`Claim failed: ${claimError.message}`);

        await new Promise(r => setTimeout(r, 1000));

        // Process directly
        await agent.processTask(task);

        console.log(`[DEMO] 🎉 Task ${task.id} PROCESSING COMPLETE.`);

        // 3. Verification
        console.log(`[DEMO] 🔍 Verifying Artifact Creation...`);
        // Wait a beat for DB sync
        await new Promise(r => setTimeout(r, 2000));

        const { data: artifact, error: artError } = await supabase
            .from('trinity_artifacts')
            .select('*')
            .eq('task_id', String(task.id))
            .limit(1);

        if (artError || !artifact || artifact.length === 0) {
            console.error(`❌ NO ARTIFACT PRODUCED in Holy Grail Schema.`);
            // Check legacy
            const { data: v4Art } = await supabase.from('trinity_artifacts').select('*').eq('task_id', String(task.id)).limit(1);
            if (v4Art && v4Art.length > 0) {
                console.log(`✅ Artifact FOUND in Legacy Schema (V4):`, v4Art[0].id);
            }
        } else {
            console.log(`✅ SUCCESS! Artifact FOUND in Holy Grail Schema (V5): ${artifact[0].id}`);
            console.log(`🔗 URL: ${artifact[0].url || artifact[0].file_path}`);
        }

    } catch (e: any) {
        console.error(`💥 DEMO CRASHED: ${e.message}`);
    }

    console.log('--- [DEMO FINISHED] ---');
}

runDemo();
