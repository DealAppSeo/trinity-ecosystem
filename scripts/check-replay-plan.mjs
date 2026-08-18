#!/usr/bin/env node
// scripts/check-replay-plan.mjs — the replay's resume and refusal logic.
//
// Run: npm run check:replay-plan
//
// The decisions asserted here all live on paths a happy-path run never takes:
// resume after interruption, a duplicate that must not be read as a failure, a
// missing secret that must not degrade to a null hash. The corpus is 147,704
// rows and the partial unique index makes a wrong first pass irreversible, so
// these are asserted before the run rather than discovered during it.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const ROOT = process.cwd();
const outDir = mkdtempSync(join(ROOT, '.replay-plan-check-'));
process.on('exit', () => rmSync(outDir, { recursive: true, force: true }));

let mod;
try {
  execFileSync(
    localTsc(),
    ['lib/trustshell/replay/plan.ts', '--outDir', outDir, '--rootDir', 'lib',
     '--module', 'commonjs', '--target', 'es2022', '--lib', 'es2022,dom',
     '--moduleResolution', 'node', '--strict'],
    { stdio: 'pipe' }
  );
  mod = await import(pathToFileURL(join(outDir, 'trustshell', 'replay', 'plan.js')).href);
} catch (err) {
  console.error(
    'check:replay-plan — FAILED. plan module does not compile:\n' +
      `${err.stdout ?? ''}${err.stderr ?? ''}`
  );
  process.exit(1);
}

const {
  classifyInsert, advance, clampBatch, verdictOf, summarize,
  MIN_BATCH, MAX_BATCH, DEFAULT_BATCH,
} = mod;

const counts = (minted, skipped, failed, remaining) => ({ minted, skipped, failed, remaining });

const assertions = [
  // ── duplicate is benign; everything else stops the run ────────────────────
  ['no error means minted', () => classifyInsert(null) === 'minted'],
  ['23505 is a duplicate, not a failure', () => classifyInsert({ code: '23505' }) === 'duplicate'],
  ['a permission error is fatal', () => classifyInsert({ code: '42501' }) === 'fatal'],
  ['a not-null violation is fatal', () => classifyInsert({ code: '23502' }) === 'fatal'],
  [
    'an error with NO code is fatal, never assumed benign',
    () => classifyInsert({ code: null }) === 'fatal' && classifyInsert({}) === 'fatal',
  ],
  [
    'classification is by SQLSTATE, not message text — a duplicate-sounding message with a ' +
      'different code stays fatal',
    () => classifyInsert({ code: '42501', message: 'duplicate key value violates unique' }) === 'fatal',
  ],

  // ── resume: the path a happy run never takes ──────────────────────────────
  ['the cursor advances past attempted ids', () => advance({ afterId: 0 }, [1, 2, 3]).afterId === 3],
  [
    'a fully-duplicate batch STILL advances — advancing only on mints never terminates',
    () => advance({ afterId: 10 }, [11, 12]).afterId === 12,
  ],
  ['an empty batch leaves the cursor alone', () => advance({ afterId: 7 }, []).afterId === 7],
  [
    'the cursor never moves backwards on out-of-order ids',
    () => advance({ afterId: 50 }, [10, 20]).afterId === 50,
  ],
  ['the max is taken, not the last element', () => advance({ afterId: 0 }, [5, 99, 7]).afterId === 99],

  // ── batching: the two ways this job fails to finish ───────────────────────
  ['a huge batch is clamped', () => clampBatch(1_000_000) === MAX_BATCH],
  ['a zero batch is clamped up, never to zero', () => clampBatch(0) === MIN_BATCH],
  ['a negative batch is clamped up', () => clampBatch(-5) === MIN_BATCH],
  ['NaN falls back to the default rather than to zero', () => clampBatch(NaN) === DEFAULT_BATCH],
  ['a sensible batch passes through', () => clampBatch(250) === 250],

  // ── three outcomes, never two ─────────────────────────────────────────────
  ['a complete clean run is VERIFIED', () => verdictOf(counts(100, 0, 0, 0)) === 'VERIFIED'],
  ['a fully-idempotent second pass is VERIFIED', () => verdictOf(counts(0, 100, 0, 0)) === 'VERIFIED'],
  ['any failure is FAILED', () => verdictOf(counts(100, 0, 1, 0)) === 'FAILED'],
  [
    'an interrupted run is NOT_CHECKED, not VERIFIED — it did not disprove the rows it never reached',
    () => verdictOf(counts(100, 0, 0, 50)) === 'NOT_CHECKED',
  ],
  [
    'failure outranks incompleteness',
    () => verdictOf(counts(1, 0, 1, 50)) === 'FAILED',
  ],
  [
    'the summary names every count including zeros, so a no-op run cannot read as success',
    () => {
      const s = summarize(counts(0, 147704, 0, 0));
      return /minted 0/.test(s) && /already present 147704/.test(s) && /failed 0/.test(s);
    },
  ],
  ['the summary leads with the verdict', () => summarize(counts(0, 0, 3, 0)).startsWith('FAILED')],
];

const failures = assertions.filter(([, fn]) => {
  try {
    return fn() !== true;
  } catch {
    return true;
  }
});

if (failures.length > 0) {
  console.error(
    `\ncheck:replay-plan — FAILED. ${failures.length} of ${assertions.length} assertions:\n`
  );
  for (const [name] of failures) console.error(`  ${name}`);
  process.exit(1);
}

console.log(`check:replay-plan — VERIFIED. ${assertions.length} assertions.`);
