#!/usr/bin/env node
// scripts/verdict-envelope-test.mjs — the artifact a third party actually holds.
//
// Run: node scripts/verdict-envelope-test.mjs
//
// Everything else in identity/ is handed objects built locally by code that
// already type-checked. An envelope arrives from somebody else, so these
// assertions are mostly about ADVERSARIAL and MALFORMED input:
//
//   * 'a packed envelope verifies offline' — no database, no network, no access
//     to us. did:key carries its own public key, which is the whole reason this
//     is portable rather than a lookup against our infrastructure.
//   * 'THE CONTRACT SWAP IS REFUSED' — a real verdict re-pointed at an easier
//     contract. This is the re-scoping attack arriving as a packaging mistake,
//     and it is what an envelope format makes possible if it does not bind.
//   * 'evidence that was not judged is FAILED, not VERIFIED' — the check that
//     turns a signed opinion into a claim about a specific artifact.
//   * 'absent evidence is null, never true' — the three-outcome rule at the
//     field level. A verdict nobody compared to an artifact covers nothing.
//   * 'hostile input never throws' — a caller's catch block must not get to
//     decide what "unverifiable" means.
//
// Real keys, real signatures. A signing test with a stubbed verifier tests the
// stub.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.envelope-check-'));
let did, wc, ce, env;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/identity/did.ts',
      'lib/trustshell/identity/work-contract.ts',
      'lib/trustshell/identity/contracted-evaluator.ts',
      'lib/trustshell/identity/verdict-envelope.ts',
      '--outDir', outDir,
      // Pinned — see work-contract-test.mjs. Fourth occurrence of the hazard.
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
  ce = await import(pathToFileURL(join(base, 'contracted-evaluator.js')).href);
  env = await import(pathToFileURL(join(base, 'verdict-envelope.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('verdict-envelope compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const { generateKeyPair } = did;
const { proposeContract, countersignContract, issueVerdict, CONTRACT_DOMAIN, VERDICT_DOMAIN } = wc;
const { renderEvidence, evidenceDigest } = ce;
const { packEnvelope, verifyEnvelope, ENVELOPE_DOMAIN } = env;

let passed = 0;
const failures = [];
const check = async (name, fn) => {
  try { await fn(); passed += 1; } catch (e) { failures.push(`${name}\n    ${e.message}`); }
};
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
};
const truthy = (v, what) => { if (!v) throw new Error(`${what}: expected truthy, got ${JSON.stringify(v)}`); };
const match = (s, re, what) => { if (!re.test(String(s))) throw new Error(`${what}: ${JSON.stringify(String(s))} !~ ${re}`); };
const throws = async (fn, re, what) => {
  try { await fn(); } catch (e) { if (re.test(e.message)) return; throw new Error(`${what}: threw ${JSON.stringify(e.message)}, wanted ${re}`); }
  throw new Error(`${what}: did not throw`);
};

// ── fixtures ────────────────────────────────────────────────────────────────

const doer = await generateKeyPair();
const checker = await generateKeyPair();
const stranger = await generateKeyPair();

const CRITERIA = [
  { id: 'tests', statement: 'the suite passes', minScore: 0.9 },
  { id: 'docs', statement: 'it is documented' },
];
const EASY_CRITERIA = [{ id: 'tests', statement: 'anything at all' }];

// Evidence differing in something `renderEvidence` actually projects: the tool
// call and its observation. An earlier draft of this file differed only in a
// `note` field, which renderEvidence ignores — so both rendered identically and
// the "mismatch" test passed a matching digest. The test was wrong, not the
// module, and the projection semantics it exposed are asserted below.
const EVIDENCE = [
  { turn: 1, madeProgress: true, calls: [{ call: { name: 'run_tests' }, observation: { outcome: 'ok', content: '42 passed' } }] },
];
const OTHER_EVIDENCE = [
  { turn: 1, madeProgress: true, calls: [{ call: { name: 'run_tests' }, observation: { outcome: 'ok', content: '0 passed' } }] },
];
// Same projection as EVIDENCE, extra field outside it.
const EVIDENCE_PLUS_UNPROJECTED = [
  { turn: 1, madeProgress: true, note: 'a field renderEvidence does not read',
    calls: [{ call: { name: 'run_tests' }, observation: { outcome: 'ok', content: '42 passed' } }] },
];

const makeContract = async (over = {}) => {
  const unsigned = {
    version: CONTRACT_DOMAIN,
    taskId: 'task-1',
    deliverable: 'a working thing',
    criteria: CRITERIA,
    doerDid: doer.did,
    checkerDid: checker.did,
    proposedAt: '2026-08-15T00:00:00.000Z',
    ...over,
  };
  const { doerSignature } = await proposeContract({ unsigned, doerKey: doer.privateKey });
  return countersignContract({ unsigned, doerSignature, checkerKey: checker.privateKey });
};

const makeVerdict = async (contract, over = {}) => {
  const { verifyContract } = wc;
  const { contractHash } = await verifyContract(contract);
  const unsigned = {
    version: VERDICT_DOMAIN,
    contractHash,
    evidenceHash: await evidenceDigest(renderEvidence(EVIDENCE)),
    checkerDid: checker.did,
    outcome: 'VERIFIED',
    scores: [
      { criterionId: 'tests', outcome: 'VERIFIED', score: 0.95 },
      { criterionId: 'docs', outcome: 'VERIFIED', score: 1 },
    ],
    issuedAt: '2026-08-15T02:00:00.000Z',
    ...over,
  };
  return issueVerdict({ unsigned, checkerKey: over.__key ?? checker.privateKey });
};

const goodEnvelope = async () => {
  const contract = await makeContract();
  return packEnvelope({ contract, verdict: await makeVerdict(contract) });
};

// ── the happy path, and what "portable" means ───────────────────────────────

await check('A PACKED ENVELOPE VERIFIES OFFLINE, with no registry lookup', async () => {
  const result = await verifyEnvelope({ envelope: await goodEnvelope() });
  eq(result.outcome, 'VERIFIED', 'a clean judged run must verify from the envelope alone');
  eq(result.contract.independent, true, 'checker != doer must be visible to the reader');
  eq(result.doerDid, doer.did, 'the reader must learn who did the work');
  eq(result.checkerDid, checker.did, 'and who judged it');
});

await check('the envelope survives a JSON round trip, which is how it travels', async () => {
  const wire = JSON.parse(JSON.stringify(await goodEnvelope()));
  const result = await verifyEnvelope({ envelope: wire });
  eq(result.outcome, 'VERIFIED', 'an envelope that cannot survive JSON is not portable');
});

// ── evidence binding ────────────────────────────────────────────────────────

await check('ABSENT EVIDENCE IS null, NEVER true', async () => {
  // The whole three-outcome rule at the field level: a verdict nobody compared
  // against an artifact covers no artifact. Reporting `true` here would let an
  // envelope vouch for anything it was later paired with.
  const result = await verifyEnvelope({ envelope: await goodEnvelope() });
  eq(result.evidenceMatches, null, 'unsupplied evidence must be null');
  match(result.detail, /NOT CHECKED/, 'and the detail must say so out loud');
});

await check('the evidence that was judged matches', async () => {
  const result = await verifyEnvelope({ envelope: await goodEnvelope(), evidence: EVIDENCE });
  eq(result.evidenceMatches, true, 'the judged evidence must match');
  eq(result.outcome, 'VERIFIED', 'and the envelope still verifies');
});

await check('EVIDENCE THAT WAS NOT JUDGED IS FAILED, not merely noted', async () => {
  // Every signature still checks out. The verdict is real, the contract is
  // real, and it is about a different artifact. If this returned VERIFIED with
  // a false flag, a caller reading `.outcome` would ship the wrong conclusion.
  const result = await verifyEnvelope({ envelope: await goodEnvelope(), evidence: OTHER_EVIDENCE });
  eq(result.evidenceMatches, false, 'the mismatch must be detected');
  eq(result.outcome, 'FAILED', 'and it must reach the top-level outcome');
  match(result.detail, /NOT what was judged/i, 'the reason must be legible');
});

await check('evidenceMatches means "renders to the same evidence", NOT "byte-identical"', async () => {
  // A caller reading `evidenceMatches: true` could reasonably assume the
  // artifact in their hand is byte-for-byte what was judged. It is not:
  // `renderEvidence` projects turns down to {turn, progress, calls,
  // observations}, and the digest covers the projection. That is coherent —
  // the judge only ever saw the projection — but it is a narrower claim than
  // the field name suggests, so it is pinned here rather than left for someone
  // to discover by trusting it too far.
  const result = await verifyEnvelope({
    envelope: await goodEnvelope(),
    evidence: EVIDENCE_PLUS_UNPROJECTED,
  });
  eq(result.evidenceMatches, true, 'a field outside the projection must not break the match');
  eq(result.outcome, 'VERIFIED', 'and the envelope still verifies');
});

await check("CHECKER AUTHORITY IS 'unverified' WHEN NOBODY VOUCHED", async () => {
  // checker_must_not_be_doer stops a doer grading itself. It does not stop a
  // doer PROPOSING the most lenient checker it can find — proposeContract is
  // called by the doer and the unsigned contract already names checkerDid, so
  // every signature in a shopped contract verifies. This field does not close
  // that; it makes it visible where a third party reads.
  const result = await verifyEnvelope({ envelope: await goodEnvelope() });
  eq(result.checkerAuthority, 'unverified', 'no ControlProof means nobody vouched');
  eq(result.outcome, 'VERIFIED', 'but it must NOT downgrade the outcome on its own');
});

await check('a verdict naming a ControlProof reads as attested', async () => {
  const contract = await makeContract();
  const verdict = await makeVerdict(contract, { controlProofRef: 'sig:abc123' });
  const result = await verifyEnvelope({ envelope: await packEnvelope({ contract, verdict }) });
  eq(result.checkerAuthority, 'attested', 'a named authority must be reported');
});

await check('a blank ControlProof is absent, not attested', async () => {
  // A blank string is "absent" wearing a value's clothes, and it is exactly
  // what a lazy producer emits.
  const contract = await makeContract();
  const verdict = await makeVerdict(contract, { controlProofRef: '   ' });
  const result = await verifyEnvelope({ envelope: await packEnvelope({ contract, verdict }) });
  eq(result.checkerAuthority, 'unverified', 'whitespace must not read as authority');
});

await check('malformed input claims no checker authority either', async () => {
  const result = await verifyEnvelope({ envelope: 'not an envelope' });
  eq(result.checkerAuthority, 'unverified', 'an unreadable envelope vouches for nothing');
});

// ── the attacks ─────────────────────────────────────────────────────────────

await check('THE CONTRACT SWAP IS REFUSED AT PACK TIME', async () => {
  // A genuine verdict re-pointed at easier criteria. Both artifacts are real
  // and correctly signed; only the pairing is a lie.
  const real = await makeContract();
  const easy = await makeContract({ criteria: EASY_CRITERIA, taskId: 'task-easy' });
  const verdict = await makeVerdict(real);
  await throws(
    () => packEnvelope({ contract: easy, verdict }),
    /different contract/,
    'packing a verdict onto another contract must be refused'
  );
});

await check('and a swapped contract is caught on the VERIFY side too', async () => {
  // Mint-time refusal is not enough on its own: an attacker builds the JSON by
  // hand rather than calling packEnvelope.
  const real = await makeContract();
  const easy = await makeContract({ criteria: EASY_CRITERIA, taskId: 'task-easy' });
  const forged = { version: ENVELOPE_DOMAIN, contract: easy, verdict: await makeVerdict(real) };
  const result = await verifyEnvelope({ envelope: forged });
  eq(result.outcome, 'FAILED', 'a hand-built swap must fail');
  eq(result.verdict.boundToContract, false, 'and the binding must be what reports it');
});

await check('a verdict signed by a stranger is refused at pack time', async () => {
  const contract = await makeContract();
  const verdict = await makeVerdict(contract, { checkerDid: stranger.did, __key: stranger.privateKey });
  await throws(
    () => packEnvelope({ contract, verdict }),
    /while the contract names/,
    'only the agreed checker may sign the verdict in an envelope'
  );
});

await check('a self-checked contract cannot be packed', async () => {
  // checker_must_not_be_doer is constitutional. An envelope is exactly the
  // place someone would try to launder a self-signed judgement.
  await throws(
    async () => {
      const contract = await makeContract({ checkerDid: doer.did });
      return packEnvelope({ contract, verdict: await makeVerdict(contract) });
    },
    /checker_must_not_be_doer|same identity/i,
    'a doer-judged contract must not become a portable artifact'
  );
});

// ── hostile and malformed input ─────────────────────────────────────────────

for (const [name, value] of [
  ['null', null],
  ['a string', 'not an envelope'],
  ['a number', 42],
  ['an array', []],
  ['an empty object', {}],
  ['a wrong version', { version: 'zkrepid:trust-envelope:v99', contract: {}, verdict: {} }],
  ['a missing verdict', { version: ENVELOPE_DOMAIN, contract: {} }],
  ['a missing contract', { version: ENVELOPE_DOMAIN, verdict: {} }],
  ['an unsigned verdict', { version: ENVELOPE_DOMAIN, contract: { doerSignature: 'a', checkerSignature: 'b' }, verdict: {} }],
]) {
  await check(`hostile input never throws: ${name}`, async () => {
    const result = await verifyEnvelope({ envelope: value });
    eq(result.outcome, 'NOT_CHECKED', `${name} must be NOT_CHECKED, not FAILED and not a throw`);
    eq(result.evidenceMatches, null, 'and it must claim nothing about evidence');
    truthy(result.detail.length > 0, 'and it must say why');
  });
}

await check('A FUTURE VERSION IS REFUSED even when everything else is valid', async () => {
  // Found by mutation testing: removing the version check left the suite green,
  // because the only wrong-version fixture was ALSO missing its signatures, so a
  // later check caught it and the version gate was never the thing under test.
  // A well-formed envelope stamped v99 is the case that matters — accepting it
  // means interpreting a future format under today's rules, which is how a
  // field that gains meaning later gets silently ignored today.
  const e = JSON.parse(JSON.stringify(await goodEnvelope()));
  e.version = 'zkrepid:trust-envelope:v99';
  const result = await verifyEnvelope({ envelope: e });
  eq(result.outcome, 'NOT_CHECKED', 'an unknown version must not be verified under v1 rules');
  match(result.detail, /unknown envelope version/, 'and it must name the version it refused');
});

await check('a tampered signature is FAILED, which is different from malformed', async () => {
  // The distinction the three-outcome rule exists for: we looked and it is
  // wrong, versus we could not look.
  const e = JSON.parse(JSON.stringify(await goodEnvelope()));
  e.verdict.signature = e.verdict.signature.replace(/^./, (c) => (c === 'A' ? 'B' : 'A'));
  const result = await verifyEnvelope({ envelope: e });
  eq(result.outcome, 'FAILED', 'a broken signature is a finding, not an absence');
});

await check('a tampered criterion is caught, because the contract is signed', async () => {
  const e = JSON.parse(JSON.stringify(await goodEnvelope()));
  e.contract.criteria[0].statement = 'anything at all';
  const result = await verifyEnvelope({ envelope: e });
  eq(result.outcome, 'FAILED', 'editing the agreed criteria must invalidate the contract');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\nverdict-envelope: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All verdict-envelope checks passed.');
