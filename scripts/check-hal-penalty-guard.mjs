#!/usr/bin/env node
// scripts/check-hal-penalty-guard.mjs — the HAL false-positive guard must protect the
// SCORE, not just the row.
//
// WHY THIS EXISTS. `hal_penalty_requires_hallucination` has been ON since 2026-05-29 to stop
// HAL docking RepID for hallucinations it never caught. It matched on
// `event_type = 'HAL_SCORE_EVENT'` — and HAL-driven penalties are not all written under that
// label. Five production rows carry `hal_decision` in ('flagged','vetoed') with
// `hallucination_caught = false` under `PREDICTION_RESOLVE` and `VALIDATION_FAILED`. The
// guard never evaluated them and each moved a real score: -9, -9, -9, -250, -9 — **-286
// RepID** between 2026-06-19 and 2026-08-31. Event 157669 is a TRUE claim, "the capital of
// France is Paris", flagged by HAL, docked -9 (200 -> 191).
//
// So a penalty could evade its own guard by being labelled something else. The guard now
// tests `hal_decision`, which is populated on every HAL-decided row, rather than trusting
// the ledger label; and it zeroes `repid_delta_calculated` as well as `delta`, because
// `apply_repid_score_event()` reads COALESCE(repid_delta_calculated, delta, 0).
//
// RETRACTED — this header previously claimed the guard was ENTIRELY cosmetic: that alphabetical
// BEFORE-trigger order let `trg_apply_repid_score_event` run first, so "all 53,690 suppressed
// penalties still docked the score". That is NOT SUPPORTED and must not be cited. On all 53,690
// suppressed rows `repid_after - repid_before = 0` — and those two columns are the honest
// witness, written by the applier from a live FOR UPDATE read and the UPDATE's RETURNING, after
// every BEFORE-UPDATE trigger on `repid_agents`. The claim came from a CONSTRUCTED probe row
// generalised to production without checking that production rows had the same shape. See
// LESSONS A36. Trigger ordering is NOT ESTABLISHED; `trg_00_` is kept because correct ordering
// is cheap and case 5 pins it, not because a misordering was ever shown in production.
//
// THE ASSERTION THAT MATTERS. Every case asserts on `repid_agents.current_repid` — what
// happened to the score — never on the event row. A check written against the row would have
// passed while those five rows were docking scores, which is how the hole survived.
//
// THREE OUTCOMES. VERIFIED / NOT_CHECKED / FAILED. Absent credentials are NOT_CHECKED and
// exit 2. They are never a pass: the whole point of this file is that a green tick over an
// unexamined guard is the failure mode.
//
// The work happens in `public.check_hal_penalty_guard()`, because the subject is a trigger
// and only the database can observe trigger ordering. It creates its own throwaway agents
// inside subtransactions that roll back, so running this writes nothing that survives.

const url =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';

// service_role only. The function reads repid_config and writes score events inside a
// rolled-back subtransaction; an anon key cannot do either, and a check that silently
// degrades to "no rows, all good" is the defect this file is about.
const key =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  '';

if (!url || !key) {
  console.log('check:hal-penalty-guard — NOT_CHECKED');
  console.log('  SUPABASE_URL and SUPABASE_SECRET_KEY are required to reach the trigger.');
  console.log('  The guard under test is a database trigger; there is nothing to assert');
  console.log('  against without a connection. This is an absence, not a pass.');
  process.exit(2);
}

// Imported dynamically, AFTER the credential gate. A static import is hoisted, so a
// missing dependency would crash the process before the NOT_CHECKED branch above could
// run — reporting FAILED for an absent package and a guard nobody looked at. Same class
// of bug as the one this file exists to catch.
let createClient;
try {
  ({ createClient } = await import('@supabase/supabase-js'));
} catch (e) {
  console.log('check:hal-penalty-guard — NOT_CHECKED');
  console.log(`  @supabase/supabase-js is not installed (${e.code ?? e.message}).`);
  console.log('  Run npm install. An unrunnable check is not a passing one.');
  process.exit(2);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await db.rpc('check_hal_penalty_guard');

if (error) {
  // TRANSPORT IS NOT A VERDICT [2026-09-04].
  //
  // This branch reported FAILED for EVERY rpc error, including `TypeError: fetch
  // failed` — a request that never reached Postgres. That made an unreachable
  // network indistinguishable from "the guard function is gone", which is the
  // finding this file exists to raise. Two consequences, both bad:
  //
  //   - A fresh clone, an offline session, or any runner without egress to the
  //     database reports FAILED on a guard nobody looked at. This file's own
  //     header sets the rule — "absent credentials are NOT_CHECKED and exit 2 …
  //     a green tick over an unexamined guard is the failure mode" — and the red
  //     direction breaks it just as thoroughly, by teaching readers that this
  //     check's red is background noise.
  //   - It is the same conflation that cost the cascade path 12 days: NOT
  //     CHECKED scored as a verdict it had not earned.
  //
  // So: an error the DATABASE returned is still FAILED, "does not exist" very
  // much included. An error that means we never got an answer is NOT_CHECKED.
  const msg = error.message ?? String(error);
  const neverReached =
    /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network|Failed to fetch|timeout/i.test(
      msg
    );

  if (neverReached) {
    console.log('check:hal-penalty-guard — NOT_CHECKED');
    console.log(`  could not reach the database: ${msg}`);
    console.log('  The request never got an answer, so this says NOTHING about the guard.');
    console.log('  Not a pass and not a failure — re-run where the database is reachable.');
    process.exit(2);
  }

  // A missing function is itself a finding: the regression was removed or never applied.
  console.log('check:hal-penalty-guard — FAILED');
  console.log(`  rpc check_hal_penalty_guard() errored: ${msg}`);
  if (/does not exist/i.test(msg)) {
    console.log('  The function is absent. Re-apply migration check_hal_penalty_guard_fn,');
    console.log('  or restore it from trinity_changelog id=182.');
  }
  process.exit(1);
}

if (!Array.isArray(data) || data.length === 0) {
  console.log('check:hal-penalty-guard — NOT_CHECKED');
  console.log('  The function returned no rows. It ran but asserted nothing, which is not');
  console.log('  a pass — treat it as the check being broken, not the guard being sound.');
  process.exit(2);
}

const failed = data.filter((r) => !r.passed);

for (const r of data) {
  console.log(`  ${r.passed ? 'PASS' : 'FAIL'}  ${r.case_name}`);
  console.log(`        expected: ${r.expectation}`);
  console.log(`        observed: ${r.observed}`);
}

if (failed.length > 0) {
  console.log(`check:hal-penalty-guard — FAILED (${failed.length} of ${data.length})`);
  console.log('');
  console.log('  If the ORDERING case is the one failing, the guard trigger was renamed so it');
  console.log('  sorts after trg_apply_repid_score_event. Restore the trg_00_ prefix — but note');
  console.log('  that a misordering has never been demonstrated in production (LESSONS A36), so');
  console.log('  this case is defence, not a reproduction. The four BEHAVIOURAL cases above are');
  console.log('  the ones that would catch a real regression; read those first.');
  process.exit(1);
}

console.log(`check:hal-penalty-guard — VERIFIED. ${data.length} cases, all passing.`);
console.log('  False positives are suppressed at the SCORE, not merely stamped on the row;');
console.log('  real hallucinations and non-HAL penalties are still applied unchanged.');
process.exit(0);
