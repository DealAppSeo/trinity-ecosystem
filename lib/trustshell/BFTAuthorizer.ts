import type { BFTConsensusProof } from './types';

// PLACEHOLDER — this does not compute consensus.
//
// A real BFT engine exists at `lib/trust/BFTEngine.ts`: three providers,
// golden-ratio vote weights, and a genuine Pythagorean Comma veto. It is wired
// to `/api/trust/bft` and nothing else. This class is what the payment path
// (`/api/trustrails/pay`), the villain demo, and `VaultPermission` actually
// call.
//
// It used to return `{ passed: true, consensusWeight: 1.0 }` unconditionally,
// which meant every compliance receipt recorded `bft_passed = true` and a
// perfect consensus weight for a vote that never happened. All 12 rows in
// `kya_compliance_receipts` carry that claim, and `pythagorean_veto` has never
// once been true because nothing here can set it.
//
// It still does not block — the posture is observe, not enforce, and refusing
// every payment would be a worse lie in the other direction. But it now reports
// `evaluated: false`, and callers must persist `bft_passed` as NULL rather than
// TRUE. A check that did not run is NOT CHECKED, never PASS.
//
// Wiring the real engine into the money path is a live decision, not a
// cleanup: BFTEngine.vote() calls three LLM providers, so it adds seconds of
// latency and per-call cost to every payment. See docs/E2E-AUDIT.md G1.
export class BFTAuthorizer {
  private static warned = false;

  async authorize(
    paymentId: string,
    agentName: string,
    amountUSDC: number,
    maxWithdrawal: number,
    action: string
  ): Promise<BFTConsensusProof> {
    const reason =
      'BFTAuthorizer is a placeholder and computes no consensus. ' +
      'The real engine (lib/trust/BFTEngine.ts) is not wired into this path.';

    if (!BFTAuthorizer.warned) {
      BFTAuthorizer.warned = true;
      console.warn(`[BFTAuthorizer] ${reason} Receipts will record bft_passed = NULL.`);
    }

    return {
      paymentId,
      votesFor:          [],
      votesAgainst:      [],
      consensusWeight:   null,
      threshold:         0.67,
      passed:            true,   // not blocked — see the note above
      pythagoreanVeto:   false,
      votedAt:           new Date().toISOString(),
      evaluated:         false,
      notEvaluatedReason: reason,
    };
  }
}
