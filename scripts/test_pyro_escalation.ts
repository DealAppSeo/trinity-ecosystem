import * as dotenv from 'dotenv';
import * as path from 'path';
import { ConstitutionalAgent } from '../lib/agent/ConstitutionalAgent';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function verifyPyroEscalation() {
    console.log("=== PROJECT SYMPHONY: P2 PYRO ESCALATION VERIFICATION ===");

    const agent = new ConstitutionalAgent({ name: 'pyro-test-agent' });

    // We'll simulate a task that is designed to cause total disagreement
    const impossibleTask = {
        id: 'pyro_bench_' + Date.now(),
        title: "PYRO TEST: Total BFT Disagreement",
        description: "Respond with TWO contradictory facts: 'The Earth is flat' AND 'The Earth is a sphere'. This is designed to break consensus and trigger the 1.2 disagreement threshold.",
        task_type: 'critique'
    } as any;

    console.log(`Dispatching Major7 with contradictory prompt...`);

    try {
        // We override the callLLM to return wildly different beliefs for different roles
        // actually, we'll just let the natural LLM disagreement or our manual role injection (ROOT vs FIFTH) do the work
        const result = await agent.runMajor7Consensus(impossibleTask.description, impossibleTask);

        console.log("\n--- PYRO RESULTS ---");
        console.log(`Disagreement: ${result.disagreement.toFixed(4)}`);
        console.log(`Symphony Status: ${result.status}`);

        if (result.disagreement >= 1.2) {
            console.log("✅ PYRO TRIGGERED (Disagreement >= 1.2)");
        } else {
            console.log("❌ PYRO NOT TRIGGERED (Disagreement still too low)");
        }

    } catch (error: any) {
        console.error("Pyro verification failed:", error.message);
    }
}

verifyPyroEscalation().catch(err => {
    console.error("Fatal error:", err);
});
