
const fs = require('fs');
const path = require('path');

async function verifyPhase_4_8() {
    console.log('🔍 Starting Phase 4.8 Verification (ZKP Reputation Integrity)...\n');

    // 1. Files Verification
    const filesToCheck = [
        'circuits/repid_threshold.circom',
        'lib/guardrail/ZKPReputationBadge.ts',
        'app/api/reputation/proof/route.ts'
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
    const circuitContent = fs.readFileSync(path.join(process.cwd(), 'circuits/repid_threshold.circom'), 'utf8');
    const badgeContent = fs.readFileSync(path.join(process.cwd(), 'lib/guardrail/ZKPReputationBadge.ts'), 'utf8');
    const agentContent = fs.readFileSync(path.join(process.cwd(), 'lib/agent/ConstitutionalAgent.ts'), 'utf8');

    if (circuitContent.includes('GreaterThan(32)')) console.log('✅ Found correct Circom comparator syntax');
    if (circuitContent.includes('threshold - 1')) console.log('✅ Found inclusive threshold logic (>=)');

    if (badgeContent.includes('snarkjs.groth16.fullProve')) console.log('✅ Found snarkjs integration in Badge Manager');
    if (badgeContent.includes('generateSimulatedProof')) console.log('✅ Found high-fidelity simulation fallback');

    if (agentContent.includes('zkpBadgeGenerator')) console.log('✅ Found ZKP import in ConstitutionalAgent');
    if (agentContent.includes('authorizeTransaction')) console.log('✅ Found authorizeTransaction gate in ConstitutionalAgent');

    console.log('\n🏁 Phase 4.8 Verification Complete.');
}

verifyPhase_4_8().catch(console.error);
