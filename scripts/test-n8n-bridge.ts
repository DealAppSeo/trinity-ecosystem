
import { N8NMCP } from '../lib/mcp/servers/N8NMCP';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * 🧪 n8n Bridge Verification
 * Tests the N8NMCP integration by attempting to connect and list workflows.
 */
async function testN8N() {
    console.log('🧪 Starting n8n Bridge Verification...');

    const n8n = new N8NMCP();
    try {
        await n8n.initialize();
        const health = await n8n.healthCheck();
        console.log(`[Health Check]: ${health ? '🟢 ONLINE' : '🔴 OFFLINE'}`);

        if (process.env.N8N_API_KEY) {
            console.log('🔎 Attempting Workflow Discovery...');
            const workflows = await n8n.callTool('n8n_list_workflows', { activeOnly: false });
            console.log('✅ Discovery Result:', workflows);
        } else {
            console.log('⚠️ N8N_API_KEY missing. Skipping discovery test.');
        }

        console.log('\n📝 Webhook Trigger Simulation (Dry Run)');
        console.log('   Note: This will likely fail if no local n8n is running, but verifies the logic path.');
        const webhookResult = await n8n.callTool('n8n_trigger_webhook', {
            webhookId: 'trinity-health-check',
            data: { status: 'testing', timestamp: new Date().toISOString() },
            isTest: true
        });
        console.log('📡 Webhook Response:', webhookResult);

    } catch (e: any) {
        console.error('❌ Bridge Test Failed:', e.message);
    }
}

testN8N();
