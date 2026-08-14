#!/usr/bin/env node
// scripts/harness-transform-test.mjs — Sprint D: middle-out context compression.
//
// Run: node scripts/harness-transform-test.mjs
//
// Every assertion is written to FAIL if the mechanism under test is removed.
// The load-bearing ones, because each guards a failure that LOOKS like success:
//
//   * 'pinned messages survive a budget that cannot fit them' — dropping the
//     system prompt always makes the numbers fit, and destroys the task.
//   * 'reports withinBudget=false rather than pretending' — silently returning
//     over budget collapses "we could not" into "it passed".
//   * 'a tool call and its result are never split' — the subtle one. Compressing
//     by token count alone drops a call and keeps its result, and the malformed
//     conversation then reads as a model bug rather than a transform bug.
//   * 'the ratio is measured in tokens, not message count' — a count-based ratio
//     reports 50% compression for dropping ten one-word messages.

import { compileHarness, createChecker } from './lib/harness-compile.mjs';

const { load } = compileHarness();
const { ManualClock } = await load('types');
const { ContextTransformer, approximateTokens } = await load('transform');

const { check, eq, truthy, close, report } = createChecker('harness-transform');

// 40 chars => 10 tokens under the default estimator.
const body = (n) => 'x'.repeat(n * 4);
const msg = (id, tokens, over = {}) => ({
  id,
  role: 'user',
  content: body(tokens),
  ...over,
});

const mk = (cfg = {}, estimator) => {
  const clock = new ManualClock(1000);
  return {
    clock,
    tf: new ContextTransformer(
      clock,
      { maxTokens: 100, headKeep: 1, tailKeep: 1, ...cfg },
      estimator
    ),
  };
};

// ── configuration guards ─────────────────────────────────────────────────────

check('rejects a non-positive budget', () => {
  let threw = false;
  try {
    new ContextTransformer(new ManualClock(0), { maxTokens: 0, headKeep: 1, tailKeep: 1 });
  } catch {
    threw = true;
  }
  eq(threw, true, 'maxTokens=0 must throw');
});

check('rejects negative head/tail', () => {
  let a = false;
  let b = false;
  try {
    new ContextTransformer(new ManualClock(0), { maxTokens: 10, headKeep: -1, tailKeep: 1 });
  } catch {
    a = true;
  }
  try {
    new ContextTransformer(new ManualClock(0), { maxTokens: 10, headKeep: 1, tailKeep: -1 });
  } catch {
    b = true;
  }
  eq([a, b], [true, true], 'both must throw');
});

// ── the no-op path ───────────────────────────────────────────────────────────

check('a list already within budget is returned untouched', () => {
  const { tf } = mk({ maxTokens: 100 });
  const input = [msg('a', 10), msg('b', 10), msg('c', 10)];
  const r = tf.transform(input);
  eq(r.droppedIds, [], 'nothing dropped');
  eq(r.compressionRatio, 1, 'ratio is 1.0');
  eq(r.withinBudget, true, 'within budget');
  eq(r.messages.length, 3, 'all three returned');
  truthy(r.basis.includes('No compression needed'), 'basis says so');
});

check('the input array is never mutated', () => {
  const { tf } = mk({ maxTokens: 30, headKeep: 1, tailKeep: 1 });
  const input = [msg('a', 10), msg('b', 10), msg('c', 10), msg('d', 10), msg('e', 10)];
  const copy = input.map((m) => m.id);
  tf.transform(input);
  eq(
    input.map((m) => m.id),
    copy,
    'caller keeps its list'
  );
});

check('an empty list is handled without NaN', () => {
  const { tf } = mk();
  const r = tf.transform([]);
  eq(r.compressionRatio, 1, 'ratio 1, not NaN');
  eq(r.originalTokens, 0, 'zero tokens');
  eq(r.withinBudget, true, 'trivially within budget');
});

// ── middle-out: head AND tail survive ────────────────────────────────────────

check('compression keeps the head and the tail, dropping the middle', () => {
  // 6 messages x 10 tokens = 60; budget 30 forces ~3 drops.
  const { tf } = mk({ maxTokens: 30, headKeep: 1, tailKeep: 1 });
  const r = tf.transform([
    msg('h', 10),
    msg('m1', 10),
    msg('m2', 10),
    msg('m3', 10),
    msg('m4', 10),
    msg('t', 10),
  ]);
  const ids = r.messages.map((m) => m.id);
  truthy(ids.includes('h'), 'head survived');
  truthy(ids.includes('t'), 'tail survived');
  truthy(r.droppedIds.length > 0, 'something was dropped');
  eq(r.withinBudget, true, 'reached the budget');
});

check('dropping is oldest-first within the middle', () => {
  const { tf } = mk({ maxTokens: 40, headKeep: 1, tailKeep: 1 });
  const r = tf.transform([
    msg('h', 10),
    msg('m1', 10),
    msg('m2', 10),
    msg('m3', 10),
    msg('t', 10),
  ]);
  // Needs to shed 10 tokens; the oldest middle message goes first.
  eq(r.droppedIds, ['m1'], 'the oldest middle message went first');
});

check('order is preserved in the output', () => {
  const { tf } = mk({ maxTokens: 40, headKeep: 1, tailKeep: 1 });
  const r = tf.transform([
    msg('h', 10),
    msg('m1', 10),
    msg('m2', 10),
    msg('m3', 10),
    msg('t', 10),
  ]);
  const ids = r.messages.map((m) => m.id);
  const sorted = [...ids].sort(
    (a, b) => ['h', 'm1', 'm2', 'm3', 't'].indexOf(a) - ['h', 'm1', 'm2', 'm3', 't'].indexOf(b)
  );
  eq(ids, sorted, 'still in original order');
});

check('a larger tailKeep protects more recent turns', () => {
  const { tf } = mk({ maxTokens: 40, headKeep: 1, tailKeep: 3 });
  const r = tf.transform([
    msg('h', 10),
    msg('m1', 10),
    msg('m2', 10),
    msg('t1', 10),
    msg('t2', 10),
    msg('t3', 10),
  ]);
  const ids = r.messages.map((m) => m.id);
  truthy(ids.includes('t1') && ids.includes('t2') && ids.includes('t3'), 'all three tail kept');
  truthy(ids.includes('h'), 'head kept');
});

// ── pinned content ───────────────────────────────────────────────────────────

check('pinned messages survive a budget that cannot fit them', () => {
  // 100 tokens pinned against a 20-token budget. The tempting "fix" is to drop
  // it; that reports a wonderful ratio and destroys the task.
  const { tf } = mk({ maxTokens: 20, headKeep: 0, tailKeep: 0 });
  const r = tf.transform([
    msg('sys', 100, { role: 'system', pinned: true }),
    msg('a', 10),
    msg('b', 10),
  ]);
  const ids = r.messages.map((m) => m.id);
  truthy(ids.includes('sys'), 'the pinned system prompt survived');
  eq(r.droppedIds.includes('sys'), false, 'and was never a drop candidate');
  eq(r.withinBudget, false, 'and the result honestly reports it does not fit');
});

check('a pinned message in the middle is still pinned', () => {
  const { tf } = mk({ maxTokens: 25, headKeep: 1, tailKeep: 1 });
  const r = tf.transform([
    msg('h', 10),
    msg('m1', 10),
    msg('keep', 10, { pinned: true }),
    msg('m2', 10),
    msg('t', 10),
  ]);
  truthy(
    r.messages.map((m) => m.id).includes('keep'),
    'position does not override pinning'
  );
  eq(r.droppedIds.includes('keep'), false, 'never dropped');
});

check('pinned messages do not consume the head/tail allowance', () => {
  // If `sys` were counted as the head, `h` would become a drop candidate.
  const { tf } = mk({ maxTokens: 40, headKeep: 1, tailKeep: 1 });
  const r = tf.transform([
    msg('sys', 10, { role: 'system', pinned: true }),
    msg('h', 10),
    msg('m1', 10),
    msg('m2', 10),
    msg('t', 10),
  ]);
  const ids = r.messages.map((m) => m.id);
  truthy(ids.includes('sys'), 'pinned kept');
  truthy(ids.includes('h'), 'head kept as well, not displaced by the pinned message');
  truthy(ids.includes('t'), 'tail kept');
});

// ── the honest over-budget outcome ───────────────────────────────────────────

check('reports withinBudget=false rather than pretending', () => {
  const { tf } = mk({ maxTokens: 5, headKeep: 1, tailKeep: 1 });
  const r = tf.transform([msg('h', 10), msg('m', 10), msg('t', 10)]);
  eq(r.withinBudget, false, 'cannot fit head+tail into 5 tokens');
  truthy(r.retainedTokens > 5, 'and says how far over it is');
  truthy(r.basis.includes('OVER BUDGET'), 'basis names the outcome');
  truthy(r.basis.includes('floor'), 'and explains what the floor is');
});

check('over-budget still returns usable messages', () => {
  const { tf } = mk({ maxTokens: 5, headKeep: 1, tailKeep: 1 });
  const r = tf.transform([msg('h', 10), msg('m', 10), msg('t', 10)]);
  truthy(r.messages.length >= 2, 'the caller still gets head and tail');
});

// ── pair integrity: the subtle one ───────────────────────────────────────────

check('a tool call and its result are never split', () => {
  // Both sit in the middle and both are droppable. Compressing by tokens alone
  // would shed exactly one of them and leave a malformed conversation.
  const { tf } = mk({ maxTokens: 30, headKeep: 1, tailKeep: 1 });
  const r = tf.transform([
    msg('h', 10),
    msg('call', 10, { role: 'assistant', pairId: 'p1' }),
    msg('result', 10, { role: 'tool', pairId: 'p1' }),
    msg('t', 10),
  ]);
  const ids = r.messages.map((m) => m.id);
  const hasCall = ids.includes('call');
  const hasResult = ids.includes('result');
  eq(hasCall, hasResult, 'call and result share a fate — both in, or both out');
});

check('a pair is not dropped when its partner is protected by the tail', () => {
  // `result` is in the tail and survives, so `call` must survive too even
  // though it sits in the droppable middle.
  const { tf } = mk({ maxTokens: 20, headKeep: 1, tailKeep: 1 });
  const r = tf.transform([
    msg('h', 10),
    msg('m1', 10),
    msg('call', 10, { role: 'assistant', pairId: 'p1' }),
    msg('result', 10, { role: 'tool', pairId: 'p1' }),
  ]);
  const ids = r.messages.map((m) => m.id);
  eq(ids.includes('call'), true, 'held by pair integrity against the budget');
  eq(ids.includes('result'), true, 'its partner is in the tail');
  truthy(r.basis.includes('pair integrity'), 'and the basis says why it stayed');
});

check('a pinned message protects its pair partner', () => {
  // Found by mutation testing, not by design. Pinned messages are guarded
  // twice — excluded from the droppable set AND added to the protected set —
  // and removing the second guard looked like an equivalent mutant because
  // every existing test still passed. It is not equivalent: the protected set
  // is also what seeds pair protection, so without it a PINNED tool call
  // silently loses its result. The redundancy is real; this case is the part
  // that is load-bearing.
  const { tf } = mk({ maxTokens: 20, headKeep: 0, tailKeep: 1 });
  const r = tf.transform([
    msg('call', 10, { role: 'assistant', pinned: true, pairId: 'p1' }),
    msg('result', 10, { role: 'tool', pairId: 'p1' }),
    msg('m1', 10),
    msg('t', 10),
  ]);
  const ids = r.messages.map((m) => m.id);
  eq(ids.includes('call'), true, 'the pinned call survives');
  eq(ids.includes('result'), true, 'and its result is protected along with it');
});

check('multi-message pairs drop as one unit', () => {
  const { tf } = mk({ maxTokens: 30, headKeep: 1, tailKeep: 1 });
  const r = tf.transform([
    msg('h', 10),
    msg('c1', 10, { pairId: 'p' }),
    msg('c2', 10, { pairId: 'p' }),
    msg('c3', 10, { pairId: 'p' }),
    msg('t', 10),
  ]);
  const dropped = r.droppedIds.filter((id) => id.startsWith('c'));
  truthy(dropped.length === 0 || dropped.length === 3, `all or nothing, got ${dropped.length}`);
});

check('unpaired messages are unaffected by pair logic', () => {
  const { tf } = mk({ maxTokens: 30, headKeep: 1, tailKeep: 1 });
  const r = tf.transform([msg('h', 10), msg('m1', 10), msg('m2', 10), msg('t', 10)]);
  eq(r.withinBudget, true, 'compresses normally with no pairs present');
});

// ── the ratio, measured in the same unit as the budget ───────────────────────

check('the ratio is measured in tokens, not message count', () => {
  // Ten tiny messages and one huge one. A count-based ratio would claim ~50%
  // compression for dropping the tiny ones while the window stayed full.
  const { tf } = mk({ maxTokens: 100, headKeep: 0, tailKeep: 1 });
  const input = [];
  for (let i = 0; i < 10; i += 1) input.push(msg(`tiny${i}`, 1));
  input.push(msg('huge', 200));
  const r = tf.transform(input);
  // Dropping all ten tiny messages sheds 10 of 210 tokens.
  truthy(r.compressionRatio > 0.9, `token-based ratio stays near 1, got ${r.compressionRatio}`);
  truthy(r.droppedIds.length >= 5, 'even though many messages were dropped');
});

check('the ratio is retained/original and drops as compression increases', () => {
  const { tf } = mk({ maxTokens: 30, headKeep: 1, tailKeep: 1 });
  const r = tf.transform([
    msg('h', 10),
    msg('m1', 10),
    msg('m2', 10),
    msg('m3', 10),
    msg('m4', 10),
    msg('t', 10),
  ]);
  eq(r.originalTokens, 60, 'input was 60 tokens');
  close(r.compressionRatio, r.retainedTokens / 60, 0.0001, 'ratio matches the definition');
  truthy(r.compressionRatio < 1, 'and is below 1 after compression');
});

check('droppedTokens accounts for what left', () => {
  const { tf } = mk({ maxTokens: 40, headKeep: 1, tailKeep: 1 });
  const r = tf.transform([
    msg('h', 10),
    msg('m1', 10),
    msg('m2', 10),
    msg('m3', 10),
    msg('t', 10),
  ]);
  eq(r.droppedTokens, 10, 'one 10-token message left');
  eq(r.originalTokens, 50, 'input was 50');
});

check('a custom estimator drives both budget and ratio', () => {
  // One token per character. The same estimator must measure both, or the two
  // can disagree about what a token is.
  const perChar = (t) => t.length;
  const { tf } = mk({ maxTokens: 100, headKeep: 1, tailKeep: 1 }, perChar);
  const r = tf.transform([
    { id: 'h', role: 'user', content: 'a'.repeat(40) },
    { id: 'm', role: 'user', content: 'b'.repeat(40) },
    { id: 't', role: 'user', content: 'c'.repeat(40) },
  ]);
  eq(r.originalTokens, 120, 'counted per character, not per four characters');
  eq(r.droppedIds, ['m'], 'and the budget used the same unit');
});

check('the default estimator is roughly four characters per token', () => {
  eq(approximateTokens('12345678'), 2, '8 chars => 2 tokens');
  eq(approximateTokens(''), 0, 'empty is zero');
});

// ── summaries are charged, not free ──────────────────────────────────────────

check('a summary replaces the dropped middle', () => {
  const { tf } = mk({
    maxTokens: 35,
    headKeep: 1,
    tailKeep: 1,
    summarise: (d) => `[${d.length} dropped]`,
  });
  const r = tf.transform([
    msg('h', 10),
    msg('m1', 10),
    msg('m2', 10),
    msg('m3', 10),
    msg('t', 10),
  ]);
  eq(r.summaryInserted, true, 'a summary went in');
  const summary = r.messages.find((m) => m.id.startsWith('summary:'));
  truthy(summary, 'and is present in the output');
  truthy(summary.content.includes('dropped'), 'carrying the summariser output');
});

check('summary tokens are charged against the budget', () => {
  // A summary counted as free is a compressor reporting a ratio it did not
  // achieve. This one is deliberately enormous.
  const { tf } = mk({
    maxTokens: 35,
    headKeep: 1,
    tailKeep: 1,
    summarise: () => body(500),
  });
  const r = tf.transform([
    msg('h', 10),
    msg('m1', 10),
    msg('m2', 10),
    msg('m3', 10),
    msg('t', 10),
  ]);
  truthy(r.retainedTokens > 100, `the summary is counted, got ${r.retainedTokens}`);
  eq(r.withinBudget, false, 'so an oversized summary is reported as over budget');
});

check('an empty summary is not inserted', () => {
  const { tf } = mk({ maxTokens: 30, headKeep: 1, tailKeep: 1, summarise: () => '' });
  const r = tf.transform([
    msg('h', 10),
    msg('m1', 10),
    msg('m2', 10),
    msg('m3', 10),
    msg('t', 10),
  ]);
  eq(r.summaryInserted, false, 'nothing to insert');
  eq(
    r.messages.some((m) => m.id.startsWith('summary:')),
    false,
    'and no empty message in the output'
  );
});

check('no summary is inserted when nothing was dropped', () => {
  const { tf } = mk({ maxTokens: 1000, headKeep: 1, tailKeep: 1, summarise: () => 'never' });
  const r = tf.transform([msg('a', 10), msg('b', 10)]);
  eq(r.summaryInserted, false, 'nothing dropped, so nothing to summarise');
});

// ── attribution and stability ────────────────────────────────────────────────

check('every dropped message is named by id', () => {
  const { tf } = mk({ maxTokens: 30, headKeep: 1, tailKeep: 1 });
  const input = [
    msg('h', 10),
    msg('m1', 10),
    msg('m2', 10),
    msg('m3', 10),
    msg('t', 10),
  ];
  const r = tf.transform(input);
  const outIds = new Set(r.messages.map((m) => m.id));
  for (const id of r.droppedIds) {
    eq(outIds.has(id), false, `${id} is reported dropped and is genuinely absent`);
  }
  const expectedDropped = input.filter((m) => !outIds.has(m.id)).map((m) => m.id);
  eq(r.droppedIds, expectedDropped, 'the report matches reality exactly');
});

check('the transform timestamp comes from the injected clock', () => {
  const { clock, tf } = mk();
  clock.set(4242);
  eq(tf.transform([msg('a', 1)]).transformedAt, 4242, 'no wall clock reached into');
});

check('compressing an already-compressed list is stable', () => {
  const { tf } = mk({ maxTokens: 30, headKeep: 1, tailKeep: 1 });
  const first = tf.transform([
    msg('h', 10),
    msg('m1', 10),
    msg('m2', 10),
    msg('m3', 10),
    msg('t', 10),
  ]);
  const second = tf.transform(first.messages);
  eq(second.droppedIds, [], 'the second pass has nothing left to do');
  eq(second.compressionRatio, 1, 'and reports no further compression');
});

report();
