#!/usr/bin/env node
// scripts/work-contract-test.mjs — the pre-execution contract and signed verdict.
//
// Run: node scripts/work-contract-test.mjs
//
// The assertions that carry this file, each guarding a way a verdict could look
// accountable while proving nothing:
//
//   * 'RE-SCOPING IS DETECTED' — the property this file actually delivers. It
//     does NOT prove the criteria predate the work (signatures carry no
//     ordering), so the assertion has to be about what it does prove: a verdict
//     bound to one contract cannot be presented against another.
//   * 'a lowered floor breaks the binding' — the back-door version of the same
//     attack. Floors live inside the signature for this reason alone.
//   * 'A CHECKER CANNOT GRADE ITS OWN VERDICT' — the structural guard on
//     veritas_catch/veritas_miss. Without it the checker's score rises by
//     rendering verdicts, which is self-certification one layer up.
//   * 'separator injection produces two contracts with one signature' — the
//     encoding collision that has already been found once in this repo, in
//     reputation-transition.ts.
//   * 'an unrelated checker's valid signature does not satisfy the contract' —
//     every individual check passes while the agreed checker never judged.
//
// Fixtures use real Ed25519 keys, not stubs. A signature test with a stubbed
// verifier tests the stub.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.work-contract-check-'));
let did, wc;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/identity/did.ts',
      'lib/trustshell/identity/work-contract.ts',
      '--outDir', outDir,
      // PINNED. `--rootDir lib/trustshell/identity` would relocate every output
      // file the moment a module gains an import from outside the directory.
      // That has now happened three times in this repo (repid-predicate's
      // ../EarnedMetrics, mcp-fleet-smoke's TS6059, and check-identity's own
      // note above), so it is pinned before it happens a fourth.
      '--rootDir', 'lib',
      '--module', 'commonjs',
      '--target', 'es2022',
      '--lib', 'es2022,dom',
      '--moduleResolution', 'node',
      '--esModuleInterop',
      '--strict',
    ],
    { stdio: 'pipe' }
  );
  const base = join(outDir, 'trustshell', 'identity');
  did = await import(pathToFileURL(join(base, 'did.js')).href);
  wc = await import(pathToFileURL(join(base, 'work-contract.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('work-contract compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const { generateKeyPair } = did;
const {
  proposeContract,
  countersignContract,
  verifyContract,
  contractPayload,
  issueVerdict,
  verifyVerdict,
  veritasSignal,
  CONTRACT_DOMAIN,
  VERDICT_DOMAIN,
} = wc;

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
const throws = async (fn, re, what) => {
  try {
    await fn();
  } catch (e) {
    if (!re.test(e.message)) throw new Error(`${what}: wrong error ${JSON.stringify(e.message)}`);
    return;
  }
  throw new Error(`${what}: expected a throw, got none`);
};

// ── fixtures ────────────────────────────────────────────────────────────────

const doer = await generateKeyPair();
const checker = await generateKeyPair();
const stranger = await generateKeyPair();

const unsigned = (over = {}) => ({
  version: CONTRACT_DOMAIN,
  taskId: 'task-1',
  deliverable: 'a working thing',
  criteria: [
    { id: 'tests', statement: 'the suite passes', minScore: 0.9 },
    { id: 'docs', statement: 'it is documented' },
  ],
  doerDid: doer.did,
  checkerDid: checker.did,
  proposedAt: '2026-08-15T00:00:00.000Z',
  ...over,
});

/** A fully agreed contract. */
const agreed = async (over = {}) => {
  const u = unsigned(over);
  const { doerSignature } = await proposeContract({ unsigned: u, doerKey: doer.privateKey });
  return countersignContract({ unsigned: u, doerSignature, checkerKey: checker.privateKey });
};

const scores = (over = []) => [
  { criterionId: 'tests', outcome: 'VERIFIED', score: 0.95 },
  { criterionId: 'docs', outcome: 'VERIFIED' },
  ...over,
];

const verdictFor = async (contract, over = {}) => {
  const v = await verifyContract(contract);
  return issueVerdict({
    unsigned: {
      version: VERDICT_DOMAIN,
      contractHash: v.contractHash,
      evidenceHash: 'sha256:' + 'a'.repeat(64),
      checkerDid: checker.did,
      outcome: 'VERIFIED',
      scores: scores(),
      issuedAt: '2026-08-15T01:00:00.000Z',
      ...over,
    },
    checkerKey: over.checkerKey ?? checker.privateKey,
  });
};

// ── the contract ────────────────────────────────────────────────────────────

await check('a contract signed by both parties verifies', async () => {
  const r = await verifyContract(await agreed());
  eq(r.outcome, 'VERIFIED', 'a well-formed contract must verify');
  truthy(r.doerSignatureValid && r.checkerSignatureValid, 'both signatures');
  eq(r.independent, true, 'checker is not doer');
  match(r.contractHash, /^sha256:[0-9a-f]{64}$/, 'contract hash shape');
});

await check('ONE SIGNATURE IS A PROPOSAL, NOT AN AGREEMENT', async () => {
  // countersigning must verify the doer's half first, or the checker could
  // manufacture agreement to criteria the doer never saw.
  const u = unsigned();
  await throws(
    () => countersignContract({ unsigned: u, doerSignature: 'not-a-signature', checkerKey: checker.privateKey }),
    /does not verify/,
    'a forged doer signature was countersigned'
  );
});

await check('A CONTRACT THE CHECKER ALSO WROTE IS REFUSED AT CONSTRUCTION', async () => {
  // verification.checker_must_not_be_doer is constitutional. Refusing at
  // construction rather than at verification means the invalid artifact never
  // exists to be passed around.
  await throws(
    () => proposeContract({ unsigned: unsigned({ checkerDid: doer.did }), doerKey: doer.privateKey }),
    /constitutional/,
    'an agent was allowed to contract with itself'
  );
});

await check('AN EMPTY CRITERIA LIST IS REFUSED', async () => {
  // Otherwise "sign a contract with no criteria" is the cheapest route past the
  // checker, and it produces a perfectly valid signature.
  await throws(
    () => proposeContract({ unsigned: unsigned({ criteria: [] }), doerKey: doer.privateKey }),
    /establishes\s+nothing/,
    'an empty contract was accepted'
  );
});

await check('duplicate criterion ids are refused', async () => {
  await throws(
    () =>
      proposeContract({
        unsigned: unsigned({
          criteria: [
            { id: 'x', statement: 'one' },
            { id: 'x', statement: 'two' },
          ],
        }),
        doerKey: doer.privateKey,
      }),
    /appears twice/,
    'ambiguous criterion ids were accepted'
  );
});

await check('a floor outside [0,1] is refused', async () => {
  // A floor of 1.5 fails every run; a floor of -1 passes every run. Both are
  // ways to write a criterion that does not constrain anything.
  await throws(
    () =>
      proposeContract({
        unsigned: unsigned({ criteria: [{ id: 'x', statement: 'y', minScore: 1.5 }] }),
        doerKey: doer.privateKey,
      }),
    /outside \[0, 1\]/,
    'an unreachable floor was accepted'
  );
});

await check('SEPARATOR INJECTION IS REFUSED, NOT ESCAPED', async () => {
  // The collision found in reputation-transition.ts, in a new encoding. Two
  // different contracts that produce identical bytes share one signature.
  await throws(
    () =>
      proposeContract({
        unsigned: unsigned({ criteria: [{ id: 'a|b', statement: 'c' }] }),
        doerKey: doer.privateKey,
      }),
    /field separator/,
    'a pipe inside a field was accepted'
  );
});

await check('THE INTRA-CRITERION SEPARATOR PREVENTS A REAL COLLISION', async () => {
  // Found by mutation: the first version of this test compared two payloads
  // that differed for unrelated reasons, so collapsing the separator to '' left
  // it green. The genuine collision pair is an id/statement boundary that moves:
  //
  //   {id: 'a',  statement: 'b'}  -> 'a' + SEP + 'b'
  //   {id: 'ab', statement: ''}   -> 'ab' + SEP + ''
  //
  // With no separator both encode as 'ab', so one signature would cover a
  // criterion called 'a' requiring 'b' AND a criterion called 'ab' requiring
  // nothing. Same defect as reputation-transition.ts, where join('') let
  // {value:1,observedAt:'2026'} collide with {value:12,observedAt:'026'}.
  const a = contractPayload(unsigned({ criteria: [{ id: 'a', statement: 'b' }] }));
  const b = contractPayload(unsigned({ criteria: [{ id: 'ab', statement: '' }] }));
  truthy(a !== b, 'a moved field boundary must change the encoding');
});

await check('CRITERION ORDER IS PART OF THE CONTRACT', async () => {
  // Sorting would be the obvious "canonicalisation", and it is declined — but
  // for a narrower reason than the first draft of this file claimed. Duplicate
  // ids are already refused, so sorting would NOT enable an attack; the earlier
  // comment saying it would was an overstatement and is corrected in the source.
  //
  // What sorting would actually do is make two different documents hash the
  // same. A contract is a document a person reads and signs, and a hash that
  // cannot tell two orderings apart has stopped identifying the thing agreed to.
  const a = contractPayload(
    unsigned({ criteria: [{ id: 'a', statement: 'x' }, { id: 'b', statement: 'y' }] })
  );
  const b = contractPayload(
    unsigned({ criteria: [{ id: 'b', statement: 'y' }, { id: 'a', statement: 'x' }] })
  );
  truthy(a !== b, 'reordered criteria must not hash the same');
});

await check('WHITESPACE DOES NOT LET AN AGENT CONTRACT WITH ITSELF', async () => {
  // One character is the entire bypass of a constitutional invariant, because
  // the invariant is a string comparison. Same hole as the loop kernel's
  // independence check, found the same way.
  await throws(
    () =>
      proposeContract({
        unsigned: unsigned({ checkerDid: ` ${doer.did} ` }),
        doerKey: doer.privateKey,
      }),
    /constitutional/,
    'padding a DID bought self-certification'
  );
});

await check('A CONTRACT THAT CANNOT BE ENCODED IS NOT_CHECKED, NOT FAILED', async () => {
  // Three outcomes. "We could not look" is a different fact from "we looked and
  // it is invalid"; collapsing them reports a malformed contract as a detected
  // forgery, which sends the reader hunting for an attacker who does not exist.
  const contract = await agreed();
  const r = await verifyContract({ ...contract, criteria: [] });
  eq(r.outcome, 'NOT_CHECKED', 'an unencodable contract was reported as invalid');
  match(r.detail, /nothing was checked/, 'the reason must say nothing was checked');
  eq(r.contractHash, '', 'no hash can be claimed for something never encoded');
});

await check('a tampered criterion breaks the doer signature', async () => {
  const contract = await agreed();
  const tampered = {
    ...contract,
    criteria: [{ id: 'tests', statement: 'the suite passes', minScore: 0.1 }, contract.criteria[1]],
  };
  const r = await verifyContract(tampered);
  eq(r.outcome, 'FAILED', 'a lowered floor must break the signature');
  eq(r.doerSignatureValid, false, 'the doer never signed this');
});

// ── the verdict ─────────────────────────────────────────────────────────────

await check('a verdict from the agreed checker against the agreed contract verifies', async () => {
  const contract = await agreed();
  const r = await verifyVerdict({ verdict: await verdictFor(contract), contract });
  eq(r.outcome, 'VERIFIED', 'a clean verdict must verify');
  truthy(r.signatureValid && r.boundToContract, 'signature and binding');
  match(r.verdictHash, /^sha256:[0-9a-f]{64}$/, 'verdict hash shape');
});

await check('RE-SCOPING IS DETECTED — a verdict cannot answer a different contract', async () => {
  // The property this file actually delivers. Not "the criteria predate the
  // work" — signatures carry no ordering — but "the criteria cannot quietly
  // become easier once the outcome is known."
  const strict = await agreed();
  const lax = await agreed({
    criteria: [{ id: 'tests', statement: 'the suite passes', minScore: 0.1 }, { id: 'docs', statement: 'it is documented' }],
  });
  const verdict = await verdictFor(lax); // judged against the easy contract
  const r = await verifyVerdict({ verdict, contract: strict }); // presented against the strict one
  eq(r.outcome, 'FAILED', 'a verdict was accepted against criteria it did not judge');
  eq(r.boundToContract, false, 'the binding must be what fails');
  match(r.detail, /different contract hash/, 'the reason must name the mismatch');
});

await check('A LOWERED FLOOR CHANGES THE HASH — floors are inside the signature', async () => {
  // The back door: same criteria, same statements, weaker floor. If minScore
  // were outside the signed payload this would be undetectable.
  const a = await agreed();
  const b = await agreed({
    criteria: [{ id: 'tests', statement: 'the suite passes', minScore: 0.5 }, { id: 'docs', statement: 'it is documented' }],
  });
  const ra = await verifyContract(a);
  const rb = await verifyContract(b);
  truthy(ra.contractHash !== rb.contractHash, 'a changed floor must change the hash');
});

await check('AN UNRELATED CHECKER CANNOT SATISFY THE CONTRACT', async () => {
  // Every individual check passes — the signature verifies, the hash matches —
  // while the agreed checker never judged anything.
  const contract = await agreed();
  const v = await verifyContract(contract);
  const verdict = await issueVerdict({
    unsigned: {
      version: VERDICT_DOMAIN,
      contractHash: v.contractHash,
      evidenceHash: 'sha256:' + 'a'.repeat(64),
      checkerDid: stranger.did,
      outcome: 'VERIFIED',
      scores: scores(),
      issuedAt: '2026-08-15T01:00:00.000Z',
    },
    checkerKey: stranger.privateKey,
  });
  const r = await verifyVerdict({ verdict, contract });
  eq(r.outcome, 'FAILED', "a stranger's valid signature satisfied the contract");
  eq(r.signatureValid, true, 'the signature itself is genuinely valid — that is the point');
  match(r.detail, /not the agreed checker/, 'reason');
});

await check('A TAMPERED VERDICT SIGNATURE FAILS', async () => {
  // Found by mutation: replacing the whole signature check with `true` left the
  // suite green, because the only test that exercised a bad verdict was the
  // unrelated-checker one — and that fails on identity, never on the signature.
  // A signature check nothing tests is a signature check that can be deleted.
  const contract = await agreed();
  const verdict = await verdictFor(contract);
  const forged = { ...verdict, outcome: 'VERIFIED', scores: [
    { criterionId: 'tests', outcome: 'VERIFIED', score: 1 },
    { criterionId: 'docs', outcome: 'VERIFIED' },
  ] };
  const r = await verifyVerdict({ verdict: forged, contract });
  eq(r.outcome, 'FAILED', 'a verdict edited after signing was accepted');
  eq(r.signatureValid, false, 'the signature must be what fails');
  match(r.detail, /signature does not verify/, 'reason');
});

await check('a verdict whose scores were raised after signing fails', async () => {
  // The realistic tamper: everything else is genuine, one number moved.
  const contract = await agreed();
  const verdict = await verdictFor(contract, {
    scores: [{ criterionId: 'tests', outcome: 'VERIFIED', score: 0.5 }, { criterionId: 'docs', outcome: 'VERIFIED' }],
  });
  const raised = {
    ...verdict,
    scores: [{ criterionId: 'tests', outcome: 'VERIFIED', score: 0.99 }, { criterionId: 'docs', outcome: 'VERIFIED' }],
  };
  const r = await verifyVerdict({ verdict: raised, contract });
  eq(r.signatureValid, false, 'a raised score must break the signature');
  eq(r.outcome, 'FAILED', 'and must fail the verdict');
});

await check('A VERDICT WITH NO CONTRACT HASH IS REFUSED AT ISSUE', async () => {
  await throws(
    () =>
      issueVerdict({
        unsigned: {
          version: VERDICT_DOMAIN,
          contractHash: '',
          evidenceHash: 'sha256:' + 'a'.repeat(64),
          checkerDid: checker.did,
          outcome: 'VERIFIED',
          scores: scores(),
          issuedAt: 'now',
        },
        checkerKey: checker.privateKey,
      }),
    /unbound verdict/,
    'an unbound verdict was signed'
  );
});

await check('a verdict with no evidence hash is refused', async () => {
  // It would vouch for any artifact later paired with it.
  await throws(
    () =>
      issueVerdict({
        unsigned: {
          version: VERDICT_DOMAIN,
          contractHash: 'sha256:' + 'b'.repeat(64),
          evidenceHash: '',
          checkerDid: checker.did,
          outcome: 'VERIFIED',
          scores: scores(),
          issuedAt: 'now',
        },
        checkerKey: checker.privateKey,
      }),
    /any artifact/,
    'a verdict naming no work was signed'
  );
});

await check('THE AGREED FLOOR OVERRULES THE CHECKER — enforced at verification', async () => {
  // A checker reporting VERIFIED at 0.4 against an agreed floor of 0.9 is
  // overruled by the contract. A floor that trusts the judge it constrains is
  // decorative.
  const contract = await agreed();
  const verdict = await verdictFor(contract, {
    scores: [
      { criterionId: 'tests', outcome: 'VERIFIED', score: 0.4 },
      { criterionId: 'docs', outcome: 'VERIFIED' },
    ],
  });
  const r = await verifyVerdict({ verdict, contract });
  eq(r.outcome, 'FAILED', 'a score below the agreed floor was accepted');
  match(r.detail, /below its agreed floor of 0\.9/, 'the floor must be named');
});

await check('an unanswered criterion is NOT_CHECKED, not dropped', async () => {
  const contract = await agreed();
  const verdict = await verdictFor(contract, {
    scores: [{ criterionId: 'tests', outcome: 'VERIFIED', score: 0.95 }],
  });
  const r = await verifyVerdict({ verdict, contract });
  eq(r.outcome, 'NOT_CHECKED', 'a skipped criterion was treated as a pass');
  match(r.detail, /'docs' was not answered/, 'the skipped criterion must be named');
});

await check('a floor with no score is NOT_CHECKED — the floor was never tested', async () => {
  const contract = await agreed();
  const verdict = await verdictFor(contract, {
    scores: [
      { criterionId: 'tests', outcome: 'VERIFIED' },
      { criterionId: 'docs', outcome: 'VERIFIED' },
    ],
  });
  const r = await verifyVerdict({ verdict, contract });
  eq(r.outcome, 'NOT_CHECKED', 'an untested floor was reported as met');
});

await check('a score exactly at the agreed floor passes, and just below fails', async () => {
  // The boundary, in both directions. Asserting only equality proves the
  // comparison is loose rather than that it is correct — the survivor found by
  // mutation in the loop kernel.
  const contract = await agreed();
  const at = await verifyVerdict({
    verdict: await verdictFor(contract, {
      scores: [{ criterionId: 'tests', outcome: 'VERIFIED', score: 0.9 }, { criterionId: 'docs', outcome: 'VERIFIED' }],
    }),
    contract,
  });
  eq(at.outcome, 'VERIFIED', 'a score exactly at the floor was rejected');
  const below = await verifyVerdict({
    verdict: await verdictFor(contract, {
      scores: [{ criterionId: 'tests', outcome: 'VERIFIED', score: 0.8999999 }, { criterionId: 'docs', outcome: 'VERIFIED' }],
    }),
    contract,
  });
  eq(below.outcome, 'FAILED', 'a score just below the floor was accepted');
});

await check('contradictory duplicate scores resolve to the weaker', async () => {
  const contract = await agreed();
  const verdict = await verdictFor(contract, {
    scores: [
      { criterionId: 'tests', outcome: 'FAILED', score: 0.95 },
      { criterionId: 'tests', outcome: 'VERIFIED', score: 0.95 },
      { criterionId: 'docs', outcome: 'VERIFIED' },
    ],
  });
  const r = await verifyVerdict({ verdict, contract });
  eq(r.outcome, 'FAILED', 'a later VERIFIED overwrote an earlier FAILED');
});

await check('an unverifiable contract makes the verdict answer NOTHING', async () => {
  const contract = await agreed();
  const verdict = await verdictFor(contract);
  const broken = { ...contract, checkerSignature: contract.doerSignature };
  const r = await verifyVerdict({ verdict, contract: broken });
  eq(r.outcome, 'FAILED', 'a verdict on an invalid contract must not verify');
  match(r.detail, /answers nothing/, 'reason');
});

// ── ground truth — the gap, kept visible ────────────────────────────────────

await check('A CHECKER CANNOT SUPPLY GROUND TRUTH FOR ITS OWN VERDICT', async () => {
  // The structural guard. Without it, veritas_catch accrues to whoever renders
  // the most verdicts, and the checker's reputation becomes a measure of its
  // output volume.
  const contract = await agreed();
  const verdict = await verdictFor(contract);
  const { verdictHash } = await verifyVerdict({ verdict, contract });
  await throws(
    async () =>
      veritasSignal(verdict, verdictHash, {
        verdictHash,
        source: 'human_review',
        actual: 'VERIFIED',
        observerDid: checker.did,
        observedAt: 'later',
      }),
    /self-certification one layer up/,
    'the checker graded its own verdict'
  );
});

await check('A PADDED OBSERVER DID DOES NOT ESCAPE THE SELF-GRADING GUARD', async () => {
  // The same one-character bypass as the contract's self-check, in the one
  // place where it would silently restore self-certification: a checker
  // grading its own verdict under a DID with a space on the end.
  const contract = await agreed();
  const verdict = await verdictFor(contract);
  const { verdictHash } = await verifyVerdict({ verdict, contract });
  await throws(
    async () =>
      veritasSignal(verdict, verdictHash, {
        verdictHash,
        source: 'human_review',
        actual: 'VERIFIED',
        observerDid: ` ${checker.did} `,
        observedAt: 'later',
      }),
    /self-certification one layer up/,
    'a padded DID let the checker grade itself'
  );
});

await check('a correct verdict graded by an outside observer is a veritas_catch', async () => {
  const contract = await agreed();
  const verdict = await verdictFor(contract);
  const { verdictHash } = await verifyVerdict({ verdict, contract });
  const signal = veritasSignal(verdict, verdictHash, {
    verdictHash,
    source: 'downstream_outcome',
    actual: 'VERIFIED',
    observerDid: stranger.did,
    observedAt: 'later',
  });
  eq(signal, 'veritas_catch', 'a confirmed verdict must earn a catch');
});

await check('a wrong verdict is a veritas_miss', async () => {
  const contract = await agreed();
  const verdict = await verdictFor(contract);
  const { verdictHash } = await verifyVerdict({ verdict, contract });
  const signal = veritasSignal(verdict, verdictHash, {
    verdictHash,
    source: 'human_review',
    actual: 'FAILED',
    observerDid: stranger.did,
    observedAt: 'later',
  });
  eq(signal, 'veritas_miss', 'a contradicted verdict must earn a miss');
});

await check('AN OBSERVATION ABOUT A DIFFERENT VERDICT SIGNALS NOTHING', async () => {
  // Otherwise any observation could be pointed at any verdict, and the binding
  // that makes the signal meaningful is decorative.
  const contract = await agreed();
  const verdict = await verdictFor(contract);
  const { verdictHash } = await verifyVerdict({ verdict, contract });
  const signal = veritasSignal(verdict, verdictHash, {
    verdictHash: 'sha256:' + 'f'.repeat(64),
    source: 'human_review',
    actual: 'FAILED',
    observedAt: 'later',
  });
  eq(signal, null, 'an unmatched observation produced a signal');
});

await check('A NOT_CHECKED VERDICT IS NOT A MISS', async () => {
  // A checker that correctly reported it could not look was right to. Scoring
  // that as an error teaches it to guess, which inverts the incentive the third
  // outcome exists to create.
  const contract = await agreed();
  const verdict = await verdictFor(contract, {
    outcome: 'NOT_CHECKED',
    scores: [{ criterionId: 'tests', outcome: 'NOT_CHECKED' }, { criterionId: 'docs', outcome: 'NOT_CHECKED' }],
  });
  const { verdictHash } = await verifyVerdict({ verdict, contract });
  const signal = veritasSignal(verdict, verdictHash, {
    verdictHash,
    source: 'human_review',
    actual: 'FAILED',
    observerDid: stranger.did,
    observedAt: 'later',
  });
  eq(signal, null, 'an honest NOT_CHECKED was punished as a wrong answer');
});

await check('an anonymous observation is allowed — absence of a DID is not the checker', async () => {
  // A human spot-check may carry no DID. Refusing it would make the only
  // usable ground truth the kind that is hardest to collect.
  const contract = await agreed();
  const verdict = await verdictFor(contract);
  const { verdictHash } = await verifyVerdict({ verdict, contract });
  const signal = veritasSignal(verdict, verdictHash, {
    verdictHash,
    source: 'human_review',
    actual: 'VERIFIED',
    observedAt: 'later',
  });
  eq(signal, 'veritas_catch', 'an unattributed human review was rejected');
});

// ── report ──────────────────────────────────────────────────────────────────

rmSync(outDir, { recursive: true, force: true });

console.log(`\nwork-contract: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All work-contract checks passed.');
