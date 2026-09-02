// KERNEL-001 — the trust-plane gate must run a side effect ONLY on a legitimate ALLOW.
//
// THREAT. The kernel core (lib/trustshell/kernel) is the boundary the whole
// "models propose, TrustShell disposes" claim rests on: an untrusted proposal is
// normalized, the deterministic policy engine disposes of it, and the gate runs
// the underlying action only when the verdict is ALLOW. The attack surface is the
// PROPOSAL — it is whatever an upstream model/agent emitted, and a prompt-injected
// model will emit whatever it takes to get a side effect to run. So the property
// worth attacking is exactly the one a fail-open would break:
//
//   for every proposal that attacks the CAPABILITY/authority boundary — malformed,
//   injection-shaped, ungranted, wrong-grant, or naming a capability a Kernel Law
//   forbids (secret exposure, privilege self-escalation, evidence rewriting, gate
//   bypass, silent constitution change) even WITH that capability granted — the
//   gate either ALLOWs it legitimately or does not run the action at all.
//
// SCOPE — THE DECLARED-ENVELOPE BOUNDARY (why this probe uses honestly-declared
// hostiles). The Constitution's `require_approval` / high-risk `VERIFY` gates key
// on self-attested risk fields (`financialExposure`, `reversibility`, `riskClass`)
// the proposer controls, so a caller who HOLDS the relevant capability can
// under-declare them to slip past those gates. That is the kernel's documented
// boundary — it fails closed over what the Envelope DECLARES, and binding the risk
// fields against a lying proposer is a later interface (a trusted Envelope
// constructor). This probe therefore attacks the NON-evadable half — the capability
// match and the Kernel Laws — and the mis-declaration boundary is pinned as an
// expected fact by check:kernel-envelope, not asserted as HELD here.
//
// WHY THIS CAN DRIFT. Default-deny lives in one branch of policy.ts; the "run only
// on ALLOW" gate lives in one branch of gate.ts; malformed-rejection lives in
// normalizeEnvelope. Nothing but this probe pins all three against a real
// adversary at once. A future edit that defaults a missing branch to allow, or
// lets a thrown authorizer error fall through to execution, opens the fail-open.
//
// WHAT THIS JUDGES — executed, not read. It compiles lib/trustshell/kernel and
// drives the REAL guardedExecute with a battery of hostile proposals, counting
// every time the action actually runs:
//
//   HELD        no hostile proposal ran the action; every block is DENY/ASK/VERIFY;
//               and the one legitimately-granted control proposal DID run (so the
//               gate is not trivially refusing everything).
//   BREACHED    some hostile proposal ran the action, or a constitutional DENY was
//               ALLOWed. Captured with the exact proposal and verdict.
//   NOT_CHECKED the kernel will not compile/import. A module that will not build
//               has told us nothing about whether it is exploitable.
//
// Read-only, no secrets, no network — the action is an in-memory counter.

import { compileAndImport } from '../compile.mjs';
import { held, breached, notChecked } from '../harness.mjs';

const KERNEL = [
  'lib/trustshell/kernel/envelope.ts',
  'lib/trustshell/kernel/constitution.ts',
  'lib/trustshell/kernel/kernel-laws.ts',
  'lib/trustshell/kernel/policy.ts',
  'lib/trustshell/kernel/gate.ts',
  'lib/trustshell/kernel/index.ts',
];

const baseProposal = () => ({
  requestId: 'req-atk',
  principal: 'agent://attacker',
  capability: 'repo.branch.create',
  tool: 'github.createBranch',
  targetResource: 'repo:acme/web@branch:x',
  argsHash: 'sha256:0',
  dataClassification: 'INTERNAL',
  riskClass: 'low',
  reversibility: 'reversible',
  financialExposure: 0,
  nonce: 'n',
});

export default {
  id: 'KERNEL-001',
  title: 'The trust-plane gate runs a side effect only on a legitimate ALLOW',
  component: 'lib/trustshell/kernel — Trust/Action Envelope + policy + gate',
  severity: 'High',
  threat:
    'If a hostile proposal can make guardedExecute run its action without a legitimate ALLOW — via a malformed body, an ungranted capability, a Kernel-Law-forbidden capability held as a grant (secret exposure, privilege self-escalation, evidence rewriting, gate bypass), or an unmet approval/verification — the "models propose, TrustShell disposes" boundary is a fail-open.',

  async run() {
    const c = await compileAndImport(KERNEL, ['lib/trustshell/kernel/index.ts']);
    if (!c.ok) return notChecked(c.reason, c.howToRun);

    const K = c.modules[0];
    const need = ['guardedExecute', 'DEFAULT_CONSTITUTION'];
    const missing = need.filter((n) => K[n] === undefined);
    if (missing.length) {
      c.cleanup();
      return notChecked(
        `lib/trustshell/kernel no longer exports ${missing.join(', ')}`,
        're-point this probe at the current kernel exports (guardedExecute, DEFAULT_CONSTITUTION)'
      );
    }
    const { guardedExecute, DEFAULT_CONSTITUTION } = K;

    // Drive one proposal; report the verdict and whether the action ran.
    const drive = async (proposal, ctx) => {
      let ran = 0;
      const res = await guardedExecute(proposal, DEFAULT_CONSTITUTION, ctx, async () => {
        ran += 1;
        return 'SIDE-EFFECT-EXECUTED';
      });
      return { decision: res.decision, ran };
    };

    // Every entry is an ATTACK: the action must NOT run. `why` is what the attacker
    // is trying.
    const injection = '"; DROP TABLE agents; --';
    const attacks = [
      { why: 'ungranted capability', proposal: baseProposal(), ctx: { grantedCapabilities: [] } },
      { why: 'grant for a different capability', proposal: baseProposal(), ctx: { grantedCapabilities: ['repo.read'] } },
      { why: 'credential exfiltration (Kernel Law), even WITH the capability granted',
        proposal: { ...baseProposal(), capability: 'credentials.reveal' },
        ctx: { grantedCapabilities: ['credentials.reveal'] } },
      { why: 'privilege self-escalation (Kernel Law), even WITH the capability granted',
        proposal: { ...baseProposal(), capability: 'capability.grant' },
        ctx: { grantedCapabilities: ['capability.grant'] } },
      { why: 'gate bypass (Kernel Law), even WITH the capability granted',
        proposal: { ...baseProposal(), capability: 'kernel.bypass' },
        ctx: { grantedCapabilities: ['kernel.bypass'] } },
      { why: 'evidence rewriting (Kernel Law), even WITH the capability granted',
        proposal: { ...baseProposal(), capability: 'evidence.delete' },
        ctx: { grantedCapabilities: ['evidence.delete'] } },
      { why: 'silent constitution change (Kernel Law), even WITH the capability granted',
        proposal: { ...baseProposal(), capability: 'constitution.write' },
        ctx: { grantedCapabilities: ['constitution.write'] } },
      { why: 'reveal-secret tool name',
        proposal: { ...baseProposal(), tool: 'shell.reveal-secret-x' },
        ctx: { grantedCapabilities: ['repo.branch.create'] } },
      { why: 'over-budget spend with no approval',
        proposal: { ...baseProposal(), financialExposure: 100000 },
        ctx: { grantedCapabilities: ['repo.branch.create'] } },
      { why: 'high-risk with forged strong evidence but NO grant',
        proposal: { ...baseProposal(), riskClass: 'high' },
        ctx: { grantedCapabilities: [], evidence: { confidence: 1.0 } } },
      { why: 'high-risk, granted, but no evidence',
        proposal: { ...baseProposal(), riskClass: 'high' },
        ctx: { grantedCapabilities: ['repo.branch.create'] } },
      { why: 'irreversible delete without approval',
        proposal: { ...baseProposal(), capability: 'repo.branch.delete', reversibility: 'irreversible' },
        ctx: { grantedCapabilities: ['repo.branch.delete'] } },
      { why: 'malformed: missing capability', proposal: (() => { const p = baseProposal(); delete p.capability; return p; })(), ctx: { grantedCapabilities: ['repo.branch.create'] } },
      { why: 'malformed: bad enum', proposal: { ...baseProposal(), riskClass: 'catastrophic' }, ctx: { grantedCapabilities: ['repo.branch.create'] } },
      { why: 'injection strings in tool + target, ungranted', proposal: { ...baseProposal(), tool: injection, targetResource: injection }, ctx: { grantedCapabilities: [] } },
      { why: 'not an object', proposal: null, ctx: { grantedCapabilities: ['repo.branch.create'] } },
    ];

    const breaches = [];
    const transcript = [];
    for (const a of attacks) {
      const { decision, ran } = await drive(a.proposal, a.ctx);
      transcript.push(`  attack: ${a.why} -> ${decision}${ran ? ' , ACTION RAN' : ''}`);
      if (ran > 0) {
        breaches.push(`the action RAN for a hostile proposal (${a.why}) with verdict ${decision}`);
      }
      if (decision === 'ALLOW') {
        breaches.push(`a hostile proposal (${a.why}) was ALLOWed`);
      }
    }

    // Control: a legitimate, granted, clean proposal MUST run — otherwise the gate
    // is trivially "safe" by refusing everything, which is not the property we want.
    const control = await drive(baseProposal(), { grantedCapabilities: ['repo.branch.create'] });
    transcript.push(`  control (legit granted) -> ${control.decision}${control.ran ? ' , action ran (expected)' : ''}`);
    const controlBroken = !(control.decision === 'ALLOW' && control.ran === 1);
    if (controlBroken) {
      // Not a fail-OPEN, but the probe cannot claim HELD honestly if the gate
      // blocks even a legitimate action — say so as NOT_CHECKED, not HELD.
      c.cleanup();
      return notChecked(
        `the control (a legitimately-granted clean proposal) did not ALLOW+run (got ${control.decision}, ran=${control.ran}) — ` +
          'the fail-closed result would be vacuous, so this cannot be reported as HELD',
        'restore the ALLOW path in lib/trustshell/kernel/policy.ts / gate.ts, then re-run npm run check:redteam'
      );
    }

    c.cleanup();

    if (breaches.length > 0) {
      return breached(
        `${breaches.length} fail-open(s): a hostile proposal reached the side effect`,
        [
          ...breaches.map((b) => `  BREACH  ${b}`),
          '',
          `driven through lib/trustshell/kernel guardedExecute (${attacks.length} hostile proposals + 1 control):`,
          ...transcript,
        ].join('\n')
      );
    }

    return held(
      `all ${attacks.length} hostile proposals were blocked (DENY/ASK/VERIFY, action never ran); ` +
        'the one legitimately-granted control ALLOWed and ran',
      transcript.join('\n')
    );
  },
};
