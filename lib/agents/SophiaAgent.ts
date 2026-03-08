import { createWalletClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { storeDecision } from '../recall/RecallMemory';
import { createClient } from '@supabase/supabase-js';

const REPUTATION_REGISTRY_ADDRESS = '0x8004B663056A597Dffe9eCcC1965A193B7388713';
const REPUTATION_REGISTRY_ABI = parseAbi([
    'function giveFeedback(uint256 agentId, string calldata uri, bytes32 hash) external',
]);

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const account = privateKeyToAccount((process.env.SOPHIA_PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000000') as `0x${string}`);
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http() });

/**
 * SOPHIA: Executes trades and updates reputation feedback.
 */
export async function executeTrade(tradeIntent: any, decisionCID: string): Promise<{
    pnl: number;
    txHash: string;
    outcomeCID: string;
}> {
    // 1. Execute Trade (Surge Paper Trading Simulation)
    console.log(`[SOPHIA] Executing ${tradeIntent.direction} on ${tradeIntent.asset}...`);
    const txHash = '0x' + Math.random().toString(16).slice(2, 66); // Mock txHash
    const pnl = (Math.random() - 0.4) * 10; // Mock PnL

    // 2. Get Sophia Agent ID
    const { data: sophiaData } = await supabase
        .from('agent_registry')
        .select('erc8004_agent_id')
        .eq('agent_name', 'SOPHIA')
        .single();

    // 3. Store Outcome in Recall
    const outcomeCID = await storeDecision({
        agentName: 'SOPHIA',
        erc8004AgentId: Number(sophiaData?.erc8004_agent_id || 0),
        decisionType: 'outcome',
        outcome: { pnl, txHash },
        linkedCIDs: [decisionCID],
        timestamp: new Date().toISOString(),
    });

    // 4. Update Reputation (giveFeedback)
    // In a real scenario, this would pin a JSON feedback file to IPFS
    try {
        await wallet.writeContract({
            address: REPUTATION_REGISTRY_ADDRESS,
            abi: REPUTATION_REGISTRY_ABI,
            functionName: 'giveFeedback',
            args: [BigInt(sophiaData?.erc8004_agent_id || 0), `recall://${outcomeCID}`, '0x' + '0'.repeat(64)],
        });
    } catch (error) {
        console.error('[SOPHIA] Failed to submit reputation feedback:', error);
    }

    return { pnl, txHash, outcomeCID };
}
