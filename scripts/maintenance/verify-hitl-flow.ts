
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const { HITLManager } = require('../lib/agent/HITLManager');
const { supabase, supabaseAdmin } = require('../lib/supabase');

async function verifyHITLFlow() {
    console.log('--- HITL FLOW VERIFICATION ---');

    const hitl = HITLManager.getInstance();
    const testTaskId = "71765"; // Real Task ID from trinity_tasks
    const agentName = 'TEST-VERIFIER';

    console.log(`[1] Escalating test task: ${testTaskId}...`);
    try {
        const requestId = await hitl.escalate(
            testTaskId,
            agentName,
            'VERIFICATION_TEST: Low confidence in simulated result.',
            { dummy: 'data', eval_score: 35 }
        );
        console.log(`✅ Escalation successful. Request ID: ${requestId}`);

        console.log(`[2] Checking database for request...`);
        const { data: request, error } = await supabaseAdmin
            .from('trinity_hitl_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (error) throw error;
        console.log(`✅ Request found in DB. Status: ${request.status}`);

        console.log(`[3] Resolving request (Mocking Founder Decision)...`);
        await hitl.resolve(requestId, 'approved', 'Decision Approved by script.');
        console.log(`✅ Resolution command sent.`);

        console.log(`[4] Final status check...`);
        const { data: finalReq } = await supabaseAdmin
            .from('trinity_hitl_requests')
            .select('status')
            .eq('id', requestId)
            .single();

        console.log(`✅ Final status in DB: ${finalReq?.status}`);

        if (finalReq?.status === 'approved') {
            console.log('\n✨ HITL FLOW VERIFIED SUCCESSFULLY ✨');
        } else {
            console.error('\n❌ HITL FLOW VERIFICATION FAILED: Status mismatch.');
        }

    } catch (e: any) {
        console.error('❌ Verification failed:', e.message);
    }
}

verifyHITLFlow();
