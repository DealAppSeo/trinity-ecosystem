// acceptance-loop.ts — revise until the auditor accepts, and terminate honestly.
//
// Zero imports, so the check suite can compile and assert it standalone.
//
// `runContractedWork` runs ONE round: draw a checker, sign a contract the doer
// did not compose, run the bounded loop, judge, envelope. What it does not do
// is what a professional review actually is — send it back, get it improved,
// look again, and only then sign it off. This module is that outer loop.
//
// ── THE ATTACK THAT LIVES HERE AND NOWHERE ELSE ──────────────────────────────
//
// `checker-assignment.ts` defeats checker-shopping AT THE DRAW: the doer must
// commit before the beacon exists, and re-running the draw returns the same
// checker forever. Both defences are properties of a SINGLE draw.
//
// A revision loop reintroduces the whole attack for free if each round draws
// again. "Rejected? Resubmit and get a new auditor" is exactly the re-roll that
// the deterministic seed was built to make impossible — it just moves the
// grinding from inside one draw to across many. Three rejections and a fresh
// draw each time is not three reviews; it is shopping with extra steps.
//
// So THE AUDITOR IS STICKY. One draw per contract, held across every revision.
// `auditorIsStable` exists to assert that and to fail loudly when it is
// violated, because the violation looks like diligence — "we got a second
// opinion" — rather than like an attack.
//
// ── WHY ROUNDS ARE BOUNDED, AND WHY EXHAUSTION IS NOT A PASS ─────────────────
//
// "Keep improving until it is accepted" has no fixed point when the judge is
// wrong, the spec is impossible, or the doer cannot do the work. Unbounded, it
// is a livelock that bills forever.
//
// Bounded, the interesting question becomes what running out MEANS. It must not
// mean accepted — that is the house defect, a budget expiring reported as a
// standard met. It must not silently mean rejected either, because the work may
// be fine and the process merely out of road. It is its own outcome,
// EXHAUSTED, and it names the last verdict so a human can tell which.
//
// ── WHY A JUDGE OUTAGE MUST NOT COST THE DOER A ROUND ────────────────────────
//
// `staged-judge.ts` already treats a throwing tier as NOT_CHECKED and escalates,
// on the grounds that "a provider outage is not a defect report, and must not be
// able to condemn the work". The same reasoning applies one level up: if a
// NOT_CHECKED round consumed revision budget, a flaky provider could exhaust a
// correct doer's allowance and produce EXHAUSTED on work nobody ever judged.
// NOT_CHECKED rounds are recorded — they are evidence about the harness — and
// they do not decrement anything.
//
// ── WHY RESUBMITTING THE SAME BYTES IS ITS OWN OUTCOME ───────────────────────
//
// "Continue to improve it" is the instruction. A doer that resubmits identical
// work has not improved anything, and under a deterministic auditor it will be
// rejected identically forever — burning the budget to reach EXHAUSTED, which
// reads as "we tried". STALLED separates "could not fix it" from "did not
// change it". They call for different interventions and only one of them is the
// doer's fault.

/** What one auditor pass concluded. Three outcomes, never two. */
export type RoundVerdict = 'ACCEPTED' | 'REJECTED' | 'NOT_CHECKED';

export interface Round {
  /** 0-based order. Rounds are evaluated in array order, not by this field. */
  index: number;
  /**
   * The DRAWN auditor for this contract. Constant across rounds by design —
   * see `auditorIsStable`.
   */
  auditorDid: string;
  /**
   * Digest of exactly what was submitted this round.
   *
   * A digest rather than the artefact: this module compares submissions for
   * equality and must never hold deliverable content, which can be large and
   * is not this layer's business.
   */
  submissionDigest: string;
  verdict: RoundVerdict;
  /** The auditor's stated reason. Carried into EXHAUSTED so it is not lost. */
  detail?: string;
}

export interface AcceptancePolicy {
  /**
   * How many REJECTED rounds a doer may absorb before EXHAUSTED.
   *
   * Counts rejections, not rounds: NOT_CHECKED does not consume budget.
   */
  maxRejections: number;
}

/**
 * Three rejections.
 *
 * Not tuned — chosen as the smallest number that can distinguish "missed
 * something" from "cannot do it": one rejection is an oversight, two is a
 * pattern, three is a trend. Raise it deliberately and record why; the failure
 * this bound prevents is an unbounded bill, so a large value is not a safe
 * default dressed as generosity.
 */
export const DEFAULT_MAX_REJECTIONS = 3;

export type AcceptanceState =
  /** Signed off. `round` is the index of the accepting round. */
  | { status: 'ACCEPTED'; round: number; auditorDid: string }
  /** Send it back. `remaining` rejections are still available. */
  | { status: 'REVISE'; remaining: number; detail?: string }
  /** Budget spent without acceptance. NOT a pass and NOT a verdict on the work. */
  | { status: 'EXHAUSTED'; rejections: number; lastDetail?: string }
  /** Identical bytes resubmitted after a rejection. */
  | { status: 'STALLED'; digest: string }
  /** No round has been run. Distinct from a round that produced nothing. */
  | { status: 'NOT_STARTED' };

/**
 * Every round names the same auditor.
 *
 * Returns the offending round index rather than a boolean, because the caller's
 * only useful action is to point at where the substitution happened.
 */
export function auditorIsStable(rounds: readonly Round[]): { stable: true } | { stable: false; at: number } {
  if (rounds.length === 0) return { stable: true };
  const first = rounds[0].auditorDid;
  for (let i = 1; i < rounds.length; i += 1) {
    if (rounds[i].auditorDid !== first) return { stable: false, at: i };
  }
  return { stable: true };
}

/**
 * Decide what happens next.
 *
 * Ordering is load-bearing and is asserted:
 *
 *   1. ACCEPTED wins over everything. Once an auditor signs off, later rounds
 *      cannot un-accept — that would let a re-review revoke a delivered result.
 *   2. STALLED is checked BEFORE exhaustion. A doer resubmitting identical
 *      bytes should be told that, not handed a budget report that implies the
 *      work was considered and found wanting.
 *   3. EXHAUSTED before REVISE, or a spent budget still asks for another round.
 */
export function evaluateAcceptance(
  rounds: readonly Round[],
  policy: AcceptancePolicy = { maxRejections: DEFAULT_MAX_REJECTIONS }
): AcceptanceState {
  if (rounds.length === 0) return { status: 'NOT_STARTED' };

  for (const round of rounds) {
    if (round.verdict === 'ACCEPTED') {
      return { status: 'ACCEPTED', round: round.index, auditorDid: round.auditorDid };
    }
  }

  const rejected = rounds.filter((r) => r.verdict === 'REJECTED');

  // Identical bytes after a rejection. Compared against the previous REJECTED
  // submission specifically: an intervening NOT_CHECKED round is a retry of the
  // same work under an outage, which is legitimate and must not read as a stall.
  if (rejected.length >= 2) {
    const last = rejected[rejected.length - 1];
    const prev = rejected[rejected.length - 2];
    if (last.submissionDigest === prev.submissionDigest) {
      return { status: 'STALLED', digest: last.submissionDigest };
    }
  }

  if (rejected.length >= policy.maxRejections) {
    return {
      status: 'EXHAUSTED',
      rejections: rejected.length,
      lastDetail: rejected[rejected.length - 1]?.detail,
    };
  }

  return {
    status: 'REVISE',
    remaining: policy.maxRejections - rejected.length,
    detail: rejected[rejected.length - 1]?.detail,
  };
}

/**
 * Is this state a completed, signed-off delivery?
 *
 * Exists so callers cannot write `state.status !== 'REVISE'` and treat
 * EXHAUSTED or STALLED as done. Every non-ACCEPTED terminal state is a reason
 * to escalate to a human, not to ship.
 */
export function isDelivered(state: AcceptanceState): boolean {
  return state.status === 'ACCEPTED';
}

/**
 * Is the loop over, one way or another?
 *
 * Separate from `isDelivered` on purpose. A caller needs both "should I run
 * another round" and "may I ship", and conflating them is how EXHAUSTED
 * becomes a pass.
 */
export function isTerminal(state: AcceptanceState): boolean {
  return state.status === 'ACCEPTED' || state.status === 'EXHAUSTED' || state.status === 'STALLED';
}
