import { RecallAgentToolkit } from "@recallnet/agent-toolkit/ai-sdk";
import { createClient } from '@supabase/supabase-js';

// Initialize once, reuse across agents
// RECALL_PRIVATE_KEY is required in .env
const recallToolkit = new RecallAgentToolkit({
    privateKey: (process.env.RECALL_PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000000') as `0x${string}`,
    configuration: {
        actions: {
            bucket: { read: true, write: true },
            account: { read: true },
        },
        context: { network: "testnet" },
    },
});

import { supabaseAdmin as supabase } from '@/lib/supabase';

export interface TradeDecision {
    agentName: string;
    erc8004AgentId: number;
    decisionType: 'signal' | 'validation' | 'trade_intent' | 'outcome';
    signal?: Record<string, any>;
    driftScore?: number;
    driftTier?: 'PASS' | 'WARN' | 'VETO';
    repIdAtDecision?: number;
    autonomyTier?: 'JUST_DO_IT' | 'DO_THEN_TELL' | 'ASK_FIRST';
    tradeIntent?: Record<string, any>;
    outcome?: { pnl: number; txHash: string };
    timestamp: string;
    linkedCIDs?: string[]; // Chain of audit
}

/**
 * Stores a decision in Recall Network and logs metadata to Supabase.
 */
export async function storeDecision(decision: TradeDecision): Promise<string> {
    try {
        const bucketAlias = `trinity-${decision.agentName.toLowerCase()}-decisions`;
        const objectKey = `${decision.decisionType}-${Date.now()}`;

        // 1. Store in Recall Network (Decentralized)
        const result = await (recallToolkit as any).storeBucketObject(
            bucketAlias,
            objectKey,
            JSON.stringify(decision)
        );

        const cid = result.cid;

        // 2. Log metadata to Supabase (Searchable Index)
        await supabase.from('recall_decisions').insert({
            agent_name: decision.agentName,
            decision_type: decision.decisionType,
            recall_cid: cid,
            recall_bucket: bucketAlias,
            created_at: decision.timestamp,
        });

        return cid;
    } catch (error) {
        console.error(`[RecallMemory] Storage failed for ${decision.agentName}:`, error);
        throw error;
    }
}

/**
 * Retrieves a decision from Recall Network by CID.
 */
export async function retrieveDecision(cid: string): Promise<TradeDecision> {
    const result = await (recallToolkit as any).getBucketObject(cid);
    return JSON.parse(result.data) as TradeDecision;
}
