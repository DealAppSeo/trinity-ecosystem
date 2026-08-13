#!/usr/bin/env node
// scripts/harness-reputation-test.mjs — the earned-reputation ledger and its
// persistence contract.
//
// Run: node scripts/harness-reputation-test.mjs
//
// THIS SUITE EXISTS BECAUSE THERE WAS NONE. `reputation.ts` is the module the
// entire harness rests on — it is what makes "self-report cannot reach a
// ranking" true rather than aspirational — and until 2026-08-13 it had zero
// direct assertions. It was exercised only indirectly, through a simulation
// whose own numbers it produces. Five suites and 186 assertions, none of them
// touching the file everything else ranks on.
//
// The load-bearing test here is 'dropping observations erases the fleet'. It
// is the executable form of the argument for
// supabase/migrations/20260813210000_agent_repid_earned_observations.sql:
// persisting the score without the observation count is not a partial save, it
// is a silent total loss.

import { compileHarness, createChecker } from './lib/harness-compile.mjs';

const { load } = compileHarness();
const { ReputationLedger } = await load('reputation');

const { check, eq, truthy, close, report } = createChecker('harness-reputation');

const PRIOR = 5000;
const mk = (over = {}) =>
  new ReputationLedger({ prior: PRIOR, alpha: 0.06, confidenceK: 20, coldStartConfidence: 0.5, ...over });

const feed = (l, id, n, good) => {
  for (let i = 0; i < n; i += 1) l.record(id, good);
};

// ── the prior, and what an unobserved expert asserts ─────────────────────────

check('an unobserved expert sits exactly on the prior', () => {
  const l = mk();
  eq(l.earnedScore('nobody'), PRIOR, 'earned is the prior');
  eq(l.observations('nobody'), 0, 'no observations');
  eq(l.confidence('nobody'), 0, 'no confidence');
});

check('the prior asserts nothing, and says so', () => {
  const l = mk();
  truthy(
    l.view('nobody').basis.includes('asserts nothing'),
    `basis should disclaim, got: ${l.view('nobody').basis}`
  );
});

check('no evidence is not evidence of badness', () => {
  // The cold-start rule. An unknown expert must not rank below a known-bad one.
  const l = mk();
  feed(l, 'bad', 200, false);
  truthy(
    l.earnedScore('unknown') > l.earnedScore('bad'),
    `unknown ${l.earnedScore('unknown')} must outrank proven-bad ${l.earnedScore('bad')}`
  );
});

// ── shrinkage: the defect this module was written to fix ─────────────────────

check('a long track record outranks a short lucky streak', () => {
  // The original defect, restated as a test: an expert at a high raw EWMA on
  // few observations outranked a lower one on many. tau was 0.429.
  //
  // The failures must be INTERLEAVED, not appended. The first version of this
  // test gave `proven` 400 successes then 60 failures and it scored 442 —
  // because the EWMA is recency-weighted, so a trailing run of failures erases
  // the record rather than denting it. See the next test.
  const l = mk();
  feed(l, 'lucky', 12, true);
  for (let i = 0; i < 400; i += 1) l.record('proven', i % 10 < 7); // 70% good, spread
  truthy(
    l.earnedScore('proven') > l.earnedScore('lucky'),
    `proven ${l.earnedScore('proven')} must outrank lucky ${l.earnedScore('lucky')} on evidence weight`
  );
  truthy(
    l.view('lucky').observedScore > l.view('proven').observedScore,
    `and the raw observed score must favour lucky (${l.view('lucky').observedScore}) over ` +
      `proven (${l.view('proven').observedScore}), or this proves nothing`
  );
});

check('the observed score is recency-weighted, not a lifetime average', () => {
  // Found by writing the test above wrongly. `alpha` 0.06 gives an effective
  // window of roughly 1/alpha ≈ 17 outcomes, so "a long track record" is not
  // what the observed score measures — a sustained recent collapse takes an
  // expert to the floor regardless of history. That is intended (it is how
  // `decayer` is caught) but it is emphatically not an average, and reading it
  // as one is how the first version of the previous test came to expect 442 to
  // be a good score.
  const l = mk();
  feed(l, 'a', 400, true);
  const afterGood = l.view('a').observedScore;
  feed(l, 'a', 60, false);
  const afterBad = l.view('a').observedScore;
  truthy(afterGood > 9500, `400 successes should approach the ceiling, got ${afterGood}`);
  truthy(afterBad < 1000, `60 recent failures should reach the floor, got ${afterBad}`);
  eq(l.observations('a'), 460, 'while the observation count keeps rising');
});

check('confidence is n/(n+k) exactly', () => {
  const l = mk({ confidenceK: 20 });
  feed(l, 'a', 20, true);
  close(l.confidence('a'), 20 / 40, 1e-9, 'n=k gives 0.5');
  feed(l, 'a', 60, true);
  close(l.confidence('a'), 80 / 100, 1e-9, 'n=80, k=20 gives 0.8');
});

check('earned lies between the prior and the observed score', () => {
  const l = mk();
  feed(l, 'a', 30, true);
  const v = l.view('a');
  truthy(v.earnedScore > PRIOR, 'above the prior, since outcomes were good');
  truthy(v.earnedScore < v.observedScore, 'but below the raw observed score, because shrunk');
});

check('a lower confidenceK trusts evidence sooner', () => {
  const slow = mk({ confidenceK: 50 });
  const fast = mk({ confidenceK: 20 });
  feed(slow, 'a', 40, true);
  feed(fast, 'a', 40, true);
  truthy(
    fast.earnedScore('a') > slow.earnedScore('a'),
    `k=20 (${fast.earnedScore('a')}) should reach further from the prior than k=50 (${slow.earnedScore('a')})`
  );
});

// ── cold start keyed to confidence, not to a count ───────────────────────────

check('cold start is decided by confidence, not observation count', () => {
  // The cold-start cliff: with a count gate, experts pinned at exactly the
  // threshold forever. Confidence and shrinkage must use the same quantity.
  const l = mk({ confidenceK: 20, coldStartConfidence: 0.5 });
  feed(l, 'a', 19, true);
  eq(l.isColdStart('a'), true, '19 observations, confidence just under 0.5');
  feed(l, 'a', 1, true);
  eq(l.isColdStart('a'), false, '20 observations, confidence exactly 0.5');
});

check('the UCB bonus decays to zero as evidence accumulates', () => {
  const l = mk();
  const gap = (id) => l.upperConfidenceBound(id, 2500) - l.earnedScore(id);
  feed(l, 'new', 2, true);
  const early = gap('new');
  feed(l, 'new', 500, true);
  const mid = gap('new');
  feed(l, 'new', 4500, true);
  const late = gap('new');
  // The bonus is (1 - n/(n+k)) * optimism exactly, so at n=502, k=20 it is
  // still ~96 bps. The first version of this test expected <30 there and was
  // simply wrong about the arithmetic, not about the module.
  truthy(early > mid && mid > late, `bonus must shrink monotonically: ${early}, ${mid}, ${late}`);
  close(mid, (1 - 502 / 522) * 2500, 2, 'and match (1 - n/(n+k)) * optimism');
  truthy(late < 20, `approaching zero at n=5002, got ${late}`);
});

check('the UCB never exceeds the scale maximum', () => {
  const l = mk();
  feed(l, 'a', 2000, true);
  truthy(l.upperConfidenceBound('a', 9000) <= 10000, 'clamped to 10000');
});

// ── graded outcomes ──────────────────────────────────────────────────────────

check('recordGraded rejects out-of-range quality rather than clamping', () => {
  const l = mk();
  let threw = 0;
  for (const bad of [1.5, -0.1, NaN, Infinity]) {
    try {
      l.recordGraded('a', bad);
    } catch {
      threw += 1;
    }
  }
  eq(threw, 4, 'all four rejected — a caller producing 1.5 has a bug');
});

// ── snapshot / hydrate ───────────────────────────────────────────────────────

check('snapshot round-trips exactly through hydrate', () => {
  const a = mk();
  feed(a, 'alpha', 300, true);
  feed(a, 'alpha', 40, false);
  feed(a, 'bravo', 25, true);

  const b = mk();
  b.hydrate(a.snapshot());

  for (const id of ['alpha', 'bravo']) {
    eq(b.observations(id), a.observations(id), `${id} observations`);
    eq(b.earnedScore(id), a.earnedScore(id), `${id} earned score`);
    close(b.confidence(id), a.confidence(id), 1e-12, `${id} confidence`);
  }
  eq(b.ids().sort(), a.ids().sort(), 'same ids');
});

check('snapshot keeps the unrounded EWMA', () => {
  // Rounding in snapshot() would make every save/load cycle lossy, and the loss
  // compounds across restarts.
  const l = mk();
  feed(l, 'a', 7, true);
  const [rec] = l.snapshot();
  truthy(!Number.isInteger(rec.observedScore), `expected a float, got ${rec.observedScore}`);
});

check('hydrate replaces rather than merges', () => {
  const l = mk();
  feed(l, 'old', 100, true);
  l.hydrate([{ id: 'new', observedScore: 6000, observations: 10 }]);
  eq(l.ids(), ['new'], 'the previous entry is gone');
  eq(l.observations('old'), 0, 'and unobserved again');
});

check('hydrate rejects a non-finite score', () => {
  const l = mk();
  let threw = 0;
  for (const bad of [NaN, Infinity, -Infinity]) {
    try {
      l.hydrate([{ id: 'a', observedScore: bad, observations: 1 }]);
    } catch {
      threw += 1;
    }
  }
  eq(threw, 3, 'all rejected');
});

check('hydrate rejects a negative or fractional observation count', () => {
  const l = mk();
  let threw = 0;
  for (const bad of [-1, 1.5, NaN]) {
    try {
      l.hydrate([{ id: 'a', observedScore: 6000, observations: bad }]);
    } catch {
      threw += 1;
    }
  }
  eq(threw, 3, 'a count is a non-negative integer');
});

check('an empty snapshot hydrates to an empty ledger', () => {
  const l = mk();
  feed(l, 'a', 10, true);
  l.hydrate([]);
  eq(l.ids(), [], 'cleared');
});

// ── the argument for the migration, executable ───────────────────────────────

check('dropping observations erases the fleet', () => {
  // THE LOAD-BEARING TEST. This is what persisting `earned_score` without an
  // observation count actually does. Not a partial save — a total, silent loss.
  const live = mk();
  feed(live, 'veteran', 800, true);
  const before = live.earnedScore('veteran');
  truthy(before > 8500, `a veteran should have earned well, got ${before}`);

  // A store that saves the score and cannot restore n.
  const restored = mk();
  restored.hydrate(live.snapshot().map((r) => ({ ...r, observations: 0 })));

  eq(restored.earnedScore('veteran'), PRIOR, 'collapses to the prior');
  truthy(
    before - restored.earnedScore('veteran') > 3500,
    `800 observations of evidence vanish: ${before} -> ${restored.earnedScore('veteran')}`
  );
  eq(restored.confidence('veteran'), 0, 'and it reports no confidence at all');
});

check('the erasure is silent — nothing errors', () => {
  // Worse than the loss is that it looks like a success. There is no exception
  // and no null; the ledger is simply, quietly, wrong.
  const live = mk();
  feed(live, 'veteran', 800, true);
  const restored = mk();
  let threw = false;
  try {
    restored.hydrate(live.snapshot().map((r) => ({ ...r, observations: 0 })));
  } catch {
    threw = true;
  }
  eq(threw, false, 'no error is raised, which is exactly why the store must refuse up front');
  eq(restored.ids(), ['veteran'], 'the row is present and looks fine');
});

check('keeping observations preserves the fleet', () => {
  // The control for the test above: with n carried, nothing is lost.
  const live = mk();
  feed(live, 'veteran', 800, true);
  const restored = mk();
  restored.hydrate(live.snapshot());
  eq(restored.earnedScore('veteran'), live.earnedScore('veteran'), 'identical');
});

// ── rounding, as the Postgres column would do it ─────────────────────────────

check('integer rounding on save costs less than one basis point per cycle', () => {
  // agent_repid.earned_score is an integer, so the store rounds. Ten
  // save/load cycles must not drift the ranking.
  const l = mk();
  feed(l, 'a', 250, true);
  const start = l.earnedScore('a');
  let snap = l.snapshot();
  for (let i = 0; i < 10; i += 1) {
    const next = mk();
    next.hydrate(snap.map((r) => ({ ...r, observedScore: Math.round(r.observedScore) })));
    snap = next.snapshot();
  }
  const end = mk();
  end.hydrate(snap);
  truthy(
    Math.abs(end.earnedScore('a') - start) <= 1,
    `ten round trips drifted ${Math.abs(end.earnedScore('a') - start)} bps, expected <= 1`
  );
});

report();
