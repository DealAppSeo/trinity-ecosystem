// lib/trustshell/reward.ts
//
// When has a payment EARNED the reputation it is about to be paid?
//
// ZERO IMPORTS, deliberately — same reasoning as `promotion.ts` and
// `hal/accuracy.ts`. This decides whether a number goes up in a table that
// governs how much money an agent may move, and a decision you cannot run
// standalone is a decision nobody checks.
//
// ── THE DEFECT THIS FILE EXISTS TO CLOSE ────────────────────────────────────
//
// `app/api/trustrails/pay/route.ts` step 6 was, unconditionally:
//
//     await kya.updateRepID(agentName, 10, `Successful compliant payment: …`);
//
// It sat below a response that, on the SAME request, could truthfully say:
//
//     bft:        { evaluated: false, status: 'NOT CHECKED' }
//     settlement: { status: 'simulated', simulated: true }
//     message:    '… SIMULATED — no transaction was broadcast. BFT consensus NOT CHECKED.'
//
// So the route disclosed both absences correctly in the payload — that part was
// already gated by `check:payment-fail-posture` — and then wrote +10 reputation
// for a "successful compliant payment" that moved no money and passed no
// consensus. The disclosure and the reward disagreed, and the reward is the half
// that persists.
//
// `BFT_ENFORCEMENT_MODE` defaults to `observe`, and observe mode returns
// `passed: true, evaluated: false` by design. `AGENT_SOPHIA_SECRET_BYTES` is
// absent in every environment this repo has been observed in, so the executor
// returns `simulated: true`. **The default configuration is the one that pays
// the unearned reward**, not an edge case.
//
// ── WHY IT COMPOUNDS, WHICH IS WHAT MAKES IT SHARP ──────────────────────────
//
// `updateRepID` writes `repid_score`, and `repid_tier`, and
// `spending_limit_daily`, and `spending_limit_per_tx` — the tier ladder is
// recomputed from the new score in the same statement. So the reward raises the
// limits that bound the next request. There is no per-payment idempotency: N
// calls are +10N. From REPID_MIN, a thousand simulated payments reach the top of
// the ladder, and the route carries no authentication.
//
// That is the whole shape: an unauthenticated caller can raise its own spending
// limits by making payments that never happen. Not a scoring nicety.
//
// ── WHAT THIS MODULE DOES AND DOES NOT FIX ──────────────────────────────────
//
// It withholds the reward unless the evidence supports the sentence the reward
// is logged under. It does NOT make the reward idempotent — that needs a store
// keyed by receipt id, and inventing one here would be a second unmeasured
// claim. The compounding is bounded, not removed: see `docs/PRIOR-WORK-INDEX.md`
// and the OPEN item recorded with this change.

/** The one reward the payment path pays. Named so it cannot drift per call site. */
export const SUCCESS_REWARD = 10;

/**
 * What actually happened, as the route already knows it.
 *
 * Every field is a value the route holds by the time step 6 runs. Nothing here
 * is fetched, inferred or defaulted: a decision function that can fill in its
 * own inputs will eventually fill in a flattering one.
 */
export interface RewardEvidence {
  /** Did the BFT panel actually run? `false` in observe mode — the default. */
  consensusEvaluated: boolean;
  /** The panel's verdict. Meaningless unless `consensusEvaluated`. */
  consensusPassed: boolean;
  /** True when the chain was never touched. */
  settlementSimulated: boolean;
  /** True only after the network confirms. Submission alone is not confirmation. */
  settlementConfirmed: boolean;
}

/**
 * Three outcomes, never two.
 *
 * `WITHHELD_NOT_CHECKED` and `WITHHELD_FAILED` pay the same amount — nothing —
 * and mean entirely different things. Collapsing them would report a provider
 * outage and a rejected payment identically, which is the two-outcome mistake
 * this repo keeps re-learning.
 */
export type RewardOutcome = 'EARNED' | 'WITHHELD_NOT_CHECKED' | 'WITHHELD_FAILED';

export interface RewardDecision {
  /** What to pass to `updateRepID`. Zero unless EARNED. Never negative. */
  delta: number;
  outcome: RewardOutcome;
  /** Every precondition that is not met, named individually. */
  unmet: string[];
  /** One line fit for the response payload and the log. */
  reason: string;
}

/**
 * Should this payment raise the agent's RepID?
 *
 * The rule is one sentence: **the reward may only be paid when every claim its
 * own log line makes is true.** The line reads "Successful compliant payment" —
 * compliant means consensus ran and passed, payment means value moved and the
 * network confirmed it. Neither is a stretch reading; both were false by default.
 *
 * A pending confirmation is NOT_CHECKED rather than FAILED. The transaction was
 * broadcast and may yet confirm; charging it as a failure would be the mirror of
 * the bug being fixed, in the other direction.
 */
export function rewardFor(evidence: RewardEvidence): RewardDecision {
  const unmet: string[] = [];
  let failed = false;

  if (!evidence.consensusEvaluated) {
    unmet.push('BFT consensus NOT CHECKED — observe mode returns passed:true without a vote');
  } else if (!evidence.consensusPassed) {
    unmet.push('BFT consensus FAILED');
    failed = true;
  }

  if (evidence.settlementSimulated) {
    unmet.push('settlement SIMULATED — no transaction was broadcast');
  } else if (!evidence.settlementConfirmed) {
    unmet.push('settlement submitted but NOT CONFIRMED by the network');
  }

  if (unmet.length === 0) {
    return {
      delta: SUCCESS_REWARD,
      outcome: 'EARNED',
      unmet,
      reason: 'consensus evaluated and passed; settlement confirmed on chain',
    };
  }

  return {
    delta: 0,
    outcome: failed ? 'WITHHELD_FAILED' : 'WITHHELD_NOT_CHECKED',
    unmet,
    reason: `RepID reward withheld: ${unmet.join('; ')}`,
  };
}

/**
 * The log line the reward is written under.
 *
 * Exists so the sentence and the condition cannot drift apart again. The old
 * text — "Successful compliant payment: N USDC" — was a true sentence about a
 * request that had done neither thing; it is now only ever emitted for a
 * decision that satisfied both.
 */
export function rewardReason(decision: RewardDecision, amountUSDC: number): string {
  return decision.outcome === 'EARNED'
    ? `Consensus-authorized, chain-confirmed payment: ${amountUSDC} USDC`
    : decision.reason;
}

/**
 * Is this delta one the payment path is permitted to pay?
 *
 * Guards the call site rather than the decision: `updateRepID` takes an
 * arbitrary signed number, and the success path must never reach it with
 * anything but zero or exactly `SUCCESS_REWARD`. A penalty routed through the
 * reward path would be a different mechanism wearing this one's name.
 */
export function isPermittedReward(delta: number): boolean {
  return delta === 0 || delta === SUCCESS_REWARD;
}
