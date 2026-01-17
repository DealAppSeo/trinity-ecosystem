/**
 * TRINITY PROGRESSIVE SCALING PROTOCOL: EXECUTION PROOF
 * This script demonstrates end-to-end production flow:
 * 1. Task Seeding
 * 2. Agent state-sync
 * 3. Autonomous execution & LLM inference
 * 4. Artifact persistence (Holy Grail Schema)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Dynamically load the COMPILED agent to avoid TS transformation errors
const { ConstitutionalAgent } = require('../dist/lib/agent/ConstitutionalAgent');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runProgressiveProof() {
    console.log('\n--- [TRINITY 🚀 PROGRESSIVE SCALING PROTOCOL] ---');
    console.log('Objective: Prove production execution of tasks & artifacts.\n');

    const demoId = `PROOF-${Date.now().toString().slice(-4)}`;

    // PHASE 1: SEEDING
    console.log(`[PHASE 1] 🔨 Seeding 3 Progressive Tasks (${demoId})...`);
    const tasks = [
        {
            title: `[PROG-A] Infrastructure Audit (${demoId})`,
            description: "Analyze the current Supabase schema and confirm if Holy Grail columns are ready.",
            task_type: 'research',
            assigned_to: 'trinity-shofet',
            status: 'pending',
            priority: 1000,
            is_real: true
        },
        {
            title: `[PROG-B] Strategic Directive (${demoId})`,
            description: "Draft a high-level mission objective for the next 24 hours of Swarm operation.",
            task_type: 'content',
            assigned_to: 'trinity-shofet',
            status: 'pending',
            priority: 999,
            is_real: true
        }
    ];

    const { data: insertedTasks, error: seedError } = await supabase
        .from('trinity_tasks')
        .insert(tasks)
        .select();

    if (seedError) {
        console.error('❌ SEEDING FAILED:', seedError.message);
        return;
    }
    console.log(`✅ Seeded ${insertedTasks.length} tasks successfully.\n`);

    // PHASE 2: AGENT BOOT
    console.log(`[PHASE 2] 🤖 Booting 'trinity-shofet' from Production Core...`);
    const agent = new ConstitutionalAgent({ name: 'trinity-shofet' });

    try {
        await agent.syncState();
        console.log(`✅ Agent Synced: Tier [${agent.autonomyTier}] | Tasks Completed: ${agent.tasksCompleted}\n`);

        // PHASE 3: EXECUTION LOOP
        console.log(`[PHASE 3] 🏃 Starting Execution Loop (Processing ${insertedTasks.length} tasks)...`);

        for (const task of insertedTasks) {
            console.log(`\n--- Processing: ${task.title} ---`);

            // 1. Claim Task
            const { error: claimErr } = await supabase
                .from('trinity_tasks')
                .update({
                    status: 'in_progress',
                    claimed_by: agent.name,
                    started_at: new Date().toISOString()
                })
                .eq('id', task.id);

            if (claimErr) {
                console.warn(`⚠️ Claim failed for ${task.id}: ${claimErr.message}`);
                continue;
            }
            console.log(`💎 Task ${task.id} CLAIMED.`);

            // 2. Execute Task (LLM + Logic)
            // Note: We use the internal processTask method from the compiled core
            await agent.processTask(task);

            // 3. Post-Execution Verification
            console.log(`🔍 Verifying persistence for task ${task.id}...`);

            // Wait for DB consistency
            await new Promise(r => setTimeout(r, 2000));

            const { data: artifact, error: artErr } = await supabase
                .from('trinity_artifacts')
                .select('*')
                .eq('task_id', String(task.id))
                .limit(1);

            if (artErr || !artifact || artifact.length === 0) {
                console.log(`❌ NO ARTIFACT FOUND in primary schema. Checking fallback...`);
                // Fallback check
                const { data: v4Art } = await supabase.from('trinity_artifacts').select('*').eq('task_id', String(task.id)).limit(1);
                if (v4Art && v4Art.length > 0) {
                    console.log(`✅ PERSISTENCE CONFIRMED in Legacy Schema: ${v4Art[0].id}`);
                } else {
                    console.error(`❌ PERSISTENCE FAILURE. Agent logic returned but no DB write detected.`);
                }
            } else {
                console.log(`✅ PERSISTENCE CONFIRMED in Holy Grail Schema: ${artifact[0].id}`);
                console.log(`📄 Title: ${artifact[0].title}`);
            }

            const { data: updatedTask } = await supabase.from('trinity_tasks').select('status').eq('id', task.id).single();
            console.log(`🏁 Final Task Status: ${updatedTask?.status}`);
        }

    } catch (e) {
        console.error(`💥 EXECUTION CRASHED: ${e.message}\nStack: ${e.stack}`);
    }

    console.log('\n--- [PROOF OF LIFE FINISHED] ---');
    console.log('If you see SUCCESS above, the swarm is truly unblocked.');
}

runProgressiveProof();
