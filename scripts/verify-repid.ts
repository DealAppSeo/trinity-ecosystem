import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { ConstitutionalAgent } from '../lib/agent/ConstitutionalAgent';
import { createClient } from '@supabase/supabase-js';

async function verifyRepID() {
    console.log("🔍 Starting RepID Verification...");

    // 1. Initialize Supabase
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // 2. Initialize Agent (VERITAS for testing)
    // We use a custom name to verify registration
    const agentName = 'VERITAS_TEST_' + Date.now().toString().slice(-4);
    console.log(`🤖 Initializing Agent: ${agentName}`);

    // Hack: We need to cast it because we are using a dynamic name not in the static WisdomProfile list
    // The ConstitutionalAgent constructor defaults to HDM wisdom if not found, which is fine.
    const agent = new ConstitutionalAgent({ name: agentName });

    // 3. Sync State (Should Register)
    await agent.syncState();
    console.log(`✅ State Synced. Initial Rep: ${agent.reputationScore}`);

    if (agent.reputationScore !== 10) {
        console.error("❌ FAIL: Initial reputation should be 10");
        process.exit(1);
    }

    // 4. Simulate a Success Task
    console.log("🏋️ Simulating Successful Task Completion...");
    await agent.updateReputation(true);

    if ((agent.reputationScore as number) !== 11) {
        console.error(`❌ FAIL: Reputation should increase to 11. Got: ${agent.reputationScore}`);
        process.exit(1);
    }
    console.log(`✅ Reputation increased to ${agent.reputationScore}`);

    // 5. Verify Persistence in DB
    console.log("💾 Verifying DB Persistence...");
    const { data, error } = await supabase
        .from('trinity_agent_registry')
        .select('*')
        .eq('agent_name', agentName)
        .single();

    if (error || !data) {
        console.error("❌ FAIL: Could not fetch agent record from DB", error);
        process.exit(1);
    }

    if (data.reputation_score !== 11) {
        console.error(`❌ FAIL: DB record has wrong score. Got: ${data.reputation_score}, Expected: 11`);
        process.exit(1);
    }

    if (data.tasks_completed !== 1) {
        console.error(`❌ FAIL: DB record has wrong tasks_completed. Got: ${data.tasks_completed}, Expected: 1`);
        process.exit(1);
    }

    console.log("✅ DB Persistence Verified!");

    // 6. Access Control Check
    console.log("🛡️ Testing Access Control...");
    const canAssist = agent.checkPermission('Assist');
    const canAct = agent.checkPermission('Act');

    console.log(`   - Can Assist (Limit 0+): ${canAssist} (Expected: true)`);
    console.log(`   - Can Act (Limit 71+): ${canAct} (Expected: false)`);

    if (canAssist === true && canAct === false) {
        console.log("✅ Access Control Logic Verified!");
    } else {
        console.error("❌ FAIL: Access Control Logic incorrect");
    }

    // Cleanup (Optional, but keeps DB clean)
    // await supabase.from('trinity_agent_registry').delete().eq('agent_name', agentName);
    // console.log("🧹 Test Data Cleaned");

    console.log("\n🎉 VERIFICATION SUCCESSFUL: RepID System is Functional");
}

verifyRepID().catch(console.error);
