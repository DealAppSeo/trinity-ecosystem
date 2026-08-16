#!/usr/bin/env node
// scripts/bft-judge-test.mjs — the BFT panel behind the Judge port.
//
// Run: node scripts/bft-judge-test.mjs
//
// The assertion that carries this file is the one that only exists because the
// engine was read instead of assumed:
//
//   * 'THE PYTHAGOREAN VETO IS NOT_CHECKED, NOT VERIFIED' — the panel vetoes
//     when agreement is TOO high (small gap + high belief = coordinated bias).
//     An adapter written on the assumption "high agreement = confident" maps
//     that straight to VERIFIED, which is the exact inversion of what the panel
//     meant. Its risk model is non-monotonic in agreement, and both tails are
//     risk.
//   * 'the veto is not overridable by leaving a threshold unset' — the operator
//     knob covers the wide-spread tail only.
//   * 'no consensus with high disbelief is FAILED, not NOT_CHECKED' — the panel
//     did not fail to decide, it decided against. Collapsing it discards the
//     one negative verdict the panel is confident about.
//   * 'TRUNCATED EVIDENCE WEAKENS THE OPINION' — a judge that read half the run
//     has not judged the run.
//   * 'the single-model judge reports NO disagreement' — recording 0 would make
//     the cheapest judge look like the most confident one, biasing the very A/B
//     the port exists to enable.
//
// The panel is stubbed. This tests the ADAPTER's reading of the engine's
// contract, not the engine — which reaches three providers and a database.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.bft-judge-check-'));
let bj;
try {
  // The adapter imports the Judge TYPE via the `@/` alias. Types are erased, so
  // compiling the single file with the alias mapped is enough and avoids
  // dragging BFTEngine (and Supabase) into this compile.
  const tsconfigPath = join(outDir, 'tsconfig.json');
  writeFileSync(tsconfigPath, JSON.stringify({
    compilerOptions: {
      outDir, rootDir: process.cwd(), module: 'commonjs', target: 'es2022',
      lib: ['es2022', 'dom'], moduleResolution: 'node', esModuleInterop: true,
      strict: true, skipLibCheck: true,
      baseUrl: process.cwd(), paths: { '@/*': ['./*'] },
    },
    files: [join(process.cwd(), 'lib/trust/bft-judge.ts')],
  }));
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });
  bj = await import(pathToFileURL(join(outDir, 'lib/trust/bft-judge.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('bft-judge compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const { createBftJudge, createSingleModelJudge, claimFor } = bj;

let passed = 0;
const failures = [];
const check = async (name, fn) => {
  try { await fn(); passed += 1; } catch (e) { failures.push(`${name}\n    ${e.message}`); }
};
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const truthy = (v, what) => { if (!v) throw new Error(`${what}: expected truthy, got ${JSON.stringify(v)}`); };
const match = (s, re, what) => { if (!re.test(String(s))) throw new Error(`${what}: ${JSON.stringify(String(s))} !~ ${re}`); };

// ── fixtures ────────────────────────────────────────────────────────────────

const REQUEST = {
  criterion: { id: 'tests', statement: 'the suite passes', minScore: 0.9 },
  deliverable: 'a working thing',
  evidence: 'turn 1 progress=true\n  ok run_tests: 42 passed',
};

/** A panel returning a fixed result, recording what it was asked. */
const stubPanel = (result) => ({
  seen: [],
  async vote(claim, context) {
    this.seen.push({ claim, context });
    return {
      consensus_reached: false, consensus_score: 0.5, threshold: 0.618,
      pythagorean_veto_fired: false, comma_gap: 0.2, hitl_required: false,
      dissenting_providers: [], votes: [],
      ...result,
    };
  },
});

const judgeWith = (result, opts) => createBftJudge(stubPanel(result), opts);

// ── the claim ───────────────────────────────────────────────────────────────

await check('the claim carries the criterion VERBATIM from the contract', async () => {
  // The panel votes belief/disbelief on a claim. Anything vaguer than the agreed
  // criterion would have it judging something nobody signed.
  const claim = claimFor(REQUEST);
  match(claim, /the suite passes/, 'the statement must appear');
  match(claim, /'tests'/, 'and the criterion id');
  match(claim, /at least 0\.9/, 'and the agreed floor');
  match(claim, /a working thing/, 'and the deliverable');
});

await check('a criterion with no floor does not invent one', async () => {
  const claim = claimFor({ ...REQUEST, criterion: { id: 'docs', statement: 'documented' } });
  eq(/standard of at least/.test(claim), false, 'no floor must be asserted where none was agreed');
});

await check('the evidence is passed as CONTEXT, not folded into the claim', async () => {
  const panel = stubPanel({ consensus_reached: true, consensus_score: 0.9 });
  await createBftJudge(panel).judge(REQUEST);
  eq(panel.seen[0].context, REQUEST.evidence, 'evidence must arrive as context');
  eq(panel.seen[0].claim.includes('42 passed'), false, 'and must not be baked into the claim');
});

// ── the non-monotonic risk model ────────────────────────────────────────────

await check('THE PYTHAGOREAN VETO IS NOT_CHECKED, NOT VERIFIED', async () => {
  // The assertion that only exists because the engine was read. The panel
  // vetoes when agreement is TOO high — a small belief gap with high average
  // belief is read as coordinated bias across three model families, not as
  // truth. An adapter assuming "high agreement = confident" inverts it.
  const r = await judgeWith({
    pythagorean_veto_fired: true, comma_gap: 0.01,
    consensus_score: 0.95, hitl_required: true,
  }).judge(REQUEST);
  eq(r.outcome, 'NOT_CHECKED', 'a veto must never read as verified');
  match(r.detail, /coordinated bias/, 'and the reason must say why agreement was the warning');
  eq(r.disagreement, 0.01, 'the tiny gap must still be reported honestly');
});

await check('the veto is NOT overridable by leaving a threshold unset', async () => {
  // The operator's maxDisagreement knob covers the wide-spread tail. An
  // operator who never set it must not thereby have opted out of the panel's
  // own call on the other tail.
  const r = await judgeWith({
    pythagorean_veto_fired: true, comma_gap: 0.0,
    consensus_reached: true, consensus_score: 0.99, hitl_required: false,
  }).judge(REQUEST);
  eq(r.outcome, 'NOT_CHECKED', 'the veto must win over consensus_reached');
});

await check('a human referral is NOT_CHECKED — the panel did not decide', async () => {
  const r = await judgeWith({ hitl_required: true, consensus_score: 0.4 }).judge(REQUEST);
  eq(r.outcome, 'NOT_CHECKED', 'a referral establishes nothing');
  match(r.detail, /referred this to a human/, 'reason');
});

await check('NO CONSENSUS WITH HIGH DISBELIEF IS FAILED, not NOT_CHECKED', async () => {
  // hitl_required is false here only when weighted disbelief cleared the
  // threshold: the panel did not fail to decide, it decided against.
  // Collapsing that into NOT_CHECKED discards the one negative verdict it is
  // confident about.
  const r = await judgeWith({
    consensus_reached: false, hitl_required: false,
    consensus_score: 0.1, dissenting_providers: ['groq', 'deepseek'],
  }).judge(REQUEST);
  eq(r.outcome, 'FAILED', 'an affirmative disbelief must be FAILED');
  match(r.detail, /affirmatively disbelieved/, 'reason');
  match(r.detail, /groq, deepseek/, 'and the dissenters must be named');
});

await check('consensus reached is VERIFIED, and reports the spread', async () => {
  const r = await judgeWith({
    consensus_reached: true, consensus_score: 0.82, comma_gap: 0.31,
  }).judge(REQUEST);
  eq(r.outcome, 'VERIFIED', 'consensus must verify');
  eq(r.score, 0.82, 'the score is the panel score');
  eq(r.disagreement, 0.31, "and comma_gap is reported as the panel's own metric");
});

// ── evidence ────────────────────────────────────────────────────────────────

await check('TRUNCATED EVIDENCE WEAKENS THE OPINION even at full consensus', async () => {
  // A confident answer over a partial record is this repo's defect wearing a
  // context window.
  const long = { ...REQUEST, evidence: 'x'.repeat(500) };
  const r = await judgeWith({ consensus_reached: true, consensus_score: 0.95 }, { maxEvidenceChars: 100 })
    .judge(long);
  eq(r.outcome, 'NOT_CHECKED', 'a judge that read half the run has not judged the run');
  match(r.detail, /first 100 characters/, 'the truncation must be named, not silent');
});

await check('truncation is only applied when a cap is set', async () => {
  const long = { ...REQUEST, evidence: 'x'.repeat(500) };
  const panel = stubPanel({ consensus_reached: true, consensus_score: 0.95 });
  const r = await createBftJudge(panel).judge(long);
  eq(r.outcome, 'VERIFIED', 'no cap means no truncation');
  eq(panel.seen[0].context.length, 500, 'and the full evidence must reach the panel');
});

await check('evidence exactly at the cap is NOT truncated', async () => {
  // The boundary, in the direction that matters: `>` vs `>=` here decides
  // whether a run that exactly fits is silently downgraded.
  const exact = { ...REQUEST, evidence: 'x'.repeat(100) };
  const r = await judgeWith({ consensus_reached: true, consensus_score: 0.9 }, { maxEvidenceChars: 100 })
    .judge(exact);
  eq(r.outcome, 'VERIFIED', 'evidence that exactly fits must not be treated as truncated');
});

// ── malformed panel output ──────────────────────────────────────────────────

await check('A NaN SCORE DOES NOT SILENTLY ROUTE TO FAILED', async () => {
  // A NaN reaching a comparison makes every branch false. The panel's numbers
  // cross a boundary where the compiler's `number` is a claim about a caller
  // that may not be compiled.
  const r = await judgeWith({ consensus_reached: true, consensus_score: NaN, comma_gap: NaN }).judge(REQUEST);
  eq(r.outcome, 'VERIFIED', 'the outcome comes from consensus_reached, not the number');
  eq(r.score, 0, 'a NaN score must be clamped, not propagated');
  eq(r.disagreement, 0, 'and so must a NaN gap');
});

await check('out-of-range panel numbers are clamped into [0,1]', async () => {
  const r = await judgeWith({ consensus_reached: true, consensus_score: 1.7, comma_gap: -0.3 }).judge(REQUEST);
  eq(r.score, 1, 'above range clamps to 1');
  eq(r.disagreement, 0, 'below range clamps to 0');
});

// ── the A/B counterpart ─────────────────────────────────────────────────────

await check('THE SINGLE-MODEL JUDGE REPORTS NO DISAGREEMENT AT ALL', async () => {
  // Not 0 — absent. A single model has no disagreement to report, and recording
  // 0 would make the cheapest judge look like the most confident one, biasing
  // the very comparison this port exists to enable.
  const judge = createSingleModelJudge({
    async assess() { return { satisfied: true, score: 0.9, reason: 'looks right' }; },
  });
  const r = await judge.judge(REQUEST);
  eq(r.outcome, 'VERIFIED', 'a satisfied claim verifies');
  eq(Object.prototype.hasOwnProperty.call(r, 'disagreement') && r.disagreement !== undefined, false,
    'no disagreement value may be invented for a single model');
});

await check('the single-model judge sees the SAME claim as the panel', async () => {
  // The A/B is meaningless if the two judges are asked different questions.
  let seen = '';
  const judge = createSingleModelJudge({
    async assess(claim) { seen = claim; return { satisfied: false, reason: 'no' }; },
  });
  await judge.judge(REQUEST);
  eq(seen, claimFor(REQUEST), 'both judges must be asked the identical claim');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\nbft-judge: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All bft-judge checks passed.');
