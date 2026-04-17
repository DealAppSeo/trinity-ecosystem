/**
 * TrustTrader EIP-712 Signing
 * Signs TradeIntents (SOPHIA) and ConstitutionalRefusals (SHOFET)
 * on Base Sepolia with ERC-8004 identity contract.
 */

import {
  createWalletClient,
  http,
  type Address,
  type Hex,
  keccak256,
  encodePacked,
  toHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

// EIP-712 Domain
const DOMAIN = {
  name: 'TrustTrader' as const,
  version: '1' as const,
  chainId: 84532,
  verifyingContract: '0x8004A818BFB912233c491871b3d84c89A494BD9e' as Address,
} as const;

// TradeIntent type definition
const TRADE_INTENT_TYPES = {
  TradeIntent: [
    { name: 'agentId', type: 'uint256' },
    { name: 'agentWallet', type: 'address' },
    { name: 'pair', type: 'string' },
    { name: 'action', type: 'string' },
    { name: 'amountUsdScaled', type: 'uint256' },
    { name: 'maxSlippageBps', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

// ConstitutionalRefusal type definition
const CONSTITUTIONAL_REFUSAL_TYPES = {
  ConstitutionalRefusal: [
    { name: 'agentId', type: 'uint256' },
    { name: 'reason', type: 'string' },
    { name: 'unityScore', type: 'string' },
    { name: 'dissonance', type: 'string' },
    { name: 'timestamp', type: 'uint256' },
  ],
} as const;

export interface TradeIntent {
  agentId: bigint;
  agentWallet: Address;
  pair: string;
  action: 'BUY' | 'SELL';
  amountUsdScaled: bigint; // USD * 100
  maxSlippageBps: bigint;
  nonce: bigint;
  deadline: bigint;
}

export interface ConstitutionalRefusal {
  agentId: bigint;
  reason: string;
  unityScore: string;
  dissonance: string;
  timestamp: bigint;
}

export interface SignedTradeIntent {
  intent: TradeIntent;
  signature: Hex;
  signer: Address;
}

export interface SignedRefusal {
  refusal: ConstitutionalRefusal;
  signature: Hex;
  signer: Address;
}

function getWalletClient(privateKey: Hex) {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(),
  });
}

/**
 * SOPHIA signs a TradeIntent (execute decision)
 */
export async function signTradeIntent(
  intent: TradeIntent,
  sophiaPrivateKey: Hex
): Promise<SignedTradeIntent> {
  const client = getWalletClient(sophiaPrivateKey);

  const signature = await client.signTypedData({
    domain: DOMAIN,
    types: TRADE_INTENT_TYPES,
    primaryType: 'TradeIntent',
    message: {
      agentId: intent.agentId,
      agentWallet: intent.agentWallet,
      pair: intent.pair,
      action: intent.action,
      amountUsdScaled: intent.amountUsdScaled,
      maxSlippageBps: intent.maxSlippageBps,
      nonce: intent.nonce,
      deadline: intent.deadline,
    },
  });

  return {
    intent,
    signature,
    signer: client.account.address,
  };
}

/**
 * SHOFET signs a ConstitutionalRefusal (veto decision)
 */
export async function signConstitutionalRefusal(
  refusal: ConstitutionalRefusal,
  shofetPrivateKey: Hex
): Promise<SignedRefusal> {
  const client = getWalletClient(shofetPrivateKey);

  const signature = await client.signTypedData({
    domain: DOMAIN,
    types: CONSTITUTIONAL_REFUSAL_TYPES,
    primaryType: 'ConstitutionalRefusal',
    message: {
      agentId: refusal.agentId,
      reason: refusal.reason,
      unityScore: refusal.unityScore,
      dissonance: refusal.dissonance,
      timestamp: refusal.timestamp,
    },
  });

  return {
    refusal,
    signature,
    signer: client.account.address,
  };
}

/**
 * Create a leaf hash for Merkle tree from a trade decision
 */
export function createLeafHash(
  agentId: bigint,
  decision: 'EXECUTE' | 'REFUSED',
  unityScore: string,
  dissonance: string,
  timestamp: bigint,
  signature: Hex
): Hex {
  return keccak256(
    encodePacked(
      ['uint256', 'string', 'string', 'string', 'uint256', 'bytes'],
      [agentId, decision, unityScore, dissonance, timestamp, signature]
    )
  );
}

export { DOMAIN, TRADE_INTENT_TYPES, CONSTITUTIONAL_REFUSAL_TYPES };
