import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { ConstitutionalAgent } from '../lib/agent/ConstitutionalAgent';

/**
 * 🧪 TEST: GENESIS LOOP V2
 * Mocks external APIs to verify the logic flow of Phase 10.
 */
async function testGenesisLoop() {
    console.log('🧪 Testing Phase 10: Web-Aware Genesis Loop...');

    try {
        const agent = new ConstitutionalAgent({
            name: 'trinity-tester',
            projectId: 'test',
            provider: 'openai'
        });

        // MOCK 1: ResearchTool
        // We override searchWeb to return fake GNN trends
        agent.researchTool.searchWeb = async (query: string) => {
            console.log(`[MOCK] ResearchTool.searchWeb("${query}") called.`);
            if (query.includes('LEGO') || query.includes('GNN') || query.includes('bid')) {
                return [
                    { title: "LEGO: Equivariant GNNs for Swarms", content: "New frame-independent architecture for variable agent teams...", url: "https://example.com/gnn" },
                    { title: "QMIX-GNN", content: "Hybrid MARL for heterogeneous cooperation...", url: "https://example.com/qmix" }
                ];
            }
            return [];
        };
        agent.researchTool.browsePage = async (url: string, instructions: string) => {
            return "[MOCK] Browsed content";
        };

        // MOCK 2: callLLM
        // We override callLLM to return a valid JSON structure
        agent.callLLM = async (prompt: string) => {
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
            from: (table: string) => ({
                insert: async (data: any) => {
                    console.log(`[MOCK] Supabase.insert('${table}'):`, data);
                    if (table === 'trinity_tasks' && data.title.includes('GENESIS-V2')) {
                        insertCalled = true;
                        if (data.metadata.source !== 'web-aware-idle') throw new Error('Incorrect metadata source');
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
        } else {
            console.error('❌ TEST FAILED: No task was inserted.');
            process.exit(1);
        }

    } catch (err: any) {
        console.error('❌ TEST FAILED with Error:', err.message);
        console.error(err);
        process.exit(1);
    }
}

testGenesisLoop();
