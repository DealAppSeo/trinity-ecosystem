import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { AdversarialVerifierAgent } from '../lib/agent/AdversarialVerifierAgent';

async function runTests() {
    console.log('--- STARTING ADVERSARIAL ISOLATION TESTS ---\n');
    
    // Test against our known false claims
    const testClaims = [
        { claim: 'The BFT threshold is 51%', expected_error: true },
        { claim: 'The BFT threshold is 61.8%', expected_error: false },
        { claim: 'ANFIS was invented by Lotfi Zadeh in 1965', expected_error: true },
        { claim: 'Trinity Symphony has 8 agents', expected_error: true },
        { claim: 'Trinity Symphony has 12 agents', expected_error: false },
        { claim: 'The IdentityRegistry is at 0x1111111111111111111111111111111111111111', expected_error: true },
        { claim: 'The IdentityRegistry is at 0x8004A818BFB912233c491871b3d84c89A494BD9e', expected_error: false },
        { claim: 'Verified tx is on block 38887591', expected_error: true },
        { claim: 'HyperDAG work began in 2019', expected_error: true },
        { claim: 'HyperDAG work began in 2016', expected_error: false },
    ];

    const agent = new AdversarialVerifierAgent();
    // Pre-load logic manually handles loading internally during verify()
    
    let caught = 0;
    let total_errors = testClaims.filter(t => t.expected_error).length;

    for (const test of testClaims) {
        console.log(`Analyzing: "${test.claim}"`);
        const result = await agent.verify(test.claim, 'system-test-id');
        
        // Correct is matched if the expectation was false and error_found is false, OR
        // expectation was true and error_found is true with high confidence.
        const correct = !!result.error_found === test.expected_error;
        
        if (result.error_found && test.expected_error) caught++;
        
        console.log(`   ${correct ? '✅' : '❌'} [Gate ${result.gate} | Method: ${result.method}]`);
        console.log(`   Expected: ${test.expected_error} | Output: ${!!result.error_found} | Confidence: ${result.confidence}`);
        if (result.error_found) console.log(`   Finding: ${result.what_is_wrong}`);
        console.log(`   Tool Receipt: ${result.tool_receipt}\n`);
        
        // Sleep to avoid litellm rate limit if it hits Gates 1 or 2
        await new Promise(r => setTimeout(r, 1000));
    }

    const catchRate = Math.round(caught / total_errors * 100);
    console.log(`\n🎯 CATCH RATE: ${caught}/${total_errors} (${catchRate}%)`);
    console.log('No Constitutional Agents were harmed in this test.');
}

runTests().catch(console.error);
