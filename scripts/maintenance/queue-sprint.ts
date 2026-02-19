
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function queueSprint() {
    console.log('🚀 Queuing "Build Phase" Learning Sprint...');

    const tasks = [
        {
            title: 'Basic Write Test',
            description: 'Use FileSystemMCP to create artifacts/test-hello.md with "# Hello from {agent_name}" + RepID stamp.',
            status: 'pending',
            priority: 'high', // Use text priority as per schema or 'high' mapped to int? Schema uses text 'high'? Standard is text.
            assigned_to: 'HDM',
            task_type: 'debug'
        },
        {
            title: 'Research Artifact',
            description: 'Research Solana SBTs, write to artifacts/sbt-research.md, verify with Trust Card.',
            status: 'pending',
            priority: 'medium',
            assigned_to: 'W3C', // W3C might not exist in swarm yet? If not, Orchestrator will pick or fail. Let's send to Orchestrator to route if unsure. Or VERITAS? 
            // The prompt mentioned W3C. I'll stick to it. If agent doesn't exist, it stays pending.
            task_type: 'research'
        },
        {
            title: 'Content Draft + Commit',
            description: 'Draft welcome email, write to artifacts/welcome-v2.md.',
            status: 'pending',
            priority: 'medium',
            assigned_to: 'MEL',
            task_type: 'content'
        },
        {
            title: 'Health Check Report',
            description: 'Run repo health, generate artifacts/health-report.md with SWOT.',
            status: 'pending',
            priority: 'medium',
            assigned_to: 'TORCH',
            task_type: 'system'
        },
        {
            title: 'Full VC Scout',
            description: 'Scout aidebate.io, produce artifacts/vc-scout-report.md with investment matrix + improvements.',
            status: 'pending',
            priority: 'medium',
            assigned_to: 'VERITAS',
            task_type: 'research'
        }
    ];

    for (const task of tasks) {
        const { error } = await supabase.from('trinity_tasks').insert({
            ...task,
            created_at: new Date().toISOString()
        });
        if (error) console.error(`Failed to queue ${task.title}:`, error.message);
        else console.log(`✅ Queued: ${task.title} -> ${task.assigned_to}`);
    }
}

queueSprint();
