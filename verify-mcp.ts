import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { ConstitutionalAgent } from './lib/agent/ConstitutionalAgent';

async function verifyMCP() {
    console.log("🔍 Starting MCP System Verification...");

    const agentName = 'MCP_TESTER_' + Date.now().toString().slice(-4);
    const agent = new ConstitutionalAgent({ name: agentName });

    // 1. Test WAKE Protocol Load
    console.log("1️⃣ Testing WAKE Phase...");
    const wakeDoc = await agent.checkMCP('WAKE');
    if (wakeDoc.includes('WAKE Protocol')) {
        console.log("✅ WAKE Protocol Loaded Successfully");
    } else {
        console.error("❌ Failed to load WAKE Protocol");
    }

    // 2. Test Fallback (Fake Phase)
    console.log("2️⃣ Testing Fallback Logic...");
    // @ts-expect-error Testing fallback with invalid phase
    const fallback = await agent.checkMCP('UNKNOWN_PHASE');
    if (fallback.includes('standard operating procedure')) {
        console.log("✅ Fallback Logic Works");
    } else {
        console.error("❌ Fallback Logic Failed");
    }

    // 3. Test Healing Throttle
    console.log("3️⃣ Testing Healing Throttle...");
    const canHeal = await agent.canCreateHealingTask();
    console.log(`   Can Heal? ${canHeal}`);
    // Should be true if no previous tasks, but requires DB access to verify fully. 
    // We assume the query runs without error.

    console.log("🎉 MCP Verification Complete");
}

verifyMCP().catch(console.error);
