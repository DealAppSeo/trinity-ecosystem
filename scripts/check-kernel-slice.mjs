// scripts/check-kernel-slice.mjs — the ONE real side-effect path, proven end to end.
//
// This drives the REAL runtime (lib/trustshell/runtime) with a REAL file-write
// executor against a real scratch directory, and asserts the brief's point-9
// invariants by checking what is actually on disk — not a counter:
//
//   1. NO ENVELOPE BYPASS      the file appears only on a legitimate ALLOW
//   2. NO PRIVILEGE AMPLIFICATION  a Kernel-Law / ungranted capability never writes
//   3. NO REPLAY / DOUBLE EXEC  a repeated requestId does not run the effect twice
//   4. HAL CANNOT AUTHORIZE     evidence state/confidence can't force a write
//   5. EVERY COMMIT -> RECEIPT  every disposition yields an integrity-hashed receipt
//
// Plus the two effect-contract properties that make it a real path, not a toy:
// args-binding (args must hash to the Envelope's argsHash) and path-safety (a
// write cannot escape the scratch root). Exit 0 VERIFIED, 1 a property regressed.

import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileAndImport } from './redteam/compile.mjs';

const FILES = [
  'lib/trustshell/kernel/envelope.ts',
  'lib/trustshell/kernel/constitution.ts',
  'lib/trustshell/kernel/kernel-laws.ts',
  'lib/trustshell/kernel/policy.ts',
  'lib/trustshell/kernel/gate.ts',
  'lib/trustshell/kernel/index.ts',
  'lib/trustshell/runtime/capability.ts',
  'lib/trustshell/runtime/receipt.ts',
  'lib/trustshell/runtime/execute.ts',
  'lib/trustshell/runtime/file-executor.ts',
  'lib/trustshell/runtime/index.ts',
];

const c = await compileAndImport(FILES, ['lib/trustshell/runtime/index.ts', 'lib/trustshell/kernel/index.ts']);
if (!c.ok) {
  console.error(`check:kernel-slice — could not build the runtime: ${c.reason}`);
  process.exit(1);
}
const [RT, K] = c.modules;
const {
  runAction,
  InMemoryLedger,
  makeFileWriteExecutor,
  mintCapability,
  attenuate,
  resolveGrantedCapabilities,
  hashArgs,
  verifyReceiptIntegrity,
} = RT;
const { DEFAULT_CONSTITUTION } = K;

const scratch = mkdtempSync(join(tmpdir(), 'kernel-slice-'));
// The executor's root is NESTED inside the per-run temp dir, so a `../` traversal
// target lands at `<scratch>/escaped.txt` — unique per run and cleaned with the
// rest. (A shared `/tmp/escaped.txt` would let one run's escape false-fail another.)
const sandbox = join(scratch, 'sandbox');
const NOW = Date.parse('2026-09-02T12:00:00.000Z');

let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL  ${name} — ${e.message}`);
  }
}
const eq = (a, b, m) => {
  if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const truthy = (v, m) => {
  if (!v) throw new Error(m);
};

// A proposal to write `args` to the scratch dir, with the correct argsHash bound.
let seq = 0;
function proposalFor(args, over = {}) {
  seq += 1;
  return {
    requestId: over.requestId ?? `req-${seq}`,
    principal: 'agent://sean/builder',
    capability: over.capability ?? 'fs.write',
    tool: 'fs.writeFile',
    targetResource: `file:${args.path}`,
    argsHash: hashArgs(args),
    dataClassification: 'INTERNAL',
    riskClass: over.riskClass ?? 'low',
    reversibility: 'reversible',
    financialExposure: 0,
    nonce: `n-${seq}`,
  };
}

function grantFor(capability) {
  return mintCapability({ capability, principal: 'agent://sean/builder', ttlMs: 3_600_000, now: NOW });
}

async function run(proposal, args, over = {}) {
  const grants = over.grants ?? [grantFor('fs.write')];
  const executor = makeFileWriteExecutor(sandbox);
  const ledger = over.ledger ?? new InMemoryLedger();
  const out = await runAction(
    {
      proposal,
      args,
      constitution: DEFAULT_CONSTITUTION,
      grantedCapabilities: resolveGrantedCapabilities(grants, over.now ?? NOW),
      approvals: over.approvals,
      evidence: over.evidence,
      composition: 'composition:builder@v1',
      now: over.now ?? NOW,
    },
    executor,
    ledger
  );
  return { out, ledger };
}

// ── the happy path is a REAL write ────────────────────────────────────────────

await check('ALLOW writes the real file and returns a committed, integrity-hashed receipt', async () => {
  const args = { path: 'ok.txt', contents: 'hello-trustshell' };
  const { out } = await run(proposalFor(args), args);
  eq(out.executed, true, 'the effect ran');
  eq(out.receipt.outcome, 'committed', 'receipt says committed');
  eq(out.receipt.decision, 'ALLOW', 'on an ALLOW verdict');
  truthy(existsSync(join(sandbox, 'ok.txt')), 'the file exists on disk');
  eq(readFileSync(join(sandbox, 'ok.txt'), 'utf8'), 'hello-trustshell', 'with the exact contents');
  truthy(verifyReceiptIntegrity(out.receipt), 'the receipt integrity hash verifies');
  truthy(out.receipt.integrityHash.startsWith('sha256:'), 'integrity hash is a sha256');
});

// ── 1. no envelope bypass / 2. no privilege amplification ─────────────────────

await check('NO PRIVILEGE AMPLIFICATION: an ungranted capability writes nothing', async () => {
  const args = { path: 'nope.txt', contents: 'should-not-exist' };
  const { out } = await run(proposalFor(args), args, { grants: [] });
  eq(out.executed, false, 'nothing ran');
  eq(out.receipt.decision, 'DENY', 'default-deny');
  truthy(!existsSync(join(sandbox, 'nope.txt')), 'no file was written');
});

await check('NO PRIVILEGE AMPLIFICATION: a Kernel-Law capability writes nothing even if granted', async () => {
  const args = { path: 'secret.txt', contents: 'x' };
  const { out } = await run(proposalFor(args, { capability: 'credentials.reveal' }), args, {
    grants: [grantFor('credentials.reveal')],
  });
  eq(out.executed, false, 'nothing ran');
  eq(out.receipt.firedRule, 'no-secret-exposure', 'the Kernel Law fired');
  truthy(!existsSync(join(sandbox, 'secret.txt')), 'no file was written');
});

// ── 3. no replay / double execution ───────────────────────────────────────────

await check('NO REPLAY: a repeated requestId does not run the effect a second time', async () => {
  const ledger = new InMemoryLedger();
  const args1 = { path: 'once.txt', contents: 'FIRST' };
  const p1 = proposalFor(args1, { requestId: 'replay-1' });
  const r1 = await run(p1, args1, { ledger });
  eq(r1.out.executed, true, 'first call writes');
  eq(readFileSync(join(sandbox, 'once.txt'), 'utf8'), 'FIRST', 'file has FIRST');

  // Same requestId, DIFFERENT contents — if it re-executed, the file would change.
  const args2 = { path: 'once.txt', contents: 'SECOND' };
  const p2 = proposalFor(args2, { requestId: 'replay-1' });
  const r2 = await run(p2, args2, { ledger });
  eq(r2.out.replay, true, 'the second call is a replay');
  eq(r2.out.executed, false, 'and does NOT run the effect');
  eq(readFileSync(join(sandbox, 'once.txt'), 'utf8'), 'FIRST', 'the file is unchanged — no double execution');
});

// ── args-binding: the executor cannot act on swapped arguments ────────────────

await check('ARGS-BINDING: args that do not hash to the Envelope argsHash are blocked', async () => {
  const authorized = { path: 'bind.txt', contents: 'authorized' };
  const proposal = proposalFor(authorized); // argsHash binds `authorized`
  const swapped = { path: 'bind.txt', contents: 'SWAPPED-AFTER-AUTH' };
  const { out } = await run(proposal, swapped); // but we hand the executor `swapped`
  eq(out.executed, false, 'a post-authorization swap does not run');
  truthy(/argsHash/.test(out.receipt.outcomeDetail), 'and the receipt says why');
  truthy(!existsSync(join(sandbox, 'bind.txt')), 'no file written');
});

// ── path-safety: a write cannot escape the scratch root ───────────────────────

await check('PATH-SAFETY: an authorized write cannot escape the scratch root', async () => {
  const args = { path: '../escaped.txt', contents: 'pwned' };
  const { out } = await run(proposalFor(args), args); // granted + ALLOW
  eq(out.receipt.decision, 'ALLOW', 'the capability is authorized');
  eq(out.receipt.outcome, 'error', 'but the executor refuses the traversal');
  // The error disposition: the executor WAS invoked (ALLOW), it ran and errored.
  eq(out.executed, true, 'executed=true on an ALLOW that errors (the effect ran, did not commit)');
  const escaped = join(sandbox, '..', 'escaped.txt');
  const leaked = existsSync(escaped);
  if (leaked) rmSync(escaped, { force: true }); // defensive: never leave a stray file (matters if this regresses)
  truthy(!leaked, 'nothing was written outside the root');
});

await check('PATH-SAFETY: a symlinked directory inside the root cannot be used to escape', async () => {
  // Plant a symlink INSIDE the sandbox pointing OUT of it, then try to write
  // through it. A purely lexical check would follow the link; the real-path guard
  // must refuse. (This is the case independent verification flagged.)
  const outside = join(scratch, 'sym-outside');
  mkdirSync(outside, { recursive: true });
  mkdirSync(sandbox, { recursive: true });
  const link = join(sandbox, 'link');
  try {
    symlinkSync(outside, link, 'dir');
  } catch {
    return; // symlinks unsupported on this filesystem — skip rather than false-fail
  }
  const args = { path: 'link/via-symlink.txt', contents: 'escape' };
  const { out } = await run(proposalFor(args), args); // granted + ALLOW
  eq(out.receipt.outcome, 'error', 'a write through a symlinked directory is refused');
  truthy(!existsSync(join(outside, 'via-symlink.txt')), 'nothing escaped via the symlink');
});

// ── 4. HAL cannot authorize ───────────────────────────────────────────────────

await check('HAL CANNOT AUTHORIZE: high-risk + disabled evidence (conf 1.0) does not write', async () => {
  const args = { path: 'hal-block.txt', contents: 'x' };
  const { out } = await run(proposalFor(args, { riskClass: 'high' }), args, {
    evidence: { confidence: 1.0, source: 'hal', state: 'disabled' },
  });
  eq(out.receipt.decision, 'VERIFY', 'disabled evidence cannot clear a high-risk action');
  eq(out.executed, false, 'nothing ran');
  truthy(!existsSync(join(sandbox, 'hal-block.txt')), 'no file written');
});

await check('HAL as evidence: high-risk + ENABLED strong evidence commits (policy decided)', async () => {
  const args = { path: 'hal-ok.txt', contents: 'verified' };
  const { out } = await run(proposalFor(args, { riskClass: 'high' }), args, {
    evidence: { confidence: 0.995, source: 'hal', state: 'enabled' },
  });
  eq(out.receipt.decision, 'ALLOW', 'enabled strong evidence clears the bar');
  eq(readFileSync(join(sandbox, 'hal-ok.txt'), 'utf8'), 'verified', 'and the file is written');
});

// ── 5. every disposition produces a receipt ───────────────────────────────────

await check('EVERY DISPOSITION PRODUCES A RECEIPT (committed and blocked alike)', async () => {
  const okArgs = { path: 'r1.txt', contents: 'a' };
  const committed = await run(proposalFor(okArgs), okArgs);
  const blocked = await run(proposalFor({ path: 'r2.txt', contents: 'b' }), { path: 'r2.txt', contents: 'b' }, { grants: [] });
  for (const { out } of [committed, blocked]) {
    truthy(out.receipt && typeof out.receipt.integrityHash === 'string', 'a receipt exists');
    truthy(verifyReceiptIntegrity(out.receipt), 'and its integrity verifies');
    // `executed` means the executor was INVOKED — true iff the verdict was ALLOW.
    // (A committed outcome is a strict subset: ALLOW that also succeeded.)
    eq(out.receipt.executed, out.receipt.decision === 'ALLOW', 'executed iff the verdict was ALLOW');
    if (out.receipt.outcome === 'committed') truthy(out.receipt.executed, 'a commit implies executed');
    truthy(out.receipt.constitutionFingerprint.startsWith('cfp-'), 'records which constitution governed it');
    truthy(out.receipt.composition.length > 0, 'and the acting composition');
  }
  // a malformed proposal also yields a receipt, and never executes
  const malformed = await run({ not: 'an envelope' }, {}, {});
  eq(malformed.out.executed, false, 'malformed never executes');
  truthy(malformed.out.receipt.outcomeDetail.length > 0, 'and still gets a receipt with a reason');
});

// ── TTL + attenuate-only (capability minter) ──────────────────────────────────

await check('TTL: an expired grant is not resolved, so the action is default-denied', async () => {
  const shortGrant = mintCapability({ capability: 'fs.write', principal: 'agent://sean/builder', ttlMs: 1000, now: NOW });
  const args = { path: 'expired.txt', contents: 'x' };
  const { out } = await run(proposalFor(args), args, { grants: [shortGrant], now: NOW + 5000 }); // 5s later
  eq(out.executed, false, 'an expired capability does not authorize');
  eq(out.receipt.decision, 'DENY', 'default-deny after expiry');
  truthy(!existsSync(join(sandbox, 'expired.txt')), 'no file written');
});

await check('ATTENUATE-ONLY: a derived grant can narrow but never widen', async () => {
  const parent = mintCapability({ capability: 'fs.write', principal: 'agent://sean/builder', ttlMs: 3_600_000, now: NOW });
  const narrower = attenuate(parent, { capability: 'fs.write.scratch', ttlMs: 60_000, now: NOW, nonce: 'a1' });
  truthy(narrower.ok, 'a sub-capability with a shorter TTL is allowed');
  const wider = attenuate(parent, { capability: 'fs', ttlMs: 60_000, now: NOW, nonce: 'a2' });
  truthy(!wider.ok, 'a broader capability is refused');
  const longer = attenuate(parent, { capability: 'fs.write', ttlMs: 7_200_000, now: NOW, nonce: 'a3' });
  truthy(!longer.ok, 'a longer TTL than the parent is refused');
});

rmSync(scratch, { recursive: true, force: true });
c.cleanup();

console.log(`\nkernel-slice: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  console.log('FAILED — a vertical-slice invariant regressed.\n');
  process.exit(1);
}
console.log(
  'check:kernel-slice — VERIFIED. One real side-effect path (file write) end to end:\n' +
    '  no envelope bypass, no privilege amplification, no replay/double-exec, HAL cannot\n' +
    '  authorize, every disposition -> an integrity-hashed receipt; plus args-binding and\n' +
    '  path-safety, TTL expiry and attenuate-only capabilities.\n'
);
