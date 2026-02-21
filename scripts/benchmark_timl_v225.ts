import * as dotenv from 'dotenv';
import * as path from 'path';
import { ConstitutionalAgent } from '../lib/agent/ConstitutionalAgent';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runBenchmark() {
    console.log("=== TIML v2.25 PERFORMANCE BENCHMARK (50 QUERIES) ===");

    const agent = new ConstitutionalAgent({
        name: 'trinity-veritas',
    });

    const tasks = [
        // --- SIMPLE (20) ---
        ...Array.from({ length: 20 }, (_, i) => ({
            id: 6000000 + i,
            title: `[BENCH:SIMPLE] Task ${i + 1}`,
            description: `Answer this simple question: What is the capital of ${['France', 'Germany', 'USA', 'Japan', 'Italy', 'UK', 'Spain', 'Canada', 'Australia', 'Brazil', 'China', 'India', 'Russia', 'Mexico', 'Egypt', 'Sweden', 'Norway', 'Finland', 'Greece', 'Turkey'][i]}?`,
            task_type: 'research'
        })),
        // --- COMPLEX (20) ---
        ...Array.from({ length: 20 }, (_, i) => ({
            id: 7000000 + i,
            title: `[BENCH:COMPLEX] Task ${i + 1}`,
            description: `Provide a detailed architectural analysis of ${['decentralized oracle networks', 'zero-knowledge proofs in rollups', 'byzantine fault tolerant consensus', 'liquid staking derivatives', 'cross-chain bridge security', 'recursive snarks', 'homomorphic encryption for voting', 'modular blockchain layers', 'account abstraction security', 'data availability sampling', 'proof of stake slashing conditions', 'maximal extractable value (MEV) mitigation', 'sharding in ethereum 2.0', 'governance tokenomics design', 'flash loan attack vectors', 'automated market maker (AMM) invariants', 'interoperability protocols', 'privacy-preserving smart contracts', 'stablecoin depegging risks', 'layer 2 state transition verification'][i]}.`,
            task_type: 'research',
            priority: 80
        })),
        // --- ADVERSARIAL (10) ---
        ...Array.from({ length: 10 }, (_, i) => ({
            id: 8000000 + i,
            title: `[BENCH:ADVERSARIAL] Task ${i + 1}`,
            description: `Critique the following controversial claim with high skepticism and logical rigor: ${['The moon landing was faked', 'Earth is flat', 'AI will inevitably destroy humanity by 2030', 'Bitcoin is a Ponzi scheme', 'Vaccines contain microchips', 'Time travel is already used by governments', 'Aliens built the pyramids', 'Cryptocurrency has zero intrinsic value', 'Privacy is a dead concept in the 21st century', 'Social media is purely a mind control tool'][i]}.`,
            task_type: 'research',
            priority: 95
        }))
    ];

    const stats = {
        total: 0,
        fast: 0,
        slow: 0,
        latencies: [] as number[],
    };

    console.log(`Starting ${tasks.length} tasks...\n`);

    for (const task of tasks) {
        const start = Date.now();
        process.stdout.write(`Processing Task ${task.id}... `);
        try {
            await agent.processWithLLM(task as any);
            const duration = (Date.now() - start) / 1000;
            stats.total++;
            stats.latencies.push(duration);

            // Heuristic path detection based on duration
            // Triadic SBFA (Slow path) involves 3+ LLM calls and consensus, almost always > 12s
            // Single LLM (Fast path) is typically < 8s
            if (duration > 10) {
                stats.slow++;
            } else {
                stats.fast++;
            }
            console.log(`✅ (${duration.toFixed(2)}s)`);
        } catch (e) {
            console.log(`❌ (${(e as Error).message.substring(0, 50)})`);
        }
    }

    console.log("\n\n=== BENCHMARK COMPLETE (IN-MEMORY ANALYTICS) ===");

    const total = stats.total;
    const slow = stats.slow;
    const fast = stats.fast;

    console.log("\n--- REAL-TIME RESULTS ---");
    console.log(`Total Tasks Processed: ${total}`);
    console.log(`Split Percentage: Fast/Mid: ${((fast / total) * 100).toFixed(1)}%, Slow: ${((slow / total) * 100).toFixed(1)}%`);
    console.log(`Mean Latency: ${(stats.latencies.reduce((a, b) => a + b, 0) / total).toFixed(2)}s`);
    console.log(`(Note: ECE and Escalation metrics require direct instrumentation for high fidelity)`);
}

runBenchmark().catch(console.error);
