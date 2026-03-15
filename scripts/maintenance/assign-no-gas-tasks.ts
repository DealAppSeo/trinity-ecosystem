import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function assignTasks() {
    console.log('🚀 Assigning No-Gas Tasks to Agents...');

    const tasks = [
        {
            title: '[MISSION] [NEXUS] Pull live crypto market signals (ETH/BTC/SOL)',
            description: 'Pull live crypto market signals into trinity_agent_logs. Focus on ETH/BTC/SOL. Log every 15 min to Supabase.',
            status: 'todo',
            priority: 10,
            task_type: 'data_collection',
            metadata: { agent: 'trinity-nexus', interval: '15m' }
        },
        {
            title: '[MISSION] [TORCH] Draft Hackathon LinkedIn Announcement Posts',
            description: 'Draft three versions of the hackathon LinkedIn announcement post. Store in linkedin_content_queue table. Flag for Sean review.',
            status: 'todo',
            priority: 8,
            task_type: 'content_creation',
            metadata: { agent: 'trinity-torch', review_by: 'Sean' }
        },
        {
            title: '[MISSION] [SOPHIA] Competitive Analysis: LabLab.ai x Surge Hackathon',
            description: 'Research current LabLab.ai x Surge hackathon participants. What are other teams building? Store findings in competitive_analysis table.',
            status: 'todo',
            priority: 9,
            task_type: 'research',
            metadata: { agent: 'trinity-sophia' }
        },
        {
            title: '[MISSION] [GCM] Developer Outreach List (LangChain/AutoGPT)',
            description: 'Build outreach list — 10 agent developers building with LangChain or AutoGPT who would benefit from @hyperdag/trustshell. Store in linkedin_content_queue with status: PENDING_REVIEW.',
            status: 'todo',
            priority: 7,
            task_type: 'growth',
            metadata: { agent: 'trinity-gcm', count: 10 }
        }
    ];

    for (const task of tasks) {
        const { data, error } = await supabase
            .from('trinity_tasks')
            .insert([task])
            .select();

        if (error) {
            console.error(`❌ Error assigning task "${task.title}":`, error.message);
        } else {
            console.log(`✅ Assigned: ${task.title}`);
        }
    }
}

assignTasks();
