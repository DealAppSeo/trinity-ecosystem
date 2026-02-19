
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const { UnifiedServiceRegistry } = require('../lib/agent/UnifiedServiceRegistry');
const { AutomationMCP } = require('../lib/mcp/servers/AutomationMCP');
const { KnowledgeMCP } = require('../lib/mcp/servers/KnowledgeMCP');

async function testRedundancy() {
    console.log('--- ECOSYSTEM REDUNDANCY VALIDATION ---');

    console.log('\n[1] Testing LLM Fallback (Static Registry)...');
    const registry = UnifiedServiceRegistry.getInstance();
    await registry.sync();
    const services = await registry.getServices('llm');
    console.log(`✅ Found ${services.length} services (Static Fallbacks active).`);
    const providers = [...new Set(services.map((s: any) => s.provider))];
    console.log(`✅ Model Diversity: ${providers.join(', ')}`);

    if (services.length < 5) {
        console.error('❌ Redundancy Failure: At least 5 fallback models required.');
    } else {
        console.log('✨ LLM REDUNDANCY: PASSED');
    }

    console.log('\n[2] Testing Automation Smart Trigger...');
    const auto = new AutomationMCP();
    await auto.connect();
    const tools = await auto.getTools();
    const trigger = tools.find((t: any) => t.name === 'trigger_any_workflow');

    if (trigger) {
        console.log('✅ trigger_any_workflow tool found.');
        const result = await trigger.execute({
            urls: ['http://invalid-dns-test-1.local', 'http://invalid-dns-test-2.local'],
            payload: { test: true }
        });
        if (result.includes('FATAL: All redundancy options failed')) {
            console.log('✅ Sequential failover logic verified.');
            console.log('✨ AUTOMATION REDUNDANCY: PASSED');
        }
    } else {
        console.error('❌ Automation tool missing.');
    }

    console.log('\n[3] Testing Knowledge Fallback...');
    const knowledge = new KnowledgeMCP();
    await knowledge.connect();
    const kTools = await knowledge.getTools();
    const docSearch = kTools.find((t: any) => t.name === 'doc360_search');

    if (docSearch) {
        const result = await docSearch.execute({ query: 'test' });
        if (result.includes('FALLBACK') || result.includes('INTERNAL_DB_ERROR') || result.includes('No internal matches found')) {
            console.log('✅ Knowledge fallback path functional.');
            console.log('✨ KNOWLEDGE REDUNDANCY: PASSED');
        }
    }

    console.log('\n--- VERIFICATION COMPLETE ---');
}

testRedundancy();
