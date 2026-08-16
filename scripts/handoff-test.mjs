#!/usr/bin/env node
// scripts/handoff-test.mjs — the signed handoff artifact.
//
// Run: node scripts/handoff-test.mjs
//
// The assertions that carry this file, each guarding a way a handoff could
// launder a claim across a session boundary:
//
//   * 'A HASH IS NOT EVIDENCE' — a reader given only the handoff sees
//     NOT_CHECKED on every VERIFIED claim. Not because the handoff is
//     dishonest, but because "I cannot see what you cite" and "I checked what
//     you cite" are different facts.
//   * 'THE SPLICE IS FAILED, NOT NOT_CHECKED' — a genuinely signed verdict from
//     another task, cited here. Every signature checks out. That is evidence of
//     a mismatch, not a gap in the evidence, and the two must not read alike.
//   * 'AN AGENT CANNOT VOUCH FOR ITSELF ACROSS A NIGHT' — self-certification
//     with a session boundary in the middle is still self-certification.
//   * 'the effective outcome NEVER STRENGTHENS' — supplying a VERIFIED verdict
//     for a checkpoint the agent itself marked FAILED must not upgrade it.
//   * 'a broken chain link is FAILED' — a chain reconstructed from timestamps
//     is one a reordering can rewrite.
//   * 'NO CHECKPOINTS IS NOT_CHECKED, not VERIFIED' — nothing claimed is not
//     everything verified, however clean the artifact looks.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.handoff-check-'));
let did, wc, ho;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/identity/did.ts',
      'lib/trustshell/identity/work-contract.ts',
      'lib/trustshell/identity/handoff.ts',
      '--outDir', outDir,
      '--rootDir', 'lib',          // pinned; see work-contract-test.mjs
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
  ho = await import(pathToFileURL(join(base, 'handoff.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('handoff compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const { generateKeyPair } = did;
const { proposeContract, countersignContract, verifyContract, verifyVerdict, issueVerdict, CONTRACT_DOMAIN, VERDICT_DOMAIN } = wc;
const { signHandoff, verifyHandoff, handoffPayload, HANDOFF_DOMAIN } = ho;

let passed = 0;
const failures = [];
const check = async (name, fn) => {
  try { await fn(); passed += 1; } catch (e) { failures.push(`${name}\n    ${e.message}`); }
};
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const truthy = (v, what) => { if (!v) throw new Error(`${what}: expected truthy, got ${JSON.stringify(v)}`); };
const match = (s, re, what) => { if (!re.test(String(s))) throw new Error(`${what}: ${JSON.stringify(String(s))} !~ ${re}`); };
const throws = async (fn, re, what) => {
  try { await fn(); } catch (e) { if (!re.test(e.message)) throw new Error(`${what}: wrong error ${JSON.stringify(e.message)}`); return; }
  throw new Error(`${what}: expected a throw, got none`);
};

// ── fixtures ────────────────────────────────────────────────────────────────

const agent = await generateKeyPair();     // the one handing off (the doer)
const checker = await generateKeyPair();   // the independent auditor
const next = await generateKeyPair();      // the receiving agent

/** A fully signed contract + verdict for a task, so a checkpoint can cite real evidence. */
const evidenceFor = async (taskId, { outcome = 'VERIFIED', score = 0.95, checkerKp = checker } = {}) => {
  const unsigned = {
    version: CONTRACT_DOMAIN, taskId, deliverable: 'a thing',
    criteria: [{ id: 'c1', statement: 'it works', minScore: 0.9 }],
    doerDid: agent.did, checkerDid: checkerKp.did, proposedAt: '2026-08-15T00:00:00.000Z',
  };
  const { doerSignature } = await proposeContract({ unsigned, doerKey: agent.privateKey });
  const contract = await countersignContract({ unsigned, doerSignature, checkerKey: checkerKp.privateKey });
  const { contractHash } = await verifyContract(contract);
  const verdict = await issueVerdict({
    unsigned: {
      version: VERDICT_DOMAIN, contractHash, evidenceHash: 'sha256:' + 'a'.repeat(64),
      checkerDid: checkerKp.did, outcome,
      scores: [{ criterionId: 'c1', outcome, score }],
      issuedAt: '2026-08-15T01:00:00.000Z',
    },
    checkerKey: checkerKp.privateKey,
  });
  const v = await verifyVerdict({ verdict, contract });
  return { contract, verdict, contractHash, verdictHash: v.verdictHash };
};

const good = await evidenceFor('task-1');
const otherTask = await evidenceFor('task-OTHER');

const unsignedHandoff = (over = {}) => ({
  version: HANDOFF_DOMAIN,
  taskId: 'task-1',
  goal: 'make the thing work',
  checkpoints: [
    {
      id: 'cp1', statement: 'the thing works', outcome: 'VERIFIED',
      verdictHash: good.verdictHash, contractHash: good.contractHash,
      checkerDid: checker.did, detail: 'judged',
    },
  ],
  failures: [{ what: 'tried the fast path', evidence: 'it timed out twice', at: 'earlier' }],
  agentDid: agent.did,
  endedAt: '2026-08-15T02:00:00.000Z',
  ...over,
});

const sign = (over = {}) => signHandoff({ unsigned: unsignedHandoff(over), agentKey: agent.privateKey });
const fullEvidence = new Map([[good.verdictHash, { verdict: good.verdict, contract: good.contract }]]);

// ── the core property ───────────────────────────────────────────────────────

await check('a backed checkpoint stands when the evidence travels', async () => {
  const r = await verifyHandoff({ handoff: await sign(), evidence: fullEvidence });
  eq(r.outcome, 'VERIFIED', 'a fully backed handoff must verify');
  eq(r.checkpoints[0].effective, 'VERIFIED', 'and the checkpoint must stand');
  eq(r.signatureValid, true, 'signature');
});

await check('A HASH IS NOT EVIDENCE — no evidence supplied caps every VERIFIED claim', async () => {
  // The reader who received only the handoff. The claims may be perfectly true;
  // a commitment that cannot be opened is indistinguishable from one that opens
  // to nothing.
  const r = await verifyHandoff({ handoff: await sign() });
  eq(r.outcome, 'NOT_CHECKED', 'an unopenable claim must not read as verified');
  eq(r.checkpoints[0].effective, 'NOT_CHECKED', 'the checkpoint caps');
  eq(r.checkpoints[0].claimed, 'VERIFIED', 'while the claim itself is preserved');
  eq(r.checkpoints[0].capReason, 'evidence_not_supplied', 'and the reason distinguishes it from a lie');
  match(r.checkpoints[0].detail, /may be true/, 'the detail must not accuse');
});

await check('a VERIFIED claim citing NOTHING is capped', async () => {
  const r = await verifyHandoff({
    handoff: await sign({
      checkpoints: [{ id: 'cp1', statement: 'trust me', outcome: 'VERIFIED', detail: 'no refs' }],
    }),
    evidence: fullEvidence,
  });
  eq(r.checkpoints[0].effective, 'NOT_CHECKED', 'an unbacked VERIFIED is an assertion, not a checkpoint');
  eq(r.checkpoints[0].capReason, 'no_evidence_cited', 'reason');
});

// ── the splice ──────────────────────────────────────────────────────────────

await check('THE SPLICE IS FAILED, NOT NOT_CHECKED', async () => {
  // A genuinely signed VERIFIED verdict, about a different task, cited here.
  // Every signature checks out. This is evidence of a mismatch, not a gap in
  // the evidence, and collapsing it into NOT_CHECKED would file a forgery
  // under "could not look".
  const handoff = await sign({
    checkpoints: [{
      id: 'cp1', statement: 'the thing works', outcome: 'VERIFIED',
      verdictHash: otherTask.verdictHash, contractHash: otherTask.contractHash,
      checkerDid: checker.did, detail: 'spliced',
    }],
  });
  const r = await verifyHandoff({
    handoff,
    evidence: new Map([[otherTask.verdictHash, { verdict: otherTask.verdict, contract: otherTask.contract }]]),
  });
  eq(r.checkpoints[0].effective, 'FAILED', 'a verdict about other work must FAIL, not merely not-check');
  eq(r.checkpoints[0].capReason, 'wrong_task', 'named as a task mismatch');
  eq(r.outcome, 'FAILED', 'and it must sink the handoff');
  match(r.checkpoints[0].detail, /task-OTHER/, 'the other task must be named');
});

await check('a verdict that does not hash to the cited value is FAILED', async () => {
  const handoff = await sign({
    checkpoints: [{
      id: 'cp1', statement: 'x', outcome: 'VERIFIED',
      verdictHash: 'sha256:' + 'f'.repeat(64), contractHash: good.contractHash,
      checkerDid: checker.did, detail: 'wrong hash',
    }],
  });
  // Supplied under the hash the checkpoint claims, so the lookup succeeds and
  // the mismatch has to be caught by comparison rather than by absence.
  const r = await verifyHandoff({
    handoff,
    evidence: new Map([['sha256:' + 'f'.repeat(64), { verdict: good.verdict, contract: good.contract }]]),
  });
  eq(r.checkpoints[0].effective, 'FAILED', 'a hash mismatch must fail');
  eq(r.checkpoints[0].capReason, 'hash_mismatch', 'reason');
});

await check('CITING A VERDICT WITHOUT ITS CONTRACT IS NOT ENOUGH', async () => {
  // Found by mutation: requiring only `verdictHash` left the contract binding
  // droppable, and the contract is half of what detects a splice. A verdict
  // alone says "somebody judged something"; the contract is what says WHICH
  // criteria, for WHICH task.
  const r = await verifyHandoff({
    handoff: await sign({
      checkpoints: [{
        id: 'cp1', statement: 'x', outcome: 'VERIFIED',
        verdictHash: good.verdictHash, detail: 'no contract cited',
      }],
    }),
    evidence: fullEvidence,
  });
  eq(r.checkpoints[0].effective, 'NOT_CHECKED', 'a verdict without its contract must not back a claim');
  eq(r.checkpoints[0].capReason, 'no_evidence_cited', 'reason');
});

await check('A CITED CONTRACT HASH THAT THE VERDICT DOES NOT NAME IS FAILED', async () => {
  // Found by mutation. The checkpoint points at contract A, the verdict answers
  // contract B, and both are real — so a reader who checks only the verdict
  // sees nothing wrong while the criteria actually judged are not the ones
  // cited.
  const r = await verifyHandoff({
    handoff: await sign({
      checkpoints: [{
        id: 'cp1', statement: 'x', outcome: 'VERIFIED',
        verdictHash: good.verdictHash, contractHash: otherTask.contractHash,
        checkerDid: checker.did, detail: 'mismatched contract',
      }],
    }),
    evidence: fullEvidence,
  });
  eq(r.checkpoints[0].effective, 'FAILED', 'a contract the verdict does not name must fail');
  eq(r.checkpoints[0].capReason, 'hash_mismatch', 'reason');
});

await check('A VERDICT THAT DOES NOT VERIFY AS VERIFIED CANNOT BACK A CLAIM', async () => {
  // Found by mutation. The evidence is present, genuine and correctly bound —
  // and says the work FAILED. A checkpoint citing it as VERIFIED is citing
  // evidence against itself, which is worse than citing none.
  const failed = await evidenceFor('task-1', { outcome: 'FAILED', score: 0.1 });
  const r = await verifyHandoff({
    handoff: await sign({
      checkpoints: [{
        id: 'cp1', statement: 'x', outcome: 'VERIFIED',
        verdictHash: failed.verdictHash, contractHash: failed.contractHash,
        checkerDid: checker.did, detail: 'cites a failing verdict',
      }],
    }),
    evidence: new Map([[failed.verdictHash, { verdict: failed.verdict, contract: failed.contract }]]),
  });
  eq(r.checkpoints[0].effective, 'FAILED', 'evidence that says FAILED must not read as VERIFIED');
  // WAS `evidence_invalid` UNTIL 2026-08-15, and the comment above was already
  // the argument against it: "citing evidence against itself" is not the same
  // fact as "the citation is broken". Measured, they were indistinguishable —
  // same cap reason AND same effective outcome, no field separating them. The
  // comment described the distinction; the assertion asserted its opposite.
  eq(r.checkpoints[0].capReason, 'contradicted_by_evidence', 'reason');
  match(r.checkpoints[0].detail, /overclaim, not a gap/, 'and the detail must name it as one');
});

await check('EVIDENCE THAT IS ACTUALLY BROKEN READS DIFFERENTLY FROM AN OVERCLAIM', async () => {
  // This path had NO coverage before 2026-08-15. The single assertion naming
  // `evidence_invalid` was on the test above, which supplies a genuine,
  // correctly-bound verdict — so the broken-citation branch was never exercised
  // and the label was being proven by the wrong case.
  const failed = await evidenceFor('task-1', { outcome: 'FAILED', score: 0.1 });
  const tampered = structuredClone(good.verdict);
  tampered.signature = tampered.signature.slice(0, -2) + (tampered.signature.endsWith('A') ? 'B' : 'A');
  const r = await verifyHandoff({
    handoff: await sign({
      checkpoints: [{
        id: 'cp1', statement: 'x', outcome: 'VERIFIED',
        verdictHash: good.verdictHash, contractHash: good.contractHash,
        checkerDid: checker.did, detail: 'cites a tampered verdict',
      }],
    }),
    evidence: new Map([[good.verdictHash, { verdict: tampered, contract: good.contract }]]),
  });
  eq(r.checkpoints[0].effective, 'FAILED', 'a broken citation cannot back a claim either');
  eq(r.checkpoints[0].capReason, 'evidence_invalid',
    'A CORRUPT CITATION MAY BE TRANSPORT OR A BUG; AN OVERCLAIM IS THE AGENT CONTRADICTING ITSELF');
  // The two must not be reported the same way. Asserted as a comparison rather
  // than two literals, so the property survives a rename of either constant.
  if (r.checkpoints[0].capReason === 'contradicted_by_evidence') {
    throw new Error('broken evidence must not be reported as an overclaim');
  }
  eq(failed.contract.taskId, 'task-1', 'fixture sanity: the task must match, or wrong_task would mask this');
});

await check('A VERDICT NOT BOUND TO THE SUPPLIED CONTRACT IS BROKEN EVIDENCE, NOT AN OVERCLAIM', async () => {
  // Found by mutation: dropping `boundToContract` from the soundness test
  // survived every assertion. It is reachable, and it is a contract-level
  // splice — a genuinely signed verdict answering contract A, presented against
  // contract B. Same taskId, so `wrong_task` does not fire; same verdict hash,
  // so `hash_mismatch` does not either. Only `boundToContract` separates it.
  //
  // It must read as evidence_invalid: the agent's citation does not hang
  // together, which is a different accusation from claiming the opposite of
  // sound evidence.
  const unsignedB = {
    version: CONTRACT_DOMAIN, taskId: 'task-1', deliverable: 'a DIFFERENT thing',
    criteria: [{ id: 'c1', statement: 'it works', minScore: 0.9 }],
    doerDid: agent.did, checkerDid: checker.did, proposedAt: '2026-08-15T00:00:00.000Z',
  };
  const { doerSignature } = await proposeContract({ unsigned: unsignedB, doerKey: agent.privateKey });
  const contractB = await countersignContract({ unsigned: unsignedB, doerSignature, checkerKey: checker.privateKey });
  const { contractHash: hashB } = await verifyContract(contractB);
  if (hashB === good.contractHash) throw new Error('fixture is not distinct: both contracts hash the same');

  const r = await verifyHandoff({
    handoff: await sign({
      checkpoints: [{
        id: 'cp1', statement: 'x', outcome: 'VERIFIED',
        verdictHash: good.verdictHash, contractHash: good.contractHash,
        checkerDid: checker.did, detail: 'verdict for contract A, contract B supplied',
      }],
    }),
    // The verdict is genuine and unmodified; only the contract it is checked
    // against is the wrong one.
    evidence: new Map([[good.verdictHash, { verdict: good.verdict, contract: contractB }]]),
  });
  eq(r.checkpoints[0].capReason, 'evidence_invalid',
    'AN UNBOUND VERDICT IS A BROKEN CITATION, whatever its signature says');
});

await check('a padded checker DID does not escape the self-certification check', async () => {
  // Found by mutation. One character, defeating the constitutional invariant —
  // the fourth place this exact bypass has surfaced in this build.
  const r = await verifyHandoff({
    handoff: await sign({
      checkpoints: [{
        id: 'cp1', statement: 'x', outcome: 'VERIFIED',
        verdictHash: good.verdictHash, contractHash: good.contractHash,
        checkerDid: ` ${agent.did} `, detail: 'padded self',
      }],
    }),
    evidence: fullEvidence,
  });
  eq(r.checkpoints[0].capReason, 'self_certified', 'whitespace must not buy self-certification');
  eq(r.checkpoints[0].effective, 'NOT_CHECKED', 'and it must still cap');
});

await check('a checkpoint naming a different checker than the verdict is FAILED', async () => {
  const handoff = await sign({
    checkpoints: [{
      id: 'cp1', statement: 'x', outcome: 'VERIFIED',
      verdictHash: good.verdictHash, contractHash: good.contractHash,
      checkerDid: next.did, detail: 'wrong checker named',
    }],
  });
  const r = await verifyHandoff({ handoff, evidence: fullEvidence });
  eq(r.checkpoints[0].effective, 'FAILED', 'a misattributed checker must fail');
});

// ── self-certification ──────────────────────────────────────────────────────

await check('AN AGENT CANNOT VOUCH FOR ITSELF ACROSS A NIGHT', async () => {
  // Self-certification with a session boundary in the middle is still
  // self-certification — and it is the one failure a perfectly valid verdict
  // still exhibits, so it is checked before anything else.
  const r = await verifyHandoff({
    handoff: await sign({
      checkpoints: [{
        id: 'cp1', statement: 'x', outcome: 'VERIFIED',
        verdictHash: good.verdictHash, contractHash: good.contractHash,
        checkerDid: agent.did, detail: 'self',
      }],
    }),
    evidence: fullEvidence,
  });
  eq(r.checkpoints[0].effective, 'NOT_CHECKED', 'an agent may not certify its own checkpoint');
  eq(r.checkpoints[0].capReason, 'self_certified', 'reason');
  match(r.checkpoints[0].detail, /night in between/, 'the detail should name the shape');
});

await check('THE CHECKER CANNOT HAND OFF VOUCHING FOR ITS OWN JUDGEMENT', async () => {
  // The realistic shape, and NOT the one this test first tried. The first
  // version built a contract whose checker was the doer — which
  // `work-contract` refuses at construction, so that verdict cannot exist and
  // the test was unbuildable.
  //
  // The reachable attack is one identity over: the AUDITOR writes the handoff.
  // The contract is impeccable (doer != checker), the verdict is genuine, and
  // the agent presenting it as an established checkpoint is the same identity
  // that judged it. Nothing in the contract layer objects, because from its
  // point of view nothing is wrong.
  //
  // The checkpoint also declines to name a checker, so the structural check has
  // nothing to compare and the evidential one must catch it.
  const handoff = await signHandoff({
    unsigned: {
      ...unsignedHandoff({
        checkpoints: [{
          id: 'cp1', statement: 'x', outcome: 'VERIFIED',
          verdictHash: good.verdictHash, contractHash: good.contractHash,
          detail: 'no checker named',
        }],
      }),
      agentDid: checker.did,        // the auditor is the one handing off
    },
    agentKey: checker.privateKey,
  });
  const r = await verifyHandoff({ handoff, evidence: fullEvidence });
  eq(r.checkpoints[0].capReason, 'self_certified', 'the real checker must still be examined');
  eq(r.checkpoints[0].effective, 'NOT_CHECKED', 'and capped');
});

// ── the ceiling never strengthens ───────────────────────────────────────────

await check('THE EFFECTIVE OUTCOME NEVER STRENGTHENS', async () => {
  // A reader supplying a VERIFIED verdict for a checkpoint the agent ITSELF
  // marked FAILED must still see FAILED. The agent that did the work saying it
  // failed is information the evidence does not override.
  const r = await verifyHandoff({
    handoff: await sign({
      checkpoints: [{
        id: 'cp1', statement: 'x', outcome: 'FAILED',
        verdictHash: good.verdictHash, contractHash: good.contractHash,
        checkerDid: checker.did, detail: 'the agent says it failed',
      }],
    }),
    evidence: fullEvidence,
  });
  eq(r.checkpoints[0].effective, 'FAILED', 'a VERIFIED verdict must not upgrade a FAILED claim');
  eq(r.outcome, 'FAILED', 'and the handoff carries it');
});

await check('NOT_CHECKED and FAILED checkpoints need no evidence', async () => {
  // Demanding evidence for them would create an incentive to report neither,
  // which is how failure disappears from a record.
  const r = await verifyHandoff({
    handoff: await sign({
      checkpoints: [
        { id: 'a', statement: 'unreachable', outcome: 'NOT_CHECKED', detail: 'proxy denied' },
        { id: 'b', statement: 'broken', outcome: 'FAILED', detail: 'assertion failed' },
      ],
    }),
  });
  eq(r.checkpoints[0].effective, 'NOT_CHECKED', 'unchanged');
  eq(r.checkpoints[1].effective, 'FAILED', 'unchanged');
  eq(r.checkpoints.every((c) => c.capReason === undefined), true, 'and neither is "capped"');
});

// ── the artifact itself ─────────────────────────────────────────────────────

await check('A TAMPERED CHECKPOINT BREAKS THE SIGNATURE', async () => {
  const handoff = await sign();
  const tampered = {
    ...handoff,
    checkpoints: [{ ...handoff.checkpoints[0], statement: 'something much stronger' }],
  };
  const r = await verifyHandoff({ handoff: tampered, evidence: fullEvidence });
  eq(r.signatureValid, false, 'an edited checkpoint must break the signature');
  eq(r.outcome, 'FAILED', 'and sink the handoff');
  eq(r.checkpoints[0].effective, 'FAILED', 'every checkpoint must fall with it');
});

await check('failures are INSIDE the signature', async () => {
  // A format where the failure list can be edited under a stable signature
  // teaches every agent to quietly drop it.
  const handoff = await sign();
  const stripped = { ...handoff, failures: [] };
  const r = await verifyHandoff({ handoff: stripped, evidence: fullEvidence });
  eq(r.signatureValid, false, 'dropping the failure record must break the signature');
});

await check('NO CHECKPOINTS IS NOT_CHECKED, not VERIFIED', async () => {
  // Nothing claimed is not everything verified, however clean the artifact looks.
  const r = await verifyHandoff({ handoff: await sign({ checkpoints: [] }), evidence: fullEvidence });
  eq(r.outcome, 'NOT_CHECKED', 'an empty handoff establishes nothing');
});

await check('separator injection is refused at signing', async () => {
  await throws(
    () => sign({ goal: 'a|b' }),
    /field separator/,
    'a pipe in the goal was accepted'
  );
});

await check('duplicate checkpoint ids are refused', async () => {
  await throws(
    () => sign({
      checkpoints: [
        { id: 'x', statement: 'one', outcome: 'FAILED', detail: '' },
        { id: 'x', statement: 'two', outcome: 'FAILED', detail: '' },
      ],
    }),
    /appears twice/,
    'ambiguous checkpoint ids were accepted'
  );
});

await check('checkpoint ORDER is part of the artifact', async () => {
  const a = handoffPayload(unsignedHandoff({
    checkpoints: [
      { id: 'a', statement: 'x', outcome: 'FAILED', detail: '' },
      { id: 'b', statement: 'y', outcome: 'FAILED', detail: '' },
    ],
  }));
  const b = handoffPayload(unsignedHandoff({
    checkpoints: [
      { id: 'b', statement: 'y', outcome: 'FAILED', detail: '' },
      { id: 'a', statement: 'x', outcome: 'FAILED', detail: '' },
    ],
  }));
  truthy(a !== b, 'reordered checkpoints must not hash the same');
});

// ── the chain ───────────────────────────────────────────────────────────────

await check('a matching chain link verifies', async () => {
  const first = await sign({ taskId: 'task-1' });
  const firstHash = (await verifyHandoff({ handoff: first })).handoffHash;
  const second = await sign({ previousHandoffHash: firstHash });
  const r = await verifyHandoff({ handoff: second, previous: first, evidence: fullEvidence });
  eq(r.chainIntact, true, 'the link must verify');
  eq(r.outcome, 'VERIFIED', 'and the handoff stands');
});

await check('A BROKEN CHAIN LINK IS FAILED', async () => {
  // A chain reconstructed from timestamps is one a reordering can rewrite.
  const first = await sign();
  const second = await sign({ previousHandoffHash: 'sha256:' + '9'.repeat(64) });
  const r = await verifyHandoff({ handoff: second, previous: first, evidence: fullEvidence });
  eq(r.chainIntact, false, 'the mismatch must be detected');
  eq(r.outcome, 'FAILED', 'and it must sink the handoff');
  match(r.detail, /chain has been rewritten/, 'reason');
});

await check('NO PREVIOUS SUPPLIED IS null, NOT false', async () => {
  // The third state again. `false` would allege a broken chain that may be
  // perfectly intact — the link was simply never examined.
  const r = await verifyHandoff({ handoff: await sign({ previousHandoffHash: 'sha256:' + '9'.repeat(64) }) });
  eq(r.chainIntact, null, 'an unexamined link must be null');
  match(r.outcome, /VERIFIED|NOT_CHECKED/, 'and must not fail the handoff on its own');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\nhandoff: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All handoff checks passed.');
