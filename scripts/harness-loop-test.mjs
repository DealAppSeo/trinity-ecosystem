#!/usr/bin/env node
// scripts/harness-loop-test.mjs — the agent execution kernel.
//
// Run: node scripts/harness-loop-test.mjs
//
// The assertions that carry the file, each guarding a failure that LOOKS like
// success:
//
//   * 'a VERIFIED claim is downgraded after X' — the headline property. An
//     agent narrates its own outcome, so a loop that takes the narration at
//     face value is a machine for producing unearned success claims. Tested
//     separately for each way the harness can know better: a denial, an
//     unreachable tool, an authorizer that could not answer.
//   * 'an empty allowlist denies everything' — a default that widens on absence
//     makes the unconfigured deployment the most permissive one.
//   * 'unknown effect spends write budget' — rm -rf and git status arrive
//     through the same tool. Classifying unknown as a read would let the most
//     dangerous calls through the cheapest door.
//   * 'the authorizer throwing fails CLOSED' — a component that cannot answer
//     has not said yes.
//   * 'BOTH gates are independently load-bearing' — LESSONS A12: two checks
//     that each make the other redundant are invisible to single-mutation
//     testing, and "each is individually redundant" is the argument that
//     deletes both. Written before the mutation run rather than after it.
//   * 'iteration exhaustion is NOT_CHECKED, never FAILED' — "we did not finish"
//     and "it failed" are different facts. Collapsing them is the two-outcome
//     bug this codebase keeps paying for.

import { compileHarness } from './lib/harness-compile.mjs';

const { load } = compileHarness();
const { ManualClock } = await load('types');
const { runAgentLoop, weakerOutcome } = await load('loop');

// Local async checker. The shared createChecker calls fn() synchronously, so an
// async body's rejection would escape the try and be reported as an unhandled
// rejection rather than a failed assertion — a test that cannot fail. Output
// shape is deliberately identical to every other suite here: a runner grepping
// for `N passed, M failed` must not fall through to its own default and invent
// a pass (see the eight sprints harness-portability spent green while red).
let passed = 0;
const failures = [];
const check = async (name, fn) => {
  try {
    await fn();
    passed += 1;
  } catch (e) {
    failures.push(`${name}\n    ${e.message}`);
  }
};
const eq = (actual, expected, what) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what}: expected ${b}, got ${a}`);
};
const truthy = (v, what) => {
  if (!v) throw new Error(`${what}: expected truthy, got ${JSON.stringify(v)}`);
};
const match = (str, re, what) => {
  if (!re.test(str)) throw new Error(`${what}: ${JSON.stringify(str)} does not match ${re}`);
};

// ── fixtures ────────────────────────────────────────────────────────────────

/** Replays scripted turns; repeats the last one forever so budgets can be exercised. */
const scriptedModel = (turns) => {
  let i = 0;
  return {
    async turn() {
      const t = turns[Math.min(i, turns.length - 1)];
      i += 1;
      return typeof t === 'function' ? t(i) : t;
    },
  };
};

const okDispatcher = (content = 'ok') => ({
  calls: [],
  async call(c) {
    this.calls.push(c);
    return { content: typeof content === 'function' ? content(c, this.calls.length) : content };
  },
});

const allowAll = { async authorize() { return { allowed: true, reason: 'test allows' }; } };
const denyAll = {
  async authorize() {
    return { allowed: false, kind: 'authorizer_denied', reason: 'test denies' };
  },
};
const throwingAuthorizer = {
  async authorize() {
    throw new Error('policy service unreachable');
  },
};

const policy = (over = {}) => ({
  maxIterations: 25,
  noProgressAbortAfter: 3,
  toolsAllowed: ['read_thing'],
  irreversibleRequiresHuman: [],
  untrustedOutputSources: [],
  maxWritesPerSession: 0,
  toolEffects: { read_thing: 'read' },
  ...over,
});

const call = (name, args = {}, id = `c${Math.random().toString(16).slice(2, 8)}`) => ({ id, name, args });
const handoff = (outcome) => ({ outcome, summary: 'done', evidence: ['ran the thing'] });

const run = (over = {}) =>
  runAgentLoop({
    taskId: 't1',
    policy: policy(over.policy),
    model: over.model ?? scriptedModel([{ calls: [], handoff: handoff('VERIFIED') }]),
    tools: over.tools ?? okDispatcher(),
    authorizer: over.authorizer ?? allowAll,
    clock: over.clock ?? new ManualClock(1000),
  });

// ── the claim ceiling — the property the whole kernel exists for ────────────

await check('weakerOutcome ranks by CLAIM STRENGTH, not by quality', () => {
  eq(weakerOutcome('VERIFIED', 'NOT_CHECKED'), 'NOT_CHECKED', 'verified yields');
  eq(weakerOutcome('NOT_CHECKED', 'FAILED'), 'FAILED', 'failed is the weakest claim');
  eq(weakerOutcome('VERIFIED', 'VERIFIED'), 'VERIFIED', 'no spurious downgrade');
});

await check('a clean run keeps its VERIFIED claim', async () => {
  const r = await run({
    model: scriptedModel([
      { calls: [call('read_thing', { q: 1 })] },
      { calls: [], handoff: handoff('VERIFIED') },
    ]),
  });
  eq(r.outcome, 'VERIFIED', 'a clean run was downgraded');
  eq(r.stopReason, 'typed_handoff', 'stop reason');
  eq(r.downgradedBecause, undefined, 'nothing should have been downgraded');
});

await check('A VERIFIED CLAIM IS DOWNGRADED AFTER A DENIED CALL', async () => {
  const r = await run({
    // `write_thing` is not in tools.allowed, so the call is refused.
    model: scriptedModel([
      { calls: [call('write_thing')] },
      { calls: [], handoff: handoff('VERIFIED') },
    ]),
  });
  eq(r.claimed, 'VERIFIED', 'the agent did claim VERIFIED');
  eq(r.outcome, 'NOT_CHECKED', 'the agent certified above what the harness observed');
  match(r.downgradedBecause ?? '', /refused/, 'the downgrade must name its cause');
});

await check('A VERIFIED CLAIM IS DOWNGRADED AFTER AN UNREACHABLE TOOL', async () => {
  // The proxy-403 case, and the reason `tools.unavailable_is_not_checked` is
  // constitutional: reading a blocked host as failure is how a 403 became a
  // credential rotation in this repo's history. It is not FAILED — and it is
  // equally not VERIFIED.
  const r = await run({
    tools: { async call() { return { content: 'CONNECT 403', unavailable: true }; } },
    model: scriptedModel([
      { calls: [call('read_thing')] },
      { calls: [], handoff: handoff('VERIFIED') },
    ]),
  });
  eq(r.outcome, 'NOT_CHECKED', 'an unreachable tool left a VERIFIED claim standing');
  match(r.downgradedBecause ?? '', /unreachable/, 'the downgrade must name its cause');
  eq(r.turns[0].calls[0].observation.outcome, 'unavailable', 'observation outcome');
});

await check('A VERIFIED CLAIM IS DOWNGRADED WHEN THE AUTHORIZER COULD NOT ANSWER', async () => {
  const r = await run({
    authorizer: throwingAuthorizer,
    model: scriptedModel([
      { calls: [call('read_thing')] },
      { calls: [], handoff: handoff('VERIFIED') },
    ]),
  });
  eq(r.outcome, 'NOT_CHECKED', 'an unanswerable authorizer left a VERIFIED claim standing');
  match(r.downgradedBecause ?? '', /could not answer/, 'the downgrade must name its cause');
});

await check('a self-reported FAILURE is neither upgraded nor downgraded', async () => {
  // The ceiling revokes over-claims. It must not touch an agent that admits
  // failure — an honest FAILED is the most trustworthy thing an agent emits.
  const r = await run({
    model: scriptedModel([
      { calls: [call('write_thing')] },
      { calls: [], handoff: handoff('FAILED') },
    ]),
  });
  eq(r.outcome, 'FAILED', 'a self-reported failure was rewritten');
  eq(r.downgradedBecause, undefined, 'nothing to downgrade');
});

await check('a downgrade is never silent', async () => {
  // A downgrade nobody can see is the same failure as no downgrade at all.
  const r = await run({
    model: scriptedModel([
      { calls: [call('write_thing')] },
      { calls: [], handoff: handoff('VERIFIED') },
    ]),
  });
  truthy(r.downgradedBecause, 'downgradedBecause must be populated');
  match(r.detail, /cannot certify above what the harness observed/, 'detail states the rule');
});

// ── bounds ──────────────────────────────────────────────────────────────────

await check('ITERATION EXHAUSTION IS NOT_CHECKED, NEVER FAILED', async () => {
  // "We ran out of budget" is not "the work failed". Two outcomes collapse the
  // distinction; three keep it.
  const r = await run({
    policy: { maxIterations: 4 },
    model: scriptedModel([
      (n) => ({ calls: [call('read_thing', { n })] }), // always new args = always progress
    ]),
    tools: okDispatcher((c) => `result ${JSON.stringify(c.args)}`),
  });
  eq(r.outcome, 'NOT_CHECKED', 'exhaustion must not read as failure');
  eq(r.stopReason, 'iteration_budget_exhausted', 'stop reason');
  eq(r.turns.length, 4, 'the cap must be exact, not off by one');
});

await check('no-progress aborts after EXACTLY the configured count', async () => {
  // Boundary, tested at N-1 and N. A rate limiter tested only well past its cap
  // leaves the off-by-one unobserved — the same defect the maxValue caveat had.
  const mk = (abortAfter) =>
    run({
      policy: { noProgressAbortAfter: abortAfter, maxIterations: 20 },
      model: scriptedModel([{ calls: [call('read_thing', { q: 'same' }, 'fixed')] }]),
      tools: okDispatcher('identical every time'),
    });
  const r = await mk(3);
  eq(r.stopReason, 'no_progress', 'should abort on repetition');
  // Turn 1 is progress (first time these args were seen); turns 2,3,4 repeat.
  eq(r.turns.length, 4, 'one progressing turn plus exactly 3 stalled ones');
  eq(r.outcome, 'NOT_CHECKED', 'a stall is not a failure');
});

await check('progress RESETS the no-progress counter', async () => {
  // Without a reset, an agent alternating stall/progress dies on its 3rd
  // cumulative stall despite working.
  let n = 0;
  const r = await run({
    policy: { noProgressAbortAfter: 2, maxIterations: 8 },
    model: scriptedModel([() => ({ calls: [call('read_thing', { q: 'same' }, 'fixed')] })]),
    tools: {
      async call() {
        n += 1;
        // Same result twice, then a different one, repeating.
        return { content: n % 3 === 0 ? `changed-${n}` : 'same' };
      },
    },
  });
  eq(r.stopReason, 'iteration_budget_exhausted', 'the counter did not reset on progress');
});

await check('a turn with no calls and no handoff is a STALL, not a stop', async () => {
  // `loops.stop_requires_typed_handoff` is constitutional. An agent that says
  // "I'm finished" in prose and stops calling tools has not stopped — it has
  // gone idle, which loses the session.
  const r = await run({
    policy: { noProgressAbortAfter: 2, maxIterations: 10 },
    model: scriptedModel([{ calls: [], note: 'I believe the task is complete.' }]),
  });
  eq(r.stopReason, 'no_progress', 'prose ended the loop as if it were a handoff');
  eq(r.outcome, 'NOT_CHECKED', 'a stall must not certify anything');
  match(r.turns[0].progressReason, /prose is not an exit/, 'reason names the rule');
});

// ── gate 1: policy over the loop's own state ────────────────────────────────

await check('AN EMPTY ALLOWLIST DENIES EVERYTHING', async () => {
  // Absence must not widen. An unset allowlist meaning "all tools" would make
  // the unconfigured deployment the most permissive one.
  const r = await run({
    policy: { toolsAllowed: [] },
    model: scriptedModel([{ calls: [call('read_thing')] }, { calls: [], handoff: handoff('VERIFIED') }]),
  });
  eq(r.turns[0].calls[0].verdict.allowed, false, 'empty allowlist allowed a call');
  eq(r.turns[0].calls[0].verdict.kind, 'not_in_allowlist', 'denial kind');
});

await check('AN IRREVERSIBLE TOOL IS REFUSED even when allowed and authorized', async () => {
  // Constitutional. A published version can never be reused; a merged PR cannot
  // be unmerged. No score, capability or grant buys these back.
  const r = await run({
    policy: {
      toolsAllowed: ['npm.publish'],
      irreversibleRequiresHuman: ['npm.publish'],
      toolEffects: { 'npm.publish': 'read' }, // even classified harmless
      maxWritesPerSession: 1000,
    },
    authorizer: allowAll,
    model: scriptedModel([{ calls: [call('npm.publish')] }, { calls: [], handoff: handoff('VERIFIED') }]),
  });
  eq(r.turns[0].calls[0].verdict.allowed, false, 'an irreversible tool was dispatched');
  eq(r.turns[0].calls[0].verdict.kind, 'irreversible_requires_human', 'denial kind');
});

await check('the default write budget of 0 denies a write', async () => {
  const r = await run({
    policy: { toolsAllowed: ['write_thing'], toolEffects: { write_thing: 'write' } },
    model: scriptedModel([{ calls: [call('write_thing')] }, { calls: [], handoff: handoff('VERIFIED') }]),
  });
  eq(r.turns[0].calls[0].verdict.kind, 'write_budget_exhausted', 'a write got through a 0 budget');
});

await check('UNKNOWN EFFECT SPENDS WRITE BUDGET; read does not', async () => {
  // rm -rf and git status arrive through the same Bash tool. Treating unknown
  // as a read lets the most dangerous calls through the cheapest door.
  const unknown = await run({
    policy: { toolsAllowed: ['bash'], toolEffects: {} },
    model: scriptedModel([{ calls: [call('bash')] }, { calls: [], handoff: handoff('VERIFIED') }]),
  });
  eq(unknown.turns[0].calls[0].effect, 'unknown', 'unlisted tools are unknown');
  eq(unknown.turns[0].calls[0].verdict.kind, 'write_budget_exhausted', 'unknown must spend budget');

  const read = await run({
    model: scriptedModel([{ calls: [call('read_thing')] }, { calls: [], handoff: handoff('VERIFIED') }]),
  });
  eq(read.turns[0].calls[0].verdict.allowed, true, 'a read was charged against the write budget');
  eq(read.session.writes, 0, 'reads must not spend write budget');
});

await check('the write budget boundary allows exactly N and refuses N+1', async () => {
  const r = await run({
    policy: {
      toolsAllowed: ['write_thing'],
      toolEffects: { write_thing: 'write' },
      maxWritesPerSession: 2,
      maxIterations: 4,
    },
    model: scriptedModel([(n) => ({ calls: [call('write_thing', { n })] })]),
    tools: okDispatcher((c) => `wrote ${JSON.stringify(c.args)}`),
  });
  const verdicts = r.turns.map((t) => t.calls[0].verdict.allowed);
  eq(verdicts.slice(0, 2), [true, true], 'a budget of 2 must permit exactly 2');
  eq(verdicts[2], false, 'the third write must be refused');
  eq(r.session.writes, 2, 'spent writes');
});

// ── gate 2, and the redundancy between them ─────────────────────────────────

await check('the authorizer refuses even when policy would allow', async () => {
  const r = await run({
    authorizer: denyAll,
    model: scriptedModel([{ calls: [call('read_thing')] }, { calls: [], handoff: handoff('VERIFIED') }]),
  });
  eq(r.turns[0].calls[0].verdict.allowed, false, 'the authorizer was not consulted');
  eq(r.turns[0].calls[0].verdict.kind, 'authorizer_denied', 'denial kind');
});

await check('THE AUTHORIZER THROWING FAILS CLOSED', async () => {
  // A component that cannot answer has not said yes. Same discipline as
  // SupabaseNonceStore, which throws rather than reporting a nonce unspent.
  const r = await run({
    authorizer: throwingAuthorizer,
    model: scriptedModel([{ calls: [call('read_thing')] }, { calls: [], handoff: handoff('VERIFIED') }]),
  });
  eq(r.turns[0].calls[0].verdict.allowed, false, 'a thrown authorizer failed OPEN');
  eq(r.turns[0].calls[0].verdict.kind, 'authorizer_error', 'denial kind');
});

await check('BOTH GATES ARE INDEPENDENTLY LOAD-BEARING', async () => {
  // LESSONS A12, applied before the mutation run rather than after it. Deleting
  // either gate alone must be observable, or "each one is individually
  // redundant" becomes the argument that deletes both.
  //
  // Gate 1 alone: policy refuses, authorizer would have allowed.
  const policyOnly = await run({
    policy: { toolsAllowed: [] },
    authorizer: allowAll,
    model: scriptedModel([{ calls: [call('read_thing')] }, { calls: [], handoff: handoff('VERIFIED') }]),
  });
  eq(policyOnly.turns[0].calls[0].verdict.kind, 'not_in_allowlist', 'gate 1 alone must refuse');

  // Gate 2 alone: policy permits, authorizer refuses.
  const authorizerOnly = await run({
    authorizer: denyAll,
    model: scriptedModel([{ calls: [call('read_thing')] }, { calls: [], handoff: handoff('VERIFIED') }]),
  });
  eq(authorizerOnly.turns[0].calls[0].verdict.kind, 'authorizer_denied', 'gate 2 alone must refuse');
});

await check('a refused call is NEVER dispatched', async () => {
  // The verdict must gate the side effect, not merely annotate it.
  const tools = okDispatcher();
  await run({
    policy: { toolsAllowed: [] },
    tools,
    model: scriptedModel([{ calls: [call('read_thing')] }, { calls: [], handoff: handoff('VERIFIED') }]),
  });
  eq(tools.calls.length, 0, 'a denied call reached the dispatcher');
});

await check('denied attempts are counted, because escalation is a pattern', async () => {
  const r = await run({
    policy: { toolsAllowed: [], noProgressAbortAfter: 2, maxIterations: 6 },
    model: scriptedModel([{ calls: [call('secrets.rotate', {}, 'fixed')] }]),
  });
  truthy(r.session.deniedAttempts >= 2, 'repeated refusals must accumulate');
  truthy(r.session.callsByTool['secrets.rotate'] >= 2, 'attempts are counted even when refused');
});

// ── the model must not set its own blast radius ─────────────────────────────

await check('EFFECT IS LOOKED UP, never taken from the call', async () => {
  // A model that could declare its own call a read would set its own blast
  // radius — self-report in the one place it costs the most.
  const r = await run({
    policy: {
      toolsAllowed: ['write_thing'],
      toolEffects: { write_thing: 'write' },
      maxWritesPerSession: 0,
    },
    model: scriptedModel([
      { calls: [call('write_thing', { effect: 'read', harmless: true })] },
      { calls: [], handoff: handoff('VERIFIED') },
    ]),
  });
  eq(r.turns[0].calls[0].effect, 'write', 'the model talked its way into a read classification');
  eq(r.turns[0].calls[0].verdict.kind, 'write_budget_exhausted', 'and past the budget');
});

// ── canonical arguments ─────────────────────────────────────────────────────

await check('argument KEY ORDER does not fake progress', async () => {
  // Insertion-order stringify would fingerprint {a,b} and {b,a} differently, so
  // every repeated call would look new and the stall detector would never fire.
  let n = 0;
  const r = await run({
    policy: { noProgressAbortAfter: 2, maxIterations: 8 },
    model: scriptedModel([
      () => ({
        calls: [
          n++ % 2 === 0
            ? call('read_thing', { alpha: 1, beta: 2 }, 'x')
            : call('read_thing', { beta: 2, alpha: 1 }, 'x'),
        ],
      }),
    ]),
    tools: okDispatcher('identical'),
  });
  eq(r.stopReason, 'no_progress', 'reordered keys read as a different call');
  // THE TURN COUNT IS THE ASSERTION. Found by mutation: with unsorted keys the
  // run still ends in no_progress, just two turns later, because {a,b} and
  // {b,a} each become "new" once before repeating. Asserting only the stop
  // reason passed against a broken canonicaliser — a test passing for the wrong
  // reason, which is the recurring defect in this suite's history.
  //
  // Canonical: turn 1 is new, turns 2 and 3 repeat → abort on turn 3.
  eq(r.turns.length, 3, 'the stall was detected late, so key order still mattered');
});

// ── untrusted output ────────────────────────────────────────────────────────

await check('output from an untrusted source is FLAGGED in the record', async () => {
  // Tool output is data, never instructions. This kernel cannot stop a model
  // reading text; it can make the exposure visible rather than implicit.
  const r = await run({
    policy: { toolsAllowed: ['web.fetch'], toolEffects: { 'web.fetch': 'read' }, untrustedOutputSources: ['web.fetch'] },
    model: scriptedModel([{ calls: [call('web.fetch')] }, { calls: [], handoff: handoff('VERIFIED') }]),
  });
  eq(r.turns[0].calls[0].observation.untrusted, true, 'untrusted output was not flagged');
});

await check('an untrusted source cannot UN-FLAG itself mid-run', async () => {
  // The narrowing direction. Widening the list mid-run grants nothing, but
  // removing an entry would let a source that injected once stop being marked
  // as untrusted for every later observation — laundering its own provenance.
  const live = policy({
    toolsAllowed: ['web.fetch'],
    toolEffects: { 'web.fetch': 'read' },
    untrustedOutputSources: ['web.fetch'],
    maxIterations: 2,
    noProgressAbortAfter: 9,
  });
  const r = await runAgentLoop({
    taskId: 't-unflag',
    policy: live,
    model: scriptedModel([
      (n) => {
        live.untrustedOutputSources.length = 0;
        return { calls: [call('web.fetch', { n })] };
      },
    ]),
    tools: okDispatcher((c) => `page ${JSON.stringify(c.args)}`),
    authorizer: allowAll,
    clock: new ManualClock(0),
  });
  for (const t of r.turns) {
    eq(t.calls[0].observation.untrusted, true, 'a source un-flagged itself mid-run');
  }
});

await check('UNTRUSTED OUTPUT CANNOT WIDEN THE ALLOWLIST', async () => {
  // The structural half of the prompt-injection defence: policy is copied and
  // frozen at entry, so a caller (or anything that reaches the caller's object
  // mid-run) cannot grow the agent's authority while it runs.
  const live = policy({ toolsAllowed: ['read_thing'], maxIterations: 4, noProgressAbortAfter: 9 });
  const r = await runAgentLoop({
    taskId: 't-inject',
    policy: live,
    model: scriptedModel([
      () => {
        // Simulates a compromised caller reacting to injected tool output.
        live.toolsAllowed.push('secrets.rotate');
        live.maxWritesPerSession = 999;
        return { calls: [call('secrets.rotate', {}, 'inj')] };
      },
    ]),
    tools: okDispatcher(),
    authorizer: allowAll,
    clock: new ManualClock(0),
  });
  eq(r.turns[0].calls[0].verdict.allowed, false, 'the allowlist widened mid-run');
  eq(r.turns[0].calls[0].verdict.kind, 'not_in_allowlist', 'denial kind');
});

await check('UNTRUSTED OUTPUT CANNOT RAISE THE WRITE BUDGET', async () => {
  // The second half, and the one that actually proves the copy is load-bearing.
  //
  // Found by mutation: replacing the frozen copy with a reference survived the
  // allowlist test above, because `allowed` is a Set built once at entry — the
  // SNAPSHOT was doing the work, not the freeze. The write budget is read from
  // the policy object on every call, so it is where a live reference shows.
  const live = policy({
    toolsAllowed: ['write_thing'],
    toolEffects: { write_thing: 'write' },
    maxWritesPerSession: 0,
    maxIterations: 3,
    noProgressAbortAfter: 9,
  });
  const r = await runAgentLoop({
    taskId: 't-budget',
    policy: live,
    model: scriptedModel([
      (n) => {
        live.maxWritesPerSession = 999; // a compromised caller, mid-run
        return { calls: [call('write_thing', { n })] };
      },
    ]),
    tools: okDispatcher(),
    authorizer: allowAll,
    clock: new ManualClock(0),
  });
  for (const t of r.turns) {
    eq(t.calls[0].verdict.kind, 'write_budget_exhausted', 'the write budget was raised mid-run');
  }
  eq(r.session.writes, 0, 'no write should have been spent');
});

// ── the record ──────────────────────────────────────────────────────────────

await check('every call carries a verdict, and turns carry a timestamp', async () => {
  const clock = new ManualClock(5000);
  const r = await run({
    clock,
    model: scriptedModel([{ calls: [call('read_thing')] }, { calls: [], handoff: handoff('VERIFIED') }]),
  });
  for (const t of r.turns) {
    eq(typeof t.startedAt, 'number', 'turn timestamp');
    for (const c of t.calls) truthy(c.verdict, 'every call must record a verdict');
  }
  eq(typeof r.endedAt, 'number', 'run timestamp');
});

await check('a model client that throws says NOTHING about the task', async () => {
  // `reliability.harness_error_marks_not_checked`. A harness fault is not
  // evidence about the work, in either direction.
  const r = await run({
    model: { async turn() { throw new Error('502 from the gateway'); } },
  });
  eq(r.outcome, 'NOT_CHECKED', 'a harness fault was scored as a task outcome');
  eq(r.stopReason, 'model_error', 'stop reason');
  eq(r.claimed, undefined, 'nothing was claimed');
});

// ── report ──────────────────────────────────────────────────────────────────

console.log(`\nharness-loop: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All harness-loop checks passed.');
