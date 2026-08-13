// lib/trustshell/ComplianceReceipt.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { ComplianceReceipt, KYAComplianceResult, BFTConsensusProof } from './types';

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

    // Build audit hash — tamper-evident proof of entire receipt
    const auditData = [
      receiptId,
      params.kyaResult.agentName,
      params.kyaResult.repidScore.toString(),
      params.amountUSDC.toString(),
      params.recipientAddress,
      // An unevaluated proof must not hash as though it passed, or two
      // materially different receipts produce the same audit hash.
      params.bftProof.evaluated ? params.bftProof.passed.toString() : 'not_evaluated',
      params.bftProof.consensusWeight?.toFixed(4) ?? 'null',
      params.solanaTxHash ?? 'no_tx',
      params.ruleHash,
    ].join(':');

    const auditHash = await this.sha256(auditData);

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

  private async sha256(data: string): Promise<string> {
    const crypto = await import('crypto');
    const secret = process.env.TRUSTRAILS_HMAC_SECRET || 'trinity-default-sbt-secret';
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }
}
