#!/usr/bin/env node
// scripts/harness-aggregate-test.mjs — Sprint H: weighted-plurality aggregation.
//
// Run: node scripts/harness-aggregate-test.mjs
//
// Every assertion fails if the mechanism under test is removed. The load-bearing
// ones, each guarding a failure that LOOKS like success:
//
//   * 'earned weight decides, not head count'   — the whole thesis. Remove the
//     weighting and a bloc of untrusted proposers outvotes a trusted one.
//   * 'a dead-even tie abstains'                — returning either side of a tie
//     reports a coin flip as a decision.
//   * 'one proposal does not count as unanimous' — 100% support by construction.
//   * 'ordering is total and deterministic'     — equal-weight clusters ordered
//     by insertion give different answers for identical input.
//   * 'dominatedBySingleExpert is reported'     — the panel cost K calls and
//     returned exactly what top-1 would have. Caught a real defect: the field
//     first measured the winning CLUSTER, contradicting its own name.

import { compileHarness, createChecker } from './lib/harness-compile.mjs';

const { load } = compileHarness();
const { ManualClock } = await load('types');
const { PluralityAggregator } = await load('aggregate');

const { check, eq, truthy, close, report } = createChecker('harness-aggregate');

const mk = (cfg = {}) => {
  const clock = new ManualClock(1000);
  return { clock, agg: new PluralityAggregator(clock, cfg) };
};
const p = (expert, key, earnedScore, over = {}) => ({
  expert,
  key,
  answer: `answer:${key}`,
  earnedScore,
  ...over,
});

// ── configuration guards ─────────────────────────────────────────────────────

check('rejects out-of-range minSupport', () => {
  let a = false;
  let b = false;
  try { new PluralityAggregator(new ManualClock(0), { minSupport: -0.1 }); } catch { a = true; }
  try { new PluralityAggregator(new ManualClock(0), { minSupport: 1.5 }); } catch { b = true; }
  eq([a, b], [true, true], 'both must throw');
});

check('rejects out-of-range minMargin', () => {
  let threw = false;
  try { new PluralityAggregator(new ManualClock(0), { minMargin: 2 }); } catch { threw = true; }
  eq(threw, true, 'must throw');
});

check('rejects minProposals below 1', () => {
  let threw = false;
  try { new PluralityAggregator(new ManualClock(0), { minProposals: 0 }); } catch { threw = true; }
  eq(threw, true, 'must throw');
});

// ── the core: earned weight, not head count ──────────────────────────────────

check('earned weight decides, not head count', () => {
  // THE THESIS. Three low-trust proposers agree on 'wrong'; one high-trust
  // proposer says 'right'. Head count says wrong 3-1. Earned weight says right.
  const { agg } = mk();
  const r = agg.aggregate([
    p('veteran', 'right', 9000),
    p('novice1', 'wrong', 1000),
    p('novice2', 'wrong', 1000),
    p('novice3', 'wrong', 1000),
  ]);
  eq(r.outcome, 'DECIDED', 'decided');
  eq(r.key, 'right', 'the trusted minority wins over the untrusted majority');
  eq(r.clusters[0].experts, ['veteran'], 'one expert, more weight');
  eq(r.clusters[1].experts, ['novice1', 'novice2', 'novice3'], 'three experts, less weight');
});

check('agreeing proposals accumulate weight', () => {
  const { agg } = mk();
  const r = agg.aggregate([
    p('a', 'x', 3000),
    p('b', 'x', 3000),
    p('c', 'y', 5000),
  ]);
  eq(r.key, 'x', '3000+3000 beats 5000');
  eq(r.clusters[0].weight, 6000, 'weights summed');
});

check('a zero-weight proposer cannot decide', () => {
  const { agg } = mk();
  const r = agg.aggregate([p('unknown', 'x', 0), p('known', 'y', 100)]);
  eq(r.key, 'y', 'any weight beats none');
});

check('earned scores are clamped into range', () => {
  // A caller passing 999999 must not be able to buy unbounded influence.
  const { agg } = mk();
  const r = agg.aggregate([p('cheat', 'x', 999999), p('honest', 'y', 10000)]);
  eq(r.clusters[0].weight, 10000, 'clamped to BPS_MAX');
  eq(r.margin, 0, 'so it ties rather than dominating');
  eq(r.outcome, 'DECIDED', 'plurality still decides at minMargin 0');
});

// ── ties and thin leads ──────────────────────────────────────────────────────

check('a dead-even tie abstains when a margin is required', () => {
  const { agg } = mk({ minMargin: 0.01 });
  const r = agg.aggregate([p('a', 'x', 5000), p('b', 'y', 5000)]);
  eq(r.outcome, 'ABSTAINED', 'no winner');
  eq(r.answer, null, 'and no answer returned');
  truthy(r.basis.includes('coin flip'), 'basis names why');
});

check('a thin lead abstains under minMargin', () => {
  const { agg } = mk({ minMargin: 0.2 });
  const r = agg.aggregate([p('a', 'x', 5100), p('b', 'y', 4900)]);
  eq(r.outcome, 'ABSTAINED', '2 share points is under 20');
});

check('a clear lead decides under the same minMargin', () => {
  const { agg } = mk({ minMargin: 0.2 });
  const r = agg.aggregate([p('a', 'x', 8000), p('b', 'y', 2000)]);
  eq(r.outcome, 'DECIDED', '60 share points clears 20');
  eq(r.key, 'x', 'the heavier answer');
});

check('minSupport can require more than a plurality', () => {
  const { agg } = mk({ minSupport: 0.75 });
  const r = agg.aggregate([p('a', 'x', 5000), p('b', 'y', 3000), p('c', 'z', 2000)]);
  eq(r.outcome, 'ABSTAINED', '50% is under the 75% floor');
  const r2 = agg.aggregate([p('a', 'x', 8000), p('b', 'y', 2000)]);
  eq(r2.outcome, 'DECIDED', '80% clears it');
});

check('pure plurality decides a three-way split', () => {
  const { agg } = mk();
  const r = agg.aggregate([p('a', 'x', 4000), p('b', 'y', 3000), p('c', 'z', 3000)]);
  eq(r.outcome, 'DECIDED', 'plurality needs no majority');
  eq(r.key, 'x', '40% wins');
  close(r.support, 0.4, 0.001, 'support is the share, not a majority');
});

// ── one proposal is not unanimity ────────────────────────────────────────────

check('one proposal does not count as unanimous', () => {
  const { agg } = mk();
  const r = agg.aggregate([p('lonely', 'x', 9000)]);
  eq(r.outcome, 'ABSTAINED', 'a single proposal cannot be a consensus');
  truthy(r.basis.includes('says nothing'), 'basis is explicit about why');
});

check('minProposals 1 permits it, deliberately', () => {
  const { agg } = mk({ minProposals: 1 });
  const r = agg.aggregate([p('lonely', 'x', 9000)]);
  eq(r.outcome, 'DECIDED', 'opt in and it decides');
  eq(r.support, 1, 'at 100% support');
  eq(r.proposalsCounted, 1, 'but the count is carried so the caller can see it');
});

// ── abstentions ──────────────────────────────────────────────────────────────

check('abstentions do not pick a winner and are excluded from the denominator', () => {
  const { agg } = mk();
  const r = agg.aggregate([
    p('a', 'x', 3000),
    p('b', 'y', 1000),
    p('c', 'ignored', 6000, { abstained: true }),
  ]);
  eq(r.key, 'x', 'the heavy abstainer does not win');
  eq(r.abstainWeight, 6000, 'its weight is reported separately');
  close(r.support, 0.75, 0.001, '3000/4000 — abstain weight is not in the denominator');
});

check('all-abstain yields NO_PROPOSALS, not a decision', () => {
  const { agg } = mk();
  const r = agg.aggregate([
    p('a', 'x', 5000, { abstained: true }),
    p('b', 'y', 5000, { abstained: true }),
  ]);
  eq(r.outcome, 'NO_PROPOSALS', 'nothing to aggregate');
  eq(r.answer, null, 'no answer');
});

check('an empty panel yields NO_PROPOSALS without NaN', () => {
  const { agg } = mk();
  const r = agg.aggregate([]);
  eq(r.outcome, 'NO_PROPOSALS', 'outcome');
  eq(r.support, 0, 'support 0, not NaN');
  eq(r.clusters, [], 'no clusters');
});

// ── equivocation, consistent with quorum.ts ──────────────────────────────────

check('an equivocator has ALL its proposals dropped', () => {
  const { agg } = mk();
  const r = agg.aggregate([
    p('two-faced', 'x', 9000),
    p('two-faced', 'y', 9000),
    p('honest1', 'z', 1000),
    p('honest2', 'z', 1000),
  ]);
  eq(r.equivocators, ['two-faced'], 'named');
  eq(r.key, 'z', 'so the honest pair wins despite far less weight');
  eq(r.clusters.length, 1, 'both equivocating clusters are gone, not just one');
});

check('equivocation is judged per expert, not per key', () => {
  // Same expert, same answer, twice — still equivocation. Counting it once
  // would let a proposer double its own weight by repeating itself.
  const { agg } = mk();
  const r = agg.aggregate([
    p('dup', 'x', 5000),
    p('dup', 'x', 5000),
    p('solo', 'y', 1000),
  ]);
  eq(r.equivocators, ['dup'], 'still an equivocator');
  eq(r.key, null, 'and cannot win by repetition');
  // Dropping the equivocator leaves ONE deciding proposal, which correctly
  // abstains under minProposals 2. The first version of this test expected 'y'
  // to win and was wrong about the module, not the other way round.
  eq(r.outcome, 'ABSTAINED', 'one survivor is not a consensus');
});

// ── determinism ──────────────────────────────────────────────────────────────

check('ordering is total and deterministic for equal weights', () => {
  const { agg } = mk();
  const forward = agg.aggregate([p('a', 'zebra', 5000), p('b', 'apple', 5000)]);
  const reversed = agg.aggregate([p('b', 'apple', 5000), p('a', 'zebra', 5000)]);
  eq(forward.key, reversed.key, 'input order does not change the winner');
  eq(forward.key, 'apple', 'ties break on key ascending, not insertion order');
  eq(
    forward.clusters.map((c) => c.key),
    reversed.clusters.map((c) => c.key),
    'and the whole cluster list matches'
  );
});

check('experts within a cluster are listed deterministically', () => {
  const { agg } = mk();
  const r = agg.aggregate([p('zoe', 'x', 1000), p('adam', 'x', 1000), p('mia', 'x', 1000)]);
  eq(r.clusters[0].experts, ['adam', 'mia', 'zoe'], 'sorted, not insertion-ordered');
});

// ── the honest-cost diagnostic ───────────────────────────────────────────────

check('dominatedBySingleExpert is reported when one proposer outweighs the rest', () => {
  // The panel cost 4 calls and returned exactly what top-1 would have. Not a
  // defect — but a caller paying for a panel deserves to know it bought nothing.
  const { agg } = mk();
  const r = agg.aggregate([
    p('whale', 'x', 9000),
    p('a', 'y', 1000),
    p('b', 'z', 1000),
    p('c', 'w', 1000),
  ]);
  eq(r.outcome, 'DECIDED', 'decided');
  eq(r.dominatedBySingleExpert, true, 'one proposer at 9000 > 3000 combined');
  truthy(r.basis.includes('top-1'), 'and the basis says so in words');
});

check('dominatedBySingleExpert is false when the panel genuinely combined', () => {
  // Caught a real defect: the field measured the winning CLUSTER against the
  // rest, so this two-expert bloc reported `true` — the exact opposite of the
  // truth, since this is the case where combining is what won it. No single
  // proposer here (max 5000) outweighs the other 6000.
  const { agg } = mk();
  const r = agg.aggregate([p('a', 'x', 3000), p('b', 'x', 3000), p('c', 'y', 5000)]);
  eq(r.key, 'x', 'the pair wins');
  eq(r.dominatedBySingleExpert, false, 'no single proposer outweighs the rest');
});

// ── reporting surface ────────────────────────────────────────────────────────

check('the result carries every cluster, not just the winner', () => {
  const { agg } = mk();
  const r = agg.aggregate([p('a', 'x', 5000), p('b', 'y', 3000), p('c', 'z', 2000)]);
  eq(r.clusters.length, 3, 'all three');
  eq(r.clusters.map((c) => c.key), ['x', 'y', 'z'], 'heaviest first');
  close(r.clusters[2].share, 0.2, 0.001, 'shares computed for losers too');
});

check('the winning answer payload is returned, not just its key', () => {
  const { agg } = mk();
  const r = agg.aggregate([
    { expert: 'a', key: 'k1', answer: { text: 'hello', n: 42 }, earnedScore: 8000 },
    { expert: 'b', key: 'k2', answer: { text: 'other', n: 1 }, earnedScore: 2000 },
  ]);
  eq(r.answer, { text: 'hello', n: 42 }, 'the object itself');
});

check('the timestamp comes from the injected clock', () => {
  const { clock, agg } = mk();
  clock.set(777);
  eq(agg.aggregate([p('a', 'x', 1), p('b', 'x', 1)]).decidedAt, 777, 'no wall clock');
});

check('margin is 1 when the winner is unopposed', () => {
  const { agg } = mk();
  const r = agg.aggregate([p('a', 'x', 5000), p('b', 'x', 5000)]);
  eq(r.margin, 1, 'nothing to beat');
  eq(r.support, 1, 'and it holds all deciding weight');
});

// ── the claim that motivated the module, asserted rather than described ──────

check('plurality decides where a 2/3 supermajority gate would abstain', () => {
  // This is the measured gap restated as an assertion. Two of three proposers
  // agree at equal weight: 66.7% support, which does NOT clear a 2/3 gate
  // (strictly greater than). The gate abstains and scores wrong; plurality
  // returns the answer the majority actually gave.
  const { agg } = mk();
  const r = agg.aggregate([p('a', 'right', 5000), p('b', 'right', 5000), p('c', 'wrong', 5000)]);
  eq(r.outcome, 'DECIDED', 'plurality decides');
  eq(r.key, 'right', 'the majority answer');
  close(r.support, 2 / 3, 0.001, 'at exactly 2/3 support');
  truthy(r.support <= 2 / 3 + 1e-9, 'which a strictly-greater-than-2/3 gate would refuse');
});

report();
