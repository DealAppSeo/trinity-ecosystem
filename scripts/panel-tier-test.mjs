#!/usr/bin/env node
// scripts/panel-tier-test.mjs — the BFT panel composed with the staged judge.
//
// Run: node scripts/panel-tier-test.mjs
//
// ── WHY THIS SUITE EXISTS, AND WHY IT IS NOT PART OF EITHER UNIT'S SUITE ─────
//
// `bft-judge` and `staged-judge` were built in two lanes, each unit-tested and
// each correct on its own. The defect was in neither: it was in the MEANING of
// a value they both handle.
//
//   bft-judge  returns NOT_CHECKED for a fired Pythagorean veto, meaning
//              "the panel's unanimity is itself the warning sign — a HUMAN
//              must look at this".
//   staged-judge reads NOT_CHECKED as "this tier could not decide — ASK THE
//              NEXT TIER".
//
// Both readings are defensible. Together they lose the warning: measured
// 2026-08-15, a vetoing panel placed anywhere but last had its referral
// converted into a single model's VERIFIED. Every unit test stayed green and
// every signature verified. A shared value with two meanings is invisible to
// the suites of the units that share it, which is what this file is for.
//
// The fix is `JudgeOpinion.referToHuman`: the judge says which NOT_CHECKED it
// meant, and staging stops when it hears a referral. ORDER-DEPENDENCE IS THE
// REGRESSION UNDER TEST — the composition must hold with the panel first,
// last, and alone.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const ROOT = process.cwd();
const outDir = mkdtempSync(join(ROOT, '.panel-tier-check-'));
let bj, sj;
try {
  // A tsconfig rather than flags, because `bft-judge.ts` imports the Judge port
  // through the `@/` alias and `tsc` resolves `paths` only from a config file.
  const tsconfigPath = join(outDir, 'tsconfig.json');
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir,
        rootDir: ROOT,
        module: 'commonjs',
        target: 'es2022',
        lib: ['es2022', 'dom'],
        moduleResolution: 'node',
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        baseUrl: ROOT,
        paths: { '@/*': ['./*'] },
      },
      files: [
        join(ROOT, 'lib/trust/bft-judge.ts'),
        join(ROOT, 'lib/trustshell/identity/staged-judge.ts'),
      ],
    })
  );
  execFileSync(localTsc(), ['-p', tsconfigPath], { stdio: 'pipe' });
  bj = await import(pathToFileURL(join(outDir, 'lib/trust/bft-judge.js')).href);
  sj = await import(pathToFileURL(join(outDir, 'lib/trustshell/identity/staged-judge.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('panel-tier compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const { createBftJudge } = bj;
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
const match = (s, re, what) => {
  if (!re.test(String(s))) throw new Error(`${what}: ${JSON.stringify(String(s))} !~ ${re}`);
};

// ── fixtures ────────────────────────────────────────────────────────────────

const REQUEST = {
  criterion: { id: 'tests', statement: 'the suite passes', minScore: 0.9 },
  deliverable: 'a working thing',
  evidence: 'turn 1 progress=true',
};

const VOTES = [
  { provider: 'a', belief: 0.93, disbelief: 0.02, weight: 1 },
  { provider: 'b', belief: 0.94, disbelief: 0.02, weight: 1 },
  { provider: 'c', belief: 0.92, disbelief: 0.03, weight: 1 },
];

/** A panel whose vote fires the Pythagorean veto: near-zero gap, high belief. */
const vetoPanel = {
  async vote() {
    return {
      consensus_reached: true, consensus_score: 0.93, threshold: 0.7,
      pythagorean_veto_fired: true, comma_gap: 0.01, hitl_required: true,
      dissenting_providers: [], votes: VOTES,
    };
  },
};

/** A panel that refers to a human WITHOUT the veto — the second referral path. */
const hitlPanel = {
  async vote() {
    return {
      consensus_reached: false, consensus_score: 0.61, threshold: 0.7,
      pythagorean_veto_fired: false, comma_gap: 0.4, hitl_required: true,
      dissenting_providers: ['c'], votes: VOTES,
    };
  },
};

/** A panel that reaches ordinary consensus. Nothing to refer. */
const agreeingPanel = {
  async vote() {
    return {
      consensus_reached: true, consensus_score: 0.88, threshold: 0.7,
      pythagorean_veto_fired: false, comma_gap: 0.22, hitl_required: false,
      dissenting_providers: [], votes: VOTES,
    };
  },
};

const stub = (name, opinion) => {
  const t = { name, calls: 0, judge: { async judge() { t.calls += 1; return opinion; } } };
  return t;
};
const mechanical = () => stub('mechanical', { outcome: 'NOT_CHECKED', detail: 'no command wired' });
const lenient = () => stub('single-model', { outcome: 'VERIFIED', score: 0.95, detail: 'looks fine to me' });

// ── the panel alone: the control ────────────────────────────────────────────

await check('the veto is NOT_CHECKED and a referral', async () => {
  const opinion = await createBftJudge(vetoPanel).judge(REQUEST);
  eq(opinion.outcome, 'NOT_CHECKED', 'a veto establishes nothing');
  eq(opinion.referToHuman, true, 'THE VETO IS A HUMAN ESCALATION, and must say so');
  match(opinion.detail, /Pythagorean/, 'and name why');
});

await check("hitl_required alone is a referral — the engine's own field", async () => {
  const opinion = await createBftJudge(hitlPanel).judge(REQUEST);
  eq(opinion.outcome, 'NOT_CHECKED', 'a referred claim is unestablished');
  eq(opinion.referToHuman, true, 'dropping hitl_required at this boundary WAS the loss');
});

await check('ordinary consensus is not a referral', async () => {
  const opinion = await createBftJudge(agreeingPanel).judge(REQUEST);
  eq(opinion.outcome, 'VERIFIED', 'consensus below the veto band is a pass');
  eq(opinion.referToHuman, undefined, 'flagging every opinion would make the flag meaningless');
});

await check('TRUNCATION IS NOT A REFERRAL — a bigger window can settle it', async () => {
  const judge = createBftJudge(agreeingPanel, { maxEvidenceChars: 4 });
  const opinion = await judge.judge(REQUEST);
  eq(opinion.outcome, 'NOT_CHECKED', 'a judge that read half the run has not judged it');
  eq(opinion.referToHuman, undefined, 'this one escalates to a bigger judge, not to a person');
});

// ── the composition: the regression this suite exists for ───────────────────

await check('THE PANEL LAST — referral preserved', async () => {
  const cheap = mechanical();
  const staged = createStagedJudge({
    tiers: [cheap, { name: 'bft-panel', judge: createBftJudge(vetoPanel) }],
  });
  const opinion = await staged.judge.judge(REQUEST);
  eq(opinion.outcome, 'NOT_CHECKED', 'the veto must stand');
  eq(staged.decisions[0].referredToHuman, true, 'and be countable');
  eq(staged.decisions[0].decidedBy, 'bft-panel', 'named as the decider');
});

await check('THE PANEL FIRST — referral preserved, and the next tier is NEVER CALLED', async () => {
  // The measured defect, now the regression test. Before `referToHuman`, this
  // returned VERIFIED from `single-model`: "a human must look at this" became
  // "ask another model", which is exactly what the panel said was insufficient.
  const fallback = lenient();
  const staged = createStagedJudge({
    tiers: [{ name: 'bft-panel', judge: createBftJudge(vetoPanel) }, fallback],
  });
  const opinion = await staged.judge.judge(REQUEST);
  eq(opinion.outcome, 'NOT_CHECKED', 'A REFERRAL MUST NOT BE DOWNGRADED BY POSITION');
  eq(fallback.calls, 0, 'ESCALATING PAST A REFERRAL IS SHOPPING WITH A POLITER NAME');
  eq(staged.decisions[0].decidedBy, 'bft-panel', 'the panel decided, not the fallback');
  eq(staged.decisions[0].referredToHuman, true, 'and it is recorded as a referral');
});

await check('THE PANEL IN THE MIDDLE — two tiers below it are never paid for', async () => {
  const cheap = mechanical();
  const fallback = lenient();
  const staged = createStagedJudge({
    tiers: [cheap, { name: 'bft-panel', judge: createBftJudge(hitlPanel) }, fallback],
  });
  const opinion = await staged.judge.judge(REQUEST);
  eq(opinion.outcome, 'NOT_CHECKED', 'position must not change the answer');
  eq(cheap.calls, 1, 'the cheap tier ran and could not decide');
  eq(fallback.calls, 0, 'the referral ended it');
  eq(staged.decisions[0].escalatedPast, ['mechanical'], 'with the escalation path recorded');
});

await check('ORDER INDEPENDENCE, stated as one assertion', async () => {
  // The property, not three instances of it: a vetoing panel yields the same
  // outcome at every position. This is what the pre-fix code violated.
  const panel = () => ({ name: 'bft-panel', judge: createBftJudge(vetoPanel) });
  const orders = [
    [panel()],
    [mechanical(), panel()],
    [panel(), lenient()],
    [mechanical(), panel(), lenient()],
  ];
  const outcomes = [];
  for (const tiers of orders) {
    outcomes.push((await createStagedJudge({ tiers }).judge.judge(REQUEST)).outcome);
  }
  eq(outcomes, ['NOT_CHECKED', 'NOT_CHECKED', 'NOT_CHECKED', 'NOT_CHECKED'],
    'A COMPOSITION WHOSE VERDICT DEPENDS ON TIER ORDER IS A CONFIG FILE DECIDING TRUST');
});

// ── the contradictory opinion ───────────────────────────────────────────────

await check('VERIFIED + referToHuman is weakened, never certified', async () => {
  const confused = stub('confused', { outcome: 'VERIFIED', score: 1, referToHuman: true, detail: 'sure but ask someone' });
  const staged = createStagedJudge({ tiers: [confused, lenient()] });
  const opinion = await staged.judge.judge(REQUEST);
  eq(opinion.outcome, 'NOT_CHECKED', 'a judge unsure enough to want a human has not certified');
  eq(staged.decisions[0].referredToHuman, true, 'the referral half survives');
  match(opinion.detail, /certified AND asked for a human/, 'and the contradiction is visible');
});

await check('FAILED beats a referral — a concrete defect is still final', async () => {
  const red = stub('mechanical', { outcome: 'FAILED', detail: 'the suite is red' });
  const staged = createStagedJudge({
    tiers: [red, { name: 'bft-panel', judge: createBftJudge(vetoPanel) }],
  });
  const opinion = await staged.judge.judge(REQUEST);
  eq(opinion.outcome, 'FAILED', 'a found defect does not need a human to confirm it');
  eq(staged.decisions[0].referredToHuman, false, 'and it is not a referral');
});

// ── outages are not referrals ───────────────────────────────────────────────

await check('EVERY TIER DOWN IS NOT A REFERRAL — infrastructure is not a judgement', async () => {
  const down = (name) => ({ name, judge: { async judge() { throw new Error(`${name} ECONNREFUSED`); } } });
  const staged = createStagedJudge({ tiers: [down('a'), down('b')] });
  const opinion = await staged.judge.judge(REQUEST);
  eq(opinion.outcome, 'NOT_CHECKED', 'we could not look');
  eq(staged.decisions[0].referredToHuman, false,
    'counting outages as referrals would bury the referral rate in provider noise');
});

await check('a panel that THROWS escalates; a panel that REFERS does not', async () => {
  // The distinction in one test: both produce NOT_CHECKED at the panel, and
  // only one of them may be resolved by asking the next model.
  const thrower = { name: 'bft-panel', judge: { async judge() { throw new Error('503'); } } };
  const afterThrow = lenient();
  const a = createStagedJudge({ tiers: [thrower, afterThrow] });
  eq((await a.judge.judge(REQUEST)).outcome, 'VERIFIED', 'an outage escalates and the next tier answers');
  eq(afterThrow.calls, 1, 'so the next tier IS called');

  const afterRefer = lenient();
  const b = createStagedJudge({
    tiers: [{ name: 'bft-panel', judge: createBftJudge(vetoPanel) }, afterRefer],
  });
  eq((await b.judge.judge(REQUEST)).outcome, 'NOT_CHECKED', 'a referral stops');
  eq(afterRefer.calls, 0, 'so the next tier is NOT called');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\npanel-tier: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All panel-tier checks passed.');
