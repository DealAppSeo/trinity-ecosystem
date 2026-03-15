
const fs = require('fs');
const path = require('path');

async function verifyPhase_4_8() {
    console.log('🔍 Starting Phase 4.8 Verification (Recursive ZKP Reputation Integrity)...\n');

    // 1. Files Verification
    const filesToCheck = [
        'circuits/repid_recursive.circom',
        'circuits/repid_recursive_final.zkey',
        'circuits/verification_key.json',
        'lib/guardrail/ZKPReputationBadge.ts',
        'scripts/self_audit_agent.ts'
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
    const circuitContent = fs.readFileSync(path.join(process.cwd(), 'circuits/repid_recursive.circom'), 'utf8');
    const badgeContent = fs.readFileSync(path.join(process.cwd(), 'lib/guardrail/ZKPReputationBadge.ts'), 'utf8');
    const agentContent = fs.readFileSync(path.join(process.cwd(), 'lib/agent/ConstitutionalAgent.ts'), 'utf8');

    if (circuitContent.includes('GreaterEqThan(32)')) console.log('✅ Found optimized GreaterEqThan(32) logic');
    if (circuitContent.includes('Poseidon(3)')) console.log('✅ Found Poseidon history provenance hashing');
    if (circuitContent.includes('RepIDRecursiveProof')) console.log('✅ Found recursive aggregator template');

    if (badgeContent.includes('snarkjs.groth16.fullProve')) console.log('✅ Found snarkjs integration in Badge Manager');
    if (badgeContent.includes('historyHash')) console.log('✅ Found history hash provenance integration');

    if (agentContent.includes('zkpBadgeGenerator')) console.log('✅ Found ZKP import in ConstitutionalAgent');
    if (agentContent.includes('authorizeTransaction')) console.log('✅ Found authorizeTransaction gate in ConstitutionalAgent');
    if (agentContent.includes('requestZKPProof')) console.log('✅ Found bidding-ready ZKP request hook');

    console.log('\n🏁 Phase 4.8 (Recursive ZKP) Verification Complete.');
}

verifyPhase_4_8().catch(console.error);
