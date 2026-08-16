// lib/trustshell/ComplianceReceipt.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { ComplianceReceipt, KYAComplianceResult, BFTConsensusProof } from './types';
import {
  halReceiptAuditPreimage,
  halReceiptRow,
  type HalClassificationInput,
} from './hal-receipt';
import { paymentAuditPreimage, requireAuditSecret } from './receipt-audit';

export { halReceiptAuditPreimage, halReceiptRow, type HalClassificationInput };
export { paymentAuditPreimage, requireAuditSecret } from './receipt-audit';

export class ComplianceReceiptGenerator {
  private get supabase() { return getSupabaseAdmin(); }

  async generate(params: {
    kyaResult:       KYAComplianceResult;
    bftProof:        BFTConsensusProof;
    amountUSDC:      number;
    recipientAddress: string;
    solanaTxHash:    string | null;
    solanaExplorerUrl: string | null;
    ruleHash:        string;
    /** True when no transaction was broadcast. */
    simulated?:      boolean;
    /** True only when the network confirmed the transaction. */
    confirmed?:      boolean;
  }): Promise<ComplianceReceipt> {

    const receiptId = crypto.randomUUID();
    const fireblocksPreAuthId = `FB-PREAUTH-${receiptId.slice(0, 8).toUpperCase()}`;

    // Built by `receipt-audit.ts` so it can be asserted directly. Inline here,
    // it was never tested, and both defects hal-receipt.ts had already fixed for
    // the HAL preimage were still live: an absent tx hash rendered as the
    // literal 'no_tx' collided with a real tx hash of that value.
    const auditHash = await this.auditHmac(
      paymentAuditPreimage({
        receiptId,
        agentName: params.kyaResult.agentName,
        repidScore: params.kyaResult.repidScore,
        amountUSDC: params.amountUSDC,
        recipientAddress: params.recipientAddress,
        // Three states, matching what is stored in `bft_passed`.
        bftPassed: params.bftProof.evaluated ? params.bftProof.passed : null,
        consensusWeight: params.bftProof.consensusWeight ?? null,
        solanaTxHash: params.solanaTxHash,
        ruleHash: params.ruleHash,
      })
    );

    const receipt: ComplianceReceipt = {
      receiptId,
      agentName:          params.kyaResult.agentName,
      agentRepidScore:    params.kyaResult.repidScore,
      agentRepidTier:     params.kyaResult.repidTier,
      paymentAmountUSDC:  params.amountUSDC,
      recipientAddress:   params.recipientAddress,
      kyaVerified:        params.kyaResult.kya_verified,
      zkpProofCID:        params.kyaResult.zkpProofCID,
      humanCustodyBound:  params.kyaResult.humanCustodyBound,
      bftProof:           params.bftProof,
      withinDailyLimit:   params.kyaResult.withinDailyLimit,
      withinTxLimit:      params.kyaResult.withinTxLimit,
      ruleHash:           params.ruleHash,
      insuranceCoverage:  params.kyaResult.insuranceCoverage,
      solanaExplorerUrl:  params.solanaExplorerUrl,
      solanaTxHash:       params.solanaTxHash,
      fireblocksPreAuthId,
      auditHash,
      createdAt:          new Date().toISOString(),
    };

    // Three states, never two. `bft_passed` is nullable precisely so an
    // unevaluated check can be recorded as unknown instead of as a pass.
    const bftPassed = params.bftProof.evaluated ? params.bftProof.passed : null;

    // A simulated run touched no chain; a submitted one is not yet confirmed.
    // Only genuine confirmation may set on_chain_verified.
    const txStatus = params.simulated
      ? 'simulated'
      : params.confirmed
        ? 'confirmed'
        : 'submitted';

    // Persist to Supabase
    const { error: insertError } = await this.supabase.from('kya_compliance_receipts').insert({
      receipt_id:           receipt.receiptId,
      agent_name:           receipt.agentName,
      agent_repid_score:    receipt.agentRepidScore,
      agent_repid_tier:     receipt.agentRepidTier,
      payment_amount_usdc:  receipt.paymentAmountUSDC,
      recipient_address:    receipt.recipientAddress,
      kya_verified:         receipt.kyaVerified,
      zkp_proof_cid:        receipt.zkpProofCID,
      human_custody_bound:  receipt.humanCustodyBound,
      bft_passed:           bftPassed,
      bft_votes_for:        receipt.bftProof.votesFor,
      bft_votes_against:    receipt.bftProof.votesAgainst,
      bft_consensus_weight: receipt.bftProof.consensusWeight,
      bft_threshold:        receipt.bftProof.threshold,
      pythagorean_veto:     receipt.bftProof.pythagoreanVeto,
      within_daily_limit:   receipt.withinDailyLimit,
      within_tx_limit:      receipt.withinTxLimit,
      rule_hash:            receipt.ruleHash,
      insurance_coverage:   receipt.insuranceCoverage,
      solana_tx_hash:       receipt.solanaTxHash,
      solana_explorer_url:  receipt.solanaExplorerUrl,
      fireblocks_preauth_id: receipt.fireblocksPreAuthId,
      audit_hash:           receipt.auditHash,
      on_chain_verified:    params.confirmed === true && params.simulated !== true,
      tx_verification_status: txStatus,
    });

    // The insert result was previously discarded, so a failed write still
    // returned a receipt object to the caller and the API answered 200 with a
    // receipt that does not exist. A receipt that was not stored is not a
    // receipt.
    if (insertError) {
      throw new Error(
        `Compliance receipt ${receipt.receiptId} was NOT persisted: ${insertError.message}`
      );
    }

    return receipt;
  }

  /**
   * Mint a receipt for a HAL classification.
   *
   * WHY THIS EXISTS. Until 2026-08-15 this table was payment-shaped at the
   * constraint level — `payment_amount_usdc` and `recipient_address` were NOT
   * NULL — so the only event that could mint a receipt was a payment. HAL
   * classifications, the largest real signal in the system (147,703 rows), had
   * nowhere to be recorded. The migration added a `receipt_kind` discriminator;
   * this is the writer for the new kind.
   *
   * WHAT IT DELIBERATELY DOES NOT CLAIM. A HAL classification is not a payment
   * and not an authorisation, so:
   *
   *   - `bft_passed` is NULL, not false. The panel did not vote on this. Three
   *     outcomes, never two — and every one of the 12 pre-existing rows had to
   *     be retracted precisely because a placeholder recorded a pass for a vote
   *     that never happened.
   *   - `kya_verified` is false. No KYA check runs on this path; recording true
   *     would assert a check nobody performed.
   *   - payment fields stay NULL. The shape constraint enforces this, so a
   *     future edit that sets them fails loudly at the database rather than
   *     producing a receipt claiming a transfer of nothing.
   *
   * IDEMPOTENT. A partial unique index on `hal_classification_id` makes a repeat
   * mint fail rather than duplicate. Replay over a historical corpus is a job
   * that gets interrupted and resumed; without that, a second pass silently
   * doubles the corpus and every rate computed from it is wrong.
   */
  async generateForHalClassification(
    c: HalClassificationInput
  ): Promise<{ receiptId: string; auditHash: string }> {
    const receiptId = crypto.randomUUID();
    const auditHash = await this.auditHmac(halReceiptAuditPreimage(c, receiptId));

    const { error } = await this.supabase
      .from('kya_compliance_receipts')
      .insert(halReceiptRow(c, receiptId, auditHash));

    // Idempotent by construction: a partial unique index on
    // hal_classification_id makes a repeat mint fail rather than duplicate.
    // Replay over a 147,703-row corpus gets interrupted and resumed; without
    // that index a second pass silently doubles the corpus and every rate
    // computed from it is wrong. The caller distinguishes the duplicate case.
    if (error) {
      throw new Error(
        `HAL receipt for classification ${c.id} was NOT persisted: ${error.message}`
      );
    }

    return { receiptId, auditHash };
  }

  /**
   * HMAC-SHA256 over an audit preimage.
   *
   * Renamed from `sha256`, which lied about what it computes — a reader
   * checking an audit hash with `sha256sum` would get a mismatch and have no
   * way to know why.
   *
   * The secret is REQUIRED. It used to fall back to a constant printed in this
   * file, which made every audit hash forgeable by anyone holding the repo. See
   * `receipt-audit.ts`.
   */
  private async auditHmac(preimage: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto
      .createHmac('sha256', requireAuditSecret(process.env))
      .update(preimage)
      .digest('hex');
  }
}
