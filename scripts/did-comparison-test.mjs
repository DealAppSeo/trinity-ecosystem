#!/usr/bin/env node
// scripts/did-comparison-test.mjs — the one string comparison that is a
// constitutional invariant, and the two implementations of it.
//
// Run: node scripts/did-comparison-test.mjs
//
// WHY THIS FILE EXISTS. Every enforcement of `checker_must_not_be_doer` is a
// DID comparison. It was written inline nine times, and mutation testing found
// the SAME one-character bypass — a DID with a trailing space is not equal to
// itself — in four of them, on four separate days. Extracting `sameDid` /
// `compareDids` fixes those nine.
//
// It cannot fix the tenth. `lib/trustshell/harness/loop.ts` may not import
// anything outside its own directory (scripts/harness-portability-check.mjs
// enforces it), which is the property that lets the kernel ship as a standalone
// package. So the kernel keeps its own copy, and this repo's own doctrine says
// what that means: "a second copy of an authorization rule is a second thing to
// get wrong, and the two copies disagree silently."
//
// The honest resolution is not to pretend there is one copy. It is to make the
// two DISAGREE LOUDLY. The conformance section below drives the real kernel
// through `runAgentLoop` over a corpus of adversarial pairs and requires its
// verdict to match `compareDids` on every one. If either implementation drifts,
// this goes red and names the pair.
//
// The assertions that carry the file:
//
//   * 'TWO ABSENT DIDs ARE NEITHER SAME NOR DIFFERENT' — `undefined ===
//     undefined` is true, so a naive check reads "neither party identified
//     itself" as "they are the same identity". Flipping to `!==` certifies
//     independence on no evidence. Both are wrong; hence three outcomes.
//   * 'CASE IS NOT FOLDED' — did:key is base58btc and case-sensitive. Folding
//     would merge two distinct keys, which is the opposite of this module's job.
//   * 'the kernel and the helper agree on every adversarial pair' — the
//     conformance check standing in for an import that cannot exist.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';
import { compileHarness } from './lib/harness-compile.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.did-compare-check-'));
let did;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/identity/did.ts',
      '--outDir', outDir,
      '--rootDir', 'lib',          // pinned; see work-contract-test.mjs
      '--module', 'commonjs', '--target', 'es2022',
      '--lib', 'es2022,dom', '--moduleResolution', 'node',
      '--esModuleInterop', '--strict',
    ],
    { stdio: 'pipe' }
  );
  did = await import(pathToFileURL(join(outDir, 'trustshell', 'identity', 'did.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('did compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const { compareDids, sameDid } = did;
const { load } = compileHarness();
const { runAgentLoop } = await load('loop');
const { ManualClock } = await load('types');

let passed = 0;
const failures = [];
const check = async (name, fn) => {
  try { await fn(); passed += 1; } catch (e) { failures.push(`${name}\n    ${e.message}`); }
};
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};

const A = 'did:key:z6MkfrQmT1nyaSyDpBrDHqTyaS9EXAMPLEaaaaaaaaaaaaa';
const B = 'did:key:z6MkfrQmT1nyaSyDpBrDHqTyaS9EXAMPLEbbbbbbbbbbbbb';

// ── the corpus, shared by both sections ─────────────────────────────────────
//
// One list, used to test the helper AND to cross-check the kernel. Two lists
// would drift, and the drift would land in exactly the pairs nobody thought to
// duplicate.

const CORPUS = [
  { a: A,             b: A,             want: 'same',          why: 'identical' },
  { a: A,             b: ` ${A}`,       want: 'same',          why: 'leading space' },
  { a: A,             b: `${A} `,       want: 'same',          why: 'trailing space — the bypass found four times' },
  { a: ` ${A} `,      b: `\t${A}\n`,    want: 'same',          why: 'assorted surrounding whitespace' },
  { a: A,             b: B,             want: 'different',     why: 'genuinely different keys' },
  { a: A,             b: A.toLowerCase(), want: 'different',   why: 'case differs — base58btc is case-sensitive' },
  { a: A,             b: `${A}x`,       want: 'different',     why: 'suffix' },
  { a: A,             b: A.replace(':', ' '), want: 'different', why: 'internal whitespace is not trimmed away' },
  { a: undefined,     b: undefined,     want: 'indeterminate', why: 'NEITHER party identified itself' },
  { a: A,             b: undefined,     want: 'indeterminate', why: 'one side absent' },
  { a: undefined,     b: A,             want: 'indeterminate', why: 'the other side absent' },
  { a: '',            b: A,             want: 'indeterminate', why: 'empty string is absent, not a value' },
  { a: '   ',         b: A,             want: 'indeterminate', why: 'whitespace-only is absent' },
  { a: '',            b: '',            want: 'indeterminate', why: 'two empties are not "the same identity"' },
];

// ── the helper ──────────────────────────────────────────────────────────────

await check('compareDids agrees with the corpus on every pair', () => {
  for (const { a, b, want, why } of CORPUS) {
    eq(compareDids(a, b), want, `${why}: compareDids(${JSON.stringify(a)}, ${JSON.stringify(b)})`);
  }
});

await check('TWO ABSENT DIDs ARE NEITHER SAME NOR DIFFERENT', () => {
  // `undefined === undefined` is true, so the naive check reads "neither party
  // identified itself" as "they are the same identity" — a spurious
  // constitutional violation that would refuse legitimate work. `!==` inverts
  // it into certified independence on no evidence. Both are wrong.
  eq(compareDids(undefined, undefined), 'indeterminate', 'two absent DIDs');
  eq(sameDid(undefined, undefined), false, 'and sameDid must not say yes');
});

await check('CASE IS NOT FOLDED — two cases are two keys', () => {
  // did:key is base58btc. Folding case would merge distinct identities, which
  // is the exact opposite of what this comparison is for.
  eq(compareDids(A, A.toLowerCase()), 'different', 'case must distinguish');
  eq(sameDid(A, A.toUpperCase()), false, 'in both directions');
});

await check('sameDid is FALSE on absent — the safe polarity for a refusal', () => {
  // Every caller asks it in order to refuse something. Returning true on absent
  // would refuse legitimate work.
  eq(sameDid(A, undefined), false, 'one absent');
  eq(sameDid(undefined, undefined), false, 'both absent');
  eq(sameDid(A, ` ${A} `), true, 'but padding must still be caught');
});

await check('!sameDid IS NOT "different" — the trap the two functions exist to separate', () => {
  // Written as an assertion because it is the mistake the API is shaped to
  // prevent, and a reader who does not see it demonstrated may well make it.
  const a = undefined, b = undefined;
  eq(!sameDid(a, b), true, 'the wrong expression evaluates to "different"...');
  eq(compareDids(a, b), 'indeterminate', '...while the truth is that we cannot tell');
});

await check('null is handled like undefined, not like a value', () => {
  // JSON round-trips turn absent fields into null, and this comparison runs on
  // the far side of exactly that boundary.
  eq(compareDids(null, A), 'indeterminate', 'null is absent');
  eq(compareDids(null, null), 'indeterminate', 'two nulls are not one identity');
});

await check('a non-string is absent, not coerced', () => {
  // The union is erased at every boundary these DIDs cross. `{}` coerced to a
  // string would compare equal to another `{}`.
  eq(compareDids({}, {}), 'indeterminate', 'objects must not compare equal');
  eq(compareDids(42, 42), 'indeterminate', 'numbers must not compare equal');
});

// ── conformance with the kernel's independent copy ──────────────────────────

/** Drive the real kernel and read back the independence verdict it computed. */
const kernelIndependence = async (doerDid, evaluatorDid) => {
  const result = await runAgentLoop({
    taskId: 't',
    policy: {
      maxIterations: 2, noProgressAbortAfter: 2, toolsAllowed: [],
      irreversibleRequiresHuman: [], untrustedOutputSources: [],
      maxWritesPerSession: 0, toolEffects: {},
    },
    model: { async turn() { return { calls: [], handoff: { outcome: 'VERIFIED', summary: 'x', evidence: [] } }; } },
    tools: { async call() { return { content: 'ok' }; } },
    authorizer: { async authorize() { return { allowed: true, reason: 'test' }; } },
    evaluator: {
      async evaluate() {
        return {
          verdicts: [{ criterionId: 'c', outcome: 'VERIFIED', detail: 'ok' }],
          evaluatorDid,
          detail: 'x',
        };
      },
    },
    criteria: [{ id: 'c', statement: 'holds' }],
    doerDid,
    clock: new ManualClock(1000),
  });
  return result.evaluation.independent;
};

await check('THE KERNEL AND THE HELPER AGREE ON EVERY ADVERSARIAL PAIR', async () => {
  // The conformance check standing in for an import that cannot exist. The
  // kernel may not reach outside lib/trustshell/harness/, so it carries its own
  // comparison; if the two drift, this names the pair rather than letting one
  // of them quietly become wrong.
  //
  //   kernel `independent`   helper compareDids
  //   true                   'different'
  //   false                  'same'
  //   null                   'indeterminate'
  const asComparison = { true: 'different', false: 'same', null: 'indeterminate' };
  for (const { a, b, want, why } of CORPUS) {
    const kernel = await kernelIndependence(a, b);
    eq(asComparison[String(kernel)], want, `${why}: kernel said independent=${JSON.stringify(kernel)}`);
    eq(asComparison[String(kernel)], compareDids(a, b), `${why}: kernel and helper disagree`);
  }
});

await check('the kernel CAPS the run whenever independence is not established', async () => {
  // The behavioural consequence, asserted separately: agreeing on the
  // classification is worth nothing if the classification stops driving the
  // outcome.
  for (const { a, b, want, why } of CORPUS) {
    const result = await runAgentLoop({
      taskId: 't',
      policy: {
        maxIterations: 2, noProgressAbortAfter: 2, toolsAllowed: [],
        irreversibleRequiresHuman: [], untrustedOutputSources: [],
        maxWritesPerSession: 0, toolEffects: {},
      },
      model: { async turn() { return { calls: [], handoff: { outcome: 'VERIFIED', summary: 'x', evidence: [] } }; } },
      tools: { async call() { return { content: 'ok' }; } },
      authorizer: { async authorize() { return { allowed: true, reason: 'test' }; } },
      evaluator: {
        async evaluate() {
          return { verdicts: [{ criterionId: 'c', outcome: 'VERIFIED', detail: 'ok' }], evaluatorDid: b, detail: 'x' };
        },
      },
      criteria: [{ id: 'c', statement: 'holds' }],
      doerDid: a,
      clock: new ManualClock(1000),
    });
    const expected = want === 'different' ? 'VERIFIED' : 'NOT_CHECKED';
    eq(result.outcome, expected, `${why}: a ${want} pair must yield ${expected}`);
  }
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\ndid-comparison: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All did-comparison checks passed.');
