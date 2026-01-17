"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: '.env.local' });
const ConstitutionalAgent_1 = require("../lib/agent/ConstitutionalAgent");
/**
 * 🧪 TEST SCRIPT: EVERGREEN VERIFICATION
 * Instantiates an Agent and checks if Phase 9 methods exist and run without crashing.
 */
async function verifyEvergreen() {
    console.log('🧪 Verifying Phase 9: Evergreen Swarm...');
    try {
        const agent = new ConstitutionalAgent_1.ConstitutionalAgent({
            name: 'trinity-tester',
            projectId: 'test',
            provider: 'openai'
        });
        // 1. Check Method Existence
        if (typeof agent.runIdleLoop !== 'function')
            throw new Error('runIdleLoop missing');
        if (typeof agent.spawnNextStep !== 'function')
            throw new Error('spawnNextStep missing');
        console.log('✅ Methods Detected: runIdleLoop, spawnNextStep');
        // 2. Mock Supabase (Partial)
        // We can't fully mock here without complex setup, but we can try running runIdleLoop 
        // and see if it catches the require() error or proceeds.
        await agent.runIdleLoop();
        console.log('✅ runIdleLoop executed (passed imports/logic check)');
        console.log('🎉 VERIFICATION PASSED: Phase 9 Codebase Integrity Verified.');
    }
    catch (err) {
        console.error('❌ VERIFICATION FAILED:', err.message);
        console.error(err);
        process.exit(1);
    }
}
verifyEvergreen();
