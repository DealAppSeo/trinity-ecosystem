/**
 * RepID Credential Interface
 * Defines the ZKP-wrapped reputation identity credential
 * that agents and humans carry across the HyperDAG ecosystem.
 */

export interface RepIDCredential {
  /** DID of the credential holder (e.g., did:hyperdag:agent:trinity-veritas) */
  did: string;
  /** Reputation score (0-100) */
  score: number;
  /** Autonomy tier derived from score */
  tier: 'Assist' | 'Approve' | 'Act' | 'Learn';
  /** Chain where the SBT is anchored */
  chain: string;
  /** SBT token ID on-chain (null if not yet minted) */
  sbtTokenId: string | null;
  /** Wallet address of the holder */
  wallet: string;
  /** ISO timestamp of last score update */
  lastUpdated: string;
  /** Number of verified task completions */
  tasksVerified: number;
  /** ZKP proof hash (null if proof not yet generated) */
  zkpProofHash: string | null;
}

export interface RepIDProof {
  /** The credential being proven */
  credential: RepIDCredential;
  /** ZKP proof bytes (base64) */
  proof: string;
  /** Public inputs to the proof circuit */
  publicInputs: string[];
  /** Verification key hash */
  verificationKeyHash: string;
  /** Timestamp of proof generation */
  generatedAt: string;
}

/**
 * Creates a new RepID credential for an agent or human.
 */
export function createRepIDCredential(params: {
  did: string;
  score: number;
  wallet: string;
  chain?: string;
  tasksVerified?: number;
}): RepIDCredential {
  const tier: RepIDCredential['tier'] =
    params.score <= 40 ? 'Assist' :
    params.score <= 70 ? 'Approve' :
    params.score <= 90 ? 'Act' : 'Learn';

  return {
    did: params.did,
    score: Math.max(0, Math.min(100, params.score)),
    tier,
    chain: params.chain || 'base-sepolia',
    sbtTokenId: null,
    wallet: params.wallet,
    lastUpdated: new Date().toISOString(),
    tasksVerified: params.tasksVerified || 0,
    zkpProofHash: null
  };
}

/**
 * Verifies that a RepID credential meets a minimum threshold.
 * Used for gating access to resources or actions.
 */
export function meetsThreshold(credential: RepIDCredential, minScore: number): boolean {
  return credential.score >= minScore;
}
