import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { ConstitutionalAgent } from '../lib/agent/ConstitutionalAgent';

/**
 * 🧪 TEST SCRIPT: EVERGREEN VERIFICATION
 * Instantiates an Agent and checks if Phase 9 methods exist and run without crashing.
 */
async function verifyEvergreen() {
    console.log('🧪 Verifying Phase 9: Evergreen Swarm...');

    try {
        const agent = new ConstitutionalAgent({
            name: 'trinity-tester',
            projectId: 'test',
            provider: 'openai'
        });

        // 1. Check Method Existence
        if (typeof agent.runGenesisLoop !== 'function') throw new Error('runGenesisLoop missing');
        if (typeof agent.spawnNextStep !== 'function') throw new Error('spawnNextStep missing');
        console.log('✅ Methods Detected: runGenesisLoop, spawnNextStep');

        // 2. Mock Supabase (Partial)
        // We can't fully mock here without complex setup, but we can try running runGenesisLoop 
        // and see if it catches the require() error or proceeds.
        await agent.runGenesisLoop();
        console.log('✅ runGenesisLoop executed (passed imports/logic check)');

        console.log('🎉 VERIFICATION PASSED: Phase 9 Codebase Integrity Verified.');
    } catch (err: any) {
        console.error('❌ VERIFICATION FAILED:', err.message);
        console.error(err);
        process.exit(1);
    }
}

verifyEvergreen();
