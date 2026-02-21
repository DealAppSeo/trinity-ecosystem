import * as dotenv from 'dotenv';
import * as path from 'path';
import { ConstitutionalAgent } from '../lib/agent/ConstitutionalAgent';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function verifyTIMLWiring() {
    console.log("=== TIML WIRING VERIFICATION ===");

    const agent = new ConstitutionalAgent({
        name: 'trinity-veritas',
    });

    // 1. SIMPLE QUERY
    const simpleTask = {
        id: Math.floor(Math.random() * 1000000) + 4000000,
        title: "[TIML_FINAL] France Capital",
        description: "What is the capital of France?",
        status: 'pending',
        priority: 10,
        task_type: 'research'
    };

    console.log(`\n--- TEST 1: SIMPLE QUERY ---`);
    console.log(`Task: ${simpleTask.title}`);
    const simpleStart = Date.now();
    await agent.processWithLLM(simpleTask as any);
    const simpleDuration = (Date.now() - simpleStart) / 1000;
    console.log(`Duration: ${simpleDuration.toFixed(2)}s`);

    // 2. COMPLEX QUERY
    const complexTask = {
        id: Math.floor(Math.random() * 1000000) + 5000000,
        title: "[TIML_FINAL] Byzantine Identity Security",
        description: "Analyze the security implications of EIP-8004 identity primitives under Byzantine failure conditions in a decentralized swarm.",
        status: 'pending',
        priority: 90,
        task_type: 'research'
    };

    console.log(`\n--- TEST 2: COMPLEX QUERY ---`);
    console.log(`Task: ${complexTask.title}`);
    const complexStart = Date.now();
    await agent.processWithLLM(complexTask as any);
    const complexDuration = (Date.now() - complexStart) / 1000;
    console.log(`Duration: ${complexDuration.toFixed(2)}s`);

    console.log("\nVerification complete. Check logs above for '[TIML] ⚡ FAST/MID PATH' vs '[TIML] 🐢 SLOW PATH'.");
}

verifyTIMLWiring().catch(console.error);
