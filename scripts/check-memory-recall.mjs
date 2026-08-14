#!/usr/bin/env node
//
// check-memory-recall.mjs — asserts the recall path degrades loudly, budgets
// honestly, and ranks on outcomes rather than popularity.
//
//   node scripts/check-memory-recall.mjs
//
// Exits non-zero on any failure, so it can gate CI.
//
// Why this file exists. lib/trustshell/MemoryRecall.ts is the read side of
// Trinity's memory, and every one of its failure modes is silent:
//
//   - a recall that ran keyword-only because the embedder was down returns a
//     short list that looks exactly like an honest miss;
//   - a budget that dropped 40 of 45 memories returns 5 that look like all of
//     them;
//   - a ranking that rewards retrieval count promotes whatever is already
//     being retrieved, forever, whether or not it ever helped.
//
// None of those throw. None turn CI red on their own. So they are asserted
// here, including the two guards at the end that fail if an earned memory
// setting is ever given a comfortable default instead of its floor.
//
// Same shape as check-harness-profile.mjs: node:assert plus the TypeScript
// compiler already in devDependencies, so this adds nothing to package.json.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { localTsc } from './local-tsc.mjs';

const SOURCES = ['lib/trustshell/MemoryRecall.ts', 'lib/trustshell/HarnessProfile.ts'];

const outDir = mkdtempSync(join(tmpdir(), 'trustshell-memory-'));
let recall;
let harness;
try {
  execFileSync(
    localTsc(),
    [...SOURCES, '--outDir', outDir, '--module', 'commonjs', '--target', 'es2019'],
    { stdio: 'pipe' }
  );
  recall = await import(pathToFileURL(join(outDir, 'MemoryRecall.js')).href);
  harness = await import(pathToFileURL(join(outDir, 'HarnessProfile.js')).href);
} catch (err) {
  console.error(`Could not compile:\n${err.stdout?.toString() ?? err.message}`);
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}

const {
  rrfFuse,
  RRF_K,
  chooseRecallTier,
  applyRecallBudget,
  utilityScore,
  canDedup,
  compileRecallPlan,
  scopeWidens,
  SCOPE_ORDER,
} = recall;
const { resolveHarnessProfile, HARNESS_SETTINGS, getSettingSpec } = harness;

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failed += 1;
    failures.push({ name, message: err.message });
  }
}

const ALL = { vectorReady: true, keywordReady: true, embedderReady: true };
const NOW = '2026-08-13T00:00:00.000Z';

// ---------------------------------------------------------------------------
// Reciprocal rank fusion
// ---------------------------------------------------------------------------

check('rrfFuse: single list preserves order', () => {
  const out = rrfFuse([[{ id: 'a' }, { id: 'b' }, { id: 'c' }]], (x) => x.id);
  assert.deepEqual(out.map((r) => r.item.id), ['a', 'b', 'c']);
});

check('rrfFuse: score matches 1/(k+rank+1)', () => {
  const out = rrfFuse([[{ id: 'a' }]], (x) => x.id);
  assert.equal(out[0].rrfScore, 1 / (RRF_K + 1));
});

check('rrfFuse: item in both lists outranks a item ranked higher in only one', () => {
  // 'b' is 2nd in both lists; 'a' is 1st in one list and absent from the other.
  const out = rrfFuse(
    [
      [{ id: 'a' }, { id: 'b' }],
      [{ id: 'z' }, { id: 'b' }],
    ],
    (x) => x.id,
  );
  assert.equal(out[0].item.id, 'b', 'cross-list agreement should win');
  assert.equal(out[0].listHits, 2);
});

check('rrfFuse: listHits counts appearances', () => {
  const out = rrfFuse([[{ id: 'a' }], [{ id: 'a' }], [{ id: 'a' }]], (x) => x.id);
  assert.equal(out[0].listHits, 3);
  assert.equal(out[0].rrfScore, 3 * (1 / (RRF_K + 1)));
});

check('rrfFuse: ties break deterministically by id', () => {
  const a = rrfFuse([[{ id: 'b' }], [{ id: 'a' }]], (x) => x.id);
  const b = rrfFuse([[{ id: 'a' }], [{ id: 'b' }]], (x) => x.id);
  assert.deepEqual(a.map((r) => r.item.id), b.map((r) => r.item.id));
});

check('rrfFuse: empty input yields empty output, not a throw', () => {
  assert.deepEqual(rrfFuse([], (x) => x.id), []);
  assert.deepEqual(rrfFuse([[], []], (x) => x.id), []);
});

// ---------------------------------------------------------------------------
// Tier selection — the degradation must be visible
// ---------------------------------------------------------------------------

check('chooseRecallTier: all capabilities gives hybrid, not degraded', () => {
  const t = chooseRecallTier(ALL);
  assert.equal(t.tier, 'hybrid');
  assert.equal(t.degraded, false);
});

check('chooseRecallTier: no keyword index degrades to vector', () => {
  const t = chooseRecallTier({ ...ALL, keywordReady: false });
  assert.equal(t.tier, 'vector');
  assert.equal(t.degraded, true);
});

check('chooseRecallTier: embeddings present but embedder down is NOT a vector capability', () => {
  // The live failure this guards: 213 of 429 rows carry embeddings. If the
  // embedder is unreachable the query cannot be vectorised, so those rows are
  // unreachable too — and a tier of 'vector' here would return nothing while
  // reporting a healthy search.
  const t = chooseRecallTier({ vectorReady: true, keywordReady: true, embedderReady: false });
  assert.equal(t.tier, 'keyword');
  assert.equal(t.degraded, true);
  assert.match(t.reason, /embedder/i);
});

check('chooseRecallTier: nothing available yields none, and says why', () => {
  const t = chooseRecallTier({ vectorReady: false, keywordReady: false, embedderReady: false });
  assert.equal(t.tier, 'none');
  assert.equal(t.degraded, true);
  assert.ok(t.reason.length > 0);
});

check('chooseRecallTier: every tier carries a non-empty reason', () => {
  for (const v of [true, false]) {
    for (const k of [true, false]) {
      for (const e of [true, false]) {
        const t = chooseRecallTier({ vectorReady: v, keywordReady: k, embedderReady: e });
        assert.ok(t.reason && t.reason.length > 0, `empty reason for ${v}/${k}/${e}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Budget — no silent truncation
// ---------------------------------------------------------------------------

const items = (n, len) =>
  Array.from({ length: n }, (_, i) => ({ id: String(i), text: 'x'.repeat(len) }));

check('applyRecallBudget: item cap drops the tail and reports the count', () => {
  const r = applyRecallBudget(items(10, 10), { maxItems: 3, maxChars: 10000 }, (i) => i.text);
  assert.equal(r.kept.length, 3);
  assert.equal(r.droppedForCount, 7);
});

check('applyRecallBudget: char budget is never exceeded', () => {
  const r = applyRecallBudget(items(10, 100), { maxItems: 10, maxChars: 250 }, (i) => i.text);
  assert.ok(r.charsUsed <= 250, `charsUsed ${r.charsUsed} exceeded budget`);
  assert.equal(r.kept.length, 2);
  assert.equal(r.droppedForChars, 8);
});

check('applyRecallBudget: an oversized item is dropped whole, never cut', () => {
  // Truncating "do not refactor the old auth module — mobile still uses it"
  // at the dash inverts it. Dropping it loses information; cutting it creates
  // false information.
  const r = applyRecallBudget(
    [{ id: '1', text: 'y'.repeat(500) }],
    { maxItems: 5, maxChars: 100 },
    (i) => i.text,
  );
  assert.equal(r.kept.length, 0);
  assert.equal(r.droppedForChars, 1);
});

check('applyRecallBudget: truncationNote present when anything dropped', () => {
  const r = applyRecallBudget(items(10, 10), { maxItems: 2, maxChars: 10000 }, (i) => i.text);
  assert.ok(r.truncationNote, 'dropping items without a note is silent truncation');
  assert.match(r.truncationNote, /2 of 10/);
});

check('applyRecallBudget: truncationNote absent when nothing dropped', () => {
  const r = applyRecallBudget(items(2, 10), { maxItems: 5, maxChars: 10000 }, (i) => i.text);
  assert.equal(r.truncationNote, undefined, 'a note with no drops would be a false warning');
  assert.equal(r.droppedForCount, 0);
  assert.equal(r.droppedForChars, 0);
});

check('applyRecallBudget: zero budget keeps nothing and says so', () => {
  const r = applyRecallBudget(items(5, 10), { maxItems: 0, maxChars: 0 }, (i) => i.text);
  assert.equal(r.kept.length, 0);
  assert.ok(r.truncationNote);
});

check('applyRecallBudget: a later small item is not reordered ahead of a dropped large one', () => {
  // Order in = order out among kept items; the function must not re-sort.
  const input = [
    { id: 'big', text: 'z'.repeat(400) },
    { id: 'small', text: 'ab' },
  ];
  const r = applyRecallBudget(input, { maxItems: 5, maxChars: 100 }, (i) => i.text);
  assert.deepEqual(r.kept.map((i) => i.id), ['small']);
});

// ---------------------------------------------------------------------------
// Utility scoring — outcomes, not popularity
// ---------------------------------------------------------------------------

const base = {
  importance: 0.5,
  reusedWithGoodOutcome: 0,
  reusedWithBadOutcome: 0,
  lastAccessedAt: null,
  createdAt: NOW,
};

check('utilityScore: a memory reused into failures scores below an unproven one', () => {
  const unproven = utilityScore(base, NOW).score;
  const harmful = utilityScore({ ...base, reusedWithBadOutcome: 5 }, NOW).score;
  assert.ok(
    harmful < unproven,
    `harmful ${harmful} should rank below unproven ${unproven} — this is the popularity-counter bug`,
  );
});

check('utilityScore: reuse alone does not raise score without good outcomes', () => {
  const popular = utilityScore(
    { ...base, reusedWithGoodOutcome: 3, reusedWithBadOutcome: 3 },
    NOW,
  ).score;
  const unproven = utilityScore(base, NOW).score;
  assert.equal(popular.toFixed(6), unproven.toFixed(6));
});

check('utilityScore: good outcomes raise the score', () => {
  const good = utilityScore({ ...base, reusedWithGoodOutcome: 5 }, NOW).score;
  assert.ok(good > utilityScore(base, NOW).score);
});

check('utilityScore: outcome term is bounded, so no memory can dominate by volume', () => {
  const huge = utilityScore({ ...base, reusedWithGoodOutcome: 1_000_000 }, NOW);
  assert.ok(huge.parts.outcome < 1, 'outcome must be squashed into (-1,1)');
});

check('utilityScore: recency decays by half over the half-life', () => {
  const { RECENCY_HALF_LIFE_DAYS } = recall;
  const old = new Date(Date.parse(NOW) - RECENCY_HALF_LIFE_DAYS * 86_400_000).toISOString();
  const s = utilityScore({ ...base, createdAt: old }, NOW);
  assert.ok(Math.abs(s.parts.recency - 0.5) < 1e-9, `recency ${s.parts.recency} != 0.5`);
});

check('utilityScore: is pure — same inputs and same now give the same score', () => {
  const a = utilityScore({ ...base, reusedWithGoodOutcome: 2 }, NOW);
  const b = utilityScore({ ...base, reusedWithGoodOutcome: 2 }, NOW);
  assert.deepEqual(a, b);
});

check('utilityScore: malformed timestamps do not throw or produce NaN', () => {
  const s = utilityScore({ ...base, createdAt: 'not-a-date' }, NOW);
  assert.ok(Number.isFinite(s.score), 'score must stay finite on bad input');
});

check('utilityScore: importance outside 0..1 is clamped, not trusted', () => {
  assert.equal(utilityScore({ ...base, importance: 99 }, NOW).parts.importance, 1);
  assert.equal(utilityScore({ ...base, importance: -5 }, NOW).parts.importance, 0);
});

// ---------------------------------------------------------------------------
// Dedup capability
// ---------------------------------------------------------------------------

check('canDedup: impossible without any candidate recall, and says duplicates are expected', () => {
  const d = canDedup({ vectorReady: false, keywordReady: false, embedderReady: false });
  assert.equal(d.possible, false);
  assert.match(d.reason, /duplicate/i);
});

check('canDedup: keyword-only is possible but flagged degraded', () => {
  const d = canDedup({ vectorReady: false, keywordReady: true, embedderReady: false });
  assert.equal(d.possible, true);
  assert.match(d.reason, /degraded/i);
});

// ---------------------------------------------------------------------------
// Plan compilation
// ---------------------------------------------------------------------------

const settings = {
  scope: 'own',
  maxItems: 5,
  maxChars: 2000,
  timeoutMs: 5000,
  maxSearchesPerTurn: 3,
};

check('compileRecallPlan: inert when no index can serve it', () => {
  const p = compileRecallPlan(settings, {
    vectorReady: false,
    keywordReady: false,
    embedderReady: false,
  });
  assert.equal(p.inert, true, 'a plan that cannot return anything must say so');
});

check('compileRecallPlan: inert when the budget is zero even with a healthy index', () => {
  const p = compileRecallPlan({ ...settings, maxItems: 0 }, ALL);
  assert.equal(p.inert, true);
});

check('compileRecallPlan: healthy path is not inert and carries the tier reason', () => {
  const p = compileRecallPlan(settings, ALL);
  assert.equal(p.inert, false);
  assert.equal(p.tier, 'hybrid');
  assert.ok(p.tierReason.length > 0);
});

check('scopeWidens: own -> team widens, team -> own does not', () => {
  assert.equal(scopeWidens('own', 'team'), true);
  assert.equal(scopeWidens('team', 'own'), false);
  assert.equal(scopeWidens('own', 'own'), false);
});

check('SCOPE_ORDER is least-privilege first', () => {
  assert.equal(SCOPE_ORDER[0], 'own');
});

// ---------------------------------------------------------------------------
// Harness integration — memory privileges must be earned
// ---------------------------------------------------------------------------

const EARNED_MEMORY_KEYS = ['memory.recall_scope', 'memory.recall_max_items', 'memory.recall_char_budget'];

check('every earned memory setting is registered as authority=earned', () => {
  for (const key of EARNED_MEMORY_KEYS) {
    const spec = getSettingSpec(key);
    assert.ok(spec, `${key} is not registered`);
    assert.equal(spec.authority, 'earned', `${key} must be earned`);
  }
});

check('every earned memory setting names what unlocks it', () => {
  for (const key of EARNED_MEMORY_KEYS) {
    const spec = getSettingSpec(key);
    assert.ok(spec.unlockedBy && spec.unlockedBy.length > 0, `${key} has no unlockedBy`);
  }
});

check('with no receipts, recall_scope floors at own', () => {
  const p = resolveHarnessProfile({ layers: {}, now: NOW });
  assert.equal(p.settings['memory.recall_scope'].value, 'own');
  assert.ok(p.unearned.includes('memory.recall_scope'));
});

check('a user cannot grant themselves team-wide recall', () => {
  const p = resolveHarnessProfile({
    layers: { user: { 'memory.recall_scope': 'org' } },
    now: NOW,
  });
  assert.equal(p.settings['memory.recall_scope'].value, 'own', 'user layer must not win over earned');
  assert.ok(
    p.rejections.some((r) => r.key === 'memory.recall_scope' && r.reason === 'authority_forbids_layer'),
    'the attempt must be recorded, not silently dropped',
  );
});

check('an earned grant with no receipt ids is refused', () => {
  const p = resolveHarnessProfile({
    layers: {},
    earned: [
      { key: 'memory.recall_scope', value: 'team', receiptIds: [], grantedAt: NOW, expiresAt: null },
    ],
    now: NOW,
  });
  assert.equal(p.settings['memory.recall_scope'].value, 'own');
  assert.ok(p.rejections.some((r) => r.reason === 'grant_without_evidence'));
});

check('a valid receipt-backed grant does widen recall scope', () => {
  const p = resolveHarnessProfile({
    layers: {},
    earned: [
      {
        key: 'memory.recall_scope',
        value: 'team',
        receiptIds: ['rcpt_synthetic_1'],
        grantedAt: NOW,
        expiresAt: null,
      },
    ],
    now: NOW,
  });
  assert.equal(p.settings['memory.recall_scope'].value, 'team');
  assert.deepEqual(p.settings['memory.recall_scope'].evidence, ['rcpt_synthetic_1']);
});

check('an expired grant falls to the floor, not to its last value', () => {
  const p = resolveHarnessProfile({
    layers: {},
    earned: [
      {
        key: 'memory.recall_max_items',
        value: 40,
        receiptIds: ['rcpt_synthetic_2'],
        grantedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-02-01T00:00:00.000Z',
      },
    ],
    now: NOW,
  });
  assert.equal(p.settings['memory.recall_max_items'].value, 5);
  assert.ok(p.rejections.some((r) => r.reason === 'grant_expired'));
});

check('extraction whitelist defaults to empty — deny, not allow', () => {
  // The upstream gate treats a missing config block as permission to extract
  // everything, for backwards compatibility. Inverted here on purpose: this
  // assertion fails if anyone "fixes" the empty default.
  const p = resolveHarnessProfile({ layers: {}, now: NOW });
  assert.deepEqual(p.settings['memory.extraction_assets'].value, []);
});

check('reuse credit requiring an outcome is constitutional and unsettable', () => {
  const p = resolveHarnessProfile({
    layers: { org: { 'memory.reuse_credit_requires_outcome': false } },
    now: NOW,
  });
  assert.equal(p.settings['memory.reuse_credit_requires_outcome'].value, true);
  assert.ok(p.rejections.some((r) => r.key === 'memory.reuse_credit_requires_outcome'));
});

// -- Regression guards -------------------------------------------------------

check('GUARD: no earned memory setting may default above its floor', () => {
  for (const spec of HARNESS_SETTINGS) {
    if (spec.dimension !== 'memory' || spec.authority !== 'earned') continue;
    if (spec.type !== 'number') continue;
    assert.equal(
      spec.default,
      spec.min,
      `${spec.key} defaults to ${spec.default} but its floor is ${spec.min} — ` +
        `an agent with no receipts would start above least privilege`,
    );
  }
});

check('GUARD: every memory setting states the failure it prevents', () => {
  for (const spec of HARNESS_SETTINGS) {
    if (spec.dimension !== 'memory') continue;
    assert.ok(spec.why && spec.why.length > 20, `${spec.key} has no meaningful why`);
  }
});

// ---------------------------------------------------------------------------

rmSync(outDir, { recursive: true, force: true });

for (const f of failures) console.error(`FAIL  ${f.name}\n      ${f.message}`);
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
