"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: '.env.local' });
const ConstitutionalAgent_1 = require("../lib/agent/ConstitutionalAgent");
/**
 * 🧪 TEST: GENESIS LOOP V2
 * Mocks external APIs to verify the logic flow of Phase 10.
 */
async function testGenesisLoop() {
    console.log('🧪 Testing Phase 10: Web-Aware Genesis Loop...');
    try {
        const agent = new ConstitutionalAgent_1.ConstitutionalAgent({
            name: 'trinity-tester',
            projectId: 'test',
            provider: 'openai'
        });
        // MOCK 1: ResearchTool
        // We override searchWeb to return fake GNN trends
        agent.researchTool.searchWeb = async (query) => {
            console.log(`[MOCK] ResearchTool.searchWeb("${query}") called.`);
            if (query.includes('LEGO') || query.includes('GNN') || query.includes('bid')) {
                return [
                    { title: "LEGO: Equivariant GNNs for Swarms", content: "New frame-independent architecture for variable agent teams..." },
                    { title: "QMIX-GNN", content: "Hybrid MARL for heterogeneous cooperation..." }
                ];
            }
            return [];
        };
        // MOCK 2: callLLM
        // We override callLLM to return a valid JSON structure
        agent.callLLM = async (prompt) => {
            console.log(`[MOCK] callLLM called with prompt length: ${prompt.length}`);
            return {
                output: JSON.stringify({
                    title: "Prototype LEGO-GNN Bidder",
                    description: "Implement a basic Equivariant GNN layer for the bidding system to handle variable agent team sizes.",
                    priority: 80
                })
            };
        };
        // MOCK 3: Supabase Insert
        // We verify parameters instead.
        let insertCalled = false;
        const mockSupabase = {
            from: (table) => ({
                insert: async (data) => {
                    console.log(`[MOCK] Supabase.insert('${table}'):`, data);
                    if (table === 'trinity_tasks' && data.title.includes('GENESIS-V2')) {
                        insertCalled = true;
                        if (data.metadata.source !== 'web-aware-idle')
                            throw new Error('Incorrect metadata source');
                    }
                    return { error: null };
                },
                select: () => ({ eq: () => ({ single: () => ({ data: { calls: 0 } }) }) }), // CostGuard stub
                rpc: () => ({ error: null }) // Usage tracker stub
            }),
            rpc: () => ({ error: null })
        };
        // @ts-ignore
        agent.supabase = mockSupabase;
        // EXECUTE
        console.log('🚀 Running Web-Aware Genesis Logic...');
        await agent.runWebAwareGenesis();
        // VERIFY
        if (insertCalled) {
            console.log('✅ TEST PASSED: Genesis Task was seeded via Mock Stack.');
        }
        else {
            console.error('❌ TEST FAILED: No task was inserted.');
            process.exit(1);
        }
    }
    catch (err) {
        console.error('❌ TEST FAILED with Error:', err.message);
        console.error(err);
        process.exit(1);
    }
}
testGenesisLoop();
