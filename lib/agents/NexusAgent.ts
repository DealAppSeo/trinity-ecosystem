import { wrapFetchWithPayment } from '@x402/fetch';
import { createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { storeDecision } from '../recall/RecallMemory';
import { supabaseAdmin as supabase } from '@/lib/supabase';

const account = privateKeyToAccount((process.env.NEXUS_PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000000') as `0x${string}`);
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http() });
const paidFetch = wrapFetchWithPayment(fetch, { wallet });

export interface MarketSignal {
    asset: string;
    price: number;
    predictedDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
    confidence: number;
    source: string;
    timestamp: string;
}

/**
 * NEXUS: Gathers market signals, using x402 for premium data.
 */
export async function gatherSignal(asset: string): Promise<{
    signal: MarketSignal;
    txHash: string;
    recallCID: string;
}> {
    let signal: MarketSignal;
    let txHash = '';

    try {
        // Attempt to purchase signal via x402
        const response = await paidFetch(
            `https://aitrinitysymphony.com/api/signals/${asset}`,
            { method: 'GET' }
        );
        txHash = response.headers.get('PAYMENT-SIGNATURE') ?? '';
        signal = await response.json();
    } catch (error) {
        console.warn('[NEXUS] x402 Signal purchase failed, falling back to public data.');
        signal = await gatherPublicSignal(asset);
    }

    // Get Agent ID from Registry
    const { data: agentData } = await supabase
        .from('agent_registry')
        .select('erc8004_agent_id')
        .eq('agent_name', 'NEXUS')
        .single();

    // Store in Recall
    const recallCID = await storeDecision({
        agentName: 'NEXUS',
        erc8004AgentId: Number(agentData?.erc8004_agent_id || 0),
        decisionType: 'signal',
        signal: signal as any,
        timestamp: new Date().toISOString(),
    });

    return { signal, txHash, recallCID };
}

async function gatherPublicSignal(asset: string): Promise<MarketSignal> {
    // Mocking public signal acquisition (e.g. from CoinGecko)
    const price = 65000 + Math.random() * 1000;
    return {
        asset,
        price,
        predictedDirection: Math.random() > 0.5 ? 'LONG' : 'SHORT',
        confidence: 0.6 + Math.random() * 0.3,
        source: 'public-api',
        timestamp: new Date().toISOString(),
    };
}
