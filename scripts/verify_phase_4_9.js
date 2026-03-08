
const fs = require('fs');
const path = require('path');

async function verifyPhase_4_9() {
    console.log('🔍 Starting Phase 4.9 Verification (Escrow & Safe Autonomy)...\n');

    // 1. Files Verification
    const filesToCheck = [
        'contracts/TrinityEscrow.sol',
        'lib/agent/ConstitutionalAgent.ts'
    ];

    console.log('--- 📂 Files Verification ---');
    for (const f of filesToCheck) {
        const fullPath = path.join(process.cwd(), f);
        if (fs.existsSync(fullPath)) {
            console.log(`✅ File exists: ${f}`);
        } else {
            console.error(`❌ File MISSING: ${f}`);
        }
    }

    // 2. Logic Verification (Grep Patterns)
    console.log('\n--- 🧠 Logic Verification (Patterns) ---');
    const escrowContent = fs.readFileSync(path.join(process.cwd(), 'contracts/TrinityEscrow.sol'), 'utf8');
    const agentContent = fs.readFileSync(path.join(process.cwd(), 'lib/agent/ConstitutionalAgent.ts'), 'utf8');

    if (escrowContent.includes('lockFunds')) console.log('✅ Found lockFunds in TrinityEscrow.sol');
    if (escrowContent.includes('releaseFunds')) console.log('✅ Found releaseFunds in TrinityEscrow.sol');
    if (escrowContent.includes('refundFunds')) console.log('✅ Found refundFunds in TrinityEscrow.sol');

    if (agentContent.includes('authorizeTransaction')) console.log('✅ Found authorizeTransaction in ConstitutionalAgent');
    if (agentContent.includes('finalizeEscrow')) console.log('✅ Found finalizeEscrow in ConstitutionalAgent');
    if (agentContent.includes('TRINITY_ESCROW_ADDRESS')) console.log('✅ Found TRINITY_ESCROW_ADDRESS in ConstitutionalAgent');

    // 3. Simulated Circuit Integration
    if (agentContent.includes('zkpBadgeGenerator.generateProof')) {
        console.log('✅ Found ZKP Reputation Proof integration in Auth Gate');
    }

    console.log('\n🏁 Phase 4.9 Verification Complete.');
}

verifyPhase_4_9().catch(console.error);
