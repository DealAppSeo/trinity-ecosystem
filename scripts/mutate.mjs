#!/usr/bin/env node
//
// mutate.mjs — the mutation gate. Break each invariant on purpose; require the
// suite that claims to protect it to turn red.
//
//   npm run mutate                    every mutation
//   npm run mutate -- --suite claims  only mutations targeting check:claims
//   npm run mutate -- --only t1-emits-backed
//   npm run mutate -- --list
//
// ============================================================================
// WHY THIS EXISTS
// ============================================================================
//
// This repo's defining failure is a system reporting success it has not earned:
// a skipped test scored as a pass, a build green over undefined references, a
// credential check green with no credential, a secret scan reporting a clean
// tree from a `git grep` that exited 128.
//
// Test suites are not exempt. On 2026-08-15 a suite reported 32 passing
// assertions including one that asserted an invariant over a branch no fixture
// could reach. Coverage would have shown that line executing happily. The only
// thing that found it was deliberately breaking the invariant and noticing that
// nothing went red.
//
// That technique worked twenty-one times in one session and then existed
// nowhere — it lived in a shell history. This file is that technique, made
// repeatable, so it survives the person who used it.
//
// ============================================================================
// FOUR OUTCOMES, BECAUSE TWO WOULD REPRODUCE THE BUG
// ============================================================================
//
//   CAUGHT    the suite went red on assertions. The invariant is protected.
//   SURVIVED  the suite stayed green. The invariant is NOT protected — this
//             fails the gate, and it is the whole point.
//   INVALID   the suite went red because the mutant does not COMPILE.
//             PRIOR-WORK-INDEX rule 4: "A mutation that does not compile is not
//             evidence." A broken-syntax mutant turns every suite red and proves
//             nothing about the assertions. Scoring it as CAUGHT is how a
//             mutation gate lies to you, and it nearly passed three times in one
//             session before being written down.
//   DRIFT     the `find` string is gone, or occurs more than once. The manifest
//             no longer describes the code. Not a pass — a stale manifest is an
//             untested invariant wearing a test's clothes.
//
// ============================================================================
// SAFETY
// ============================================================================
//
// This edits source files in place. Original bytes are held in memory, restored
// in a `finally`, on any signal, and on an uncaught throw — and the restore is
// VERIFIED byte-for-byte before the process is allowed to exit. If a restore
// ever fails the run aborts loudly with the path, because a half-restored source
// tree is worse than a failed gate.

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { MUTATIONS, SUITES } from './mutations.mjs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => {
  const i = argv.indexOf(n);
  return i === -1 ? null : (argv[i + 1] ?? null);
};

if (flag('--help')) {
  console.log(
    'usage: npm run mutate [-- --suite <name>] [-- --only <id>] [-- --list]\n\n' +
      `  ${MUTATIONS.length} mutations across ${SUITES.length} suites:\n` +
      SUITES.map((s) => `    ${s} (${MUTATIONS.filter((m) => m.suite === s).length})`).join('\n') +
      '\n'
  );
  process.exit(0);
}

if (flag('--list')) {
  for (const m of MUTATIONS) {
    console.log(`${m.id.padEnd(34)} ${m.suite.padEnd(24)} ${m.file}`);
    console.log(`  protects: ${m.protects}\n`);
  }
  process.exit(0);
}

const suiteFilter = opt('--suite');
const onlyFilter = opt('--only');
const selected = MUTATIONS.filter(
  (m) =>
    (!suiteFilter || m.suite === suiteFilter || m.suite === `check:${suiteFilter}`) &&
    (!onlyFilter || m.id === onlyFilter)
);

if (selected.length === 0) {
  console.error(`No mutations match --suite ${suiteFilter ?? '*'} --only ${onlyFilter ?? '*'}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Restore safety net
// ---------------------------------------------------------------------------

/** @type {Map<string, string>} path -> original bytes */
const originals = new Map();

function restoreAll() {
  let failed = null;
  for (const [path, bytes] of originals) {
    try {
      writeFileSync(path, bytes);
      if (readFileSync(path, 'utf8') !== bytes) failed = path;
    } catch (err) {
      failed = `${path} (${err.message})`;
    }
  }
  originals.clear();
  if (failed) {
    console.error(`\n!!! RESTORE FAILED for ${failed}`);
    console.error('!!! The source tree may be mutated. Run `git checkout -- <path>` NOW.');
    return false;
  }
  return true;
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    console.error(`\nInterrupted (${sig}) — restoring sources…`);
    const okRestore = restoreAll();
    process.exit(okRestore ? 130 : 1);
  });
}
process.on('uncaughtException', (err) => {
  console.error(`\nUncaught: ${err?.stack ?? err}`);
  restoreAll();
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Running a suite
// ---------------------------------------------------------------------------

/**
 * A mutant that fails to COMPILE turns every suite red and proves nothing.
 * These are the signatures each check script emits on that path, plus node's
 * and tsc's own. Matching any of them makes the result INVALID, not CAUGHT.
 */
const COMPILE_FAILURE = [
  /does not compile/i,
  /SyntaxError/,
  /error TS\d+/,
  /ERR_MODULE_NOT_FOUND/,
  /Cannot find (module|name)/,
  /Unexpected (end of input|token|identifier)/,
];

function runSuite(suite) {
  const r = spawnSync('npm', ['run', '--silent', suite], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10 * 60 * 1000,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  return {
    code: r.status ?? 1,
    out,
    compileFailure: COMPILE_FAILURE.some((re) => re.test(out)),
    timedOut: r.error?.code === 'ETIMEDOUT',
  };
}

// ---------------------------------------------------------------------------
// Baseline — every suite must be GREEN before any mutation means anything
// ---------------------------------------------------------------------------

const neededSuites = [...new Set(selected.map((m) => m.suite))].sort();

console.log(`mutation gate — ${selected.length} mutation(s), ${neededSuites.length} suite(s)\n`);
console.log('baseline (a mutation against a red suite proves nothing):');

const baselineBroken = [];
for (const suite of neededSuites) {
  const r = runSuite(suite);
  console.log(`  ${r.code === 0 ? '✓' : '✗'} ${suite}${r.code === 0 ? '' : `  exit ${r.code}`}`);
  if (r.code !== 0) baselineBroken.push({ suite, out: r.out });
}

if (baselineBroken.length > 0) {
  console.error('\nFAILED — baseline is not green. Fix these before mutating:');
  for (const b of baselineBroken) {
    console.error(`\n--- ${b.suite} ---\n${b.out.trim().split('\n').slice(-12).join('\n')}`);
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Mutate
// ---------------------------------------------------------------------------

const results = [];

try {
  for (const m of selected) {
    process.stdout.write(`\n${m.id}\n  ${m.suite} · ${m.file}\n  `);

    let source;
    try {
      source = readFileSync(m.file, 'utf8');
    } catch (err) {
      results.push({ ...m, outcome: 'DRIFT', detail: `cannot read ${m.file}: ${err.message}` });
      console.log('DRIFT — file missing');
      continue;
    }

    // Exactly once. Zero means the manifest is stale; more than one means the
    // mutation would land somewhere nobody chose, and "it went red" would not
    // tell us which site did it.
    const occurrences = source.split(m.find).length - 1;
    if (occurrences !== 1) {
      results.push({
        ...m,
        outcome: 'DRIFT',
        detail: `find string occurs ${occurrences} times, expected exactly 1`,
      });
      console.log(`DRIFT — find string occurs ${occurrences}×, expected 1`);
      continue;
    }

    originals.set(m.file, source);
    writeFileSync(m.file, source.replace(m.find, m.replace));

    const r = runSuite(m.suite);

    // Restore immediately — before interpreting, so an interpretation bug
    // cannot leave the tree dirty.
    writeFileSync(m.file, source);
    if (readFileSync(m.file, 'utf8') !== source) {
      console.error(`\n!!! RESTORE FAILED for ${m.file} — aborting.`);
      process.exit(1);
    }
    originals.delete(m.file);

    let outcome;
    let detail = '';
    if (r.timedOut) {
      outcome = 'INVALID';
      detail = 'suite timed out';
    } else if (r.code === 0) {
      outcome = 'SURVIVED';
      detail = 'suite stayed green — this invariant is not protected';
    } else if (r.compileFailure) {
      outcome = 'INVALID';
      detail = 'mutant does not compile — not evidence (PRIOR-WORK-INDEX rule 4)';
    } else {
      outcome = 'CAUGHT';
      const line = r.out.split('\n').find((l) => /FAILED|✗/.test(l)) ?? '';
      detail = line.trim().slice(0, 100);
    }

    results.push({ ...m, outcome, detail });
    console.log(`${outcome}${detail ? ` — ${detail}` : ''}`);
  }
} finally {
  restoreAll();
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const by = (o) => results.filter((r) => r.outcome === o);
const caught = by('CAUGHT');
const survived = by('SURVIVED');
const invalid = by('INVALID');
const drift = by('DRIFT');

console.log('\n' + '─'.repeat(70));
console.log(
  `CAUGHT ${caught.length}  ·  SURVIVED ${survived.length}  ·  ` +
    `INVALID ${invalid.length}  ·  DRIFT ${drift.length}`
);

for (const r of survived) {
  console.log(`\n✗ SURVIVED  ${r.id}`);
  console.log(`  ${r.suite} did not go red when this broke:`);
  console.log(`  ${r.file}`);
  console.log(`  protects: ${r.protects}`);
  console.log('  → three causes, and they need telling apart:');
  console.log('      1. no assertion covers this property');
  console.log('      2. an assertion exists but is asserted over a situation no');
  console.log('         fixture reaches — vacuous, and invisible from a green run');
  console.log('      3. the MUTATION does not actually violate the rule it names,');
  console.log('         in which case this manifest entry is the defect');
  console.log('    Check 3 first: it is the cheapest to rule out, and a weak');
  console.log('    mutation looks exactly like an unprotected invariant.');
}

for (const r of drift) {
  console.log(`\n⚠ DRIFT     ${r.id} — ${r.detail}`);
  console.log(`  ${r.file}`);
  console.log('  → the code moved and the manifest did not. Re-point the find');
  console.log('    string, or delete the entry if the invariant is genuinely gone.');
}

for (const r of invalid) {
  console.log(`\n⚠ INVALID   ${r.id} — ${r.detail}`);
  console.log('  → the mutant is not a valid program, so its red says nothing.');
  console.log('    Rewrite the replacement so it compiles and still breaks the rule.');
}

// SURVIVED and DRIFT both fail. INVALID fails too: an entry that cannot produce
// evidence is an entry pretending to. Three ways to be useless, one exit code.
const bad = survived.length + drift.length + invalid.length;
if (bad > 0) {
  console.log(`\nFAILED — ${bad} mutation(s) produced no evidence.`);
  process.exit(1);
}

console.log(`\nVERIFIED — all ${caught.length} mutations caught by the suite that claims them.`);
