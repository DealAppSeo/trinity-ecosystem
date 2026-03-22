import { createClient } from '@supabase/supabase-js';
import { ConstitutionalAgent } from '../lib/agent/ConstitutionalAgent';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    console.log("Locating HAL-002 task...");
    const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY! || process.env.SUPABASE_ANON_KEY!);
    const { data: task, error } = await s.from('trinity_tasks').select('*').ilike('title', '%HAL-002%').limit(1).single();
    if (error || !task) { 
        console.error('Task HAL-002 not found or error:', error); 
        return; 
    }
    
    console.log("Task found:", task.title);
    const agent = new ConstitutionalAgent({ name: 'TORCH' } as any);
    await agent.syncState();
    
    console.log("Firing verifyPeerTask natively...");
    try {
        await agent.verifyPeerTask(task);
    } catch (e) {
        console.error("Error during verifyPeerTask:", e);
    }
    console.log("Diagnostic execution finished.");
    process.exit(0);
}
main();
