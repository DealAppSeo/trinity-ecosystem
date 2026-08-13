// lib/trustshell/types.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

export type RepIDTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

export interface AgentKYAProfile {
  agentName:           string;
  repidScore:          number;      // 0-10000
  repidTier:           RepIDTier;
  spendingLimitDaily:  number;      // USDC
  spendingLimitPerTx:  number;      // USDC
  insuranceCoverage:   number;      // USDC
  collateralStaked:    number;      // USDC
  zkpProofCID:         string;      // IPFS CID — stub for v1
  humanCustodyVerified: boolean;
  vaultAccessPermitted: boolean;
}

export interface BFTVote {
  agent:   string;
  vote:    'approve' | 'reject';
  weight:  number;   // RepID / 10000
  reason:  string;
}

export interface BFTConsensusProof {
  paymentId:         string;
  votesFor:          string[];
  votesAgainst:      string[];
  consensusWeight:   number | null;  // null when not evaluated
  threshold:         number;         // 0.618 golden ratio
  passed:            boolean;
  pythagoreanVeto:   boolean;
  votedAt:           string;

  // Whether consensus was actually computed. `passed: true` with
  // `evaluated: false` means "not blocked" — it does NOT mean "consensus
  // reached". Anything persisting or displaying this proof must treat the two
  // as different, or it reports a check that never ran as a check that passed.
  evaluated:         boolean;
  notEvaluatedReason?: string;
}

export interface KYAComplianceResult {
  agentName:         string;
  kya_verified:      boolean;
  repidScore:        number;
  repidTier:         RepIDTier;
  humanCustodyBound: boolean;
  zkpProofCID:       string;
  withinDailyLimit:  boolean;
  withinTxLimit:     boolean;
  insuranceCoverage: number;
  denialReason?:     string;
}

export interface ComplianceReceipt {
  receiptId:          string;
  agentName:          string;
  agentRepidScore:    number;
  agentRepidTier:     RepIDTier;
  paymentAmountUSDC:  number;
  recipientAddress:   string;
  kyaVerified:        boolean;
  zkpProofCID:        string;
  humanCustodyBound:  boolean;
  bftProof:           BFTConsensusProof;
  withinDailyLimit:   boolean;
  withinTxLimit:      boolean;
  ruleHash:           string;
  insuranceCoverage:  number;
  solanaExplorerUrl:  string | null;   // null when nothing was broadcast
  solanaTxHash:       string | null;   // null when nothing was broadcast
  fireblocksPreAuthId: string;
  auditHash:          string;
  createdAt:          string;
}

export interface VaultAccessRequest {
  vaultId:     string;
  agentName:   string;
  action:      'deposit' | 'withdraw' | 'rebalance';
  amountUSDC:  number;
}

export interface VaultAccessResult {
  permitted:   boolean;
  reason:      string;
  agentRepid:  number;
  minRequired: number;
  receipt?:    ComplianceReceipt;
}
