
import { mcpManager } from '../lib/mcp/MCPManager';
import * as dotenv from 'dotenv';

dotenv.config();

async function verifyExpansion() {
    console.log('🧪 Starting Phase 13/14 Verification Sprint...');

    await mcpManager.initializeAll();
    const tools = await mcpManager.listTools();
    console.log(`✅ Total Tools Registered: ${tools.length}`);

    const testSuites = [
        { name: 'Financial Fundamentals', tool: 'get_company_fundamentals', args: { symbol: 'AAPL', function: 'OVERVIEW' } },
        { name: 'Multimodal (Replicate)', tool: 'replicate_search', args: { query: 'video generation' } },
        { name: 'Academic Research', tool: 'semantic_scholar_search', args: { query: 'AGI safety' } },
        { name: 'Cloud Sandbox (E2B)', tool: 'cloud_execute_code', args: { code: 'print("Hello from Cloud")' } },
        { name: 'Human Interface', tool: 'request_human_clarification', args: { taskId: 'test-123', question: 'Should I favor speed or cost?' } }
    ];

    for (const suite of testSuites) {
        console.log(`\n--- Testing ${suite.name} ---`);
        try {
            const hasTool = tools.find(t => t.name === suite.tool);
            if (!hasTool) {
                console.error(`❌ Tool ${suite.tool} NOT FOUND!`);
                continue;
            }

            const result = await mcpManager.routeToolCall(suite.tool, suite.args);
            console.log(`✅ Result: ${result.substring(0, 200)}...`);
        } catch (e: any) {
            console.error(`❌ Suite ${suite.name} FAILED: ${e.message}`);
        }
    }

    console.log('\n✨ Verification Sprint Complete.');
}

verifyExpansion().catch(console.error);
