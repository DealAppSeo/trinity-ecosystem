import { ConstitutionalAgent } from '../lib/agent/ConstitutionalAgent';
import { Task } from '../lib/agent/types';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function verifyFastPath() {
    console.log("--- FAST PATH VERIFICATION ---");
    const agent = new ConstitutionalAgent({
        name: 'trinity-orch',
        autonomyTier: 1, // Economy
        primaryVirtue: 'Wisdom'
    } as any);

    // [MOCK] Bypass DB for test
    (agent as any).claimTask = async () => true;
    (agent as any).availableProviders = ['together']; // Force healthy one
    (agent as any).log = async () => { };
    (agent as any).updateReputation = async () => { };

    const task: Task = {
        id: Math.floor(Math.random() * 9007199254740991), // Large positive integer for bigint
        title: 'Simple Greeting',
        description: 'Just say hello and tell me what time it is.',
        status: 'todo',
        priority: 'low',
        task_type: 'chat',
        created_at: new Date().toISOString(),
        metadata: JSON.stringify({ provider_used: 'together' }) // Force Together for speed
    } as any;

    console.log(`[TEST] Task: ${task.title}`);
    const start = Date.now();
    try {
        const result = await agent.processTask(task);
        const duration = (Date.now() - start) / 1000;
        console.log(`\n[TEST] Result Output: ${result.output?.substring(0, 100)}...`);
        console.log(`[TEST] Total Latency: ${duration.toFixed(2)}s`);

        if (duration < 10) {
            console.log("✅ INFRASTRUCTURE RESTORED: Fast path achieved sub-10s latency.");
        } else {
            console.log("⚠️ CAUTION: Latency exceeded 10s. Check logs for routing decisions.");
        }
    } catch (e: any) {
        console.error(`❌ TEST FAILED: ${e.message}`);
    }
}

verifyFastPath().catch(console.error);
