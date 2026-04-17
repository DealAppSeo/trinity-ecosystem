/**
 * TrustTrader Trade Pipeline
 * Orchestrates: Signals → Veto Engine → EIP-712 Sign → Merkle → RepID → Log
 */

import { createClient } from '@supabase/supabase-js';
import {
  signTradeIntent,
  signConstitutionalRefusal,
  createLeafHash,
  type TradeIntent,
  type ConstitutionalRefusal,
} from './eip712';
import { addLeafAndCommit, type MerkleLeafData } from './merkle';
import type { Hex, Address } from 'viem';

const supabaseUrl = process.env.SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

// RepID scoring constants
const REPID_DELTAS = {
  SUCCESSFUL_TRADE: 50,
  FAILED_TRADE: -150,
  CONSTITUTIONAL_REFUSAL: 10,
  VETO_PREVENTED_LOSS: 25,
} as const;

interface VetoResult {
  veto: boolean;
  execute: boolean;
  unity_score: number;
  dissonance: number;
  threshold: number;
  reason: string | null;
}

interface PipelineResult {
  decision: 'EXECUTE' | 'REFUSED';
  signature: Hex;
  merkleRoot: string;
  leafHash: string;
  unityScore: number;
  dissonance: number;
  agentName: string;
}

/**
 * Fetch latest signals from trusttrader_signals table.
 */
async function fetchLatestSignals(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('trusttrader_signals')
    .select('signal_name, normalized')
    .order('fetched_at', { ascending: false })
    .limit(13);

  if (error) throw new Error(`Failed to fetch signals: ${error.message}`);

  const signals: Record<string, number> = {};
  for (const row of data || []) {
    if (!(row.signal_name in signals)) {
      signals[row.signal_name] = Number(row.normalized);
    }
  }
  return signals;
}

/**
 * Fetch agent RepID score from agent_repid table.
 */
async function fetchRepId(agentName: string): Promise<number> {
  const { data, error } = await supabase
    .from('agent_repid')
    .select('repid_score')
    .eq('agent_name', agentName)
    .single();

  if (error || !data) return 5000; // default
  return Number(data.repid_score);
}

/**
 * Update RepID after a trade decision.
 */
async function updateRepId(
  agentName: string,
  eventType: string,
  delta: number,
  reason: string
): Promise<void> {
  const currentRepId = await fetchRepId(agentName);
  const newRepId = Math.max(0, Math.min(10000, currentRepId + delta));

  await supabase
    .from('agent_repid')
    .update({
      repid_score: newRepId,
      earned_score: delta > 0 ? delta : 0,
      last_activity: new Date().toISOString(),
    })
    .eq('agent_name', agentName);

  await supabase.from('agent_repid_history').insert({
    agent_id: agentName,
    repid_delta: delta,
    payment_proof_hash: '0x_repid_update',
    reason,
  });
}

/**
 * Log trade decision to trade_execution_log.
 */
async function logTradeDecision(params: {
  agentName: string;
  decision: string;
  pair: string;
  action: string;
  amountUsd: number;
  unityScore: number;
  dissonance: number;
  riskProfile: string;
  reason: string | null;
  signature: string;
  merkleHash: string;
}): Promise<void> {
  await supabase.from('trade_execution_log').insert({
    asset: params.pair.split('/')[0],
    execution_mode: 'paper',
    agent_name: params.agentName,
    decision: params.decision,
    pair: params.pair,
    action: params.action,
    amount_usd: params.amountUsd,
    unity_score: params.unityScore,
    dissonance: params.dissonance,
    risk_profile: params.riskProfile,
    reason: params.reason,
    signature: params.signature,
    merkle_hash: params.merkleHash,
  });
}

/**
 * Log Merkle commitment to repid_merkle_events.
 */
async function logMerkleEvent(
  agentName: string,
  merkleRoot: string,
  leafHash: string,
  treeDepth: number
): Promise<void> {
  await supabase.from('repid_merkle_events').insert({
    agent_name: agentName,
    merkle_root: merkleRoot,
    leaf_hash: leafHash,
    tree_depth: treeDepth,
  });
}

/**
 * Run the full trade pipeline.
 */
export async function runTradePipeline(params: {
  pair: string;
  action: 'BUY' | 'SELL';
  amountUsd: number;
  riskProfile: string;
  vetoResult: VetoResult;
  sophiaKey: Hex;
  shofetKey: Hex;
  agentWallet: Address;
}): Promise<PipelineResult> {
  const agentId = 1n; // SOPHIA's agent ID
  const now = BigInt(Math.floor(Date.now() / 1000));
  const nonce = BigInt(Date.now());

  let signature: Hex;
  let decision: 'EXECUTE' | 'REFUSED';

  if (params.vetoResult.execute) {
    // SOPHIA signs TradeIntent
    decision = 'EXECUTE';
    const intent: TradeIntent = {
      agentId,
      agentWallet: params.agentWallet,
      pair: params.pair,
      action: params.action,
      amountUsdScaled: BigInt(Math.round(params.amountUsd * 100)),
      maxSlippageBps: 50n,
      nonce,
      deadline: now + 3600n,
    };
    const signed = await signTradeIntent(intent, params.sophiaKey);
    signature = signed.signature;
  } else {
    // SHOFET signs ConstitutionalRefusal
    decision = 'REFUSED';
    const refusal: ConstitutionalRefusal = {
      agentId,
      reason: params.vetoResult.reason || 'Unity score below threshold',
      unityScore: params.vetoResult.unity_score.toString(),
      dissonance: params.vetoResult.dissonance.toString(),
      timestamp: now,
    };
    const signed = await signConstitutionalRefusal(refusal, params.shofetKey);
    signature = signed.signature;
  }

  // Merkle commitment
  const merkleData: MerkleLeafData = {
    agentId,
    decision,
    unityScore: params.vetoResult.unity_score.toString(),
    dissonance: params.vetoResult.dissonance.toString(),
    timestamp: now,
    signature,
  };
  const commitment = addLeafAndCommit(merkleData);

  // Log to trade_execution_log
  await logTradeDecision({
    agentName: 'trinity-sophia',
    decision,
    pair: params.pair,
    action: params.action,
    amountUsd: params.amountUsd,
    unityScore: params.vetoResult.unity_score,
    dissonance: params.vetoResult.dissonance,
    riskProfile: params.riskProfile,
    reason: params.vetoResult.reason,
    signature,
    merkleHash: commitment.root,
  });

  // Log Merkle event
  await logMerkleEvent('trinity-sophia', commitment.root, commitment.leafHash, commitment.treeDepth);

  // Update RepID
  if (decision === 'REFUSED') {
    await updateRepId('trinity-sophia', 'constitutional_refusal', REPID_DELTAS.CONSTITUTIONAL_REFUSAL,
      `Veto: ${params.vetoResult.reason}`);
    if (params.vetoResult.veto) {
      await updateRepId('trinity-shofet', 'veto_issued', REPID_DELTAS.VETO_PREVENTED_LOSS,
        `Veto prevented potential loss on ${params.pair}`);
    }
  } else {
    await updateRepId('trinity-sophia', 'trade_executed', REPID_DELTAS.SUCCESSFUL_TRADE,
      `Executed ${params.action} ${params.pair} $${params.amountUsd}`);
  }

  return {
    decision,
    signature,
    merkleRoot: commitment.root,
    leafHash: commitment.leafHash,
    unityScore: params.vetoResult.unity_score,
    dissonance: params.vetoResult.dissonance,
    agentName: 'trinity-sophia',
  };
}
