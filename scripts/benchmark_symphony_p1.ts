import * as dotenv from 'dotenv';
import * as path from 'path';
import { ConstitutionalAgent } from '../lib/agent/ConstitutionalAgent';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runSymphonyP1Benchmark() {
    console.log("=== PROJECT SYMPHONY: P1 ORCHESTRATION BENCHMARK ===");

    const agent = new ConstitutionalAgent({ name: 'veritas-p1-benchmark' });

    const dummyTask = {
        id: 'p1_bench_' + Date.now(),
        title: "P1 BENCHMARK: Critical Physics Reasoning",
        description: "Analyze the potential for 20% faster than light communication using quantum entanglement. Be adversarial and technical.",
        task_type: 'research'
    } as any;

    console.log(`\nDispatching Major7 team for task: ${dummyTask.title}`);
    const startTime = Date.now();

    try {
        const result = await agent.runMajor7Consensus(dummyTask.description, dummyTask);
        const duration = (Date.now() - startTime) / 1000;

        console.log("\n--- BENCHMARK RESULTS ---");
        console.log(`Execution Time: ${duration.toFixed(2)}s`);
        console.log(`Composite Belief: [${result.aggregatedBelief.map(b => b.toFixed(4)).join(', ')}]`);
        console.log(`Max Consensus: ${(Math.max(...result.aggregatedBelief) * 100).toFixed(2)}%`);
        console.log(`Symphony Status: ${result.status}`);
        console.log(`Judas Agent: ${result.judasAgent}`);
        console.log(`Disagreement Score: ${result.disagreement.toFixed(4)}`);

        if (Math.max(...result.aggregatedBelief) >= 0.618) {
            console.log("✅ GOLDEN RATIO CONSENSUS REACHED (>= 61.8%)");
        } else {
            console.log("⚠️ CONSENSUS ABSTAINED (< 61.8%)");
        }

        if (result.judasAgent !== 'NONE') {
            console.log(`✅ OUTLIER (JUDAS) DETECTED: ${result.judasAgent}`);
        } else {
            console.log("❌ NO JUDAS DETECTED (System too aligned?)");
        }

    } catch (error: any) {
        console.error("Benchmark failed:", error.message);
    }
}

runSymphonyP1Benchmark().catch(err => {
    console.error("Fatal benchmark error:", err);
});
