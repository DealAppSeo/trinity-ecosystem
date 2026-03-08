import { createWalletClient, http, parseAbi, keccak256, toHex } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { storeDecision } from '../recall/RecallMemory';
import { MarketSignal } from './NexusAgent';
import { createClient } from '@supabase/supabase-js';

const PYTHAGOREAN_COMMA = 1.013643;
const WARN_THRESHOLD = 1.5 * PYTHAGOREAN_COMMA;
const VETO_THRESHOLD = 3.0 * PYTHAGOREAN_COMMA;

const VALIDATION_REGISTRY_ADDRESS = '0x8004A818BFB912233c491871b3d84c89A494BD9e'; // Placeholder/Actual
const VALIDATION_REGISTRY_ABI = parseAbi([
    'function validationRequest(address validatorAddress, uint256 agentId, string calldata requestURI, bytes32 requestHash) external',
    'function validationResponse(bytes32 requestHash, bool response, string calldata responseURI, bytes32 responseHash, string calldata tag) external',
]);

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const account = privateKeyToAccount((process.env.VERITAS_PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000000') as `0x${string}`);
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http() });

/**
 * VERITAS: Validates signals using mathematical drift detection.
 */
export async function validateSignal(
    signal: MarketSignal,
    signalCID: string,
    nexusId: number
): Promise<{
    approved: boolean;
    driftTier: 'PASS' | 'WARN' | 'VETO';
    driftScore: number;
    evidenceCID: string;
}> {
    // 1. Calculate Drift Score (Pythagorean Comma Gap)
    const driftScore = Math.abs(1.0 - signal.confidence) / PYTHAGOREAN_COMMA;
    const driftTier = driftScore < WARN_THRESHOLD ? 'PASS' : driftScore < VETO_THRESHOLD ? 'WARN' : 'VETO';
    const approved = driftTier !== 'VETO';

    // 2. Get Veritas Agent ID
    const { data: veritasData } = await supabase
        .from('agent_registry')
        .select('erc8004_agent_id')
        .eq('agent_name', 'VERITAS')
        .single();

    // 3. Store Evidence in Recall
    const evidenceCID = await storeDecision({
        agentName: 'VERITAS',
        erc8004AgentId: Number(veritasData?.erc8004_agent_id || 0),
        decisionType: 'validation',
        driftScore,
        driftTier,
        linkedCIDs: [signalCID],
        timestamp: new Date().toISOString(),
    });

    // 4. Post to ERC-8004 Validation Registry (On-chain)
    const evidenceHash = keccak256(toHex(JSON.stringify({ signalCID, driftScore, driftTier })));

    try {
        await wallet.writeContract({
            address: VALIDATION_REGISTRY_ADDRESS,
            abi: VALIDATION_REGISTRY_ABI,
            functionName: 'validationRequest',
            args: [account.address, BigInt(nexusId), `recall://${evidenceCID}`, evidenceHash],
        });

        await wallet.writeContract({
            address: VALIDATION_REGISTRY_ADDRESS,
            abi: VALIDATION_REGISTRY_ABI,
            functionName: 'validationResponse',
            args: [evidenceHash, approved, `recall://${evidenceCID}`, evidenceHash, `drift-${driftTier.toLowerCase()}`],
        });
    } catch (error) {
        console.error('[VERITAS] On-chain validation request failed:', error);
    }

    return { approved, driftTier, driftScore, evidenceCID };
}
