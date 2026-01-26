import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function bootstrap() {
    console.log('--- 🚀 SWARM BOOTSTRAP: PURGE & SEED ---');

    // 1. Purge
    console.log('🧹 Purging dependent tables...');
    try {
        await supabase.from('trinity_tasks').update({ parent_task_id: null }).neq('id', 0);
        await supabase.from('failure_analysis').delete().neq('id', 0);
        await supabase.from('trinity_insights').delete().neq('id', 0);
        await supabase.from('trinity_artifacts').delete().neq('id', 0);
        await supabase.from('trinity_agent_logs').delete().neq('id', 0);
    } catch (e) { console.warn('Purge warning:', e); }

    console.log('🧹 Purging trinity_tasks in batches...');
    let totalDeleted = 0;
    let failCount = 0;
    while (failCount < 5) {
        const { data: batch, error: fetchError } = await supabase
            .from('trinity_tasks')
            .select('id')
            .limit(100);

        if (fetchError) {
            console.error('❌ Fetch failed:', fetchError.message);
            break;
        }

        if (!batch || batch.length === 0) break;

        const ids = batch.map(t => t.id);
        const { error: deleteError } = await supabase
            .from('trinity_tasks')
            .delete()
            .in('id', ids);

        if (deleteError) {
            console.error('❌ Batch delete failed:', deleteError.message);
            failCount++;
            // Try to delete individual items if batch fails
            for (const id of ids) {
                await supabase.from('trinity_tasks').delete().eq('id', id);
            }
        } else {
            totalDeleted += batch.length;
            console.log(`✅ Deleted ${totalDeleted} tasks...`);
            failCount = 0;
        }
    }
    console.log('✅ Queue cleared.');

    // 2. Seed Level 1 Tasks
    const tasks = [
        {
            title: '[LEVEL 1] Artifact Creation Test',
            description: `
[DIRECTIVE]: EXPLICIT EXECUTION REQUIRED.
1. Use the 'save_artifact' tool.
2. Title: 'Bootstrap Success Memo'
3. Content: 'The swarm has been successfully bootstrapped. Level 1 execution confirmed.'
4. Type: 'report'
5. Access Level: 'public'

[SQL_FALLBACK]: If tool fails, output the text clearly so verifiers can see it.
`,
            task_type: 'content',
            priority: 100,
            status: 'pending',
            metadata: { level: 1, evergreen: true }
        },
        {
            title: '[LEVEL 1] Agent Directory Scan',
            description: `
[DIRECTIVE]: EXPLICIT TOOL USAGE.
1. Use your research capabilities or internal knowledge to list 3 agents in this swarm.
2. Save the list using 'save_artifact' with title 'Swarm Registry Scan'.
3. Do not over-analyze. Just list and save.
`,
            task_type: 'research',
            priority: 90,
            status: 'pending',
            metadata: { level: 1, evergreen: true }
        },
        {
            title: '[LEVEL 1] Verify & Loop',
            description: `
[DIRECTIVE]: SIMPLICITY IS KEY.
1. Confirm you are online and healthy.
2. Create a small markdown report about your current state.
3. Save it as 'Agent Health Pulse'.
`,
            task_type: 'maintenance',
            priority: 80,
            status: 'pending',
            metadata: { level: 1, evergreen: true }
        }
    ];

    console.log('🌱 Seeding Level 1 tasks...');
    const { error: seedError } = await supabase
        .from('trinity_tasks')
        .insert(tasks);

    if (seedError) {
        console.error('❌ Seeding failed:', seedError.message);
    } else {
        console.log('✅ Level 1 seeded. Swarm should now focus on these.');
    }

    console.log('--- BOOTSTRAP COMPLETE ---');
}

bootstrap();
