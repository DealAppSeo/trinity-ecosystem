#!/usr/bin/env node
// scripts/check-hal-penalty-guard.mjs — the HAL false-positive guard must protect the
// SCORE, not just the row.
//
// WHY THIS EXISTS. `hal_penalty_requires_hallucination` has been ON since 2026-05-29 and
// had suppressed 53,690 penalties. On 2026-08-31 it was measured and none of them were
// real: the guard stamped `penalty_suppressed: true`, set `delta = 0`, and the agent's
// score moved anyway — 191 -> 182 in a live probe. Postgres fires BEFORE-INSERT triggers
// in alphabetical order by trigger name, and `trg_apply_repid_score_event` sorted ahead of
// `trg_hal_penalty_guard`, so `UPDATE repid_agents SET current_repid` had already run by
// the time the guard zeroed anything. Three months of a protection that was never applied.
//
// That is this repo's recurring defect wearing its best disguise: a system reporting
// success it has not earned, inside the very mechanism built to prevent exactly that.
//
// THE ASSERTION THAT MATTERS. Every case asserts on `repid_agents.current_repid` — what
// happened to the score — never on the event row. A check written against the row would
// have PASSED against the broken guard, which is how it survived undetected.
//
// A second live hole is covered too: the guard matched only
// `event_type = 'HAL_SCORE_EVENT'`, so a HAL penalty written as PREDICTION_RESOLVE walked
// past it. Event 157669 — a TRUE claim, "the capital of France is Paris", flagged by HAL —
// took -9 that way.
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
  // A missing function is itself a finding: the regression was removed or never applied.
  console.log('check:hal-penalty-guard — FAILED');
  console.log(`  rpc check_hal_penalty_guard() errored: ${error.message}`);
  if (/does not exist/i.test(error.message)) {
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
  console.log('  If the ordering case is the one failing, the guard trigger has been renamed');
  console.log('  so it sorts AFTER trg_apply_repid_score_event again. The trg_00_ prefix is');
  console.log('  load-bearing: without it the applier writes the score first and every other');
  console.log('  case here reverts to suppressed-on-paper-only.');
  process.exit(1);
}

console.log(`check:hal-penalty-guard — VERIFIED. ${data.length} cases, all passing.`);
console.log('  False positives are suppressed at the SCORE, not merely stamped on the row;');
console.log('  real hallucinations and non-HAL penalties are still applied unchanged.');
process.exit(0);
