import * as dotenv from 'dotenv';
import * as path from 'path';
import { ConstitutionalAgent } from '../lib/agent/ConstitutionalAgent';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function verifySBFA() {
    console.log("=== v2.24 SBFA INTEGRATION VERIFICATION ===");

    // Initialize Agent
    const agent = new ConstitutionalAgent({
        name: 'trinity-veritas',
    });

    // 1. SIMPLE QUERY
    const simpleTask = {
        id: Math.floor(Math.random() * 1000000) + 2000000,
        title: "[TIML_TEST_SIMPLE] France Capital",
        description: "What is the capital of France?",
        status: 'pending',
        priority: 10,
        task_type: 'research'
    };

    // 2. COMPLEX QUERY
    const complexTask = {
        id: Math.floor(Math.random() * 1000000) + 3000000,
        title: "[TIML_TEST_COMPLEX] Byzantine EIP-8004",
        description: "Analyze the security implications of the EIP-8004 identity primitive under Byzantine failure conditions.",
        status: 'pending',
        priority: 90,
        task_type: 'research'
    };

    console.log(`\n--- RUNNING SIMPLE TASK: ${simpleTask.title} ---`);
    await agent.processWithLLM(simpleTask as any);

    console.log(`\n--- RUNNING COMPLEX TASK: ${complexTask.title} ---`);
    await agent.processWithLLM(complexTask as any);

    try {
        // We call processWithLLM directly to trigger the triadic flow
        // Note: processWithLLM returns { success: boolean, llm_used: boolean }
        const result = await agent.processWithLLM(testTask as any);

        console.log("\n========================================");
        console.log("VERIFICATION RESULT");
        console.log("VERIFICATION RESULT (processWithLLM)");
        console.log("========================================");
        console.log(`Success: ${result.success}`);
        console.log(`LLM Used: ${result.llm_used}`);
        console.log("========================================");

        if (result.success) {
            console.log("✅ SBFA Triadic Consensus (processWithLLM) executed successfully.");
            console.log("Attempting to process task with agent.processTask for further verification...");

            const processTaskResult = await agent.processTask(testTask as any);

            if (processTaskResult && processTaskResult.success) {
                console.log("\n✅ SBFA Integration Verified Successfully!");
                console.log("Check trinity_agent_logs in Supabase for 'sbfa_pi_terms' entry.");
            } else {
                console.warn("\n⚠️ SBFA Task failed or reported error, but check logs for 'sbfa_pi_terms' action.");
            }
        } else {
            console.error("❌ SBFA Verification Failed (processWithLLM did not succeed).");
        }
    } catch (error) {
        console.error("❌ Fatal Error during SBFA verification:", error);
    }
}

verifySBFA().then(() => {
    console.log("Verification script finished.");
    process.exit(0);
}).catch(err => {
    console.error("Unhandle rejection:", err);
    process.exit(1);
});
