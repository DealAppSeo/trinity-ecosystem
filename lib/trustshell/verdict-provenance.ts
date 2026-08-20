// lib/trustshell/verdict-provenance.ts — can a verdict that moved a score be
// traced back to the evidence that earned it?
//
// P2 of docs/SPRINT-DECISIONS-2026-08-17.md: "issuer staking / schema facts that
// block Gate 2". This is the schema fact.
//
// ── A CORRECTION THIS FILE CARRIES ON PURPOSE ───────────────────────────────
//
// The first version of this module stated: "the scoring path carries NO
// provenance column — Gate 2 is blocked by a missing foreign key." That was
// derived from `information_schema.columns` on `repid_score_events` and
// `hal_runner_results`, finding no shared key and no provenance column.
//
// It was true of the COLUMNS and FALSE of the TABLE. Nobody asked the jsonb.
//
//   repid_score_events.metadata ->> 'quorum_providers_used'
//
// is a scalar count of the providers consulted, and it is present on
// **93,657 of 147,723 HAL_SCORE_EVENT rows (63.4%)**, continuously from
// 2026-06-04 to today [MEASURED 2026-08-17].
//
// Gate 2 is therefore NOT blocked by a missing foreign key. It is blocked by a
// PROJECTION: `v_agent_earned_observations` discards a value the table already
// carries. No DDL, no backfill, no join to `hal_runner_results`.
//
// The original error is the house pattern in PRIOR-WORK-INDEX rule 2 — suspect
// the sample before the measurement. `information_schema.columns` is a fine
// instrument that answers a narrower question than the one being asked, and a
// schema with a jsonb column has no "shape" that a column list can report.
//
// ── WHAT IS ACTUALLY MEASURED [2026-08-17, live database] ───────────────────
//
// Provenance is carried on exactly the event type that renders a verdict, and
// on no other. By event_type:
//
//   HAL_SCORE_EVENT      147,723 rows   93,657 with provenance (63.4%)
//                                       68,436 catches, 43,026 moved a score
//   PREDICTION_RESOLVE     2,888 rows        0 with provenance
//                                        1,587 catches, 0 moved a score
//   all 14 other types     ~1,500 rows       0 with provenance, 0 catches
//
// Where provenance is PRESENT AND ZERO — a verdict issued having consulted
// nothing, which is precisely `refusesToIssue` — there are 2,443 such rows
// (2026-06-04 .. 2026-07-08) and among them:
//
//   **ZERO actionable catches. ZERO score movement.**
//
// So the alarming reading — "unearned vetoes are moving spending limits" — is
// measured FALSE everywhere it is measurable. That is a real result, and it is
// the opposite of what the first version of this file implied.
//
// The residue is bounded and datable: **180** catches that moved a score and
// carry no provenance key, summed applied delta **-1,800**, ALL of them on
// **2026-06-04** — the single day the key was introduced. Not 70,000. Not zero.
//
// Coverage is complete going forward on the event type that stakes: in August,
// HAL_SCORE_EVENT is 35 of 35 with provenance. The August rows without it are
// SERVICE_FULFILLED / SERVICE_SATISFIED / PREDICTION_RESOLVE / VALIDATION_FAILED,
// which render no HAL verdict and so have nothing to be provenanced.
//
// ── THE PROJECTION IS CLOSED [2026-08-17, same session, logged] ─────────────
//
// `v_agent_earned_observations` now projects `quorum_providers_used` as an
// eighth column — additive, nullable, row counts unchanged (152,164 / 233 / 85
// by signal, verified before and after). Migration and rollback SQL logged to
// `trinity_changelog` id 141, allowed under the preflight fence for additive
// reversible views. `EarnedMetricsRepo.ts`'s `.select()` now names the column,
// so `describeLinkage` — both the repo half (parsed from source) and the
// measured half (SCORING_PATH_COLUMNS below) — is VERIFIED. This is what that
// verdict means and does not mean: the value now REACHES the code that could
// consult it. Nothing consults it yet.
//
// ── WHAT REMAINS, AND WHY IT IS A SEPARATE DECISION ─────────────────────────
//
// `issuer-stake.ts` and its `refusesToIssue` are correct, mutation-tested and
// exported — and STILL have zero importers beyond the barrel. The schema
// blocker is gone; what is left is deciding how `EarnedMetrics.veritasCatchRate`
// should react to an actionable catch with `quorum_providers_used === 0`. That
// is a scoring-behavior change, and this repo's hard rule is explicit: "No
// DEFAULT_WEIGHTS changes without explicit decision on main." Measured today
// it would change nothing live — the 2,443 zero-provider events include zero
// actionable catches — but the decision of HOW to gate future ones (drop the
// observation? weight it down? hold it NOT_CHECKED like `provenanceOf` does?)
// is not this module's to make unilaterally. `provenanceOf` above is the
// candidate policy, mutation-tested and ready; wiring it in is deliberately
// left undone here.
//
// ── A SECOND DEFECT IN THE SAME VIEW, RECORDED WHERE IT WAS FOUND ───────────
//
// The view's integrity arm is `success = hallucination_caught IS NOT TRUE` over
// ALL of `repid_score_events`, not over HAL verdicts. So its 70,023 failures are
// 68,436 HAL catches + 1,587 PREDICTION_RESOLVE catches — two different
// mechanisms pooled into one signal, which is LESSONS A21's shape one view over.
// The arithmetic is exact, so this is not an estimate. Not fixed here; fixing a
// view is a migration and this module is pure. Recorded so it is not rediscovered.
//
// The view's `bft` arm is dead: `bft_payment_evaluations` has 0 rows.

import { refusesToIssue } from './issuer-stake';

/** Three outcomes. Two would collapse "cannot tell" into "fine". */
export type ProvenanceOutcome = 'VERIFIED' | 'NOT_CHECKED' | 'FAILED';

export interface ScoringEvent {
  /** Did this verdict act AGAINST the subject? Only actionable verdicts stake. */
  vetoed: boolean;
  /**
   * Was any verification provider attempted?
   *
   * `null` MEANS THE FIELD DID NOT REACH HERE — not "no". That distinction is
   * load-bearing: reading null as `false` would manufacture findings out of a
   * missing key rather than out of evidence.
   */
  providerAttempted: boolean | null;
}

export interface ProvenanceVerdict {
  outcome: ProvenanceOutcome;
  /**
   * May this event move a reputation score?
   *
   * False for both NOT_CHECKED and FAILED, for different reasons — one is
   * untraceable, the other is traceably unearned. The outcome says which.
   */
  countsTowardScore: boolean;
  detail: string;
}

/**
 * Judge one scoring event's provenance.
 *
 * ORDER IS LOAD-BEARING, and it is not the order this function was first
 * written in. Two properties have to hold at once:
 *
 *  1. A NON-ACTIONABLE event needs no provenance. It stakes nothing, so demanding
 *     evidence from it is a category error — and an expensive one. The first
 *     version checked `providerAttempted == null` FIRST, which made every clean
 *     observation with no provenance NOT_CHECKED and therefore non-counting.
 *     Measured against the live view that is **82,459 of 152,482 rows (54.1%)**
 *     silently dropped — including 100% of the x402 and latency signal, neither
 *     of which has a provider concept at all. It would have deleted the positive
 *     evidence and kept only the accusations.
 *
 *  2. Within an ACTIONABLE verdict, UNTRACEABLE must still be distinguished from
 *     UNEARNED — null before false — because an event whose provenance never
 *     arrived cannot be called unearned.
 *
 * Checking `vetoed` first satisfies both. Checking null first satisfies only the
 * second, and quietly violates the "only actionable verdicts stake" rule that
 * this same function states one branch below.
 */
export function provenanceOf(event: ScoringEvent): ProvenanceVerdict {
  if (!event.vetoed) {
    return {
      outcome: 'VERIFIED',
      countsTowardScore: true,
      detail:
        'a non-actionable verdict; nothing is staked either way, so no provenance is owed. ' +
        'This branch is why the x402, latency and clean-integrity observations survive — ' +
        'they have no provider concept and must not be dropped for lacking one.',
    };
  }
  if (event.providerAttempted === null || event.providerAttempted === undefined) {
    return {
      outcome: 'NOT_CHECKED',
      countsTowardScore: false,
      detail:
        'this ACTIONABLE verdict carries no record of whether a verification provider was ' +
        'consulted, so an earned catch and a coin flip are indistinguishable here. NOT a ' +
        'finding that the verdict was unearned — the evidence was never carried, not weighed ' +
        'and found absent. Measured population: 180 such events moved a score, all on ' +
        '2026-06-04, summed delta -1,800.',
    };
  }
  if (event.providerAttempted === false) {
    if (
      refusesToIssue({
        providerAttempted: false,
        vetoed: event.vetoed,
      })
    ) {
      return {
        outcome: 'FAILED',
        countsTowardScore: false,
        detail:
          'an ACTIONABLE verdict issued having consulted no provider. This is ' +
          '`refusesToIssue` from issuer-stake.ts, applied at the point the verdict would ' +
          'move a score. Measured on the live scoring path there are 2,443 zero-provider ' +
          'events and ZERO of them are actionable catches — so today this branch fires on ' +
          'nothing, and the gate exists to keep it that way.',
      };
    }
  }
  return {
    outcome: 'VERIFIED',
    countsTowardScore: true,
    detail: 'an actionable verdict backed by an attempted provider',
  };
}

/**
 * The columns `EarnedMetricsRepo` can actually see, RE-MEASURED 2026-08-17
 * after the migration in the same session (trinity_changelog id 141). Was
 * six columns, none provenance, from 2026-08-17T13:xx until the migration
 * later the same day; now seven, `quorum_providers_used` among them.
 *
 * Checked in as SCHEMA, not as rows — the preflight fences forbid prod rows as
 * git fixtures, and a column list is neither a row nor a secret. It is here so
 * the gate fails when the shape changes, which is the event worth catching.
 */
export const SCORING_PATH_COLUMNS: readonly string[] = [
  'agent_id',
  'signal',
  'observed_at',
  'success',
  'domain',
  'value_ms',
  'quorum_providers_used',
];

/**
 * Any of these reaching the observation view would make provenance derivable.
 *
 * `quorum_providers_used` is first because it is the one that ALREADY EXISTS —
 * as `metadata->>'quorum_providers_used'` on repid_score_events. Projecting it
 * through the view is a one-line change with no DDL and no backfill, and it is
 * the cheapest path to closing Gate 2 by a wide margin.
 */
export const PROVENANCE_COLUMN_CANDIDATES: readonly string[] = [
  'quorum_providers_used',
  'provider_attempted',
  'providers_attempted',
  'providers_used',
  'hal_providers_used',
  'hal_runner_result_id',
  'evidence_ref',
];

export interface LinkageReport {
  outcome: ProvenanceOutcome;
  /** Which candidate columns, if any, are present on the scoring path. */
  found: readonly string[];
  detail: string;
}

/**
 * Is provenance derivable from the columns the scorer can see?
 *
 * Takes the column list as an argument rather than reading a schema, so this is
 * pure and the gate can drive it over both the measured shape and a hypothetical
 * fixed one.
 *
 * HOW THE GATE CLOSES, stated precisely because the first version overstated it.
 * That version said "it goes VERIFIED on its own the moment a linking column
 * lands — no edit to this file", while feeding this function the checked-in
 * SCORING_PATH_COLUMNS constant. Nothing in the repo changed when the view
 * changed, so the verdict was frozen. The claim was the same unearned-green
 * shape the module was written to report.
 *
 * `check:verdict-provenance` now requires two halves, and both are things the
 * person wiring provenance through does anyway:
 *
 *   REPO HALF     — parsed from EarnedMetricsRepo.ts's `.select()`. Genuinely
 *                   self-closing: no edit to this file or to the suite.
 *   MEASURED HALF — SCORING_PATH_COLUMNS below, which must be re-measured
 *                   against the view. This IS an edit, and it is the right one:
 *                   it is the act of confirming the view supplies the column.
 *
 * Adding it to the `.select()` alone would not prove that. PostgREST would 400
 * and EarnedMetricsRepo would report `unmeasured` — silently downgrading agents
 * to "no track record" on the payment path in app/api/trustrails/pay/route.ts.
 *
 * All three states were verified by execution, not by reading: unwired -> exit 2,
 * repo half only -> exit 2 naming which half is missing, both -> exit 0.
 */
export function describeLinkage(columns: readonly string[]): LinkageReport {
  const found = PROVENANCE_COLUMN_CANDIDATES.filter((c) => columns.includes(c));
  if (found.length > 0) {
    return {
      outcome: 'VERIFIED',
      found,
      detail: `provenance is derivable on the scoring path via: ${found.join(', ')}`,
    };
  }
  return {
    outcome: 'NOT_CHECKED',
    found: [],
    detail:
      'the observation view carries NO provenance column, so `refusesToIssue` cannot be ' +
      'applied to the events that move reputation. The blocker is a PROJECTION, not a ' +
      'missing foreign key: repid_score_events already carries ' +
      "metadata->>'quorum_providers_used' on 63.4% of HAL_SCORE_EVENT rows and on 100% of " +
      'them since the 2026-06-04 cutover. The smallest change that unblocks it is one line ' +
      'in v_agent_earned_observations projecting that value — no DDL, no backfill.',
  };
}
