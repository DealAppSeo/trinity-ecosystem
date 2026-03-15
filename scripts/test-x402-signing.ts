import { signAgentIdentity } from '../lib/agent/erc8004';

/**
 * Test x402 Identity & Payment Signing (Phase 2.3)
 */
async function testSigning() {
    console.log('🧪 Testing EIP-712 ERC-8004 Identity Signing...');
    
    const sig = await signAgentIdentity(
        'NEXUS',
        85.5,
        '0xabc123...',
        '0x0123...'
    );

    console.log('✅ Signature Generated:', sig);
    console.log('🏁 Verification Logic Ready for Blockchain Gateway.');
}

testSigning().catch(console.error);
