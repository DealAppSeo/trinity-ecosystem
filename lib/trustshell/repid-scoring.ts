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
//    The multiplier is now 5000 (Sean's call; see `SCORE_LOG_MULTIPLIER` for
//    what it did to the tier distribution). `reachableCeiling()` and
//    `describeCoherence()` are what keep it fixed: any future re-tune that puts
//    a gate back above the ceiling fails the suite instead of silently closing
//    the payment path again.
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
 * Multiplier on the log curve. **Raised 2000 -> 5000 on 2026-08-16**, by
 * Sean's decision, to make the score reach the gates it feeds.
 *
 * At 2000 the maximum attainable score was 4008 against a payment threshold of
 * 5000, so Gold, Platinum and the payment path were unreachable for everyone.
 * At 5000 a flawless agent computes 10021.6 and reports 10000 — THE CAP NOW
 * BINDS, which it did not before, so every agent above weightedSum 0.99 reads
 * exactly 10000.
 *
 * WHAT THIS DID TO THE DISTRIBUTION, computed rather than assumed. Over the
 * honest weighted-sum range [0, 1]:
 *
 *   Bronze     2.2%      Gold      21.6%
 *   Silver     6.8%      Platinum  69.4%
 *
 * Platinum now begins at a weighted sum of 0.306 — an agent performing at ~31%
 * of the maximum holds the 500,000 USDC daily limit. That is a property of the
 * log curve's steepness, not of the multiplier: `log10` compresses the top of
 * the range hard, so raising the multiplier to reach the gates necessarily
 * widens the top tier.
 *
 * If that distribution is wrong, THE TIER FLOORS ARE THE KNOB, not this
 * constant — moving them redistributes without re-breaking reachability, and
 * `describeCoherence` will refuse any set that puts a floor back above the
 * ceiling. Recorded here so the next person changing either one can see what
 * the other costs.
 */
export const SCORE_LOG_MULTIPLIER = 5000;
export const SCORE_LOG_INPUT_SCALE = 100;

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

/** What the weighted sum would have to be for a score — the inverse of the curve. */
export function weightedSumRequiredFor(score: number): number {
  return (10 ** (score / SCORE_LOG_MULTIPLIER) - 1) / SCORE_LOG_INPUT_SCALE;
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
