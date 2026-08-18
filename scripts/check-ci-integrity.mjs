#!/usr/bin/env node
// scripts/check-ci-integrity.mjs — the gate that protects the gates.
//
// Run: node scripts/check-ci-integrity.mjs
// Exit: 0 VERIFIED · anything else FAILED (no NOT_CHECKED branch: every
//        assertion here is a source-level read of files that must exist in
//        this repo, so there is no honest "could not tell")
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// Every other check in this repo protects a PROPERTY of the code. This one
// protects the MACHINERY that protects properties — because "delete the check"
// and "delete the invariant the check enforces" are both one clean-looking
// diff away from a green build, and neither leaves the kind of trace a normal
// review catches under time pressure. Two specific instances, named because
// both are real and both are cheap to reintroduce by accident:
//
//   1. THE MUTATION GATE ITSELF. `npm run mutate` in `.github/workflows/
//      check.yml`'s `mutate` job is what makes every other `protects:` claim
//      in `scripts/mutations.mjs` mean something rather than being a comment
//      nobody runs. Remove the job, comment out the run step, or add
//      `continue-on-error: true` to it, and 123+ "verified" invariants become
//      123+ assertions that happen to still be true today.
//
//   2. `checker_must_not_be_doer` — CONSTITUTIONAL, per its own source
//      comments (`work-contract.ts`, `spine.ts`, `auditor-grant.ts` each say
//      so in the thrown message). The examinee may not grade itself. It is
//      enforced independently at FOUR call sites on purpose (spine.ts's own
//      comment: "a constitutional invariant should not rest on one call
//      site") — which means a partial regression (three of four still guard,
//      one was refactored and the guard silently dropped) is exactly the
//      shape normal test coverage is worst at catching, because the other
//      three still pass everything.
//
// SOURCE-LEVEL, LIKE check-pay-brief.mjs BESIDE IT. This does not run the
// mutation gate (that would be circular — the thing verifying the gate exists
// would itself depend on the gate it is verifying) and does not import the
// identity modules (several reach Supabase transitively and do not compile
// standalone). It reads text. What it buys is real: a regression in either
// property changes bytes on disk, and every one of these assertions reads
// those bytes.
//
// THIS FILE HAS NO NOT_CHECKED OUTCOME. Every path it reads is checked into
// this repo and must exist; a missing file is a FAILED assertion (readFileSync
// throws, `check()` catches it, reports it), not an excuse.

import { readFileSync } from 'node:fs';
import { createChecker } from './lib/harness-compile.mjs';

const { check, truthy, report } = createChecker('ci-integrity');

const read = (p) => readFileSync(p, 'utf8');

/** Comments stripped — a guard that survives only as a comment is not a guard. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Same idea, YAML shape: a `#` comment describing a step is not the step. A
 * line-oriented strip (not a lookbehind for `://`) is correct here because
 * this workflow's step names and run commands never contain a literal `#`. */
const stripYamlComments = (src) =>
  src.split('\n').map((line) => line.replace(/#.*$/, '')).join('\n');

// ═════════════════════════════════════════════════════════════════════════
// 1. THE MUTATION GATE — .github/workflows/check.yml
// ═════════════════════════════════════════════════════════════════════════

const WORKFLOW = '.github/workflows/check.yml';
// Comment-stripped: a `#` line describing a step is not the step. Caught by
// running this check against its own first draft — the restore-verification
// assertion below passed against a mutant that had deleted the actual
// `git diff --exit-code` step, because the COMMENT above it (a full paragraph
// explaining why the step exists) still contained the string being matched.
const workflow = stripYamlComments(read(WORKFLOW));

/**
 * Slice out one top-level job's body (its header line through the line before
 * the next 2-space-indented `name:` key, or EOF). Search for the next job
 * starts AFTER the current job's own header line — searching from `jobStart`
 * (or `jobStart + 1`, still inside the leading `\n`) matches the job's own
 * header as "the next job" and returns an empty body, which silently passes
 * every negative assertion ("must not contain X") for the wrong reason.
 */
function jobBodyOf(name) {
  const header = `\n  ${name}:`;
  const jobStart = workflow.indexOf(header);
  truthy(jobStart !== -1, `${name} job block not found in ${WORKFLOW}`);
  const searchFrom = jobStart + header.length;
  const nextJob = workflow.slice(searchFrom).search(/^\s{2}\S.*:\s*$/m);
  return nextJob === -1 ? workflow.slice(jobStart) : workflow.slice(jobStart, searchFrom + nextJob);
}

check('the mutate job exists in the workflow', () => {
  truthy(/^\s*mutate:\s*$/m.test(workflow), `${WORKFLOW} must declare a top-level \`mutate:\` job`);
});

check('the mutate job actually runs npm run mutate', () => {
  // Scoped to the job body, not "does this string appear anywhere in the
  // file" — a `mutate:` job that runs nothing, beside a comment elsewhere
  // mentioning `npm run mutate`, must not pass this.
  const jobBody = jobBodyOf('mutate');
  truthy(/run:\s*npm run mutate\s*$/m.test(jobBody),
    'the mutate job must contain a step that runs `npm run mutate` with no trailing modifier');
});

check('the mutate job is not softened with continue-on-error or || true', () => {
  const jobBody = jobBodyOf('mutate');
  truthy(!/continue-on-error:\s*true/.test(jobBody),
    'continue-on-error: true on the mutate job turns every mutation failure into a green tick');
  truthy(!/npm run mutate\s*\|\|/.test(jobBody),
    '`npm run mutate || ...` launders a failing mutation gate into a passing step');
});

check('the restore-verification step survives beside it', () => {
  // mutate.mjs restores every mutated file in a `finally`; this step is the
  // INDEPENDENT check on that claim, per the workflow's own comment. Losing
  // it does not disable the gate, but it turns "the mutation runner corrupted
  // the tree" from a red CI run into a quietly dirty one.
  const jobBody = jobBodyOf('mutate');
  truthy(/git diff --exit-code/.test(jobBody),
    'the mutate job must verify the tree is clean after running (git diff --exit-code)');
});

// ═════════════════════════════════════════════════════════════════════════
// 2. checker_must_not_be_doer — FOUR independent enforcement points
// ═════════════════════════════════════════════════════════════════════════
//
// Each check below verifies BOTH halves at each site: the comparison that
// detects same-identity, AND that detecting it actually refuses (throws or
// excludes) rather than merely being computed and discarded. A comparison
// with no consequence is not an invariant.

check('work-contract.ts: assertContractSane refuses a self-checked contract', () => {
  const src = stripComments(read('lib/trustshell/identity/work-contract.ts'));
  const guard = src.match(/if\s*\(\s*sameDid\(\s*c\.doerDid\s*,\s*c\.checkerDid\s*\)\s*\)\s*\{[\s\S]{0,300}/);
  truthy(guard, 'a sameDid(c.doerDid, c.checkerDid) guard must exist in work-contract.ts');
  truthy(/throw\s+new\s+Error/.test(guard[0]), 'the guard must throw, not merely compute the comparison');
  truthy(/checker_must_not_be_doer/.test(guard[0]),
    'the thrown message must name checker_must_not_be_doer, so this guard is provably THIS invariant');
});

check('checker-assignment.ts: the doer is excluded from its own drawable pool', () => {
  const raw = read('lib/trustshell/identity/checker-assignment.ts');
  const src = stripComments(raw);
  const guard = src.match(/if\s*\(\s*c\.did\.trim\(\)\s*===\s*input\.doerDid\.trim\(\)\s*\)\s*\{[\s\S]{0,150}/);
  truthy(guard, 'the doer-exclusion comparison in eligiblePool must exist');
  truthy(/excluded\.push/.test(guard[0]), 'a detected doer must actually be excluded, not merely flagged');
  // This site enforces the invariant through exclusion rather than a thrown
  // message naming it, so the identifier is checked in the JSDoc rather than
  // a throw. NOT checked against the whole file: `checker_must_not_be_doer`
  // also names the concept in this file's top-of-file explanatory comment
  // (unrelated to eligiblePool) and in an unrelated `doerDid: Did;` field on
  // a different interface earlier in the file — checking the raw file lets
  // either one paper over the specific JSDoc being deleted. Windowed to a
  // fixed span starting at eligiblePool's own signature instead, comfortably
  // covering its input type (JSDoc included) through the exclusion guard.
  const fnStart = raw.indexOf('export function eligiblePool(input: {');
  truthy(fnStart !== -1, 'eligiblePool(input: {...}) signature must exist');
  const fnWindow = raw.slice(fnStart, fnStart + 600);
  truthy(/checker_must_not_be_doer/.test(fnWindow),
    "eligiblePool's own doerDid JSDoc must still name this exclusion checker_must_not_be_doer");
});

check('spine.ts: the drawn checker is re-checked against the doer post-draw', () => {
  const src = stripComments(read('lib/trustshell/identity/spine.ts'));
  const guard = src.match(/if\s*\(\s*assigned\.unsigned\.checkerDid\s*===\s*assignment\.doerDid\s*\)\s*\{[\s\S]{0,300}/);
  truthy(guard, 'the post-draw defence-in-depth comparison must exist in spine.ts');
  truthy(/throw\s+new\s+Error/.test(guard[0]), 'the guard must throw, not merely compute the comparison');
  truthy(/checker_must_not_be_doer/.test(guard[0]), 'the thrown message must name checker_must_not_be_doer');
});

check('auditor-grant.ts: an auditor may not hold a grant to audit itself', () => {
  const src = stripComments(read('lib/trustshell/identity/auditor-grant.ts'));
  const guard = src.match(/if\s*\(\s*sameDid\(\s*input\.auditor\.did\s*,\s*input\.doerDid\s*\)\s*\)\s*\{[\s\S]{0,300}/);
  truthy(guard, 'a sameDid(input.auditor.did, input.doerDid) guard must exist in auditor-grant.ts');
  truthy(/throw\s+new\s+Error/.test(guard[0]), 'the guard must throw, not merely compute the comparison');
  truthy(/checker_must_not_be_doer/.test(guard[0]), 'the thrown message must name checker_must_not_be_doer');
});

check('did.ts: sameDid and compareDids still exist for the throw-based sites to call', () => {
  // Three of the four sites above call sameDid(...) by name. If that export
  // disappeared, those three regex matches above would already fail — this
  // assertion exists so a FAILURE there reads as "the primitive is gone",
  // not "the regex broke", when someone is debugging a red run at 3am.
  const src = stripComments(read('lib/trustshell/identity/did.ts'));
  truthy(/export\s+function\s+compareDids\s*\(/.test(src), 'compareDids must still be exported');
  truthy(/export\s+function\s+sameDid\s*\(/.test(src), 'sameDid must still be exported');
});

report();
