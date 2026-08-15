// contracted-evaluator-port.ts — the compile-time half of "the adapter still
// fits the kernel port".
//
// WHY THIS FILE EXISTS, AND WHY IT IS FOUR LINES.
//
// `contracted-evaluator.ts` restates the kernel's `Evaluator` shapes instead of
// importing them, on purpose: the kernel is meant to ship standalone, and an
// import would make that file the place a reader goes to learn what the kernel
// requires, so the two would drift. Restating creates the obvious hazard — the
// copies can fall out of step — so its header says the mismatch is caught
// "because the adapter is assigned to the port in the test".
//
// HALF OF THAT WAS TRUE. `scripts/contracted-evaluator-test.mjs` does run the
// real `runAgentLoop` with a real contracted evaluator, which is the stronger
// check in one direction: it exercises the shape the kernel actually consumes.
// But the sentence named `check:types`, and **`check:types` never reads that
// file** — `tsc --noEmit` resolves 2,310 files here and not one of them is a
// `.mjs` [VERIFIED 2026-08-15 with `tsc --listFilesOnly`]. So the guarantee as
// written was unearned: a suite nobody ran left the drift undetected, and the
// comment said otherwise.
//
// The runtime test also cannot see every direction of drift. It fails only when
// the loop READS a field that moved. Add a required field to the kernel's
// `Evaluation` that the loop does not yet consume and the suite stays green
// while the adapter no longer satisfies the port — which is the same
// "green over a shape nobody checked" this repo keeps paying for.
//
// So: one line the compiler must accept. Not a second copy of the runtime test,
// and not an abstraction — `asLoopEvaluator` is the widening a caller needs
// anyway when handing the adapter to `runAgentLoop`.

import type { Evaluator } from '../harness/loop';
import { createContractedEvaluator } from './contracted-evaluator';

/** What `createContractedEvaluator` returns, before the kernel widens it. */
export type ContractedEvaluatorAdapter = ReturnType<typeof createContractedEvaluator>;

/**
 * The adapter, as `runAgentLoop` sees it.
 *
 * The `return` below is the assertion: if the restated shapes ever stop
 * matching the kernel's, this stops compiling and `tsc` names the offending
 * property. Callers that need the signed `Verdict` or the per-criterion
 * `disagreement` should keep the adapter's own type and NOT go through this —
 * widening to `Evaluator` deliberately hides both.
 */
export function asLoopEvaluator(adapter: ContractedEvaluatorAdapter): Evaluator {
  return adapter;
}
