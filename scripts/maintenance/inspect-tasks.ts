import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTasks() {
    console.log('--- [TRINITY TASK INSPECTOR] ---');

    // Check pending tasks
    const { data: pending, error: pError } = await supabase
        .from('trinity_tasks')
        .select('id, title, assigned_to, status')
        .eq('status', 'pending');

    if (pError) console.error('Error fetching pending tasks:', pError.message);
    else console.log(`Pending Tasks: ${pending?.length || 0}`);

    // Check in-progress tasks
    const { data: inProgress, error: iError } = await supabase
        .from('trinity_tasks')
        .select('id, title, claimed_by, status')
        .in('status', ['doing', 'in_progress']);

    if (iError) console.error('Error fetching in-progress tasks:', iError.message);
    else console.log(`In-Progress Tasks: ${inProgress?.length || 0}`);

    // Check active agents
    const { data: agents, error: aError } = await supabase
        .from('trinity_agent_registry')
        .select('agent_name, last_active, current_tier, reputation_score');

    if (aError) console.error('Error fetching agents:', aError.message);
    else {
        console.log('\n--- [AGENT STATUS] ---');
        agents?.forEach(a => {
            const lastActive = new Date(a.last_active);
            const now = new Date();
            const diffMin = Math.floor((now.getTime() - lastActive.getTime()) / 1000 / 60);
            console.log(`${a.agent_name}: ${a.current_tier} | Rep: ${a.reputation_score} | Last Active: ${diffMin}m ago`);
        });
    }
}

checkTasks();
