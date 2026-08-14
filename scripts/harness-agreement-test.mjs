#!/usr/bin/env node
// scripts/harness-agreement-test.mjs — Sprint N: do experts fail independently?
//
// Run: node scripts/harness-agreement-test.mjs
//
// Every assertion is written so it FAILS if the mechanism is removed. The
// load-bearing ones:
//
//   * 'independent failures measure a lift near 1'   — fails if the expected-
//     joint denominator is dropped and raw co-failure is reported instead
//   * 'two bad but INDEPENDENT experts do not read as correlated' — the whole
//     reason a ratio is used rather than a raw rate
//   * 'nothing is reported when there is no evidence' — fails if the module
//     invents a default of 1.0, which would recommend panels in exactly the
//     deployment where they lose money

import { compileHarness, createChecker } from './lib/harness-compile.mjs';

const { load } = compileHarness();
const { AgreementTracker, AdaptivePanelPolicy } = await load('agreement');

const { check, eq, truthy, report } = createChecker('harness-agreement');

const near = (actual, expected, tol, label) =>
  truthy(
    Math.abs(actual - expected) <= tol,
    `${label}: expected ~${expected} (+-${tol}), got ${actual}`
  );

/** Deterministic LCG so these tests never flake. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ── configuration ────────────────────────────────────────────────────────────

check('rejects a non-positive evidence threshold', () => {
  let threw = false;
  try {
    new AgreementTracker({ minCoObservations: 0 });
  } catch {
    threw = true;
  }
  truthy(threw, 'must reject minCoObservations 0');
});

// ── the core ratio ───────────────────────────────────────────────────────────

check('independent failures measure a lift near 1', () => {
  // Two experts each wrong 30% of the time, wrongness drawn independently.
  const t = new AgreementTracker();
  const ra = rng(1);
  const rb = rng(999);
  for (let i = 0; i < 4000; i += 1) {
    t.recordTask([
      { expert: 'a', correct: ra() >= 0.3 },
      { expert: 'b', correct: rb() >= 0.3 },
    ]);
  }
  const s = t.stats();
  near(s.fleetLift, 1.0, 0.12, 'independent fleet lift');
  truthy(s.confident, 'plenty of evidence');
});

check('perfectly correlated failures measure a lift far above 1', () => {
  // Same wrongness draw for both — they always fail together.
  const t = new AgreementTracker();
  const r = rng(7);
  for (let i = 0; i < 4000; i += 1) {
    const wrong = r() < 0.3;
    t.recordTask([
      { expert: 'a', correct: !wrong },
      { expert: 'b', correct: !wrong },
    ]);
  }
  const s = t.stats();
  // With p(wrong)=0.3 for both and total correlation, observed joint = 0.3 and
  // expected = 0.09, so lift -> 1/0.3 ~= 3.33.
  near(s.fleetLift, 3.33, 0.25, 'fully correlated fleet lift');
  truthy(s.fleetLift > 2, 'unambiguously above independence');
});

check('two BAD but independent experts do not read as correlated', () => {
  // The reason a ratio is used and not a raw co-failure rate. Both are wrong
  // 80% of the time, so they are both wrong on ~64% of tasks — a huge raw
  // number that says nothing about correlation. Fails if the denominator goes.
  const t = new AgreementTracker();
  const ra = rng(11);
  const rb = rng(2024);
  for (let i = 0; i < 4000; i += 1) {
    t.recordTask([
      { expert: 'a', correct: ra() >= 0.8 },
      { expert: 'b', correct: rb() >= 0.8 },
    ]);
  }
  const [p] = t.pairAgreements();
  truthy(p.observedJoint > 0.55, `raw co-failure is high: ${p.observedJoint.toFixed(2)}`);
  near(p.lift, 1.0, 0.1, 'but the LIFT correctly reports independence');
});

check('anti-correlated failures measure a lift BELOW 1', () => {
  // They fail on complementary tasks — the best possible case for a panel.
  const t = new AgreementTracker();
  const r = rng(5);
  for (let i = 0; i < 2000; i += 1) {
    const aWrong = r() < 0.4;
    t.recordTask([
      { expert: 'a', correct: !aWrong },
      { expert: 'b', correct: aWrong },
    ]);
  }
  truthy(t.stats().fleetLift < 0.3, `expected well below 1, got ${t.stats().fleetLift}`);
});

// ── refusing to invent evidence ──────────────────────────────────────────────

check('nothing is reported when there is no evidence', () => {
  // A default of "assume independent" would recommend a panel in precisely the
  // deployment where a panel loses money.
  const t = new AgreementTracker();
  const s = t.stats();
  eq(s.fleetLift, null, 'no lift is asserted');
  eq(s.confident, false, 'and it says so');
  eq(t.mostIndependentPair(), null, 'no pair can be recommended');
});

check('a top-1 router (one observation per task) stays uninformative', () => {
  const t = new AgreementTracker();
  for (let i = 0; i < 500; i += 1) t.recordTask([{ expert: 'a', correct: i % 3 !== 0 }]);
  const s = t.stats();
  eq(s.tasks, 500, 'tasks still counted');
  eq(s.pairs, 0, 'but no pair is measurable');
  eq(s.fleetLift, null, 'and no lift is invented from it');
  eq(s.confident, false, 'not confident');
});

check('a pair that never fails yields no lift rather than a fabricated one', () => {
  const t = new AgreementTracker({ minCoObservations: 5 });
  for (let i = 0; i < 100; i += 1) {
    t.recordTask([
      { expert: 'a', correct: true },
      { expert: 'b', correct: true },
    ]);
  }
  const [p] = t.pairAgreements();
  eq(p.coObservations, 100, 'observed plenty');
  eq(p.lift, null, '0/0 is not 1.0');
  eq(t.stats().confident, false, 'and that is not confidence');
});

check('confidence requires the configured evidence, not merely some', () => {
  const t = new AgreementTracker({ minCoObservations: 100 });
  const ra = rng(3);
  const rb = rng(4);
  for (let i = 0; i < 40; i += 1) {
    t.recordTask([
      { expert: 'a', correct: ra() >= 0.5 },
      { expert: 'b', correct: rb() >= 0.5 },
    ]);
  }
  eq(t.stats().confident, false, '40 < 100 co-observations');
  truthy(t.stats().fleetLift !== null, 'a value exists, it is just not trusted yet');
  for (let i = 0; i < 80; i += 1) {
    t.recordTask([
      { expert: 'a', correct: ra() >= 0.5 },
      { expert: 'b', correct: rb() >= 0.5 },
    ]);
  }
  eq(t.stats().confident, true, '120 >= 100');
});

// ── pair structure, which is the point of not averaging ──────────────────────

check('correlation is per-PAIR, and the least correlated pair is findable', () => {
  // a and b share a failure mode; c fails on its own schedule. A fleet-wide
  // average would hide that (a,c) is the panel worth running.
  const t = new AgreementTracker();
  const shared = rng(21);
  const own = rng(77);
  for (let i = 0; i < 2000; i += 1) {
    const sharedWrong = shared() < 0.3;
    t.recordTask([
      { expert: 'a', correct: !sharedWrong },
      { expert: 'b', correct: !sharedWrong },
      { expert: 'c', correct: own() >= 0.3 },
    ]);
  }
  const pairs = t.pairAgreements();
  eq(pairs.length, 3, 'three pairs from three experts');
  const ab = pairs.find((p) => p.a === 'a' && p.b === 'b');
  const ac = pairs.find((p) => p.a === 'a' && p.b === 'c');
  truthy(ab.lift > 2.5, `a/b fail together: lift ${ab.lift.toFixed(2)}`);
  near(ac.lift, 1.0, 0.15, 'a/c are independent');
  eq(pairs[0].b, 'b', 'most correlated pair sorts first');
  const best = t.mostIndependentPair();
  truthy(best.a === 'a' || best.a === 'b', `least correlated pair involves c: ${best.a}/${best.b}`);
  eq(best.b, 'c', 'and it is the one with c in it');
});

check('pair identity is order-insensitive', () => {
  const t = new AgreementTracker();
  t.recordTask([
    { expert: 'z', correct: false },
    { expert: 'a', correct: false },
  ]);
  t.recordTask([
    { expert: 'a', correct: false },
    { expert: 'z', correct: false },
  ]);
  eq(t.stats().pairs, 1, 'a/z and z/a are one pair');
  const [p] = t.pairAgreements();
  eq(p.coObservations, 2, 'both tasks counted');
  eq(p.bothWrong, 2, 'both-wrong counted regardless of argument order');
});

check('per-expert wrong counts are not swapped by argument order', () => {
  // The subtle one: `a` is the lexicographically smaller id, so counts must be
  // assigned by identity, not by position. Fails if the code assumes
  // outcomes[i] is always the pair's `a`.
  const t = new AgreementTracker();
  // 'z' is wrong every time, 'a' never is — but supplied z-first.
  for (let i = 0; i < 10; i += 1) {
    t.recordTask([
      { expert: 'z', correct: false },
      { expert: 'a', correct: true },
    ]);
  }
  const [p] = t.pairAgreements();
  eq(p.a, 'a', 'a sorts first');
  eq(p.aWrong, 0, "a was never wrong");
  eq(p.bWrong, 10, 'z was always wrong');
  eq(p.bothWrong, 0, 'never both');
});

check('three experts on one task produce all three pairs', () => {
  const t = new AgreementTracker();
  t.recordTask([
    { expert: 'a', correct: false },
    { expert: 'b', correct: false },
    { expert: 'c', correct: true },
  ]);
  eq(t.stats().pairs, 3, 'a/b, a/c, b/c');
  const ab = t.pairAgreements().find((p) => p.a === 'a' && p.b === 'b');
  eq(ab.bothWrong, 1, 'a and b were both wrong on this task');
});

check('the same expert twice in one task is not a pair with itself', () => {
  const t = new AgreementTracker();
  t.recordTask([
    { expert: 'a', correct: false },
    { expert: 'a', correct: false },
  ]);
  eq(t.stats().pairs, 0, 'no self-pair');
});

check('an empty task is counted but contributes nothing', () => {
  const t = new AgreementTracker();
  t.recordTask([]);
  eq(t.stats().tasks, 1, 'the task happened');
  eq(t.stats().pairs, 0, 'it just taught us nothing');
});

check('reset clears evidence without changing configuration', () => {
  const t = new AgreementTracker({ minCoObservations: 2 });
  t.recordTask([
    { expert: 'a', correct: false },
    { expert: 'b', correct: false },
  ]);
  t.reset();
  eq(t.stats().tasks, 0, 'tasks cleared');
  eq(t.stats().pairs, 0, 'pairs cleared');
  eq(t.stats().fleetLift, null, 'lift cleared');
});

// ── the decision this exists to inform ───────────────────────────────────────

check('the estimator separates a panel-worthy fleet from a panel-hostile one', () => {
  // End to end: the number a caller would actually gate on. Sprint M measured
  // that a panel gains +4.70pp when errors are independent and LOSES 0.85pp
  // when they are not. These two fleets must be distinguishable, or the gate
  // cannot be built.
  const build = (correlated) => {
    const t = new AgreementTracker();
    const shared = rng(31);
    const ra = rng(41);
    const rb = rng(53);
    for (let i = 0; i < 2000; i += 1) {
      const s = shared() < 0.25;
      t.recordTask([
        { expert: 'a', correct: correlated ? !s : ra() >= 0.25 },
        { expert: 'b', correct: correlated ? !s : rb() >= 0.25 },
      ]);
    }
    return t.stats().fleetLift;
  };
  const indep = build(false);
  const corr = build(true);
  near(indep, 1.0, 0.15, 'panel-worthy fleet reads as independent');
  truthy(corr > 3, `panel-hostile fleet reads as correlated: ${corr.toFixed(2)}`);
  truthy(corr / indep > 2.5, 'the two are separable by a wide margin');
});

// -- the direct measurement, after the proxy was found to saturate -----------

check('panel uplift is null before any panel has run', () => {
  const t = new AgreementTracker();
  const u = t.panelUplift();
  eq(u.observations, 0, 'nothing observed');
  eq(u.upliftPp, null, 'and nothing asserted');
  eq(u.confident, false, 'not confident');
});

check('uplift measures the panel-minus-leader difference in points', () => {
  const t = new AgreementTracker({ minCoObservations: 10 });
  // 100 tasks: leader right 60, panel right 75.
  for (let i = 0; i < 60; i += 1) t.recordPanelOutcome(true, i < 55);
  for (let i = 0; i < 40; i += 1) t.recordPanelOutcome(false, i < 20);
  const u = t.panelUplift();
  eq(u.observations, 100, '100 panels');
  eq(u.leaderCorrect, 60, 'leader right 60');
  eq(u.panelCorrect, 75, 'panel right 55 + 20');
  eq(u.upliftPp, 15, '+15 points');
  eq(u.confident, true, 'enough evidence');
});

check('rescued and spoiled are tracked APART, not just netted', () => {
  // The distinction the header argues for: a panel that rescues 200 and spoils
  // 190 nets +10 and is a coin flip; one that rescues 60 and spoils 0 nets less
  // and is strictly better. Fails if only the net is stored.
  const coinFlip = new AgreementTracker({ minCoObservations: 1 });
  for (let i = 0; i < 200; i += 1) coinFlip.recordPanelOutcome(false, true);
  for (let i = 0; i < 190; i += 1) coinFlip.recordPanelOutcome(true, false);
  const cf = coinFlip.panelUplift();

  const clean = new AgreementTracker({ minCoObservations: 1 });
  for (let i = 0; i < 60; i += 1) clean.recordPanelOutcome(false, true);
  for (let i = 0; i < 330; i += 1) clean.recordPanelOutcome(true, true);
  const cl = clean.panelUplift();

  eq(cf.rescued, 200, 'coin-flip rescues');
  eq(cf.spoiled, 190, 'coin-flip spoils almost as many');
  eq(cl.rescued, 60, 'clean rescues fewer');
  eq(cl.spoiled, 0, 'and spoils none');
  truthy(
    cf.upliftPp < cl.upliftPp,
    'the clean panel nets more here, but the point is the two are distinguishable at all'
  );
  truthy(cf.spoiled > 0 && cl.spoiled === 0, 'spoilage is visible separately from the net');
});

check('a panel that only ever agrees with the leader shows zero uplift', () => {
  const t = new AgreementTracker({ minCoObservations: 1 });
  for (let i = 0; i < 50; i += 1) t.recordPanelOutcome(i % 2 === 0, i % 2 === 0);
  const u = t.panelUplift();
  eq(u.upliftPp, 0, 'no uplift');
  eq(u.rescued, 0, 'nothing rescued');
  eq(u.spoiled, 0, 'nothing spoiled');
});

check('a panel that makes things worse reports a NEGATIVE uplift', () => {
  // The case the whole module exists to catch: extra calls, worse answers.
  const t = new AgreementTracker({ minCoObservations: 1 });
  for (let i = 0; i < 30; i += 1) t.recordPanelOutcome(true, false);
  for (let i = 0; i < 10; i += 1) t.recordPanelOutcome(false, true);
  const u = t.panelUplift();
  truthy(u.upliftPp < 0, `must be negative, got ${u.upliftPp}`);
  eq(u.spoiled, 30, 'spoiled more than it rescued');
  eq(u.rescued, 10, 'rescued some');
});

check('reset clears panel evidence too', () => {
  const t = new AgreementTracker({ minCoObservations: 1 });
  t.recordPanelOutcome(false, true);
  t.reset();
  eq(t.panelUplift().observations, 0, 'panel observations cleared');
  eq(t.panelUplift().upliftPp, null, 'uplift cleared');
});

// -- the adaptive gate -------------------------------------------------------

check('rejects an out-of-range exploration rate', () => {
  let n = 0;
  for (const bad of [-0.1, 1.5]) {
    try { new AdaptivePanelPolicy(new AgreementTracker(), { explorationRate: bad }); }
    catch { n += 1; }
  }
  eq(n, 2, 'both rejected');
});

check('it panels unconditionally until it has evidence', () => {
  const t = new AgreementTracker();
  const pol = new AdaptivePanelPolicy(t, { warmupPanels: 20 });
  for (let i = 0; i < 20; i += 1) {
    const d = pol.decide();
    eq(d.panel, true, `warmup task ${i} panels`);
    eq(d.mode, 'warmup', 'and says so');
    t.recordPanelOutcome(true, true); // no uplift at all
  }
  // Evidence now says panels buy nothing; the verdict must flip.
  const after = pol.decide();
  eq(after.mode === 'declined' || after.mode === 'explore', true, `flipped, got ${after.mode}`);
});

check('it keeps panelling while uplift clears the floor', () => {
  const t = new AgreementTracker();
  const pol = new AdaptivePanelPolicy(t, { warmupPanels: 10, minUpliftPp: 0.5 });
  for (let i = 0; i < 10; i += 1) { pol.decide(); t.recordPanelOutcome(false, true); }
  const d = pol.decide();
  eq(d.panel, true, 'panels pay, so keep panelling');
  eq(d.mode, 'exploit', 'and it is exploiting, not warming up');
  truthy(d.upliftPp > 0.5, `uplift ${d.upliftPp} clears the floor`);
});

check('it STOPS panelling when the measured uplift goes negative', () => {
  // The whole point: a fleet whose experts fail together must stop paying for
  // panels. Fails if the gate is removed or always returns true.
  const t = new AgreementTracker();
  const pol = new AdaptivePanelPolicy(t, { warmupPanels: 10, explorationRate: 0 });
  for (let i = 0; i < 10; i += 1) { pol.decide(); t.recordPanelOutcome(true, false); }
  const d = pol.decide();
  eq(d.panel, false, 'panels are actively harmful — stop');
  eq(d.mode, 'declined', 'and say why');
  truthy(d.upliftPp < 0, `negative uplift ${d.upliftPp}`);
});

check('a break-even panel is DECLINED, because extra calls are not free', () => {
  const t = new AgreementTracker();
  const pol = new AdaptivePanelPolicy(t, { warmupPanels: 10, minUpliftPp: 0.5, explorationRate: 0 });
  for (let i = 0; i < 10; i += 1) { pol.decide(); t.recordPanelOutcome(true, true); }
  eq(pol.decide().panel, false, 'zero uplift does not justify 3x the calls');
});

check('exploration never stops, so a verdict can be revisited', () => {
  // Without this the decision is a one-way door: one unlucky warmup and panels
  // never run again whatever the fleet later does. Fails if exploration is
  // dropped once the policy starts declining.
  const t = new AgreementTracker();
  const pol = new AdaptivePanelPolicy(t, { warmupPanels: 5, explorationRate: 0.1 });
  for (let i = 0; i < 5; i += 1) { pol.decide(); t.recordPanelOutcome(true, false); }
  let explored = 0;
  for (let i = 0; i < 500; i += 1) if (pol.decide().mode === 'explore') explored += 1;
  truthy(explored > 0, 'it still probes');
  const st = pol.stats();
  truthy(st.explorationRate <= 0.1 + 1e-9, `held to budget: ${st.explorationRate}`);
  truthy(st.explorationRate > 0.05, `and actually spends it: ${st.explorationRate}`);
});

check('explorationRate 0 makes the decision permanent, but only by choice', () => {
  const t = new AgreementTracker();
  const pol = new AdaptivePanelPolicy(t, { warmupPanels: 5, explorationRate: 0 });
  for (let i = 0; i < 5; i += 1) { pol.decide(); t.recordPanelOutcome(true, false); }
  for (let i = 0; i < 200; i += 1) eq(pol.decide().mode, 'declined', 'never probes again');
  eq(pol.stats().explorations, 0, 'no exploration at all');
});

check('the decision always carries a basis naming the evidence', () => {
  const t = new AgreementTracker();
  const pol = new AdaptivePanelPolicy(t, { warmupPanels: 3 });
  truthy(/Warming up/.test(pol.decide().basis), 'warmup explains itself');
  for (let i = 0; i < 3; i += 1) { pol.decide(); t.recordPanelOutcome(true, false); }
  const d = pol.decide();
  truthy(/rescued|not paying/.test(d.basis), `basis names the evidence: ${d.basis}`);
});

check('the gate reads UPLIFT, not the saturating lift proxy', () => {
  // The coverage hole this sprint nearly shipped. Sprint N's whole finding is
  // that fleetLift saturates: it reads ~2.14 where a panel still pays +3.75pp
  // and ~2.28 where the panel LOSES. A gate on lift would therefore decline in
  // a fleet where panels are clearly working.
  //
  // This builds exactly that fleet: experts that DO fail together (high lift),
  // whose panels nonetheless rescue far more than they spoil (positive uplift).
  // The gate must follow the uplift. Fails if it is rewired to lift.
  const t = new AgreementTracker({ minCoObservations: 10 });
  const r = rng(1234);
  for (let i = 0; i < 400; i += 1) {
    const shared = r() < 0.4;
    t.recordTask([
      { expert: 'a', correct: !shared },
      { expert: 'b', correct: !shared },
    ]);
  }
  const lift = t.stats().fleetLift;
  truthy(lift > 2, `these experts genuinely fail together: lift ${lift.toFixed(2)}`);

  for (let i = 0; i < 100; i += 1) t.recordPanelOutcome(i >= 70, true);
  const u = t.panelUplift();
  truthy(u.upliftPp > 20, `yet the panel is clearly paying: ${u.upliftPp.toFixed(1)}pp`);

  const pol = new AdaptivePanelPolicy(t, { warmupPanels: 10, minUpliftPp: 0.5 });
  const d = pol.decide();
  eq(d.panel, true, 'the gate must keep panelling on the uplift evidence');
  eq(d.mode, 'exploit', 'exploiting a measured gain, not declining on a proxy');
});

check('a low-lift fleet whose panels do NOT pay is still declined', () => {
  // The mirror image, so the test above cannot be satisfied by ignoring
  // evidence entirely. Experts look independent, but panels lose anyway.
  const t = new AgreementTracker({ minCoObservations: 10 });
  const ra = rng(9);
  const rb = rng(88);
  for (let i = 0; i < 400; i += 1) {
    t.recordTask([
      { expert: 'a', correct: ra() >= 0.3 },
      { expert: 'b', correct: rb() >= 0.3 },
    ]);
  }
  near(t.stats().fleetLift, 1.0, 0.15, 'these look independent');
  for (let i = 0; i < 100; i += 1) t.recordPanelOutcome(true, i < 80);
  const pol = new AdaptivePanelPolicy(t, { warmupPanels: 10, explorationRate: 0 });
  const d = pol.decide();
  eq(d.panel, false, 'independent-looking, but panels measurably lose');
  eq(d.mode, 'declined', 'so decline');
});

report();
