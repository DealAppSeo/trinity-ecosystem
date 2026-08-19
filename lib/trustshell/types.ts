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
  /**
   * `null` when the limit was NOT EVALUATED — not when it failed.
   *
   * Three states, because two forced a guess: the per-transaction denial path
   * returns before the spend history is read, and with a bare boolean it
   * asserted `withinDailyLimit: true` about a check that never ran. The
   * database columns are nullable and SQL NULL already means unknown, so this
   * stores faithfully.
   */
  withinDailyLimit:  boolean | null;
  withinTxLimit:     boolean | null;
  /**
   * The per-transaction ceiling this decision was ACTUALLY MEASURED AGAINST —
   * the stored `spending_limit_per_tx`, which is what `checkPerTxLimit` uses.
   *
   * ── WHY THE ENFORCED NUMBER IS EXPORTED RATHER THAN RE-DERIVED ────────────
   *
   * `pay/route.ts` briefs the BFT panel with a `maxWithdrawal`, and it computed
   * that itself as `TIER_LIMITS[tierForScore(repidScore)].perTx`. That is a
   * SECOND source for one fact, and the two disagree for any row the current
   * ladder did not write — which is 9 of 12 live rows (see
   * `docs/REPID-REGISTRY-DRIFT-2026-08-17.md`). Measured 2026-08-17, the brief
   * overstated the enforced ceiling by up to **20x**: TORCH is enforced at
   * 5,000 and the panel was told 100,000.
   *
   * That line already carries a comment about a FOURTH tier ladder deleted from
   * it — `repidScore > 7500 ? 100000 : 50000` — and the note that "the panel
   * weighs this number, so a wrong one is a wrong brief". The replacement
   * reintroduced the same split from the other side: not a second ladder this
   * time, but the right ladder applied to a row the ladder did not write.
   *
   * Exporting the enforced value is the same fix as every previous recurrence —
   * delete the second implementation — and it is the ONLY one available here
   * that changes no limit. Deriving the brief is what produced the divergence;
   * reconciling row and ladder is the open operator decision and is not this.
   *
   * `null` when NOT EVALUATED: no profile could be read, so no ceiling was
   * applied. Never 0 — a zero ceiling is a real policy ("this agent may spend
   * nothing"), and collapsing unknown into it is the fail-shape this interface
   * already refuses for `withinDailyLimit`.
   */
  enforcedPerTxLimit: number | null;
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
  /** `null` when not evaluated. See `KYAComplianceResult`. */
  withinDailyLimit:   boolean | null;
  withinTxLimit:      boolean | null;
  ruleHash:           string;
  insuranceCoverage:  number;
  solanaExplorerUrl:  string | null;   // null when nothing was broadcast
  solanaTxHash:       string | null;   // null when nothing was broadcast
  fireblocksPreAuthId: string;
  auditHash:          string;
  createdAt:          string;
}

import type { ControlProof } from './identity/control-proof';
import type { DelegatedControlProof } from './identity/delegation';

export interface VaultAccessRequest {
  vaultId:     string;
  agentName:   string;
  action:      'deposit' | 'withdraw' | 'rebalance';
  amountUSDC:  number;
  /**
   * Optional dual-auth proof. SHADOW MODE ONLY — it is observed and recorded,
   * and does NOT affect whether access is granted. The live gate remains
   * `agent_kya_registry.human_custody_verified`. See CustodyShadow.ts and
   * LESSONS A11.
   */
  controlProof?: ControlProof | DelegatedControlProof;
}

export interface VaultAccessResult {
  permitted:   boolean;
  reason:      string;
  agentRepid:  number;
  minRequired: number;
  receipt?:    ComplianceReceipt;
}
