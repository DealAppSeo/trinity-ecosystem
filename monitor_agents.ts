import { supabaseAdmin } from './lib/supabase';

async function monitor() {
    console.log("Waiting for Railway deployment to complete (approx 90 seconds)...");
    await new Promise(r => setTimeout(r, 90000));
    
    const startTime = new Date();
    console.log(`Polling trinity_agent_logs for activity occurring after ${startTime.toISOString()}...`);
    
    for (let i = 0; i < 20; i++) {
        const { data, error } = await supabaseAdmin
            .from('trinity_agent_logs')
            .select('agent_name, event_type, created_at')
            .gt('created_at', startTime.toISOString())
            .order('created_at', { ascending: false })
            .limit(10);
            
        if (data && data.length > 0) {
            console.log("\n================ AGENT ACTIVITY DETECTED ================");
            console.table(data.map(d => ({
                Agent: d.agent_name,
                Event: d.event_type,
                Time: d.created_at
            })));
            console.log("=========================================================");
            return;
        }
        
        process.stdout.write(".");
        await new Promise(r => setTimeout(r, 15000));
    }
    console.log("\nTimeout waiting for agents.");
}

monitor();
