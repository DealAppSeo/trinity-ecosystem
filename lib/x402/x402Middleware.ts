import { supabaseAdmin as supabase } from '../supabase';

export interface x402Receipt {
    agent_id: string;
    amount: number;
    tx_hash?: string;
    action_type: string;
    timestamp: string;
    metadata?: any;
}

export class x402Middleware {
    /**
     * Intercepts an agent action and enforces x402 payment requirements.
     */
    static async wrapAction(
        agentId: string,
        actionType: string,
        cost: number,
        action: () => Promise<any>,
        metadata: any = {}
    ) {
        if (cost > 0) {
            console.log(`[x402] 💳 Payment required for action: ${actionType} (Cost: ${cost} USDC)`);

            // In a real scenario, we'd verify a signed receipt or transaction hash here.
            // For the hackathon MVP, we log the intent and proceed if the "mock" receipt is valid.
            const receipt: x402Receipt = {
                agent_id: agentId,
                amount: cost,
                action_type: actionType,
                timestamp: new Date().toISOString(),
                metadata: { ...metadata, status: 'processed' }
            };

            const { error } = await supabase.from('x402_receipts').insert([receipt]);

            if (error) {
                console.error(`[x402] ❌ Failed to log payment receipt:`, error.message);
                throw new Error("x402 Payment verification failed.");
            }

            console.log(`[x402] ✅ Payment processed. Executing action...`);
        }

        return await action();
    }

    /**
     * Specifically for the NEXUS signal purchase test.
     */
    static async mockNexusSignalPurchase() {
        return await this.wrapAction(
            'NEXUS',
            'SIGNAL_PURCHASE',
            0.001, // 0.001 USDC
            async () => {
                return { signal: 'BUY ETH', confidence: 0.92, provider: 'NEXUS-SOL' };
            },
            { asset: 'ETH', network: 'base-sepolia' }
        );
    }
}
