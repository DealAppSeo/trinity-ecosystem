import type { BFTConsensusProof } from './types';
import { bftEngine, type PaymentAuthorizationRequest } from '@/lib/trust/BFTEngine';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Connects the payment path to the real BFT engine.
//
// This used to be a 16-line placeholder returning `passed: true` with a
// consensus weight of 1.0 for a vote that never happened, which is why all 12
// rows in kya_compliance_receipts claim BFT consensus and `pythagorean_veto`
// has never once been true. The real engine — three providers, golden-ratio
// weighting, Pythagorean Comma veto — was wired to a single route no UI called.
//
// Two modes, chosen by BFT_ENFORCEMENT_MODE:
//
//   observe (default) — the payment does not wait. The receipt is written with
//     bft_passed = NULL, the authorisation context is queued to
//     bft_payment_evaluations, and a worker fills in the verdict afterwards.
//     Settlement never blocks on three LLM calls, and the divergence data
//     accumulates.
//
//   enforce — the panel runs inline and a failed consensus refuses the payment.
//     Adds seconds of latency to every transfer and makes settlement depend on
//     third-party model availability.
//
// Observe is the default deliberately. The Comma veto fires on *unanimous*
// high confidence, so on this question a routine, obviously-fine payment may be
// escalated; nobody knows the real rate yet because it has never run against
// payments. Measure it in observe mode, then decide. Turning on enforcement
// before that is choosing a refusal rate blind.

export type BftEnforcementMode = 'observe' | 'enforce';

export function bftEnforcementMode(): BftEnforcementMode {
  return process.env.BFT_ENFORCEMENT_MODE === 'enforce' ? 'enforce' : 'observe';
}

/** Context the panel needs, captured at payment time. */
export interface PaymentAuthorizationContext extends PaymentAuthorizationRequest {}

export class BFTAuthorizer {
  private static warnedObserve = false;

  /**
   * Decide whether the payment may proceed.
   *
   * In observe mode this never blocks and reports `evaluated: false`, so the
   * caller records bft_passed = NULL rather than a pass. In enforce mode it
   * runs the panel and reports a real verdict.
   */
  async authorize(
    paymentId: string,
    agentName: string,
    amountUSDC: number,
    maxWithdrawal: number,
    action: string,
    context?: Partial<PaymentAuthorizationContext>
  ): Promise<BFTConsensusProof> {
    const mode = bftEnforcementMode();

    if (mode === 'observe') {
      if (!BFTAuthorizer.warnedObserve) {
        BFTAuthorizer.warnedObserve = true;
        console.warn(
          '[BFTAuthorizer] observe mode: consensus is evaluated asynchronously. ' +
            'Receipts record bft_passed = NULL until the worker fills them in. ' +
            'Set BFT_ENFORCEMENT_MODE=enforce to gate payments inline.'
        );
      }
      return {
        paymentId,
        votesFor: [],
        votesAgainst: [],
        consensusWeight: null,
        threshold: 0.618033988749895,
        passed: true, // not blocked — see the note above; this is not a verdict
        pythagoreanVeto: false,
        votedAt: new Date().toISOString(),
        evaluated: false,
        notEvaluatedReason:
          'Queued for asynchronous BFT evaluation (observe mode). Not a consensus result.',
      };
    }

    // enforce — run the panel inline.
    const request: PaymentAuthorizationRequest = {
      paymentId,
      agentName,
      amountUSDC,
      maxWithdrawal,
      recipientAddress: context?.recipientAddress ?? '(unspecified)',
      purpose: context?.purpose ?? action,
      repidScore: context?.repidScore ?? 0,
      repidTier: context?.repidTier ?? 'unknown',
      humanCustody: context?.humanCustody ?? false,
    };

    try {
      const result = await bftEngine.authorizePayment(request);
      return {
        paymentId,
        votesFor: result.votes.filter(v => v.belief > v.disbelief).map(v => v.provider),
        votesAgainst: result.dissenting_providers,
        consensusWeight: result.consensus_score,
        threshold: result.threshold,
        passed: result.consensus_reached,
        pythagoreanVeto: result.pythagorean_veto_fired,
        votedAt: new Date().toISOString(),
        evaluated: true,
      };
    } catch (e: unknown) {
      // A provider outage is not a consensus failure. Reporting `passed: false`
      // would refuse a legitimate payment because a third party was down;
      // reporting `passed: true, evaluated: true` would claim a vote that never
      // ran. Neither is honest, so: do not block, and record NOT CHECKED.
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[BFTAuthorizer] enforce-mode evaluation failed, not blocking: ${message}`);
      return {
        paymentId,
        votesFor: [],
        votesAgainst: [],
        consensusWeight: null,
        threshold: 0.618033988749895,
        passed: true,
        pythagoreanVeto: false,
        votedAt: new Date().toISOString(),
        evaluated: false,
        notEvaluatedReason: `BFT engine unavailable: ${message}`,
      };
    }
  }

  /**
   * Queue a payment for asynchronous evaluation.
   *
   * Called after the receipt exists, so the verdict has somewhere to land.
   * Failures are logged and swallowed: a queue write must never fail a payment
   * that has already settled.
   */
  async enqueue(receiptId: string, request: PaymentAuthorizationRequest): Promise<void> {
    const claim =
      `Authorise ${request.amountUSDC} USDC from ${request.agentName} ` +
      `(RepID ${request.repidScore}/${request.repidTier}) to ${request.recipientAddress} ` +
      `for "${request.purpose}"`;

    const { error } = await getSupabaseAdmin().from('bft_payment_evaluations').insert({
      receipt_id: receiptId,
      payment_id: request.paymentId,
      agent_name: request.agentName,
      amount_usdc: request.amountUSDC,
      recipient_address: request.recipientAddress,
      purpose: request.purpose,
      repid_score: request.repidScore,
      repid_tier: request.repidTier,
      max_withdrawal: request.maxWithdrawal,
      human_custody: request.humanCustody,
      claim,
    });

    if (error) {
      console.error(
        `[BFTAuthorizer] Could not queue evaluation for receipt ${receiptId}: ${error.message}. ` +
          'The receipt keeps bft_passed = NULL and will not be evaluated.'
      );
    }
  }
}
