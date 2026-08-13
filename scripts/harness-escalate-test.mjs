#!/usr/bin/env node
// scripts/harness-escalate-test.mjs — Sprint I: the escalation policy.
//
// Run: node scripts/harness-escalate-test.mjs
//
// Load-bearing assertions, each guarding a failure that LOOKS like success:
//
//   * 'a spent budget is reported, never silent' — a cap that quietly declines
//     to escalate degrades answers while every cost metric stays healthy.
//   * 'budgetDenied is distinct from no-signal'  — "could not afford it" and
//     "did not need it" are different facts and must not collapse.
//   * 'the cap is not exceeded by one'           — testing the pre-increment
//     rate is the classic off-by-one in a rate limiter.
//   * 'a disabled floor never fires'             — a 0 floor must mean OFF, not
//     "escalate always", which is the whole-budget no-op.

import { compileHarness, createChecker } from './lib/harness-compile.mjs';

const { load } = compileHarness();
const { ManualClock } = await load('types');
const { EscalationPolicy } = await load('escalate');

const { check, eq, truthy, close, report } = createChecker('harness-escalate');

const mk = (cfg = {}) => {
  const clock = new ManualClock(500);
  return { clock, pol: new EscalationPolicy(clock, cfg) };
};
// Confident, clearly-leading expert: no signal should fire on this.
const clear = { topEarned: 9000, runnerUpEarned: 4000, topConfidence: 0.95 };

// ── configuration guards ─────────────────────────────────────────────────────

check('rejects an out-of-range maxEscalationRate', () => {
  let a = false;
  let b = false;
  try { new EscalationPolicy(new ManualClock(0), { maxEscalationRate: -0.1 }); } catch { a = true; }
  try { new EscalationPolicy(new ManualClock(0), { maxEscalationRate: 1.1 }); } catch { b = true; }
  eq([a, b], [true, true], 'both must throw');
});

check('rejects an out-of-range confidenceFloor', () => {
  let threw = false;
  try { new EscalationPolicy(new ManualClock(0), { confidenceFloor: 2 }); } catch { threw = true; }
  eq(threw, true, 'must throw');
});

check('rejects negative floors', () => {
  let a = false;
  let b = false;
  try { new EscalationPolicy(new ManualClock(0), { earnedFloor: -1 }); } catch { a = true; }
  try { new EscalationPolicy(new ManualClock(0), { marginFloor: -1 }); } catch { b = true; }
  eq([a, b], [true, true], 'both must throw');
});

// ── floors default to OFF ────────────────────────────────────────────────────

check('a disabled floor never fires', () => {
  // All floors 0 = every signal off. The dangerous inversion is 0 meaning
  // "escalate always", which would spend the entire budget on every task.
  const { pol } = mk();
  const r = pol.decide({ topEarned: 0, runnerUpEarned: 0, topConfidence: 0 });
  eq(r.escalate, false, 'worst possible signals, but every floor is off');
  eq(r.reason, null, 'nothing fired');
  eq(pol.stats().escalations, 0, 'and nothing was counted');
});

check('a clear leader does not escalate with all floors armed', () => {
  const { pol } = mk({ earnedFloor: 5000, marginFloor: 1000, confidenceFloor: 0.5 });
  const r = pol.decide(clear);
  eq(r.escalate, false, 'confident, high, clearly ahead');
  eq(r.reason, null, 'no signal');
  truthy(r.basis.includes('clear pick'), 'basis says so');
});

// ── each signal fires on its own ─────────────────────────────────────────────

check('thin margin fires', () => {
  const { pol } = mk({ marginFloor: 1000 });
  const r = pol.decide({ topEarned: 8000, runnerUpEarned: 7500, topConfidence: 0.9 });
  eq(r.escalate, true, 'a 500 bps lead is under the 1000 floor');
  eq(r.reason, 'thin_margin', 'named');
});

check('low earned fires', () => {
  const { pol } = mk({ earnedFloor: 5000 });
  const r = pol.decide({ topEarned: 4000, runnerUpEarned: 1000, topConfidence: 0.9 });
  eq(r.escalate, true, 'the best available is mediocre');
  eq(r.reason, 'low_earned', 'named');
});

check('low confidence fires', () => {
  const { pol } = mk({ confidenceFloor: 0.5 });
  const r = pol.decide({ topEarned: 9000, runnerUpEarned: 1000, topConfidence: 0.2 });
  eq(r.escalate, true, 'a high score on thin evidence');
  eq(r.reason, 'low_confidence', 'named');
});

check('a lone candidate has infinite margin and does not trip thin_margin', () => {
  // No runner-up means nothing to be close to, so the margin is infinite.
  //
  // topEarned MUST be below marginFloor here. The first version used 6000
  // against a 5000 floor, which passed even when the mutation replaced
  // POSITIVE_INFINITY with topEarned — 6000 still cleared 5000, so the test
  // never distinguished the two and mutation testing caught it as a hole.
  // At 3000 against a 5000 floor the substitution fires and the test fails.
  const { pol } = mk({ marginFloor: 5000 });
  const r = pol.decide({ topEarned: 3000, topConfidence: 0.9 });
  eq(r.escalate, false, 'no runner-up, so no thin margin, even on a low score');
  eq(r.reason, null, 'and no signal at all');
});

check('signals are checked margin, then earned, then confidence', () => {
  // All three would fire; the reported reason must be the first in that order,
  // because a caller tuning floors needs to know which one is binding.
  const { pol } = mk({ marginFloor: 1000, earnedFloor: 5000, confidenceFloor: 0.5 });
  const r = pol.decide({ topEarned: 2000, runnerUpEarned: 1900, topConfidence: 0.1 });
  eq(r.reason, 'thin_margin', 'margin wins the tie-break');
});

// ── the budget cap ───────────────────────────────────────────────────────────

check('a spent budget is reported, never silent', () => {
  // THE ONE THAT MATTERS. Cap at 0 means no panel may ever run; the policy must
  // still say it wanted one, or answer quality falls while cost looks perfect.
  const { pol } = mk({ marginFloor: 1000, maxEscalationRate: 0 });
  const r = pol.decide({ topEarned: 8000, runnerUpEarned: 7900, topConfidence: 0.9 });
  eq(r.escalate, false, 'cannot afford it');
  eq(r.budgetDenied, true, 'and says so');
  eq(r.reason, 'thin_margin', 'and still names what it wanted');
  truthy(r.basis.includes('cost decision, not a quality one'), 'basis is explicit');
  eq(pol.stats().denied, 1, 'counted');
});

check('budgetDenied is distinct from no-signal', () => {
  const { pol } = mk({ marginFloor: 1000, maxEscalationRate: 0 });
  const denied = pol.decide({ topEarned: 8000, runnerUpEarned: 7900, topConfidence: 0.9 });
  const quiet = pol.decide(clear);
  eq(denied.budgetDenied, true, 'wanted, refused');
  eq(quiet.budgetDenied, false, 'never wanted');
  eq(denied.escalate, quiet.escalate, 'both end up not escalating');
  truthy(denied.reason !== quiet.reason, 'but they are NOT the same outcome');
});

check('the cap is not exceeded by one', () => {
  // Rate limiters classically test the pre-increment rate, which lets exactly
  // one extra through. Ten decisions at a 0.2 cap must yield at most 2.
  const { pol } = mk({ marginFloor: 10000, maxEscalationRate: 0.2 });
  for (let i = 0; i < 10; i += 1) {
    pol.decide({ topEarned: 5000, runnerUpEarned: 4999, topConfidence: 0.9 });
  }
  const s = pol.stats();
  eq(s.decisions, 10, 'ten decisions');
  truthy(s.escalations <= 2, `at most 2 escalations at a 0.2 cap, got ${s.escalations}`);
  eq(s.escalations + s.denied, 10, 'every wanted escalation is either taken or denied');
});

check('the cap allows everything at 1', () => {
  const { pol } = mk({ marginFloor: 10000, maxEscalationRate: 1 });
  for (let i = 0; i < 5; i += 1) {
    pol.decide({ topEarned: 5000, runnerUpEarned: 4999, topConfidence: 0.9 });
  }
  eq(pol.stats().escalations, 5, 'all five');
  eq(pol.stats().denied, 0, 'none denied');
});

check('the first escalation cannot fit a cap below 100%', () => {
  // A real and non-obvious consequence of a rate cap: on decision 1 the rate
  // would be 1/1 = 100%, which exceeds any cap under 1. So a capped policy is
  // ALWAYS denied its first panel and needs a warm-up of quiet decisions before
  // it can afford one. Worth an assertion because it means a low cap on a short
  // run produces zero panels, not "a few".
  const { pol } = mk({ marginFloor: 1000, maxEscalationRate: 0.5 });
  const thin = { topEarned: 5000, runnerUpEarned: 4900, topConfidence: 0.9 };
  const first = pol.decide(thin);
  eq(first.escalate, false, '1/1 = 100% exceeds the 50% cap');
  eq(first.budgetDenied, true, 'and it is reported as a budget refusal');
  eq(pol.stats().escalations, 0, 'nothing escalated yet');
});

check('budget recovers as non-escalating decisions accumulate', () => {
  // The cap is a rate, not a quota: quiet tasks make room for later panels.
  const { pol } = mk({ marginFloor: 1000, maxEscalationRate: 0.5 });
  const thin = { topEarned: 5000, runnerUpEarned: 4900, topConfidence: 0.9 };
  pol.decide(clear);
  const second = pol.decide(thin);
  eq(second.escalate, true, 'after one quiet decision, 1/2 = 50% fits the cap');
  eq(pol.stats().escalations, 1, 'and it was taken');
});

// ── accounting ───────────────────────────────────────────────────────────────

check('rate is escalations over decisions, not over escalations', () => {
  const { pol } = mk({ marginFloor: 1000 });
  pol.decide(clear);
  pol.decide(clear);
  pol.decide({ topEarned: 5000, runnerUpEarned: 4900, topConfidence: 0.9 });
  const s = pol.stats();
  eq(s.decisions, 3, 'three decisions');
  eq(s.escalations, 1, 'one escalation');
  close(s.rate, 1 / 3, 0.001, 'rate is 1/3, not 1/1');
});

check('reasons are counted separately', () => {
  const { pol } = mk({ marginFloor: 1000, earnedFloor: 3000, confidenceFloor: 0.3 });
  pol.decide({ topEarned: 8000, runnerUpEarned: 7900, topConfidence: 0.9 });
  pol.decide({ topEarned: 2000, runnerUpEarned: 500, topConfidence: 0.9 });
  pol.decide({ topEarned: 8000, runnerUpEarned: 1000, topConfidence: 0.1 });
  const s = pol.stats();
  eq(s.byReason.thin_margin, 1, 'one margin');
  eq(s.byReason.low_earned, 1, 'one earned');
  eq(s.byReason.low_confidence, 1, 'one confidence');
});

check('stats on a fresh policy are zero, not NaN', () => {
  const { pol } = mk();
  const s = pol.stats();
  eq(s.decisions, 0, 'no decisions');
  eq(s.rate, 0, 'rate 0, not NaN');
});

check('reset clears every counter', () => {
  const { pol } = mk({ marginFloor: 1000 });
  pol.decide({ topEarned: 5000, runnerUpEarned: 4900, topConfidence: 0.9 });
  pol.reset();
  const s = pol.stats();
  eq([s.decisions, s.escalations, s.denied], [0, 0, 0], 'all zero');
  eq(s.byReason.thin_margin, 0, 'reasons too');
});

check('the timestamp comes from the injected clock', () => {
  const { clock, pol } = mk();
  clock.set(4242);
  eq(pol.decide(clear).decidedAt, 4242, 'no wall clock reached into');
});

// ── the point of the module, asserted rather than described ─────────────────

check('a mixed workload escalates only its uncertain share', () => {
  // The whole justification: panels cost 3-4x, so they must not fire on tasks
  // that have an obvious best expert. 8 clear tasks and 2 thin ones should
  // produce 2 panels, not 10.
  const { pol } = mk({ marginFloor: 1000, maxEscalationRate: 1 });
  for (let i = 0; i < 8; i += 1) pol.decide(clear);
  for (let i = 0; i < 2; i += 1) {
    pol.decide({ topEarned: 6000, runnerUpEarned: 5900, topConfidence: 0.9 });
  }
  const s = pol.stats();
  eq(s.escalations, 2, 'only the two uncertain tasks');
  close(s.rate, 0.2, 0.001, 'a 20% escalation rate, not 100%');
});

report();
