// scripts/check-kernel-envelope.mjs — the kernel core fails closed, proven by running it.
//
// The kernel core (lib/trustshell/kernel) is the trust plane: an untrusted
// proposal becomes a normalized Envelope, the deterministic policy engine
// disposes of it (ALLOW/DENY/ASK/VERIFY), and the gate runs the underlying action
// ONLY on ALLOW. This suite drives the REAL compiled modules — not a reading of
// them — and pins the properties that, if they regressed, would turn the gate
// into a fail-open:
//
//   * default-deny: no granted capability => DENY, action not run
//   * malformed proposal => DENY, action not run, policy never consulted
//   * a constitutional `deny` outranks a held capability
//   * require_approval blocks with ASK until the approval is presented
//   * a high-risk action needs verification EVIDENCE to clear; policy (not HAL)
//     decides, and absent/weak evidence => VERIFY
//   * the action function is invoked on ALLOW and on no other verdict
//
// Exit 0 = VERIFIED, 1 = a fail-closed property regressed. If the kernel will not
// compile that is a hard failure here (unlike a redteam probe against a possibly
// unreachable surface, this is our own new code and must build).

import { compileAndImport } from './redteam/compile.mjs';

const KERNEL = [
  'lib/trustshell/kernel/envelope.ts',
  'lib/trustshell/kernel/constitution.ts',
  'lib/trustshell/kernel/policy.ts',
  'lib/trustshell/kernel/gate.ts',
  'lib/trustshell/kernel/index.ts',
];

const c = await compileAndImport(KERNEL, ['lib/trustshell/kernel/index.ts']);
if (!c.ok) {
  console.error(`check:kernel-envelope — could not build the kernel: ${c.reason}`);
  process.exit(1);
}
const K = c.modules[0];
const {
  DEFAULT_CONSTITUTION,
  dispose,
  guardedExecute,
  normalizeEnvelope,
  constitutionFingerprint,
} = K;

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

// A well-formed, low-risk, non-financial proposal. Individual tests override one
// field at a time so a single property is under test each time.
const base = () => ({
  requestId: 'req-1',
  principal: 'agent://sean/builder',
  capability: 'repo.branch.create',
  tool: 'github.createBranch',
  targetResource: 'repo:acme/web@branch:agent/1',
  argsHash: 'sha256:deadbeef',
  dataClassification: 'INTERNAL',
  riskClass: 'low',
  reversibility: 'reversible',
  financialExposure: 0,
  nonce: 'n-1',
});

// A gate run that records whether the action was invoked.
async function run(proposal, ctx) {
  let ran = 0;
  const res = await guardedExecute(
    proposal,
    DEFAULT_CONSTITUTION,
    ctx,
    async () => {
      ran += 1;
      return 'did-the-thing';
    }
  );
  return { res, ran };
}

const GRANTED = { grantedCapabilities: ['repo.branch.create'] };

// ── the happy path exists, so the deny tests mean something ───────────────────

await check('a granted, low-risk, clean proposal is ALLOWed and the action RUNS', async () => {
  const { res, ran } = await run(base(), GRANTED);
  eq(res.decision, 'ALLOW', 'clean granted proposal must ALLOW');
  eq(res.ran, true, 'and the gate must report it ran');
  eq(ran, 1, 'and the action must actually have been invoked once');
  eq(res.value, 'did-the-thing', 'and the action value flows back');
});

// ── default-deny ──────────────────────────────────────────────────────────────

await check('DEFAULT-DENY: no granted capability => DENY, action not run', async () => {
  const { res, ran } = await run(base(), { grantedCapabilities: [] });
  eq(res.decision, 'DENY', 'ungranted capability must DENY');
  eq(res.ran, false, 'and must not run');
  eq(ran, 0, 'the action must never have been invoked');
});

await check('a grant for a DIFFERENT capability does not authorize this one', async () => {
  const { res, ran } = await run(base(), { grantedCapabilities: ['repo.read'] });
  eq(res.decision, 'DENY', 'unrelated grant must not authorize');
  eq(ran, 0, 'action not run');
});

// ── malformed input never reaches policy ──────────────────────────────────────

await check('a malformed proposal => DENY, action not run, no verdict', async () => {
  const bad = base();
  delete bad.capability; // missing required field
  const { res, ran } = await run(bad, GRANTED);
  eq(res.decision, 'DENY', 'malformed must DENY');
  eq(res.ran, false, 'and not run');
  eq(res.verdict, null, 'and policy must not even have produced a verdict');
  eq(ran, 0, 'action not run');
  truthy(/invalid envelope/.test(res.reason), `reason should name the invalidity, got: ${res.reason}`);
});

await check('a bad enum value is rejected at normalization', async () => {
  const bad = base();
  bad.riskClass = 'catastrophic'; // not a RiskClass
  const norm = normalizeEnvelope(bad);
  eq(norm.ok, false, 'out-of-range enum must be rejected');
});

await check('a non-object proposal is rejected, not coerced', async () => {
  for (const junk of [null, undefined, 42, 'string', []]) {
    const { res, ran } = await run(junk, GRANTED);
    eq(res.decision, 'DENY', `junk ${JSON.stringify(junk)} must DENY`);
    eq(ran, 0, 'action not run');
  }
});

// ── hard rules outrank grants ─────────────────────────────────────────────────

await check('a constitutional DENY outranks a held capability', async () => {
  const p = base();
  p.capability = 'credentials.reveal';
  // Even if the caller somehow holds the capability, the hard rule wins.
  const { res, ran } = await run(p, { grantedCapabilities: ['credentials.reveal'] });
  eq(res.decision, 'DENY', 'credential-exfiltration must be denied regardless of grant');
  eq(res.verdict.firedRule, 'no-credential-exfiltration', 'and name the rule that fired');
  eq(ran, 0, 'action not run');
});

await check('the credential rule also fires on a tool-name match', async () => {
  const p = base();
  p.tool = 'shell.reveal-secret';
  const { res } = await run(p, { grantedCapabilities: [p.capability] });
  eq(res.decision, 'DENY', 'a reveal-secret tool must be denied');
});

// ── require_approval ──────────────────────────────────────────────────────────

await check('overspend without approval => ASK, action not run', async () => {
  const p = base();
  p.financialExposure = 100;
  const { res, ran } = await run(p, GRANTED);
  eq(res.decision, 'ASK', 'spend at/above threshold must ASK');
  eq(res.verdict.firedRule, 'overspend-needs-approval', 'and name the rule');
  eq(ran, 0, 'action not run while awaiting approval');
});

await check('overspend WITH the matching approval proceeds', async () => {
  const p = base();
  p.financialExposure = 250;
  const { res, ran } = await run(p, {
    grantedCapabilities: ['repo.branch.create'],
    approvals: ['overspend-needs-approval'],
  });
  eq(res.decision, 'ALLOW', 'a presented approval clears the ASK');
  eq(ran, 1, 'and the action runs');
});

await check('an approval for the WRONG rule does not clear the ASK', async () => {
  const p = base();
  p.financialExposure = 250;
  const { res, ran } = await run(p, {
    grantedCapabilities: ['repo.branch.create'],
    approvals: ['some-other-rule'],
  });
  eq(res.decision, 'ASK', 'a mismatched approval must not satisfy the rule');
  eq(ran, 0, 'action not run');
});

await check('an irreversible delete needs approval', async () => {
  const p = base();
  p.capability = 'repo.branch.delete';
  p.reversibility = 'irreversible';
  const { res } = await run(p, { grantedCapabilities: ['repo.branch.delete'] });
  eq(res.decision, 'ASK', 'irreversible delete must ASK');
});

// ── HAL is evidence, not authority ────────────────────────────────────────────

await check('a high-risk action with NO evidence => VERIFY, action not run', async () => {
  const p = base();
  p.riskClass = 'high';
  const { res, ran } = await run(p, GRANTED);
  eq(res.decision, 'VERIFY', 'high risk with no evidence must VERIFY');
  eq(ran, 0, 'action not run');
});

await check('high-risk with WEAK confidence => still VERIFY', async () => {
  const p = base();
  p.riskClass = 'high';
  const { res, ran } = await run(p, { grantedCapabilities: ['repo.branch.create'], evidence: { confidence: 0.5 } });
  eq(res.decision, 'VERIFY', 'weak evidence must not clear a high-risk action');
  eq(ran, 0, 'action not run');
});

await check('high-risk clears only when policy (not HAL) finds confidence >= threshold', async () => {
  const p = base();
  p.riskClass = 'high';
  const strong = await run(p, {
    grantedCapabilities: ['repo.branch.create'],
    evidence: { confidence: 0.995 },
  });
  eq(strong.res.decision, 'ALLOW', 'strong evidence clears the bar');
  eq(strong.ran, 1, 'and the action runs');

  // The bar is policy's, and it is configurable — but it is POLICY that applies
  // it. A verifier returning 1.0 under a 1.0-exclusive... here we prove the
  // threshold is honoured: raise it above the evidence and it blocks again.
  const raised = await run(p, {
    grantedCapabilities: ['repo.branch.create'],
    evidence: { confidence: 0.995 },
    verifyThreshold: 0.999,
  });
  eq(raised.res.decision, 'VERIFY', 'a higher policy threshold blocks the same evidence');
});

// ── dispose is total, and ALLOW is the only thing that runs the action ────────

await check('dispose never throws, even on adversarial field values', async () => {
  const hostile = base();
  hostile.tool = '"; DROP TABLE agents; --';
  hostile.targetResource = '../../etc/passwd';
  hostile.capability = 'repo.branch.create';
  const norm = normalizeEnvelope(hostile);
  truthy(norm.ok, 'these are valid strings, so they normalize');
  // A deterministic verdict, no throw.
  const v = dispose(norm.envelope, DEFAULT_CONSTITUTION, GRANTED);
  truthy(['ALLOW', 'DENY', 'ASK', 'VERIFY'].includes(v.decision), 'a verdict, not a throw');
});

await check('across every verdict, the action runs iff ALLOW', async () => {
  const cases = [
    { p: base(), ctx: GRANTED, expect: 'ALLOW' },
    { p: base(), ctx: { grantedCapabilities: [] }, expect: 'DENY' },
    { p: { ...base(), financialExposure: 500 }, ctx: GRANTED, expect: 'ASK' },
    { p: { ...base(), riskClass: 'high' }, ctx: GRANTED, expect: 'VERIFY' },
  ];
  for (const { p, ctx, expect } of cases) {
    const { res, ran } = await run(p, ctx);
    eq(res.decision, expect, `expected ${expect}`);
    eq(ran, expect === 'ALLOW' ? 1 : 0, `action-run count wrong for ${expect}`);
  }
});

// ── the constitution fingerprint identifies a version ─────────────────────────

await check('constitutionFingerprint is stable and changes on any edit', async () => {
  const a = constitutionFingerprint(DEFAULT_CONSTITUTION);
  const again = constitutionFingerprint(DEFAULT_CONSTITUTION);
  eq(a, again, 'same content, same fingerprint');
  const edited = { ...DEFAULT_CONSTITUTION, version: 'constitution-v0-edited' };
  truthy(constitutionFingerprint(edited) !== a, 'an edit must change the fingerprint');
});

c.cleanup();

console.log(`\nkernel-envelope: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  console.log('FAILED — a kernel fail-closed property regressed.\n');
  process.exit(1);
}
console.log(
  'check:kernel-envelope — VERIFIED. The gate fails closed: default-deny, malformed=>DENY,\n' +
    '  hard rules outrank grants, require_approval blocks with ASK, high risk needs evidence\n' +
    '  policy (not HAL) accepts, and the action runs on ALLOW and no other verdict.\n'
);
