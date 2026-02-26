import * as dotenv from 'dotenv';
import * as path from 'path';
import { ConstitutionalAgent } from '../lib/agent/ConstitutionalAgent';
import { SBFAOperator } from '../lib/agent/SBFAOperator';
import { VeritasConverter } from '../lib/agent/VeritasConverter';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runSynergyBenchmark() {
    console.log("=== PROJECT SYMPHONY: P0 SYNERGY BENCHMARK (TRIAD VS MAJOR7) ===");

    // We'll use two agents to facilitate the test
    const chesed = new ConstitutionalAgent({ name: 'chesed-veritas' });
    const sophia = new ConstitutionalAgent({ name: 'sophia-veritas' });

    const testTasks = [
        {
            id: 101,
            title: "Reasoning: The Bat and Ball Problem",
            description: "A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost? Show your reasoning step-by-step.",
            ground_truth: "0.05"
        },
        {
            id: 102,
            title: "Logic: Transitive Inference",
            description: "If all A are B, and some B are C, is it necessarily true that some A are C? Explain why or why not with a formal logical proof.",
            ground_truth: "No"
        },
        {
            id: 103,
            title: "Coding: Fibonacci Space Complexity",
            description: "Write a function to calculate the n-th Fibonacci number with O(1) space complexity. Explain the logic.",
            ground_truth: "Iterative approach with two variables"
        },
        {
            id: 104,
            title: "Adversarial: The Liar's Paradox",
            description: "Analyze the statement 'This statement is false.' from a mathematical logic perspective. Is it a valid proposition in ZFC set theory?",
            ground_truth: "No (Self-referential paradox)"
        },
        {
            id: 105,
            title: "MMLU: Physics (Quantum Mechanics)",
            description: "Explain the Heisenberg Uncertainty Principle and its relationship to the commutator of position and momentum operators [x, p].",
            ground_truth: "i*hbar"
        }
    ];

    const results = {
        triad: { success: 0, total: 0, latencies: [] as number[], costs: [] as number[], belief_avg: 0 },
        major7: { success: 0, total: 0, latencies: [] as number[], costs: [] as number[], belief_avg: 0 }
    };

    console.log(`\nTesting ${testTasks.length} tasks across Triad (3) and Major7 (4) formations...\n`);

    for (const task of testTasks) {
        console.log(`\n--- Task ${task.id}: ${task.title} ---`);

        // 1. TRIAD (3 agents)
        console.log(`[TRIAD] Dispatching 3 agents...`);
        const triadStart = Date.now();
        const triadResponses = await Promise.all([
            chesed.callLLM(task.description, { forceModel: 'openai-gpt-4o' }),
            sophia.callLLM(task.description, { forceModel: 'anthropic-claude-3-5-sonnet' }),
            chesed.callLLM(task.description, { forceModel: 'gemini-1.5-flash' })
        ]);
        const triadDuration = (Date.now() - triadStart) / 1000;

        const triadBeliefs = triadResponses.map(r => VeritasConverter.extract(r.output));
        const triadConsensus = SBFAOperator.process({
            beliefs: triadBeliefs as [number, number, number][],
            latencies: triadResponses.map(() => triadDuration), // Simulation
            costs: [0.03, 0.03, 0.01] // Estimated
        });

        results.triad.total++;
        results.triad.latencies.push(triadDuration);
        results.triad.belief_avg += Math.max(...triadConsensus.aggregatedBelief);
        console.log(`[TRIAD] Consensus Status: ${triadConsensus.status} | Confidence: ${Math.max(...triadConsensus.aggregatedBelief).toFixed(2)}`);

        // 2. MAJOR7 (4 agents)
        console.log(`[MAJOR7] Dispatching 4 agents...`);
        const m7Start = Date.now();
        const m7Responses = await Promise.all([
            chesed.callLLM(task.description, { forceModel: 'openai-gpt-4o' }),
            sophia.callLLM(task.description, { forceModel: 'anthropic-claude-3-5-sonnet' }),
            chesed.callLLM(task.description, { forceModel: 'gemini-1.5-flash' }),
            sophia.callLLM(task.description, { forceModel: 'grok-3' })
        ]);
        const m7Duration = (Date.now() - m7Start) / 1000;

        const m7Beliefs = m7Responses.map(r => VeritasConverter.extract(r.output));
        const m7Consensus = SBFAOperator.process({
            beliefs: m7Beliefs as [number, number, number][],
            latencies: m7Responses.map(() => m7Duration),
            costs: [0.03, 0.03, 0.01, 0.02]
        });

        results.major7.total++;
        results.major7.latencies.push(m7Duration);
        results.major7.belief_avg += Math.max(...m7Consensus.aggregatedBelief);
        console.log(`[MAJOR7] Consensus Status: ${m7Consensus.status} | Confidence: ${Math.max(...m7Consensus.aggregatedBelief).toFixed(2)}`);
    }

    console.log("\n=== BENCHMARK RESULTS SUMMARY ===");
    const triadConf = results.triad.belief_avg / results.triad.total;
    const m7Conf = results.major7.belief_avg / results.major7.total;
    const synergy = (m7Conf / triadConf);

    console.log(`TRIAD Mean Confidence: ${triadConf.toFixed(4)}`);
    console.log(`MAJOR7 Mean Confidence: ${m7Conf.toFixed(4)}`);
    console.log(`Synergy Magnitude: ${synergy.toFixed(2)}x`);
    console.log(`Target Synergy: 4.5x (Method-dependent)`);

    console.log("\n[P0 CONCLUSION] If Synergy Magnitude > 1.0, the count effect is validated.");
}

runSynergyBenchmark().catch(err => {
    console.error("Benchmark failed:", err);
});
