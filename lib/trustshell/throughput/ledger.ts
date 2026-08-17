// lib/trustshell/throughput/ledger.ts
//
// The throughput ledger — does a producer still produce, and if not, did
// somebody DECIDE that?
//
// ZERO IMPORTS, deliberately, so `check:throughput` can compile and assert this
// file standalone. Every decision below is a judgement about when to wake a
// human, and each one is worth asserting directly rather than describing.
//
// =============================================================================
// THE FOUR WEEKS THIS EXISTS TO HAVE PREVENTED
// =============================================================================
//
// On 2026-07-17 at 22:18 UTC, twelve agent loops stopped inside a 48-second
// window. Nothing said anything for 29 days. Measured on 2026-08-15:
//
//   trinity_tasks (peer_verify)   35,612/week  ->  11
//   hal_classifications            2,650/day   ->  1-3
//   repid_score_events            35,353/14d   ->  116
//   agent_heartbeat               12 agents pinging -> last_ping frozen at 22:18
//
// Three instruments watched this the whole time and all three stayed green,
// because all three answer a question nobody was asking:
//
//   Railway        "is the process up?"          yes — it is, right now
//   UptimeRobot    "does /health return 200?"    yes — 100%, 0 incidents, 29 days
//   agent_heartbeat.status   the literal string 'online', which NOTHING updates.
//                            The `last_ping` column beside it read 698 hours.
//                            One row, two fields, flatly contradicting; every
//                            dashboard read the wrong one.
//
// LIVENESS IS NOT THROUGHPUT. A process can answer every health check forever
// while producing nothing. This module measures the only thing that matters —
// did rows appear — and it refuses to be satisfied by a heartbeat.
//
// =============================================================================
// THE CANARY, AND WHY IT IS THE SUBTLEST FAILURE HERE
// =============================================================================
//
// The fleet was not silent for 29 days. Every day at 09:15 UTC exactly one agent
// made exactly one LLM call and hal-pipeline evaluated it — the SAME prompt every
// single day:
//
//   prompt_sha256 b3730537deaff655ec19b68ed8ba61f0ff99e7aa8142461ec717ed8a0876af99
//   observed on 08-11, 08-12, 08-14, 08-15 ... identical
//
// So "has this producer written anything lately?" answered YES for four weeks.
// A synthetic probe kept every liveness check satisfied while real output was
// zero. That is why `syntheticFilter` is not optional decoration: a ledger that
// counts its own canary as production is a ledger that will hide the next
// outage exactly as this one was hidden.
//
// =============================================================================
// WHY A DECLARED STATE IS REQUIRED, NOT INFERRED
// =============================================================================
//
// Silence has at least four causes and they are indistinguishable from the data:
//
//   - somebody switched it off to save money        (fine, but say so)
//   - the code exists and is never called           (`quorum-receipt-writer.ts`
//                                                    is imported by NOTHING;
//                                                    `hal_quorum_receipts` has
//                                                    been an empty table since
//                                                    2026-07-13)
//   - it is failing and swallowing the error        (`pipeline.ts` discards its
//                                                    insert result entirely)
//   - it broke and nobody noticed                   (the four weeks above)
//
// No amount of cleverness separates these from a row count. A human has to have
// written down the intent BEFORE the silence, or the ledger is just a second
// dashboard to ignore. So the declared state is an input, and the absence of a
// declaration is itself a finding.

/** What a human says this producer is SUPPOSED to be doing. */
export type DeclaredState =
  /** Expected to produce. Silence is an alarm. */
  | 'running'
  /** Deliberately off to save spend. Silence is expected — until `reviewBy`. */
  | 'paused_cost'
  /** Code exists, nothing calls it. Silence is expected; this is a debt. */
  | 'not_wired'
  /** Dead on purpose. Silence is correct forever. */
  | 'decommissioned';

export const DECLARED_STATES: readonly DeclaredState[] = [
  'running',
  'paused_cost',
  'not_wired',
  'decommissioned',
];

export type Verdict =
  /** Declared running, producing at or near baseline. */
  | 'OK'
  /** Declared running, produced NOTHING in the window. Loud. */
  | 'UNEXPLAINED_SILENCE'
  /** Declared running, well below its own baseline. Loud, and earlier. */
  | 'UNEXPLAINED_DEGRADATION'
  /** Declared off; silent, as declared. Quiet, still tracked. */
  | 'EXPECTED_SILENCE'
  /** Declared off but PRODUCING. Loud — something you think is off is spending. */
  | 'UNDECLARED_ACTIVITY'
  /** A cost pause that outlived its review date. Loud: pauses become drift. */
  | 'STALE_PAUSE'
  /** Producing, but every row matched the synthetic filter. Loud. */
  | 'CANARY_ONLY'
  /**
   * A quorum member present in the baseline is ABSENT from the window. Loud.
   *
   * SEPARATE FROM DEGRADATION ON PURPOSE — this is the verdict the ledger did
   * not have on 2026-07-14. Gemini went 2,653 → 0 overnight while total volume
   * did NOT move (2,683 → 2,689), because the surviving providers absorbed the
   * load. A row count cannot see that: there is nothing wrong with the row
   * count. Volume only fell on 07-16 and the containers stopped on 07-17, so
   * the earliest volume-based alarm was already two days late and every
   * liveness check was four days late and green throughout.
   *
   * Losing a member is a CAPABILITY loss, not a throughput loss. A five-model
   * quorum degraded to three still produces rows; it just produces weaker
   * evidence, silently, and nothing in a count says so.
   */
  | 'MEMBER_LOST'
  /** Not enough history to judge, or the measurement itself failed. */
  | 'NOT_CHECKED';

/** Verdicts that must wake a human. */
export const LOUD: readonly Verdict[] = [
  'UNEXPLAINED_SILENCE',
  'UNEXPLAINED_DEGRADATION',
  'UNDECLARED_ACTIVITY',
  'STALE_PAUSE',
  'CANARY_ONLY',
  'MEMBER_LOST',
];

export function isLoud(v: Verdict): boolean {
  return LOUD.includes(v);
}

/** One producer's declaration, as written down by a human. */
export interface Declaration {
  /** Stable key, e.g. 'peer_verify_mesh' or 'hal_classifications'. */
  producer: string;
  state: DeclaredState;
  /** Why, in words. Required for every state except 'running'. */
  reason?: string;
  /**
   * ISO date a `paused_cost` declaration must be revisited.
   *
   * Required for `paused_cost` and only that state. A pause with no review date
   * is how "we turned it off for a week to save money" becomes a year, and the
   * whole point of this ledger is that drift has to announce itself.
   */
  reviewBy?: string;
  /**
   * Fraction of trailing baseline below which a RUNNING producer is degraded.
   * Defaults to 0.5.
   *
   * 0.5 is chosen from the incident, not from taste. The mesh went
   * 6,972 -> 2,847 -> 1,615 -> 4 over four days. A silence-only rule fires on
   * day four. A 50%-of-baseline rule fires on 07-16, TWO DAYS EARLIER, while
   * providers were still merely rate-limited and the fleet was still alive.
   */
  degradedBelow?: number;
  /** Minimum days of history before a baseline is trustworthy. Default 7. */
  minBaselineDays?: number;
}

/** What was actually observed for a producer over the measurement window. */
export interface Observation {
  producer: string;
  /** Rows written in the window, EXCLUDING anything the synthetic filter caught. */
  rows: number;
  /** Rows excluded as synthetic (canary/probe/smoke). */
  syntheticRows: number;
  /** Mean rows per window over the trailing baseline period. */
  baseline: number;
  /** Days of history the baseline was computed over. */
  baselineDays: number;
  /** Most recent non-synthetic write, ISO, or null if never. */
  lastRealWrite: string | null;
}

export interface Assessment {
  producer: string;
  verdict: Verdict;
  loud: boolean;
  /** One sentence a human can act on. */
  detail: string;
  /** Observed / baseline, or null when there is no usable baseline. */
  ratio: number | null;
}

/**
 * Classify one producer.
 *
 * `now` is passed in rather than read from the clock so this is a pure function
 * of its inputs and its tests cannot flake. (`scripts/mutate.mjs` learned the
 * same lesson: a check whose result depends on wall-clock time is a check that
 * fails at midnight for reasons nobody can reproduce.)
 */
export function assess(d: Declaration, o: Observation, now: string): Assessment {
  const minDays = d.minBaselineDays ?? 7;
  const degradedBelow = d.degradedBelow ?? 0.5;
  const producing = o.rows > 0;
  const ratio = o.baseline > 0 ? o.rows / o.baseline : null;

  const out = (verdict: Verdict, detail: string): Assessment => ({
    producer: d.producer,
    verdict,
    loud: isLoud(verdict),
    detail,
    ratio,
  });

  // --- declared OFF ---------------------------------------------------------
  //
  // Checked BEFORE the running branch, and activity is checked before silence.
  // A producer you believe is off but which is writing rows is spending money
  // you have not budgeted, and it is the case most likely to be missed because
  // nobody looks at things they think are off.
  if (d.state !== 'running') {
    if (producing) {
      return out(
        'UNDECLARED_ACTIVITY',
        `declared '${d.state}' but wrote ${o.rows} row(s) — something you believe is off is running`
      );
    }
    if (d.state === 'paused_cost') {
      // A pause is a decision with an expiry. Without one it is indistinguishable
      // from having forgotten, which is exactly the state this ledger exists to
      // make impossible.
      if (!d.reviewBy) {
        return out('STALE_PAUSE', 'paused_cost with no reviewBy date — a pause with no expiry is drift');
      }
      if (Date.parse(d.reviewBy) < Date.parse(now)) {
        return out('STALE_PAUSE', `paused_cost review date ${d.reviewBy} has passed — decide again or restart it`);
      }
    }
    return out('EXPECTED_SILENCE', `declared '${d.state}'${d.reason ? `: ${d.reason}` : ''}`);
  }

  // --- declared RUNNING -----------------------------------------------------

  // Canary before silence: a producer whose entire output is synthetic LOOKS
  // alive to every "anything recent?" check. This is the exact shape that hid a
  // four-week outage — one identical prompt per day, for 29 days.
  if (!producing && o.syntheticRows > 0) {
    return out(
      'CANARY_ONLY',
      `${o.syntheticRows} synthetic row(s) and ZERO real output — a probe is keeping liveness checks satisfied`
    );
  }

  if (!producing) {
    return out(
      'UNEXPLAINED_SILENCE',
      o.lastRealWrite
        ? `declared running, no output in window; last real write ${o.lastRealWrite}`
        : 'declared running, no output in window, and no real write on record'
    );
  }

  // A producer can be producing AND be mostly canary. Judged on real rows, but
  // reported, because a collapsing real/synthetic ratio is an early warning.
  if (o.baselineDays < minDays || o.baseline <= 0) {
    return out(
      'NOT_CHECKED',
      `baseline covers ${o.baselineDays}d of a required ${minDays}d — too little history to call this`
    );
  }

  if (ratio !== null && ratio < degradedBelow) {
    return out(
      'UNEXPLAINED_DEGRADATION',
      `${o.rows} vs baseline ${o.baseline.toFixed(1)} (${(ratio * 100).toFixed(0)}% of normal, floor ${(degradedBelow * 100).toFixed(0)}%)`
    );
  }

  return out('OK', `${o.rows} row(s), ${((ratio ?? 1) * 100).toFixed(0)}% of baseline`);
}

/**
 * A producer writing rows that nobody declared.
 *
 * Discovery matters as much as monitoring. `quorum-receipt-writer.ts` has been in
 * the tree since 2026-07-13 and is imported by nothing; `hal_quorum_receipts` has
 * never held a row. Nobody would have added either to a registry, because nobody
 * knew. The inverse — rows appearing from a producer no one registered — is how
 * the registry finds what it is missing instead of quietly covering less each
 * month.
 */
export function undeclared(observed: string[], declared: string[]): string[] {
  const known = new Set(declared);
  return observed.filter((p) => !known.has(p)).sort();
}

/** Declarations that are malformed. A registry that lies is worse than none. */
export function validateDeclaration(d: Declaration): string[] {
  const errs: string[] = [];
  if (!d.producer || !d.producer.trim()) errs.push('producer is required');
  if (!DECLARED_STATES.includes(d.state)) errs.push(`state '${d.state}' is not a declared state`);
  // 'running' needs no reason — producing is its own justification. Every other
  // state is a human decision, and a decision without a reason cannot be
  // reviewed by whoever inherits it.
  if (d.state !== 'running' && !d.reason?.trim()) {
    errs.push(`state '${d.state}' requires a reason`);
  }
  if (d.state === 'paused_cost' && !d.reviewBy) errs.push('paused_cost requires reviewBy');
  if (d.state !== 'paused_cost' && d.reviewBy) errs.push('reviewBy is only meaningful for paused_cost');
  if (d.reviewBy && Number.isNaN(Date.parse(d.reviewBy))) errs.push(`reviewBy '${d.reviewBy}' is not a date`);
  if (d.degradedBelow !== undefined && !(d.degradedBelow > 0 && d.degradedBelow <= 1)) {
    errs.push('degradedBelow must be in (0, 1]');
  }
  return errs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Quorum diversity — the leg a row count cannot cover
// ─────────────────────────────────────────────────────────────────────────────
//
// WHY THIS EXISTS, MEASURED RATHER THAN IMAGINED.
//
// `hal_classifications.model` encodes which providers took part in each
// fact-check. Measured 2026-08-17 over the days before the fleet stopped:
//
//   day     total   gemini   qwen   fact-check-partial
//   07-13   2,683    2,653  1,799        0
//   07-14   2,683        0    177      259     <- members lost, VOLUME FLAT
//   07-15   2,689        0      0      479
//   07-16   1,707        0      0      177     <- volume finally moves
//   07-17   1,360        0      0      139
//   07-17 22:18 — containers stop
//
// The row-count ledger fires on 07-16 at the earliest. Membership was gone on
// 07-14. **Two days of warning were sitting in a column nobody read**, and the
// liveness checks were green for all of it.
//
// So this is not a refinement of throughput. It answers a different question:
// throughput asks *is anything coming out*, diversity asks *is it still being
// produced by the thing we think is producing it*.
//
// ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
//
// No opinion about WHICH members matter, and no minimum-quorum policy. This
// module reports that a member present in the baseline is absent now. Whether
// three providers is acceptable is a policy question with a cost attached, and
// putting it here would bury it.

/** What was observed about quorum composition over the window. */
export interface DiversityObservation {
  producer: string;
  /** Distinct members seen in the window, non-synthetic rows only. */
  seen: readonly string[];
  /**
   * Distinct members seen over the trailing baseline period.
   *
   * The baseline is a SET, not a mean. A member either took part or it did not,
   * and averaging that produces a number ("4.2 providers") that names nothing
   * you can go and restart.
   */
  baselineSeen: readonly string[];
  /** Days of history the baseline covers. */
  baselineDays: number;
}

export interface DiversityAssessment {
  producer: string;
  verdict: Verdict;
  loud: boolean;
  detail: string;
  /** Baseline members absent from the window. Empty when nothing was lost. */
  missing: readonly string[];
  /** Members in the window that the baseline never saw. Not a fault — reported. */
  gained: readonly string[];
}

/**
 * Members in `baseline` that are absent from `window`.
 *
 * Exported because it is the whole comparison and deserves to be assertable on
 * its own. Order follows the baseline so a report reads the same way twice.
 */
export function lostMembers(
  windowSeen: readonly string[],
  baselineSeen: readonly string[]
): string[] {
  const present = new Set(windowSeen);
  return baselineSeen.filter((m) => !present.has(m));
}

/** Members in the window the baseline never saw. */
export function gainedMembers(
  windowSeen: readonly string[],
  baselineSeen: readonly string[]
): string[] {
  const known = new Set(baselineSeen);
  return windowSeen.filter((m) => !known.has(m));
}

/**
 * Classify quorum composition for one producer.
 *
 * Mirrors `assess` for the declared-off states so a producer cannot be loud on
 * diversity while being legitimately silent on throughput — a paused producer
 * has no members by definition, and reporting that as MEMBER_LOST would be the
 * ledger crying wolf about its own pause.
 */
export function assessDiversity(
  d: Declaration,
  o: DiversityObservation,
  now: string
): DiversityAssessment {
  const minDays = d.minBaselineDays ?? 7;
  const missing = lostMembers(o.seen, o.baselineSeen);
  const gained = gainedMembers(o.seen, o.baselineSeen);

  const out = (verdict: Verdict, detail: string): DiversityAssessment => ({
    producer: d.producer,
    verdict,
    loud: isLoud(verdict),
    detail,
    missing,
    gained,
  });

  // Declared off: composition is not a question. Silence is the declaration.
  if (d.state !== 'running') {
    return out(
      'EXPECTED_SILENCE',
      `declared ${d.state}; quorum composition is not assessed for a producer that is not running`
    );
  }

  // Thin history cannot distinguish "member lost" from "member never seen".
  if (o.baselineDays < minDays) {
    return out(
      'NOT_CHECKED',
      `${o.baselineDays} day(s) of history, ${minDays} required — a short baseline cannot tell a lost member from one that was never there`
    );
  }

  if (o.baselineSeen.length === 0) {
    return out(
      'NOT_CHECKED',
      'no members recorded in the baseline, so there is nothing to compare against'
    );
  }

  if (missing.length > 0) {
    // Named, not counted. "1 provider missing" sends nobody anywhere; "gemini"
    // names the thing to go and restart.
    return out(
      'MEMBER_LOST',
      `${missing.length} of ${o.baselineSeen.length} baseline member(s) ABSENT: ${missing.join(', ')}. ` +
        `Still present: ${o.seen.length ? o.seen.join(', ') : 'none'}. ` +
        'Row volume may be unaffected — surviving members absorb the load — so check this before trusting a healthy row count.'
    );
  }

  return out(
    'OK',
    `all ${o.baselineSeen.length} baseline member(s) present` +
      (gained.length ? `; ${gained.length} new: ${gained.join(', ')}` : '')
  );
}
