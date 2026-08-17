// lib/trustshell/repid-scoring.ts
//
// The pure half of RepID scoring: the tier ladder, the normalization, the score
// curve, and the spend arithmetic.
//
// ZERO IMPORTS, deliberately — the same reason `hal-receipt.ts` gives. Its two
// callers (`RepIDConfig.ts`, `KYAValidator.ts`) reach Supabase through the `@/`
// alias, so a check suite cannot compile either standalone, and consequently
// NEITHER HAS EVER HAD A TEST. Both are load-bearing: RepIDConfig backs
// `/api/trustrails/repid/configure`, and KYAValidator gates `VaultPermission`.
// The thing nobody could run is the thing nobody checked.
//
// ── WHAT MEASURING THIS FIRST FOUND ─────────────────────────────────────────
//
// Five defects, each verified by computation before being written down:
//
// 1. **THE SCORE COULD NOT REACH THE GATE IT FEEDS — FIXED 2026-08-16.** With
//    the multiplier at 2000 the maximum attainable score was **4008** against a
//    payment threshold of **5000**, so Gold, Platinum and the payment path were
//    unreachable for everyone, permanently. Gold would have needed a weighted
//    sum of 3.15 when the maximum is 1.0.
//
//    This is the standing rule in CLAUDE.md — *compute the ceiling before
//    optimising toward it* — applied to a scoring curve instead of a component.
//    Raising the multiplier to 5000 fixed that and produced the MIRROR defect:
//    the gate then never closed, and a weak fleet came out 99% Platinum. Both
//    have one cause — the floors were calibrated against each other and never
//    against the curve. The curve is now 57200/0.5 (Sean's call, Option B of a
//    measured pair; see `SCORE_LOG_MULTIPLIER`). `reachableCeiling()` and
//    `describeCoherence()` keep a gate REACHABLE; `check:repid-calibration`
//    keeps it ESCAPABLE. It took both to close this.
//
// 2. **TWO TIER LADDERS THAT DISAGREE.** `KYAValidator` used `>` and
//    `RepIDConfig` used `>=` over the same thresholds, so at exactly 2500,
//    5000 and 7500 the two disagreed about the tier — one says Silver, the
//    other Bronze. Same defect the loop kernel's DID comparison had: one rule,
//    two implementations, disagreeing on the boundary. There is now one ladder.
//
// 3. **AN ABSENT DAILY SPEND READ AS ZERO.** `getDailySpend` destructured away
//    the query error and returned `(data || []).reduce(...)`, so a database
//    failure produced 0 — indistinguishable from "has spent nothing" — and the
//    daily-limit check then PASSED. A DB outage granted the full daily
//    allowance. Absent is not zero; this is the `Usage`/`Figure` lesson from
//    the loop kernel, in the place where it costs money.
//
// 4. **A FABRICATED PROOF ID.** `zkp_proof_cid || \`ZKP_STUB_${name}_VERIFIED\``
//    turned a missing proof into a non-empty string containing the word
//    VERIFIED. Any consumer testing presence saw a proof that does not exist.
//
// 5. **NORMALIZATION UNBOUNDED ABOVE.** `pct / 100` and `1 - ms/2000` were
//    clamped at 0 but not at 1, so an accuracy recorded as 150% or a negative
//    latency inflated the weighted sum past 1.0 — the one route to a Gold score
//    the honest path cannot reach.

/** Score domain. A score outside this is a bug in whatever produced it. */
export const REPID_MIN = 0;
export const REPID_MAX = 10000;

export type RepIDTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

/**
 * The canonical tier ladder — ONE definition, inclusive lower bounds.
 *
 * Inclusive (`>=`) because that is how a threshold reads in every other part of
 * this system and in the prose that describes it: "2500 and above is Silver".
 * The exclusive variant was the accident, not the intent, and it differed from
 * this one at exactly three scores.
 *
 * Ordered high to low so `tierForScore` can return the first match.
 */
export const TIER_FLOORS: readonly { tier: RepIDTier; floor: number }[] = [
  { tier: 'Platinum', floor: 7500 },
  { tier: 'Gold', floor: 5000 },
  { tier: 'Silver', floor: 2500 },
  { tier: 'Bronze', floor: 0 },
];

/**
 * The tier a score sits in. The single implementation.
 *
 * A non-finite score is Bronze rather than a throw: this runs on the read path
 * of a gate, and a gate that throws tends to acquire a `try/catch` returning
 * the permissive answer. Bronze is the least-privileged tier, so a malformed
 * score lands in the safest place.
 */
export function tierForScore(score: number): RepIDTier {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'Bronze';
  for (const { tier, floor } of TIER_FLOORS) {
    if (score >= floor) return tier;
  }
  return 'Bronze';
}

/** Per-tier spending limits, in USDC. */
export const TIER_LIMITS: Readonly<Record<RepIDTier, { daily: number; perTx: number }>> = {
  Platinum: { daily: 500000, perTx: 100000 },
  Gold: { daily: 100000, perTx: 50000 },
  Silver: { daily: 10000, perTx: 5000 },
  Bronze: { daily: 1000, perTx: 100 },
};

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

export interface RepIDWeights {
  bftAccuracy: number;
  veritasCatchRate: number;
  x402SuccessRate: number;
  latencyOpportunity: number;
  humanCustodyScore: number;
}

export const DEFAULT_WEIGHTS: RepIDWeights = {
  bftAccuracy: 0.4,
  veritasCatchRate: 0.3,
  x402SuccessRate: 0.15,
  latencyOpportunity: 0.1,
  humanCustodyScore: 0.05,
};

export const WEIGHT_SUM_TOLERANCE = 0.01;

/**
 * Are these weights usable?
 *
 * CHECKED ON READ, NOT ONLY ON WRITE. The original validated the sum inside
 * `updateInstitutionWeights` and nowhere else, so weights written straight to
 * `institution_risk_config` — by a migration, a console, or another service —
 * were used unvalidated. Weights summing to 5 make `weightedSum` reach 5.0,
 * which is the one way an agent clears a tier the honest maximum cannot.
 * A validation that only guards the front door guards nothing.
 */
export function weightsProblem(weights: unknown): string | null {
  if (typeof weights !== 'object' || weights === null) return 'weights are not an object';
  const w = weights as Record<string, unknown>;
  const keys: (keyof RepIDWeights)[] = [
    'bftAccuracy',
    'veritasCatchRate',
    'x402SuccessRate',
    'latencyOpportunity',
    'humanCustodyScore',
  ];
  let sum = 0;
  for (const key of keys) {
    const value = w[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return `weight '${key}' is not a finite number`;
    }
    if (value < 0) return `weight '${key}' is negative (${value}), which would let a bad metric raise the score`;
    sum += value;
  }
  if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
    return `weights sum to ${sum.toFixed(4)}, not 1.0 — the score's range depends on this summing to 1`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export interface RawMetrics {
  /** Percentage, 0–100. */
  bftAccuracy: number;
  /** Percentage, 0–100. */
  veritasCatchRate: number;
  /** Percentage, 0–100. */
  x402SuccessRate: number;
  latencyMs: number;
  humanCustody: boolean;
}

export interface NormalizedMetrics {
  bft: number;
  veritas: number;
  x402: number;
  latency: number;
  custody: number;
}

/**
 * Clamp into [0, 1].
 *
 * CLAMPED AT BOTH ENDS. The original clamped latency at 0 only, so a percentage
 * recorded above 100 — or a negative latency — pushed a component past 1 and
 * the weighted sum past its supposed maximum. Non-finite maps to 0, the
 * least-credit answer, because a metric nobody could compute must not pay.
 */
function unitClamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Latency's opportunity score: full credit at 0 ms, none at or beyond 2000 ms. */
export const LATENCY_ZERO_CREDIT_MS = 2000;

export function normalizeMetrics(raw: RawMetrics): NormalizedMetrics {
  return {
    bft: unitClamp(raw.bftAccuracy / 100),
    veritas: unitClamp(raw.veritasCatchRate / 100),
    x402: unitClamp(raw.x402SuccessRate / 100),
    latency: unitClamp(1 - raw.latencyMs / LATENCY_ZERO_CREDIT_MS),
    custody: raw.humanCustody ? 1 : 0,
  };
}

export interface ScoreBreakdown {
  bftContribution: number;
  veritasContribution: number;
  x402Contribution: number;
  latencyContribution: number;
  custodyContribution: number;
}

export function contributionsOf(n: NormalizedMetrics, w: RepIDWeights): ScoreBreakdown {
  return {
    bftContribution: n.bft * w.bftAccuracy,
    veritasContribution: n.veritas * w.veritasCatchRate,
    x402Contribution: n.x402 * w.x402SuccessRate,
    latencyContribution: n.latency * w.latencyOpportunity,
    custodyContribution: n.custody * w.humanCustodyScore,
  };
}

export function sumContributions(b: ScoreBreakdown): number {
  return (
    b.bftContribution +
    b.veritasContribution +
    b.x402Contribution +
    b.latencyContribution +
    b.custodyContribution
  );
}

// ---------------------------------------------------------------------------
// The curve, and its ceiling
// ---------------------------------------------------------------------------

/** Multiplier on the log curve. Named so `reachableCeiling` cannot drift from it. */
/**
 * The log curve's two constants. **THESE MOVE TOGETHER — see below.**
 *
 * ── HISTORY, BECAUSE BOTH FAILURE MODES HAPPENED HERE ───────────────────────
 *
 * 2000/100  the gate never OPENED. Maximum attainable score 4008 against a
 *           payment threshold of 5000, so Gold, Platinum and the payment path
 *           were unreachable for everyone, permanently.
 * 5000/100  the gate never CLOSED. Simulated through this module, a WEAK fleet
 *           (45% BFT accuracy, 30% catch rate) came out 99% Platinum, holding
 *           the 500,000 USDC daily limit. Every operating population landed in
 *           the top tier; the ladder sorted nobody.
 * 57200/0.5 present. Chosen by measurement, not taste — see
 *           `scripts/sim/repid-calibration.mjs`, which searches the
 *           (scale, multiplier) grid for the pair that best separates simulated
 *           populations while keeping the floors at their plain values.
 *
 * ── WHY THE INPUT SCALE IS THE REAL KNOB ────────────────────────────────────
 *
 * `log10` compresses hard. With a scale of 100, `1 + ws*100` spans 1..101 and a
 * real fleet's whole operating range — weighted sums roughly 0.35 to 0.85 —
 * lands in the top ~1,700 points of a 10,000-point scale. No choice of
 * multiplier fixes that, because the multiplier scales the compressed range
 * without decompressing it. Dropping the scale to 0.5 makes the argument span
 * 1..1.5, where log10 is far closer to linear, and the multiplier then restores
 * the range. That is why both constants changed at once.
 *
 * ── WHAT THIS DOES TO THE DISTRIBUTION, computed rather than assumed ────────
 *
 * Over the honest weighted-sum range [0, 1]:
 *
 *              was (5000/100)      now (57200/0.5)
 *   Bronze          2.2%                21.2%
 *   Silver          6.8%                23.4%
 *   Gold           21.6%                25.9%
 *   Platinum       69.4%                29.5%
 *
 * READ THAT AS A PROPERTY OF THE CURVE, NOT OF ANY FLEET. A uniform sweep over
 * weightedSum answers "how much of the INPUT RANGE maps to each tier"; no set
 * of real agents is uniform over [0,1]. For population figures — the ones that
 * actually matter — run `npm run check:repid-calibration`.
 *
 * Platinum now begins at weightedSum 0.7049, up from 0.306. The floors keep
 * their plain meaning: 2500 needs 0.2118, 5000 needs 0.4459.
 *
 * THE CAP STILL BINDS, narrowly: a flawless agent computes 10072.4 and reports
 * 10000, so scores flatten above weightedSum 0.9913 — 0.9% of the range, down
 * from 1%+ before. Asserted, so it is a known property rather than a surprise
 * the first time two excellent agents tie.
 *
 * ── IF YOU CHANGE EITHER CONSTANT ───────────────────────────────────────────
 *
 * Run `npm run check:repid-calibration`. It fails the ladder that cannot sort,
 * which is the check that did not exist when the 2000 -> 5000 change was made
 * and would have caught its consequence immediately. `describeCoherence` only
 * proves a gate is REACHABLE; that suite proves it is ESCAPABLE.
 */
export const SCORE_LOG_MULTIPLIER = 57200;
export const SCORE_LOG_INPUT_SCALE = 0.5;

export function scoreFromWeightedSum(weightedSum: number): number {
  if (typeof weightedSum !== 'number' || !Number.isFinite(weightedSum)) return REPID_MIN;
  const raw = SCORE_LOG_MULTIPLIER * Math.log10(1 + Math.max(0, weightedSum) * SCORE_LOG_INPUT_SCALE);
  return Math.min(REPID_MAX, Math.max(REPID_MIN, Math.floor(raw)));
}

/**
 * The highest score any agent can actually reach.
 *
 * DERIVED, not asserted. With normalized components in [0,1] and weights
 * summing to 1, the weighted sum's maximum is exactly 1 — so the ceiling is the
 * curve evaluated there. Computing it from the same constants the curve uses is
 * what stops this number going stale the moment somebody re-tunes the
 * multiplier and forgets the docstring.
 */
export function reachableCeiling(): number {
  return scoreFromWeightedSum(1);
}

/**
 * The weighted sum required to REACH a score — and it must actually reach it.
 *
 * The closed-form inverse `(10^(s/M) - 1) / S` is correct as real arithmetic and
 * WRONG as floating point. `scoreFromWeightedSum` takes a FLOOR, so a result one
 * unit-in-the-last-place low scores one point short, and the function's own name
 * becomes false: `weightedSumRequiredFor(2500)` returned a weighted sum scoring
 * **2499** — Bronze, not Silver.
 *
 * NOT INTRODUCED BY THE 57200/0.5 RECALIBRATION, only made easier to see:
 * measured over the closed form, 933 of the first 4,000 scores landed short
 * under the OLD constants and 4,024 of the first 9,000 under the new ones. A
 * larger multiplier amplifies the same last-bit error rather than causing it.
 *
 * So the definition is tightened from "the real-valued inverse" to **the
 * smallest weighted sum that this module actually scores at or above `score`**,
 * which is the property every caller already assumed. It is reached by nudging
 * exact by construction — bounded, and asserted to round
 * trip for every score in the domain.
 *
 * It matters because this is the number quoted to an operator asking what an
 * agent needs to clear a gate, and `describeCoherence` puts it in the report
 * that explains why a gate is unreachable.
 */
export function weightedSumRequiredFor(score: number): number {
  if (typeof score !== 'number' || !Number.isFinite(score)) return NaN;
  if (score <= REPID_MIN) return 0;

  // Above the reachable ceiling there is NO answer in [0,1]. Return the
  // mathematical inverse so a caller can see HOW FAR out of range the gate is —
  // `describeCoherence` prints exactly this to explain an unreachable gate, and
  // "3.15" is the number that made the original finding legible. `expm1` rather
  // than `10**x - 1` because the latter subtracts two nearly-equal numbers and
  // loses about five significant digits near zero.
  if (scoreFromWeightedSum(1) < score) {
    return Math.expm1((score / SCORE_LOG_MULTIPLIER) * Math.LN10) / SCORE_LOG_INPUT_SCALE;
  }

  // Otherwise BISECT for the smallest weighted sum this module actually scores
  // at or above `score`. Exact by construction, and immune to the precision of
  // any closed form — which is the point: the closed-form inverse and the
  // forward curve disagree at the last bit in BOTH directions, so no amount of
  // algebra makes them round-trip. Searching the forward function does.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    if (scoreFromWeightedSum(mid) >= score) hi = mid;
    else lo = mid;
  }
  return hi;
}


/**
 * The payment threshold used when an institution has not stored one.
 *
 * Named because it was written as a bare `5000` in three places, and two of
 * them reached it by different routes — see `resolvePaymentThreshold`.
 */
export const DEFAULT_PAYMENT_THRESHOLD = 5000;

export interface ThresholdResolution {
  /** VERIFIED: usable. NOT_CHECKED: could not be read. FAILED: read, unusable. */
  outcome: LimitOutcome;
  /** `null` whenever the outcome is not VERIFIED. Never a guessed number. */
  threshold: number | null;
  source: 'stored' | 'default' | 'unreadable' | 'malformed';
  detail: string;
}

/**
 * The payment threshold, resolved ONCE so two readers cannot disagree.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * `RepIDConfig` read `min_repid_payment` in two places with two different
 * operators:
 *
 *   coherence():  describeCoherence(data?.min_repid_payment ?? 5000)   // ??
 *   calculate():  const threshold = config?.min_repid_payment || 5000  // ||
 *
 * They agree on every value except the two that matter. A stored **0** — an
 * operator saying "no RepID minimum, pay everyone" — was reported on as 0 by
 * the coherence check and silently enforced as 5000 by the gate. So the report
 * written specifically to catch a gate that never opens was **checking a number
 * the gate does not use**, and answering VERIFIED about it. Demonstrated
 * against both expressions before this was written, not inferred.
 *
 * That is the original finding of this branch — a gate whose stated rule and
 * enforced rule differ — reappearing inside the checker built to catch it. It
 * is also the same one-rule-two-implementations defect as the two tier ladders
 * and the loop kernel's DID comparison. Three times now, so the fix is the same
 * one: delete the second implementation.
 *
 * ── ABSENT, ZERO, UNREADABLE AND MALFORMED ARE FOUR DIFFERENT THINGS ───────
 *
 * `||` collapses the first two; discarding the query error collapses the third
 * into whichever of the first two the caller wrote. An unreadable config is the
 * dangerous one: both sites did `const { data } = await …` with no `error`, so
 * a database outage substituted 5000 — and for an institution that had stored
 * **8000**, that LOWERS the bar. A fail-open on the payment gate, reached by an
 * outage rather than by any input.
 *
 * `readable` is a required argument with no default. The caller must state
 * whether the read succeeded, because a signature that let them omit it is
 * exactly how the error came to be discarded in the first place.
 *
 * ── WHAT IS LIVE AND WHAT IS LATENT ────────────────────────────────────────
 *
 * Measured against `institution_risk_config` on 2026-08-16 — 3 rows, and the
 * column is `integer NULL DEFAULT 5000` with **no CHECK constraint** and a
 * UNIQUE `institution_id` (so `.single()` cannot see the multi-row form of
 * PGRST116, and mapping that code to "absent" is sound):
 *
 *   amina-conservative   7500
 *   default              5000
 *   portfolio-balanced   4000
 *
 * Stated separately because they are not equally severe, and saying so is the
 * difference between a finding and an alarm:
 *
 * - **The unreadable-config path is LIVE.** `amina-conservative` stores 7500;
 *   substituting the default drops its bar to 5000. A real institution's gate
 *   loosens by 2500 points during a database outage. This one was reachable
 *   today, without anyone changing a row.
 * - **The stored-zero divergence is LATENT.** No row stores 0. Nothing
 *   prevents one — there is no CHECK — so it is one `update` away, and the
 *   coherence report would then describe a threshold the gate does not use.
 *   It was not firing.
 * - **A NEGATIVE threshold is storable and was a fail-open.** No CHECK bounds
 *   the column, and `-1` is truthy, so BOTH old expressions passed it through
 *   intact; `repidScore >= -1` is then true for every agent and the payment
 *   gate always opens. Refused as malformed here.
 * - **A non-finite threshold cannot come from this column** — it is `integer`.
 *   The guard in `describeCoherence` is defensive, for callers that reach it
 *   directly, and is NOT evidence of a reachable production path.
 */
export function resolvePaymentThreshold(stored: unknown, readable: boolean): ThresholdResolution {
  if (!readable) {
    return {
      outcome: 'NOT_CHECKED',
      threshold: null,
      source: 'unreadable',
      detail:
        'the institution configuration could not be read, so the payment threshold is ' +
        'UNKNOWN. Substituting the default would silently re-rate every agent against a ' +
        'number nobody configured — and for an institution that stored a stricter ' +
        'threshold it would LOWER the bar during an outage.',
    };
  }
  if (stored === undefined || stored === null) {
    return {
      outcome: 'VERIFIED',
      threshold: DEFAULT_PAYMENT_THRESHOLD,
      source: 'default',
      detail: `no threshold is stored; using the default of ${DEFAULT_PAYMENT_THRESHOLD}`,
    };
  }
  if (typeof stored !== 'number' || !Number.isFinite(stored) || stored < 0) {
    return {
      outcome: 'FAILED',
      threshold: null,
      source: 'malformed',
      detail:
        `the stored payment threshold ${JSON.stringify(stored)} is not a usable number. ` +
        'Refusing to substitute a default: a threshold nobody can evaluate must not ' +
        'quietly become one that can be.',
    };
  }
  // ZERO IS A REAL VALUE and reaches here intact. It means "no RepID minimum",
  // which is a policy an operator may legitimately set. `|| 5000` turned it
  // into the strictest-but-one gate in the ladder without saying so.
  return {
    outcome: 'VERIFIED',
    threshold: stored,
    source: 'stored',
    detail:
      stored === 0
        ? 'the stored threshold is 0 — no RepID minimum. This is a configured policy, not an absent value.'
        : `using the stored threshold of ${stored}`,
  };
}

export interface CoherenceReport {
  /**
   * VERIFIED when every gate below is reachable; FAILED when one is not;
   * NOT_CHECKED when the threshold itself was not a number this could compare.
   *
   * THREE OUTCOMES, added after the two-outcome version answered VERIFIED for a
   * non-finite threshold: the unreachability test is `floor > ceiling`, and
   * `NaN > 10000` is `false`, so a garbage threshold was never reported
   * unreachable and fell through to "every gate is reachable". A coherence
   * check that cannot tell "I compared them and they are fine" from "I could
   * not compare them" is the exact defect it exists to detect.
   */
  outcome: LimitOutcome;
  ceiling: number;
  /**
   * Every gate that was compared against the ceiling, reachable or not.
   *
   * A report that lists only the FAILURES cannot distinguish "the tier floors
   * were checked and are fine" from "the tier floors were never in the list".
   * Once the multiplier was raised, every floor sat below the ceiling and their
   * inclusion became unobservable from the outcome alone — mutation testing
   * caught exactly that. Saying what was examined is the same discipline as the
   * three-outcome rule, applied to a report instead of a verdict.
   */
  gatesConsidered: readonly { name: string; floor: number }[];
  /** Gates the score is compared against: tier floors plus the payment threshold. */
  unreachable: readonly { name: string; floor: number; needsWeightedSum: number }[];
  detail: string;
}

/**
 * Is this configuration internally coherent — can the score reach the gates it
 * is compared against?
 *
 * THE CHECK THAT WOULD HAVE CAUGHT THIS ON DAY ONE, and it is one arithmetic
 * call. A scoring function whose maximum sits below the threshold it feeds is
 * not a strict policy, it is a gate that never opens, and nothing in a passing
 * test suite or a green build says so — the code is correct, the numbers are
 * plausible, and the payment path is simply dead.
 *
 * Reported rather than thrown. Which way to fix an incoherent configuration —
 * raise the curve or lower the gates — changes what every agent scores, and
 * that is the operator's call, not this function's.
 */
export function describeCoherence(paymentThreshold: number): CoherenceReport {
  const ceiling = reachableCeiling();

  // The threshold is compared with `>`, and EVERY comparison against NaN is
  // false — so without this, a non-finite threshold is silently never
  // unreachable and the report reads VERIFIED. "I could not compare these" is
  // not "these are fine".
  if (typeof paymentThreshold !== 'number' || !Number.isFinite(paymentThreshold)) {
    return {
      outcome: 'NOT_CHECKED',
      ceiling,
      gatesConsidered: [],
      unreachable: [],
      detail:
        `the payment threshold ${JSON.stringify(paymentThreshold)} is not a finite number, so it ` +
        `could not be compared against the reachable ceiling of ${ceiling}. Nothing here was ` +
        'checked — reporting VERIFIED would assert a comparison that never happened.',
    };
  }

  const gates = [
    ...TIER_FLOORS.filter((t) => t.floor > 0).map((t) => ({ name: `tier ${t.tier}`, floor: t.floor })),
    { name: 'payment threshold', floor: paymentThreshold },
  ];
  const unreachable = gates
    .filter((g) => g.floor > ceiling)
    .map((g) => ({ ...g, needsWeightedSum: weightedSumRequiredFor(g.floor) }));

  if (unreachable.length === 0) {
    return {
      outcome: 'VERIFIED',
      ceiling,
      gatesConsidered: gates,
      unreachable: [],
      detail: `every gate is reachable: the highest attainable score is ${ceiling}`,
    };
  }
  return {
    outcome: 'FAILED',
    ceiling,
    gatesConsidered: gates,
    unreachable,
    detail:
      `the highest attainable score is ${ceiling}, but ${unreachable.length} gate(s) sit above it: ` +
      unreachable
        .map((g) => `${g.name} at ${g.floor} would need a weighted sum of ${g.needsWeightedSum.toFixed(2)}`)
        .join('; ') +
      '. The weighted sum cannot exceed 1.0, so these can never be met.',
  };
}

// ---------------------------------------------------------------------------
// Spend limits
// ---------------------------------------------------------------------------

export type LimitOutcome = 'VERIFIED' | 'NOT_CHECKED' | 'FAILED';

export interface LimitCheck {
  outcome: LimitOutcome;
  /**
   * `null` when the limit could not be evaluated.
   *
   * Three states, because the two-state version is what produced the
   * fail-open: a boolean forces an unknown to be reported as one of the two
   * answers, and the convenient one is `true`.
   */
  withinLimit: boolean | null;
  detail: string;
}

/**
 * Does this transaction fit under the per-transaction limit?
 *
 * Inclusive: an amount exactly equal to the limit is within it. A limit is the
 * most you may spend, not the least you may not.
 */
export function checkPerTxLimit(amountUSDC: number, limit: number): LimitCheck {
  if (!Number.isFinite(amountUSDC) || amountUSDC < 0) {
    return { outcome: 'NOT_CHECKED', withinLimit: null, detail: `amount ${amountUSDC} is not a usable number` };
  }
  if (!Number.isFinite(limit) || limit < 0) {
    return { outcome: 'NOT_CHECKED', withinLimit: null, detail: `per-tx limit ${limit} is not a usable number` };
  }
  if (amountUSDC > limit) {
    return {
      outcome: 'FAILED',
      withinLimit: false,
      // WORDING IS PART OF THE CONTRACT. This string lands in a compliance
      // receipt's `denialReason` and `scripts/e2e/run-e2e.mjs` matches
      // /exceeds per-tx limit/i against it over HTTP. An earlier draft said
      // "the per-transaction limit of", which reads better and broke the
      // assertion — a denial reason that is evidence is an observable surface,
      // not prose to tidy.
      detail: `Amount ${amountUSDC} USDC exceeds per-tx limit ${limit}`,
    };
  }
  return { outcome: 'VERIFIED', withinLimit: true, detail: `amount ${amountUSDC} is within the per-tx limit of ${limit}` };
}

/**
 * Does this transaction fit under the daily limit, given spend so far?
 *
 * **`spentSoFar` IS NULLABLE AND NULL MEANS UNKNOWN.** This is the whole fix
 * for the fail-open: the caller could not read the spend history, and an
 * unreadable history is not an empty one. Returning NOT_CHECKED forces the
 * caller to decide what to do about a limit it could not evaluate, where the
 * previous shape — a bare number that quietly became 0 — decided for it, in
 * the permissive direction, silently.
 */
export function checkDailyLimit(
  amountUSDC: number,
  spentSoFar: number | null,
  limit: number
): LimitCheck {
  if (spentSoFar === null) {
    return {
      outcome: 'NOT_CHECKED',
      withinLimit: null,
      detail:
        'the daily spend history could not be read, so the daily limit was not evaluated. ' +
        'An unreadable history is not an empty one — treating it as zero spend would grant ' +
        'the full daily allowance during a database outage.',
    };
  }
  if (!Number.isFinite(spentSoFar) || spentSoFar < 0) {
    return { outcome: 'NOT_CHECKED', withinLimit: null, detail: `spend so far (${spentSoFar}) is not a usable number` };
  }
  if (!Number.isFinite(amountUSDC) || amountUSDC < 0) {
    return { outcome: 'NOT_CHECKED', withinLimit: null, detail: `amount ${amountUSDC} is not a usable number` };
  }
  if (!Number.isFinite(limit) || limit < 0) {
    return { outcome: 'NOT_CHECKED', withinLimit: null, detail: `daily limit ${limit} is not a usable number` };
  }
  const total = spentSoFar + amountUSDC;
  if (total > limit) {
    return {
      outcome: 'FAILED',
      withinLimit: false,
      detail: `Daily limit would be exceeded: ${spentSoFar} already spent + ${amountUSDC} = ${total} > ${limit}`,
    };
  }
  return {
    outcome: 'VERIFIED',
    withinLimit: true,
    detail: `${spentSoFar} spent + ${amountUSDC} = ${total}, within the daily limit of ${limit}`,
  };
}

/**
 * Is this a real ZKP proof reference?
 *
 * Exists because the absence of a proof was being papered over with a
 * manufactured string — `ZKP_STUB_<agent>_VERIFIED` — which is non-empty,
 * truthy, and contains the word VERIFIED. Every consumer testing for presence
 * saw a proof. A placeholder that reads as its own success is worse than no
 * placeholder.
 */
export function isPlaceholderProofCid(cid: unknown): boolean {
  if (typeof cid !== 'string' || cid.trim() === '') return true;
  return /^ZKP_STUB_/.test(cid.trim());
}

// ---------------------------------------------------------------------------
// REGISTRY DRIFT — the stored tier and the derived tier are two ladders again
//
// `check:repid-calibration` proves the LADDER sorts agents. It says nothing
// about the ROWS, and the rows were written by a different ladder.
//
// `agent_kya_registry` stores `repid_score`, `repid_tier` AND
// `spending_limit_daily`. Two of those three are derivable from the first, so
// they can disagree — and `KYAValidator` reads them from opposite sides:
//
//   validate()      enforces the STORED `spending_limit_daily`
//   updateRepID()   writes `TIER_LIMITS[tierForScore(newScore)]`
//
// So an agent's authorized limit depends on WHICH WRITER LAST TOUCHED ITS ROW,
// not on anything the agent did. That is the one-rule-two-implementations defect
// this module has already fixed three times — the two tier ladders, the DID
// comparison, the payment threshold — arriving a fourth time, now split across
// the code/database boundary where neither a type nor a test could see it.
//
// ── MEASURED LIVE, 2026-08-17 — 9 of 12 rows disagree ───────────────────────
//
// Against `agent_kya_registry` (12 rows). Every disagreement is PERMISSIVE: the
// ladder grants more than the row stores, so the next write RAISES the limit.
//
//   TORCH    7600  stored Silver /  10,000  ladder Platinum / 500,000   x50
//   ORCH     8100  stored Gold   / 100,000  ladder Platinum / 500,000   x5
//   NEXUS    7900  stored Gold   / 100,000  ladder Platinum / 500,000   x5
//   W3C      7700  stored Gold   / 100,000  ladder Platinum / 500,000   x5
//   GCM/HDM/CHESED/MEL/APM  6900-7400  stored Silver / 10,000  ladder Gold / 100,000  x10
//   VERITAS / SHOFET / SOPHIA   agree (Platinum)
//
// The trigger is routine: `app/api/trustrails/pay/route.ts` calls
// `updateRepID(agentName, +10, 'Successful compliant payment')`. ONE compliant
// payment re-rates the agent. TORCH's daily limit goes 10,000 -> 500,000 for
// having made a payment, with no change in any measured metric.
//
// ── THE SHARPER FORM: A PENALTY RAISES THE LIMIT ───────────────────────────
//
// `updateRepID` takes a signed delta, so the same path runs for penalties. Since
// the stored limit is BELOW what the ladder grants, an agent can be penalised
// and still come out with more spending power. `penaltyHeadroom` is how far a
// score may FALL while the ladder still grants at least today's stored limit:
//
//   TORCH 5,100 · GCM 4,900 · HDM 4,800 · CHESED 4,700 · MEL 4,600 · APM 4,400
//   ORCH 3,100 · NEXUS 2,900 · W3C 2,700 · VERITAS 1,700 · SHOFET 1,300 · SOPHIA 1,150
//
// TORCH can lose 5,100 points — more than two full tiers — and its authorized
// daily limit does not fall below 10,000. Anything short of that is a penalty
// that INCREASES it.
//
// ── WHY THIS DETECTS AND DOES NOT FIX ──────────────────────────────────────
//
// The two repairs are opposites and both are an operator's call, exactly as the
// curve recalibration was:
//
//   * TRUST THE LADDER — derive the limit on read. Consistent immediately, and
//     it grants TORCH 500,000 USDC the moment it ships.
//   * TRUST THE ROW — stop deriving in `updateRepID`. Fail-closed, and it
//     freezes every limit at whatever the old ladder wrote, including for agents
//     whose scores have since moved.
//
// Picking either from here would move real spending limits on a fabricated
// mandate. So this reports, in the three outcomes, and the decision is recorded
// in the index. What is NOT an operator's call is whether anyone can SEE the
// disagreement, which is what this function is for.

export interface RegistryDrift {
  /** VERIFIED: row and ladder agree. FAILED: they disagree. NOT_CHECKED: unusable input. */
  outcome: LimitOutcome;
  storedTier: unknown;
  ladderTier: RepIDTier;
  storedDaily: number | null;
  ladderDaily: number;
  /**
   * What the next `updateRepID` multiplies the daily limit by, `null` when it
   * cannot be computed. Above 1 means a write RAISES the limit.
   */
  limitMultiplierOnNextWrite: number | null;
  /**
   * How far the score may FALL while the ladder still grants at least the
   * stored limit. `null` when the stored limit exceeds every tier, so no score
   * sustains it. This is the number that makes a penalty legible as a reward.
   */
  penaltyHeadroom: number | null;
  detail: string;
}

/**
 * Does a stored registry row agree with the ladder that would rewrite it?
 *
 * Pure, and takes the three stored fields rather than a Supabase row, so it is
 * testable without a database — the reason the drift went unseen is that every
 * existing suite tests the ladder in isolation, where a row cannot contradict
 * it.
 */
export function describeRegistryDrift(
  storedScore: unknown,
  storedTier: unknown,
  storedDaily: unknown
): RegistryDrift {
  const ladderTier = tierForScore(storedScore as number);
  const ladderDaily = TIER_LIMITS[ladderTier].daily;

  // A non-finite score reaches `tierForScore` and comes back Bronze by design —
  // safe for a gate, WRONG as evidence of agreement. Reporting VERIFIED here
  // would claim a comparison against a score nobody could read.
  if (typeof storedScore !== 'number' || !Number.isFinite(storedScore)) {
    return {
      outcome: 'NOT_CHECKED', storedTier, ladderTier, storedDaily: null, ladderDaily,
      limitMultiplierOnNextWrite: null, penaltyHeadroom: null,
      detail: `the stored score ${JSON.stringify(storedScore)} is not a finite number, so the row could not be compared against the ladder`,
    };
  }
  if (typeof storedDaily !== 'number' || !Number.isFinite(storedDaily) || storedDaily < 0) {
    return {
      outcome: 'NOT_CHECKED', storedTier, ladderTier, storedDaily: null, ladderDaily,
      limitMultiplierOnNextWrite: null, penaltyHeadroom: null,
      detail: `the stored daily limit ${JSON.stringify(storedDaily)} is not a usable number, so the row could not be compared against the ladder`,
    };
  }

  // The lowest floor whose tier still grants at least the stored limit. Ascending
  // because we want the LOWEST such floor — the furthest a score can fall.
  const ascending = [...TIER_FLOORS].sort((a, b) => a.floor - b.floor);
  const sustaining = ascending.find((t) => TIER_LIMITS[t.tier].daily >= storedDaily);
  const penaltyHeadroom = sustaining === undefined ? null : storedScore - sustaining.floor;
  const limitMultiplierOnNextWrite = storedDaily === 0 ? null : ladderDaily / storedDaily;

  const tierAgrees = storedTier === ladderTier;
  const limitAgrees = storedDaily === ladderDaily;
  if (tierAgrees && limitAgrees) {
    return {
      outcome: 'VERIFIED', storedTier, ladderTier, storedDaily, ladderDaily,
      limitMultiplierOnNextWrite, penaltyHeadroom,
      detail: `the stored row agrees with the ladder: ${ladderTier}, ${ladderDaily} USDC daily`,
    };
  }
  const parts: string[] = [];
  if (!tierAgrees) parts.push(`tier stored as ${JSON.stringify(storedTier)} but the ladder says ${ladderTier}`);
  if (!limitAgrees) {
    parts.push(
      `daily limit stored as ${storedDaily} but the ladder grants ${ladderDaily}` +
      (limitMultiplierOnNextWrite === null ? '' : ` (x${limitMultiplierOnNextWrite} on the next write)`)
    );
  }
  return {
    outcome: 'FAILED', storedTier, ladderTier, storedDaily, ladderDaily,
    limitMultiplierOnNextWrite, penaltyHeadroom,
    detail:
      `score ${storedScore}: ` + parts.join('; ') +
      '. `validate()` enforces the stored limit and `updateRepID` writes the derived one, so ' +
      'this agent is re-rated by its next reputation update rather than by anything it did' +
      (penaltyHeadroom === null ? '' : `; the score may fall ${penaltyHeadroom} points before the limit does`),
  };
}

// ---------------------------------------------------------------------------
// MARGINAL VALUE — what does real improvement actually buy?
//
// Sprint D4 recorded the inversion as a property of the CURVE: "+0.01 of real
// improvement was worth 880 points at the bottom and 0 at the top", and
// predicted the 57200/0.5 recalibration would reduce it. Measured here, the
// prediction holds — but the DIAGNOSIS does not, and the difference changes
// what a fix would have to touch.
//
// Below saturation the curve's own spread is 124 -> 83, a factor of **1.49**.
// That is a logarithm behaving like a logarithm, and it is not the finding.
//
// The collapse to zero is the CLAMP. `scoreFromWeightedSum` floors at
// `REPID_MAX`, and 57200/0.5 evaluates to **10072.42** at weightedSum 1 — so
// the calibration overshoots the maximum by 72 points and every agent above
// weightedSum ~= 0.9915 scores exactly 10000. Inside that band, measurable
// improvement is worth exactly nothing.
//
// So "the curve pays least at the top" is the wrong target. Reshaping the log
// would move 1.49; only the overshoot moves the zero.
// ---------------------------------------------------------------------------

/** Points bought by adding `delta` at `weightedSum`. Drives the real curve. */
export function marginalValueAt(weightedSum: number, delta = 0.01): number {
  const from = scoreFromWeightedSum(weightedSum);
  const to = scoreFromWeightedSum(Math.min(1, weightedSum + delta));
  return to - from;
}

export interface Saturation {
  /** Smallest weighted sum this module already scores at `REPID_MAX`. */
  atWeightedSum: number;
  /** Width of the dead band, in weighted-sum units. */
  bandWidth: number;
  /** What the curve WOULD score at weightedSum 1 with no clamp. */
  uncappedAtOne: number;
  /** By how much the calibration overshoots `REPID_MAX`. The cause. */
  overshoot: number;
}

/**
 * Where does improvement stop paying, and why?
 *
 * Found by scanning the real function rather than inverting it: the inverse is
 * the thing that was already wrong once here (`weightedSumRequiredFor` returned
 * a sum scoring one point short), so this asks the module directly.
 */
export function saturationPoint(step = 0.0001): Saturation {
  let at = 1;
  for (let ws = 0; ws <= 1 + 1e-12; ws += step) {
    if (scoreFromWeightedSum(ws) >= REPID_MAX) {
      at = Math.min(1, ws);
      break;
    }
  }
  const uncappedAtOne =
    SCORE_LOG_MULTIPLIER * Math.log10(1 + 1 * SCORE_LOG_INPUT_SCALE);
  return {
    atWeightedSum: at,
    bandWidth: Math.max(0, 1 - at),
    uncappedAtOne,
    overshoot: uncappedAtOne - REPID_MAX,
  };
}
