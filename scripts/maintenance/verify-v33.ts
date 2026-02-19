import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function verifyV33() {
    console.log('--- [v3.33 VERIFICATION START] ---');
    try {
        // [PHASE 1] Import components
        const { ConstitutionalAgent } = await import('../packages/agent-core/src/agent/ConstitutionalAgent');
        console.log('✅ ConstitutionalAgent Imported');

        // [PHASE 2] Test PRAL Loop Execution (Mocked)
        console.log('\n[TEST 1] PRAL Loop Simulation');
        const orch = new ConstitutionalAgent({ name: 'trinity-orch' } as any);
        const mockTask = {
            id: '999',
            title: 'Verify v3.33 Protocol Integration',
            description: 'Run a verification task to ensure PRAL loop the BFT diversity are working.',
            task_type: 'code',
            priority: 100
        };

        // We won't call run() because it has an infinite loop
        // Instead we test the components directly or simulate a part of the loop

        console.log('Simulating Perceive Phase...');
        // @ts-ignore - for access to private/mocked methods if needed
        const bible = await orch.fetchBible();
        console.log(`- Bible loaded (${bible.length} chars)`);

        // Test BFT Diversity
        console.log('\n[TEST 2] BFT Diversity Check');
        const verifiers = [
            { name: 'trinity-shofet', expected: 'openai' },
            { name: 'trinity-veritas', expected: 'grok' },
            { name: 'trinity-mel', expected: 'anthropic' }
        ];

        for (const v of verifiers) {
            const family = (orch as any).getLLMFamily(v.name);
            console.log(`- Agent ${v.name} mapped to family: ${family} (Expected: ${v.expected})`);
        }

        // Test Diversity Violation
        console.log('\nChecking for diversity violation (Same family: trinity-orch & trinity-shofet)');
        const executor = 'trinity-orch';
        const verifier = 'trinity-shofet';

        // Mock verifyPeerTask logic
        const executorFamily = (orch as any).getLLMFamily(executor);
        const verifierFamily = (orch as any).getLLMFamily(verifier);

        if (executorFamily === verifierFamily) {
            console.warn(`✅ Warning Triggered: BFT Diversity Violation detected as expected between ${executor} and ${verifier} (${executorFamily})`);
        } else {
            console.error('❌ Error: Diversity check failed to detect violation.');
        }

        // [PHASE 3] ERC-8004 Sync
        console.log('\n[TEST 3] ERC-8004 Reputation Sync');
        await orch.integrateErc8004('999', 95);
        console.log('✅ Reputation bridge call complete.');

        console.log('\n--- [v3.33 VERIFICATION COMPLETE] ---');
    } catch (e: any) {
        console.error('❌ Verification failed:', e.message);
        console.error(e.stack);
    }
}

verifyV33();
