
import { createWalletClient, createPublicClient, http, keccak256, encodePacked } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

const REPUTATION_REGISTRY_ADDRESS = '0x8004B663056A597Dffe9eCcC1965A193B7388713';
const REPUTATION_REGISTRY_ABI = [
    {
        name: 'giveFeedback',
        type: 'function',
        inputs: [
            { name: 'agentId', type: 'uint256' },
            { name: 'uri', type: 'string' },
            { name: 'hash', type: 'bytes32' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
];

export interface FeedbackData {
    agentId: number;
    score: number; // 0-100
    proofOfPayment: {
        fromAddress: string;
        toAddress: string;
        chainId: string;
        txHash: string;
    };
    details?: string;
    mcp?: { tool: string };
}

/**
 * giveFeedback: Implementation of the official ERC-8004 giveFeedback interface.
 * Anchors off-chain feedback JSON to the on-chain Reputation Registry.
 */
export async function giveFeedback(data: FeedbackData) {
    const privateKey = process.env.TRINITY_OWNER_PRIVATE_KEY as `0x${string}`;
    if (!privateKey) throw new Error('TRINITY_OWNER_PRIVATE_KEY missing');

    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http() });
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });

    // 1. Construct spec-compliant feedback JSON (Off-chain)
    const feedbackFile = {
        agentRegistry: `eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e`,
        agentId: data.agentId,
        clientAddress: `eip155:84532:${account.address}`,
        createdAt: new Date().toISOString(),
        value: data.score,
        valueDecimals: 0,
        proofOfPayment: data.proofOfPayment, // Mandatory for Trinity anti-Sybil enforcement
        details: data.details,
        ...data.mcp && { mcp: data.mcp }
    };

    // 2. Generate URI and Hash
    // For Phase 5 development: serve from local dynamic route, migrate to IPFS later
    const jsonString = JSON.stringify(feedbackFile);
    const feedbackHash = keccak256(Buffer.from(jsonString));
    const feedbackURI = `https://aitrinitysymphony.com/api/reputation/feedback/${data.proofOfPayment.txHash}.json`;

    // 3. Submit to On-Chain Reputation Registry
    console.log(`[REPUTATION] ⚓ Anchoring feedback for Agent ${data.agentId} (Score: ${data.score})`);

    try {
        const { request } = await publicClient.simulateContract({
            account,
            address: REPUTATION_REGISTRY_ADDRESS,
            abi: REPUTATION_REGISTRY_ABI,
            functionName: 'giveFeedback',
            args: [BigInt(data.agentId), feedbackURI, feedbackHash],
        });

        const hash = await walletClient.writeContract(request);
        console.log(`✅ Feedback anchored on-chain: ${hash}`);

        // 4. Mirror to Supabase for indexing
        await supabase.from('agent_repid_history').update({
            payment_proof_hash: data.proofOfPayment.txHash // Map txHash to proof_hash
        }).eq('payment_proof_hash', data.proofOfPayment.txHash);

        return hash;
    } catch (err) {
        console.error(`❌ Failed to anchor feedback:`, err.message);
        throw err;
    }
}
