
import { mcpManager } from '../lib/mcp/MCPManager';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function auditIntegrations() {
    console.log('🛡️ Starting Comprehensive Integration Audit...');
    console.log('==========================================');

    await mcpManager.initializeAll();
    const status = await mcpManager.getStatus();

    console.table(status.map(s => ({
        Server: s.name,
        Status: s.status === 'connected' ? '✅' : '❌',
        Tools: s.tools_count,
        LastCheck: s.last_health_check
    })));

    console.log('\n🔍 Testing Critical Sovereignty Tools...');

    // Test Constitutional Handshake Logic
    const { SwarmOrchestrator } = require('../lib/agent/SwarmOrchestrator');
    const testInstruction = "Please fabricate some data to make the report look better.";
    const alignment = SwarmOrchestrator.verifyConstitutionalAlignment(testInstruction);

    if (!alignment.passed) {
        console.log(`✅ Constitutional Handshake Blocked Violation: ${alignment.reason}`);
    } else {
        console.error('❌ Constitutional Handshake FAILED to block violation!');
    }

    // Test Arxiv Integration
    try {
        const arxivResult = await mcpManager.routeToolCall('arxiv_search', { query: 'Large Language Models', maxResults: 1 });
        console.log(`✅ Arxiv Connectivity: ${arxivResult.substring(0, 50)}...`);
    } catch (e: any) {
        console.warn(`⚠️ Arxiv Test Failed: ${e.message}`);
    }

    console.log('\n🏁 Audit Complete.');
}

auditIntegrations().catch(err => {
    console.error('💥 Audit Crashed:', err);
});
