#!/usr/bin/env node
// scripts/check-all.mjs — discover and run every `check:*` script.
//
// WHY THIS EXISTS. `npm run check` was a single ~400-character line listing
// every suite. That made it a **structural conflict magnet**: two lanes adding
// suites concurrently always collide on that one line, because git resolves by
// line and there is only one. Over 2026-08-14/15 that exact conflict was
// resolved by hand FIVE times across four PRs. None of them needed judgement —
// every resolution was "keep both" — which is the signature of a problem that
// should not be reaching a human at all.
//
// Adding a suite is now editing an independent `"check:name": "..."` line.
// Two lanes adding two suites touch two different lines and merge cleanly.
//
// ── THE FAILURE MODE THIS RUNNER MUST NOT HAVE ───────────────────────────────
//
// The recurring defect in this codebase is a system reporting success it has
// not earned, and a discovery-based runner has an obvious new way to do it:
// **discover nothing, run nothing, exit 0.** A typo in the glob, a renamed
// field, a package.json that failed to parse — each would produce a green tick
// over zero executed assertions, which is worse than the hardcoded list it
// replaces.
//
// So the count is guarded (`MINIMUM_SUITES`), every discovered suite is printed
// before anything runs, and the summary names each one with its outcome. A run
// that checked less than it should is loud.
//
// ── THREE OUTCOMES, TAKEN FROM THE EXIT CODE ─────────────────────────────────
//
// This is not a new convention — it is the one the suites already use:
//
//   0        VERIFIED     the check ran and passed
//   2        NOT_CHECKED  the check could not run (network denied, no
//                         credential). NOT a failure — see
//                         `tools.unavailable_is_not_checked`, and the history
//                         where reading a proxy 403 as failure caused a
//                         credential rotation that was never needed.
//   anything FAILED       the check ran and something is wrong
//
// `scripts/check-legacy-key.mjs` exits 2 when the network is denied, and four
// other scripts use the same signal. Collapsing 2 into failure would make the
// whole suite red in every sandboxed session; collapsing it into success would
// report a check that never ran as passing. Neither is acceptable, so the
// distinction is carried through to the summary.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/**
 * Floor on how many suites discovery must find.
 *
 * NOT a count of what exists — it is a tripwire. Discovery finding fewer than
 * this means discovery is broken, and a broken discovery that exits 0 is
 * precisely the unearned-success defect. Raise it when the suite count grows
 * comfortably past it; never lower it to make a red run green.
 *
 * At the time of writing there were 26 `check:*` scripts.
 */
const MINIMUM_SUITES = 20;

/**
 * Suites that must run FIRST, in this order.
 *
 * Only ordering that is load-bearing belongs here. `check:secrets` runs first
 * because a leaked credential is the one finding worth surfacing before
 * spending ten minutes on everything else. Everything absent from this list
 * runs afterwards in alphabetical order, which is stable across machines —
 * `Object.keys` order is insertion order, so ordering by it would make the run
 * order depend on where in package.json somebody happened to paste a line.
 */
const RUN_FIRST = ['check:secrets', 'check:auth'];

function discover() {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  } catch (e) {
    console.error(`check-all: cannot read package.json — ${e.message}`);
    console.error('Refusing to report a result: zero suites ran.');
    process.exit(1);
  }
  const scripts = pkg.scripts ?? {};
  // `check` itself is this runner. Anything else beginning `check:` is a suite.
  const found = Object.keys(scripts).filter((k) => k.startsWith('check:'));
  const rest = found.filter((k) => !RUN_FIRST.includes(k)).sort();
  return [...RUN_FIRST.filter((k) => found.includes(k)), ...rest];
}

const suites = discover();

// `--list` prints what WOULD run, one per line, and runs nothing.
//
// Exists so another check can verify the gate set without parsing package.json
// and re-deriving this file's rules. TF-04 in check-trust-foundation.mjs uses
// it: asking the runner what it will run is strictly stronger than matching
// substrings in a command string, because it also catches a suite that is
// defined but that discovery would skip.
if (process.argv.includes('--list')) {
  console.log(suites.join('\n'));
  process.exit(0);
}

if (suites.length < MINIMUM_SUITES) {
  console.error(
    `check-all: discovered only ${suites.length} suite(s), below the floor of ` +
      `${MINIMUM_SUITES}. This is a discovery failure, not a small test suite — ` +
      'refusing to exit 0 over checks that never ran.'
  );
  console.error(`Discovered: ${suites.join(', ') || '(none)'}`);
  process.exit(1);
}

console.log(`check-all: running ${suites.length} suites\n${suites.map((s) => `  ${s}`).join('\n')}\n`);

const results = [];
for (const suite of suites) {
  console.log(`\n${'─'.repeat(70)}\ncheck-all: ${suite}\n${'─'.repeat(70)}`);
  // Serial, not parallel. Several suites compile TypeScript into temp dirs and
  // run `npx tsc`; running them concurrently makes wall-clock worse, not
  // better, and interleaves their output into something nobody can read.
  const run = spawnSync('npm', ['run', suite], { stdio: 'inherit', shell: false });

  // A signal leaves status null, and that is not a pass.
  //
  // UNREACHABLE THROUGH THE CURRENT SPAWN PATH, and said so rather than left to
  // look tested: measured 2026-08-15, `npm run` converts a SIGKILLed child into
  // exit **137**, so status is a number here even when a suite is OOM-killed.
  // The 137 case IS covered (it lands in FAILED, and there is a test). This
  // branch is kept for the day something spawns a suite directly instead of
  // through npm, where null becomes reachable — an unreachable branch that
  // silently became reachable and defaulted to VERIFIED is the failure worth
  // pre-empting.
  const code = run.status === null ? `signal:${run.signal ?? 'unknown'}` : run.status;
  const outcome = run.status === 0 ? 'VERIFIED' : run.status === 2 ? 'NOT_CHECKED' : 'FAILED';
  results.push({ suite, outcome, code });
}

// ── summary ─────────────────────────────────────────────────────────────────

const width = Math.max(...results.map((r) => r.suite.length));
console.log(`\n${'═'.repeat(70)}\ncheck-all summary\n${'═'.repeat(70)}`);
for (const r of results) {
  const note = r.outcome === 'FAILED' ? `  (exit ${r.code})` : '';
  console.log(`  ${r.outcome.padEnd(12)} ${r.suite.padEnd(width)}${note}`);
}

const counts = {
  VERIFIED: results.filter((r) => r.outcome === 'VERIFIED').length,
  NOT_CHECKED: results.filter((r) => r.outcome === 'NOT_CHECKED').length,
  FAILED: results.filter((r) => r.outcome === 'FAILED').length,
};

console.log(
  `\ncheck-all: ${counts.VERIFIED} VERIFIED, ${counts.NOT_CHECKED} NOT_CHECKED, ` +
    `${counts.FAILED} FAILED, of ${results.length} suites.`
);

if (counts.NOT_CHECKED > 0) {
  // Stated rather than implied. A green run with NOT_CHECKED suites in it has
  // covered less than a green run without them, and the difference has to be
  // visible or the tick over-claims.
  console.log(
    `\nNOT CHECKED (${counts.NOT_CHECKED}): ` +
      results.filter((r) => r.outcome === 'NOT_CHECKED').map((r) => r.suite).join(', ') +
      '\n  These did not run — usually a denied network or an absent credential.' +
      '\n  A green result here means "everything that COULD run, passed".'
  );
}

process.exit(counts.FAILED > 0 ? 1 : 0);
