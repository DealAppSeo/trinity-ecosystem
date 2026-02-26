import * as dotenv from 'dotenv';
import * as path from 'path';
import { supabaseAdmin as supabase } from '../lib/supabase';
import { ConstitutionalAgent } from '../lib/agent/ConstitutionalAgent';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testStreaming() {
    console.log("=== PROJECT SYMPHONY: P0 STREAMING VERIFICATION ===");

    const agent = new ConstitutionalAgent({ name: 'chesed-stream-test' });

    // 1. Create a dummy task that requires a long reasoning response
    console.log("Creating long-form reasoning task...");
    const { data: task, error: createError } = await supabase
        .from('trinity_tasks')
        .insert({
            title: "Verification: Long-form Stream Test",
            description: "Explain the philosophy of Project Symphony in 500 words, focusing on the integration of Major7 chords into AI consensus. Be verbose to ensure streaming accumulation.",
            status: 'pending',
            priority: 100,
            task_type: 'research'
        })
        .select()
        .single();

    if (createError) throw createError;
    console.log(`Task created: ${task.id}`);

    // 2. Start processing in the background
    console.log("Starting agent processing (Simulating stream callback)...");

    // We'll run the processTask but also poll the DB in parallel to see the "Streaming..." updates
    const processPromise = agent.processTask(task as any);

    // 3. Polling for 30 seconds to see the result column changing
    const pollInterval = setInterval(async () => {
        const { data: updatedTask } = await supabase
            .from('trinity_tasks')
            .select('result, status')
            .eq('id', task.id)
            .single();

        if (updatedTask) {
            console.log(`\n[POLL] Status: ${updatedTask.status} | Length: ${updatedTask.result?.length || 0}`);
            if (updatedTask.result?.includes("(Streaming...)")) {
                console.log("✅ STREAMING DETECTED: " + updatedTask.result.substring(0, 50) + "...");
            }
        }
    }, 2000);

    await processPromise;
    clearInterval(pollInterval);
    console.log("\n=== STREAMING VERIFICATION COMPLETE ===");
}

testStreaming().catch(err => {
    console.error("Test failed:", err);
});
