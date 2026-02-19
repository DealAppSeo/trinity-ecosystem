import { MCPManager } from '../lib/mcp/MCPManager';

async function testASICloud() {
    const manager = new MCPManager();
    console.log('--- TESTING ASI:CLOUD MCP ---');

    try {
        console.log('\n[1] Discovery: Listing GPU Resources...');
        const res = await manager.routeToolCall('list_gpu_resources', {});
        console.log('Raw Result:', res);
        try {
            console.log('Parsed Result:', JSON.parse(res));
        } catch (e) {
            console.log('Result is not JSON (Plain String)');
        }

        console.log('\n[2] Inference: Testing decentralized chat tool...');
        const inf = await manager.routeToolCall('asi_chat_inference', {
            prompt: 'Explain decentralized arbitrage in one sentence.'
        });
        console.log('Raw Result:', inf);
        try {
            console.log('Parsed Result:', JSON.parse(inf));
        } catch (e) {
            console.log('Result is not JSON (Plain String)');
        }

        console.log('\n✅ ASI:Cloud MCP Integration Verified!');
    } catch (e: any) {
        console.error('❌ Integration Test Failed:', e.message);
    }
}

testASICloud();
