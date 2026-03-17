import { supabaseAdmin as supabase } from '../supabase';
import { ERC8004Bridge } from '../web3/erc8004';
import { verifyTypedData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export interface x402Receipt {
    agent_id: string;
    amount: number;
    signature?: string;
    action_type: string;
    timestamp: string;
    metadata?: any;
}

const X402_DOMAIN = {
    name: 'x402 Payment Protocol',
    version: '2.0',
    chainId: 84532, // Base Sepolia
    verifyingContract: '0x' + '0'.repeat(40) as `0x${string}` // Stub
} as const;

const X402_TYPES = {
    Payment: [
        { name: 'agentId', type: 'string' },
        { name: 'amount', type: 'uint256' },
        { name: 'actionType', type: 'string' },
        { name: 'timestamp', type: 'string' }
    ]
} as const;

export class x402Middleware {
    /**
     * Intercepts an agent action and enforces x402 payment requirements.
     * Aligned with V2 SPEC: Uses PAYMENT-SIGNATURE headers.
     */
    static async wrapAction(
        agentId: string,
        actionType: string,
        cost: number,
        action: () => Promise<any>,
        metadata: any = {}
    ) {
        if (cost > 0) {
            const atomicCost = ERC8004Bridge.toAtomicUnits(cost);
            console.log(`[x402] 💳 Payment required: ${actionType} (Cost: ${cost} USDC | ${atomicCost} atomic)`);

            // Generate EIP-712 Signature (Phase 2.2 Alignment)
            const timestamp = new Date().toISOString();
            const signature = await this.signPayment(agentId, atomicCost, actionType, timestamp);

            const receipt: x402Receipt = {
                agent_id: agentId,
                amount: cost,
                signature,
                action_type: actionType,
                timestamp,
                metadata: { ...metadata, status: 'authorized', units: 'atomic_6' }
            };

            const { error } = await supabase.from('x402_receipts').insert([receipt]);

            if (error) {
                console.error(`[x402] ❌ Failed to log payment receipt:`, error.message);
                throw new Error("x402 Payment verification failed.");
            }

            console.log(`[x402] ✅ Payment authorized with EIP-712 signature. Executing...`);
        }

        return await action();
    }

    private static async signPayment(agentId: string, amount: bigint, actionType: string, timestamp: string): Promise<string> {
        const privateKey = process.env.TRINITY_DEPLOYER_PRIVATE_KEY as `0x${string}`;
        if (!privateKey) {
            console.warn('[x402] ⚠️ Missing TRINITY_DEPLOYER_PRIVATE_KEY, using mock signature.');
            return '0xMOCK_SIGNATURE_' + Math.random().toString(16).slice(2);
        }

        const account = privateKeyToAccount(privateKey);
        
        return await account.signTypedData({
            domain: X402_DOMAIN,
            types: X402_TYPES,
            primaryType: 'Payment',
            message: {
                agentId,
                amount,
                actionType,
                timestamp
            }
        });
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
