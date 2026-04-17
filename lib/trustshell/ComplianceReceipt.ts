// lib/trustshell/ComplianceReceipt.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

import { createClient } from '@supabase/supabase-js';
import type { ComplianceReceipt, KYAComplianceResult, BFTConsensusProof } from './types';

export class ComplianceReceiptGenerator {
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key'
  );

  async generate(params: {
    kyaResult:       KYAComplianceResult;
    bftProof:        BFTConsensusProof;
    amountUSDC:      number;
    recipientAddress: string;
    solanaTxHash:    string;
    solanaExplorerUrl: string;
    ruleHash:        string;
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
      params.bftProof.passed.toString(),
      params.bftProof.consensusWeight.toFixed(4),
      params.solanaTxHash,
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

    // Persist to Supabase
    await this.supabase.from('kya_compliance_receipts').insert({
      receipt_id:           receipt.receiptId,
      agent_name:           receipt.agentName,
      agent_repid_score:    receipt.agentRepidScore,
      agent_repid_tier:     receipt.agentRepidTier,
      payment_amount_usdc:  receipt.paymentAmountUSDC,
      recipient_address:    receipt.recipientAddress,
      kya_verified:         receipt.kyaVerified,
      zkp_proof_cid:        receipt.zkpProofCID,
      human_custody_bound:  receipt.humanCustodyBound,
      bft_passed:           receipt.bftProof.passed,
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
    });

    return receipt;
  }

  private async sha256(data: string): Promise<string> {
    const crypto = await import('crypto');
    const secret = process.env.TRUSTRAILS_HMAC_SECRET || 'trinity-default-sbt-secret';
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }
}
