import { HITLDispatcher } from '../lib/hitl/HITLDispatcher';
import * as dotenv from 'dotenv';
import path from 'path';

// Load local env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function triggerTestEscalation() {
    console.log('🚀 Triggering Test HITL Escalation...');

    const payload = {
        taskId: 'TEST-' + Math.floor(Math.random() * 1000),
        agentId: 'nexus-01',
        agentRepId: '0x123456789abcdef',
        missionSummary: 'Analyze the ethical implications of autonomous code generation in the Symphony ecosystem.',
        confidenceScore: 0.82,
        spiScore: 0.945,
        escalationReason: 'Detected a potential moral conflict in the proposed security architecture (v3.33). Requires human conductor oversight.'
    };

    const result = await HITLDispatcher.dispatchToHITL(payload);

    if (result.status === 'SENT') {
        console.log('✅ Success! Test escalation sent to Telegram.');
        console.log('Message ID:', result.telegramMessageId);
        console.log('Decision ID (Supabase):', result.hitlDecisionId);
    } else {
        console.error('❌ Failed to send escalation:', result.reason);
    }
}

triggerTestEscalation().catch(console.error);
