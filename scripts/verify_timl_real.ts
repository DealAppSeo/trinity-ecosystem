import * as dotenv from 'dotenv';
import * as path from 'path';
import { TIMLManager } from '../lib/agent/TIMLManager';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function verifyTIML() {
    console.log("=== TIML REAL DATA VERIFICATION ===");
    const timl = new TIMLManager();
    const agentName = 'trinity-veritas';

    const result = await timl.analyze(agentName);

    console.log("\n----------------------------------------");
    console.log(`AGENT: ${agentName}`);
    console.log(`MEASURED ALPHA (α): ${result.alpha.toFixed(4)}`);
    console.log("ALLOCATION VECTOR:");
    console.log(`  [FAST]: ${result.allocation.fast_budget.toFixed(2)}`);
    console.log(`  [MID]:  ${result.allocation.mid_budget.toFixed(2)}`);
    console.log(`  [SLOW]: ${result.allocation.slow_budget.toFixed(2)}`);
    console.log("----------------------------------------\n");

    // Attempt to log to Supabase for Step 4
    console.log("Logging analysis to Supabase...");
    await timl.logAnalysis(agentName, 1840991, result.alpha, result.allocation);
    console.log("✅ Logged successfully.");
}

verifyTIML().then(() => process.exit(0));
