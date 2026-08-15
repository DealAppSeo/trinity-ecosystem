#!/usr/bin/env node
// scripts/staged-judge-test.mjs — cheap tiers, and the rule that keeps them honest.
//
// Run: node scripts/staged-judge-test.mjs
//
// The assertions that matter are about the ASYMMETRY:
//
//   * 'FAILED IS FINAL' — a cheap tier that found a concrete defect ends it, and
//     the expensive tier is never called. Escalating past a failure is shopping
//     for a better answer.
//   * 'VERIFIED ESCALATES' — a cheap tier may condemn but may not certify. This
//     is the same rule `requireIndependentEvaluation` enforces in the kernel,
//     and it is the one that stops staging from manufacturing cheap greens.
//   * 'an outage cannot condemn' — a throwing tier escalates as NOT_CHECKED.
//     A provider being down is not a defect report.
//   * 'decisions record which tier decided' — the measurement surface. Without
//     it, whether staging pays is unknowable.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.staged-judge-check-'));
let did, wc, ce, sj;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/identity/did.ts',
      'lib/trustshell/identity/work-contract.ts',
      'lib/trustshell/identity/contracted-evaluator.ts',
      'lib/trustshell/identity/staged-judge.ts',
      '--outDir', outDir,
      // Pinned — see work-contract-test.mjs. Fifth occurrence of the hazard.
      '--rootDir', 'lib',
      '--module', 'commonjs',
      '--target', 'es2022',
      '--lib', 'es2022,dom',
      '--moduleResolution', 'node',
      '--esModuleInterop',
      '--strict',
    ],
    { stdio: 'pipe' }
  );
  const base = join(outDir, 'trustshell', 'identity');
  did = await import(pathToFileURL(join(base, 'did.js')).href);
  wc = await import(pathToFileURL(join(base, 'work-contract.js')).href);
  ce = await import(pathToFileURL(join(base, 'contracted-evaluator.js')).href);
  sj = await import(pathToFileURL(join(base, 'staged-judge.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('staged-judge compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const { generateKeyPair } = did;
const { proposeContract, countersignContract, CONTRACT_DOMAIN } = wc;
const { createContractedEvaluator } = ce;
const { createStagedJudge } = sj;

let passed = 0;
const failures = [];
const check = async (name, fn) => {
  try { await fn(); passed += 1; } catch (e) { failures.push(`${name}\n    ${e.message}`); }
};
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
};
const match = (s, re, what) => { if (!re.test(String(s))) throw new Error(`${what}: ${JSON.stringify(String(s))} !~ ${re}`); };
const throws = (fn, re, what) => {
  try { fn(); } catch (e) { if (re.test(e.message)) return; throw new Error(`${what}: threw ${JSON.stringify(e.message)}, wanted ${re}`); }
  throw new Error(`${what}: did not throw`);
};

// ── fixtures ────────────────────────────────────────────────────────────────

const REQUEST = {
  criterion: { id: 'tests', statement: 'the suite passes', minScore: 0.9 },
  deliverable: 'a working thing',
  evidence: 'turn 1 progress=true',
};

/** A tier that answers the same way every time and counts its calls. */
const tier = (name, opinion) => {
  const t = {
    name,
    calls: 0,
    judge: {
      async judge() {
        t.calls += 1;
        if (opinion instanceof Error) throw opinion;
        return opinion;
      },
    },
  };
  return t;
};

// ── the asymmetry ───────────────────────────────────────────────────────────

await check('FAILED IS FINAL — the expensive tier is never called', async () => {
  const cheap = tier('mechanical', { outcome: 'FAILED', detail: 'the suite is red' });
  const dear = tier('panel', { outcome: 'VERIFIED', score: 1, detail: 'looks fine to me' });
  const staged = createStagedJudge({ tiers: [cheap, dear] });

  const opinion = await staged.judge.judge(REQUEST);
  eq(opinion.outcome, 'FAILED', 'a concrete defect must stand');
  eq(dear.calls, 0, 'ESCALATING PAST A FAILURE IS SHOPPING FOR A BETTER ANSWER');
  match(opinion.detail, /\[mechanical\]/, 'the deciding tier must be named in the detail');
  eq(staged.decisions[0].decidedBy, 'mechanical', 'and recorded');
  eq(staged.decisions[0].escalatedPast, [], 'with nothing escalated past');
});

await check('VERIFIED ESCALATES — a cheap tier may condemn but may not certify', async () => {
  const cheap = tier('mechanical', { outcome: 'VERIFIED', score: 1, detail: 'nothing looked wrong' });
  const dear = tier('panel', { outcome: 'FAILED', detail: 'the feature is stubbed' });
  const staged = createStagedJudge({ tiers: [cheap, dear] });

  const opinion = await staged.judge.judge(REQUEST);
  eq(dear.calls, 1, 'the expensive tier must be consulted before certifying');
  eq(opinion.outcome, 'FAILED', "and its answer stands over the cheap tier's pass");
  eq(staged.decisions[0].decidedBy, 'panel', 'the panel decided');
  eq(staged.decisions[0].escalatedPast, ['mechanical'], 'having escalated past the cheap tier');
});

await check('NOT_CHECKED escalates', async () => {
  const cheap = tier('mechanical', { outcome: 'NOT_CHECKED', detail: 'no test command configured' });
  const dear = tier('panel', { outcome: 'VERIFIED', score: 0.95, detail: 'read it, it holds' });
  const staged = createStagedJudge({ tiers: [cheap, dear] });

  const opinion = await staged.judge.judge(REQUEST);
  eq(opinion.outcome, 'VERIFIED', "the last tier's answer stands");
  eq(dear.calls, 1, 'an undecided cheap tier must escalate');
});

await check("the last tier's VERIFIED stands — staging must not make certifying impossible", async () => {
  const only = tier('panel', { outcome: 'VERIFIED', score: 0.99, detail: 'judged' });
  const staged = createStagedJudge({ tiers: [only] });
  const opinion = await staged.judge.judge(REQUEST);
  eq(opinion.outcome, 'VERIFIED', 'a single-tier staged judge is just that judge');
  eq(staged.decisions[0].decidedBy, 'panel', 'and it is recorded as the decider');
});

await check('the score survives escalation — staging must not discard the judgement', async () => {
  const cheap = tier('mechanical', { outcome: 'NOT_CHECKED', detail: 'cannot tell' });
  const dear = tier('panel', { outcome: 'VERIFIED', score: 0.93, detail: 'judged' });
  const staged = createStagedJudge({ tiers: [cheap, dear] });
  const opinion = await staged.judge.judge(REQUEST);
  eq(opinion.score, 0.93, 'a dropped score would silently fail every minScore floor');
});

// ── outages ─────────────────────────────────────────────────────────────────

await check('AN OUTAGE CANNOT CONDEMN — a throwing tier escalates', async () => {
  const cheap = tier('mechanical', new Error('ECONNREFUSED'));
  const dear = tier('panel', { outcome: 'VERIFIED', score: 0.95, detail: 'judged' });
  const staged = createStagedJudge({ tiers: [cheap, dear] });

  const opinion = await staged.judge.judge(REQUEST);
  eq(opinion.outcome, 'VERIFIED', 'a provider being down is not a defect report');
  match(opinion.detail, /ECONNREFUSED/, 'but the outage must remain visible');
});

await check('every tier down is NOT_CHECKED, never FAILED', async () => {
  const cheap = tier('mechanical', new Error('ECONNREFUSED'));
  const dear = tier('panel', new Error('503'));
  const staged = createStagedJudge({ tiers: [cheap, dear] });

  const opinion = await staged.judge.judge(REQUEST);
  eq(opinion.outcome, 'NOT_CHECKED', 'we could not look, which is not the same as looking and finding it wrong');
  match(opinion.detail, /ECONNREFUSED.*503|503/s, 'both outages must be named');
});

await check('DECISIONS ACCUMULATE ACROSS CRITERIA, in call order', async () => {
  // Found by mutation testing: clearing `decisions` on every call left the suite
  // green, because every other test judged exactly one criterion and then read
  // index 0. The record is the whole measurement surface — how often the cheap
  // tier ends it is unknowable if it only ever holds the last answer.
  const cheap = tier('mechanical', { outcome: 'FAILED', detail: 'red' });
  const staged = createStagedJudge({ tiers: [cheap, tier('panel', { outcome: 'VERIFIED', detail: 'x' })] });

  await staged.judge.judge({ ...REQUEST, criterion: { id: 'tests', statement: 'a' } });
  await staged.judge.judge({ ...REQUEST, criterion: { id: 'docs', statement: 'b' } });

  eq(staged.decisions.length, 2, 'both decisions must be retained');
  eq(staged.decisions.map((d) => d.criterionId), ['tests', 'docs'], 'in call order');
  eq(staged.decisions.map((d) => d.decidedBy), ['mechanical', 'mechanical'], 'naming the tier each time');
});

// ── configuration refusals ──────────────────────────────────────────────────

await check('a staged judge with no tiers is refused', () => {
  throws(
    () => createStagedJudge({ tiers: [] }),
    /at least one tier/,
    'answering NOT_CHECKED while looking configured is the failure mode'
  );
});

await check('duplicate tier names are refused', () => {
  throws(
    () => createStagedJudge({ tiers: [tier('same', { outcome: 'VERIFIED', detail: '' }), tier('same', { outcome: 'VERIFIED', detail: '' })] }),
    /share a name/,
    'tier names are the measurement key'
  );
});

// ── the seam it exists to plug into ─────────────────────────────────────────

await check('A STAGED JUDGE DRIVES A REAL CONTRACTED EVALUATOR', async () => {
  // The point of matching the `Judge` port: this composes with the evaluator
  // that is already tested end-to-end against the kernel, with no adapter.
  const doer = await generateKeyPair();
  const checker = await generateKeyPair();
  const criteria = [{ id: 'tests', statement: 'the suite passes', minScore: 0.9 }];
  const unsigned = {
    version: CONTRACT_DOMAIN,
    taskId: 'task-1',
    deliverable: 'a working thing',
    criteria,
    doerDid: doer.did,
    checkerDid: checker.did,
    proposedAt: '2026-08-15T00:00:00.000Z',
  };
  const { doerSignature } = await proposeContract({ unsigned, doerKey: doer.privateKey });
  const contract = await countersignContract({ unsigned, doerSignature, checkerKey: checker.privateKey });

  const cheap = tier('mechanical', { outcome: 'FAILED', detail: 'the suite is red' });
  const dear = tier('panel', { outcome: 'VERIFIED', score: 1, detail: 'looks fine' });
  const staged = createStagedJudge({ tiers: [cheap, dear] });

  const evaluator = createContractedEvaluator({
    contract,
    checkerKey: checker.privateKey,
    judge: staged.judge,
    now: () => new Date('2026-08-15T02:00:00.000Z'),
  });

  const result = await evaluator.evaluate({
    taskId: 'task-1',
    criteria,
    turns: [{ turn: 1, madeProgress: true }],
    doerDid: doer.did,
  });

  eq(result.verdicts[0].outcome, 'FAILED', 'the cheap tier must be able to fail a real contracted run');
  eq(dear.calls, 0, 'and the expensive tier must not have been paid for');
  eq(staged.decisions.length, 1, 'one criterion, one decision');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\nstaged-judge: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All staged-judge checks passed.');
