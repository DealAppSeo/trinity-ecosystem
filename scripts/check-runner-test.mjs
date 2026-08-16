#!/usr/bin/env node
// scripts/check-runner-test.mjs — the runner that gates everything else.
//
// Run: node scripts/check-runner-test.mjs
//
// WHY THIS EXISTS. `npm run check` is now discovery-based, and discovery has a
// failure mode the hardcoded list did not: **find nothing, run nothing, exit
// 0.** That is the house defect — a system reporting success it has not earned
// — sitting in the one place that would mask every other suite at once. A green
// tick from a runner that discovered zero suites is the most expensive possible
// version of it.
//
// So the assertions that carry this file are the negative ones:
//
//   * 'discovering fewer suites than the floor FAILS' — the tripwire.
//   * 'an unreadable package.json FAILS' — no falling back to "assume fine".
//   * 'exit 2 is NOT_CHECKED, not a pass and not a failure' — the three-outcome
//     rule, taken from the exit code. Collapsing it either way is wrong:
//     failure makes every sandboxed run red, success reports a check that never
//     ran as passing.
//   * 'a non-zero exit FAILS the run' — the obvious one, asserted because a
//     runner that swallows it is indistinguishable from one that works.
//
// Fixtures are temp directories with a synthetic package.json, so the real
// suites are never executed here — this tests the RUNNER, not the checks.

import { mkdtempSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const RUNNER = join(process.cwd(), 'scripts/check-all.mjs');

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed += 1; } catch (e) { failures.push(`${name}\n    ${e.message}`); }
};
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
};
const truthy = (v, what) => { if (!v) throw new Error(`${what}: expected truthy`); };
const match = (s, re, what) => { if (!re.test(s)) throw new Error(`${what}: ${JSON.stringify(String(s).slice(0,200))} !~ ${re}`); };

/**
 * Build a scratch project whose `check:*` scripts are trivial node one-liners.
 * `n` filler suites all exit 0; `extra` adds named suites with chosen exits.
 */
function fixture({ n = 22, extra = {}, raw = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'check-runner-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  cpSync(RUNNER, join(dir, 'scripts/check-all.mjs'));
  if (raw !== null) {
    writeFileSync(join(dir, 'package.json'), raw);
    return dir;
  }
  const scripts = { check: 'node scripts/check-all.mjs' };
  for (let i = 0; i < n; i += 1) scripts[`check:filler-${String(i).padStart(2, '0')}`] = 'node -e ""';
  Object.assign(scripts, extra);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fx', scripts }, null, 2));
  return dir;
}

const run = (dir, args = []) =>
  spawnSync('node', ['scripts/check-all.mjs', ...args], { cwd: dir, encoding: 'utf8' });

const cleanup = [];
const withFixture = (opts, fn) => {
  const dir = fixture(opts);
  cleanup.push(dir);
  return fn(dir);
};

// ── the tripwire ────────────────────────────────────────────────────────────

check('DISCOVERING FEWER SUITES THAN THE FLOOR FAILS', () => {
  // The whole reason this file exists. A discovery bug that finds 3 suites must
  // not produce a green tick over the 23 it missed.
  withFixture({ n: 3 }, (dir) => {
    const r = run(dir);
    eq(r.status, 1, 'a below-floor run must exit non-zero');
    match(r.stderr, /discovery failure/, 'and must name it as a discovery failure');
    match(r.stderr, /refusing to exit 0/i, 'and say what it is refusing to do');
  });
});

check('discovering ZERO suites fails rather than trivially passing', () => {
  withFixture({ n: 0 }, (dir) => {
    const r = run(dir);
    eq(r.status, 1, 'zero suites must not be a pass');
  });
});

check('AN UNREADABLE package.json FAILS — no "assume fine" path', () => {
  withFixture({ raw: '{ this is not json' }, (dir) => {
    const r = run(dir);
    eq(r.status, 1, 'unparseable config must not exit 0');
    match(r.stderr, /zero suites ran/, 'and must say nothing ran');
  });
});

// ── three outcomes, from the exit code ──────────────────────────────────────

check('EXIT 2 IS NOT_CHECKED — neither a pass nor a failure', () => {
  // check-legacy-key exits 2 when the network is denied, and four other scripts
  // use the same signal. Treating it as failure makes every sandboxed run red;
  // treating it as success reports a check that never ran as passing.
  withFixture({ extra: { 'check:blocked': 'node -e "process.exit(2)"' } }, (dir) => {
    const r = run(dir);
    eq(r.status, 0, 'a NOT_CHECKED suite must not fail the run');
    match(r.stdout, /NOT_CHECKED\s+check:blocked/, 'it must appear as NOT_CHECKED in the summary');
    match(r.stdout, /1 NOT_CHECKED/, 'and be counted');
    match(r.stdout, /everything that COULD run, passed/, 'the tick must state what it does not cover');
  });
});

check('A NON-ZERO EXIT FAILS THE RUN', () => {
  withFixture({ extra: { 'check:broken': 'node -e "process.exit(1)"' } }, (dir) => {
    const r = run(dir);
    eq(r.status, 1, 'a failing suite must fail the run');
    match(r.stdout, /FAILED\s+check:broken/, 'and be named in the summary');
    match(r.stdout, /exit 1/, 'with its exit code');
  });
});

check('an unusual exit code is FAILED, not silently tolerated', () => {
  withFixture({ extra: { 'check:weird': 'node -e "process.exit(7)"' } }, (dir) => {
    const r = run(dir);
    eq(r.status, 1, 'exit 7 must fail');
    match(r.stdout, /FAILED\s+check:weird/, 'named');
  });
});

check('AN OOM-KILLED SUITE IS FAILED, never a pass', () => {
  // The realistic version of "the suite died". Measured: `npm run` converts a
  // SIGKILLed child into exit 137 rather than a null status, so this is the
  // shape an OOM actually takes here — and 137 must not fall through to
  // VERIFIED just because it is not 1.
  withFixture({ extra: { 'check:oom': `node -e "process.kill(process.pid,'SIGKILL')"` } }, (dir) => {
    const r = run(dir);
    eq(r.status, 1, 'a killed suite must fail the run');
    match(r.stdout, /FAILED\s+check:oom/, 'and be named in the summary');
  });
});

check('a clean run exits 0 and says how many suites ran', () => {
  withFixture({ n: 22 }, (dir) => {
    const r = run(dir);
    eq(r.status, 0, 'all-passing must exit 0');
    match(r.stdout, /22 VERIFIED, 0 NOT_CHECKED, 0 FAILED, of 22 suites/, 'summary line');
  });
});

// ── discovery semantics ─────────────────────────────────────────────────────

check('the runner does not discover ITSELF', () => {
  // `check` is the runner. Including it would recurse until the process died.
  withFixture({}, (dir) => {
    const r = run(dir, ['--list']);
    const listed = r.stdout.trim().split('\n');
    eq(listed.includes('check'), false, 'the runner must not run itself');
  });
});

check('ORDER IS DETERMINISTIC, not package.json key order', () => {
  // Object key order is insertion order, so ordering by it would make the run
  // order depend on where somebody pasted a line.
  const extra = { 'check:zzz': 'node -e ""', 'check:aaa': 'node -e ""' };
  withFixture({ extra }, (dir) => {
    const listed = run(dir, ['--list']).stdout.trim().split('\n');
    const rest = listed.filter((s) => !['check:secrets', 'check:auth'].includes(s));
    eq(rest, [...rest].sort(), 'non-priority suites must be alphabetical');
  });
});

check('check:secrets and check:auth run FIRST, in that order', () => {
  // A leaked credential is the one finding worth surfacing before spending ten
  // minutes on everything else.
  const extra = { 'check:secrets': 'node -e ""', 'check:auth': 'node -e ""' };
  withFixture({ extra }, (dir) => {
    const listed = run(dir, ['--list']).stdout.trim().split('\n');
    eq(listed.slice(0, 2), ['check:secrets', 'check:auth'], 'priority order');
  });
});

check('--list runs NOTHING', () => {
  // If --list executed suites, TF-04 asking the runner what it runs would run
  // the entire check suite as a side effect.
  withFixture({ extra: { 'check:boom': 'node -e "process.exit(1)"' } }, (dir) => {
    const r = run(dir, ['--list']);
    eq(r.status, 0, '--list must not fail on a failing suite');
    truthy(r.stdout.includes('check:boom'), 'it should still be listed');
    eq(/FAILED/.test(r.stdout), false, 'nothing should have been executed');
  });
});

// ── the real project ────────────────────────────────────────────────────────

check('the REAL package.json discovers the gates TF-04 requires', () => {
  const r = spawnSync('node', ['scripts/check-all.mjs', '--list'], { encoding: 'utf8' });
  eq(r.status, 0, '--list must succeed on the real project');
  const listed = r.stdout.trim().split('\n');
  for (const gate of ['check:prior-work', 'check:secrets', 'check:identity', 'check:types']) {
    truthy(listed.includes(gate), `${gate} must be discovered`);
  }
  truthy(listed.length >= 20, `expected 20+ suites, found ${listed.length}`);
});

for (const d of cleanup) rmSync(d, { recursive: true, force: true });

console.log(`\ncheck-runner: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All check-runner checks passed.');
