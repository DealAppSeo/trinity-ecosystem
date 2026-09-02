// lib/trustshell/kernel/policy.ts — the deterministic disposition engine (the PDP).
//
// This is the trust plane. It takes a normalized Envelope, the Constitution, and
// a decision context, and returns exactly one verdict: ALLOW / DENY / ASK /
// VERIFY. It contains no model call, no network, no randomness — the same inputs
// always produce the same verdict, which is the property a mutation test and an
// adversarial probe can pin. (docs/TRUSTHARNESS-STRATEGY.md §2.1, §3.1.)
//
// FOUR PROPERTIES THIS FILE EXISTS TO HOLD, each the kind that regresses quietly:
//
//   1. DEFAULT-DENY. An action is ALLOWed only when an explicit grant covers its
//      capability AND nothing else blocks it. The absence of a rule is never a
//      yes. Most authorization bugs are a missing branch defaulting to allow;
//      here the final branch is deny.
//
//   2. HARD RULES OUTRANK GRANTS. A minted capability cannot buy past a
//      constitutional `deny` — the credential-exfiltration rule fires even if the
//      caller holds the capability. Grants say "you may act in this area"; hard
//      rules say "never this", and never wins.
//
//   3. HAL IS EVIDENCE, NOT AUTHORITY. A high-risk action routes to VERIFY, and
//      the DETERMINISTIC policy — not HAL — decides whether the evidence HAL
//      returned (a confidence number) clears the bar. Policy consumes evidence;
//      it never lets a probabilistic verifier issue the verdict. Putting HAL in
//      the authority path is the same failure as letting the router write the
//      trust plane.
//
//   4. TOTALITY. `dispose` never throws. A caller that wraps it and treats a
//      thrown error as "allow" would convert a bug into a fail-open; there is no
//      throw to catch. Any state it cannot make sense of falls through to DENY.

import type { TrustActionEnvelope } from './envelope';
import type { Constitution, HardRule } from './constitution';
import { conditionMatches } from './constitution';

export type Decision = 'ALLOW' | 'DENY' | 'ASK' | 'VERIFY';

/** Evidence handed to policy by a VerificationProvider (HAL). It is INPUT to a
 *  deterministic decision, never the decision itself. */
export interface VerificationEvidence {
  /** [0,1] confidence from the verifier. */
  readonly confidence: number;
  /** Free-form provenance for the receipt; not interpreted by policy. */
  readonly source?: string;
}

/**
 * What the gate needs to know beyond the Envelope and the Constitution:
 *  - which capabilities the caller was actually minted (default-deny reads this),
 *  - which approvals have been presented (resolves a `require_approval` ASK),
 *  - any verification evidence already gathered (resolves a high-risk VERIFY).
 */
export interface DecisionContext {
  /** Capabilities minted to this caller. Empty (or missing the Envelope's
   *  capability) → DENY. This is the seam the CapabilityMinter fills. */
  readonly grantedCapabilities: readonly string[];
  /** Ids of hard rules whose `require_approval` has been satisfied by a human. */
  readonly approvals?: readonly string[];
  /** Evidence from a VerificationProvider, if any has been gathered. */
  readonly evidence?: VerificationEvidence;
  /** Minimum confidence a `high` risk action must clear to move from VERIFY to
   *  ALLOW. Defaults to 0.99 — a high bar, and fail-closed if evidence is absent. */
  readonly verifyThreshold?: number;
}

export interface Verdict {
  readonly decision: Decision;
  /** Every reason that shaped the verdict, in evaluation order. Never empty. */
  readonly reasons: readonly string[];
  /** Which hard rule fired, when one did — surfaced for the receipt. */
  readonly firedRule?: string;
}

const DEFAULT_VERIFY_THRESHOLD = 0.99;

/**
 * Dispose of one proposed action. Total, deterministic, default-deny.
 *
 * Order matters and is itself a property: hard `deny` first (nothing overrides
 * it), then approvals, then the grant check (default-deny), then verification.
 * ALLOW is reachable only by passing every one of them.
 */
export function dispose(
  envelope: TrustActionEnvelope,
  constitution: Constitution,
  ctx: DecisionContext
): Verdict {
  const reasons: string[] = [];

  // (1) Hard DENY rules first — a minted capability cannot buy past these.
  for (const rule of constitution.hard) {
    if (rule.effect === 'deny' && conditionMatches(rule.when, envelope)) {
      return {
        decision: 'DENY',
        reasons: [`constitution hard rule '${rule.id}' forbids this: ${rule.forbids}`],
        firedRule: rule.id,
      };
    }
  }

  // (2) require_approval rules — each must be satisfied by a presented approval,
  //     otherwise the action is blocked with ASK (never silently allowed).
  const approvals = new Set(ctx.approvals ?? []);
  const unmet: HardRule[] = [];
  for (const rule of constitution.hard) {
    if (rule.effect === 'require_approval' && conditionMatches(rule.when, envelope)) {
      if (!approvals.has(rule.id)) unmet.push(rule);
    }
  }
  if (unmet.length > 0) {
    const first = unmet[0];
    return {
      decision: 'ASK',
      reasons: unmet.map((r) => `awaiting approval for '${r.id}': ${r.forbids}`),
      firedRule: first.id,
    };
  }

  // (3) DEFAULT-DENY: an ALLOW requires an explicit grant for this capability.
  //     No grant, no allow — the absence of a rule is never a yes.
  if (!ctx.grantedCapabilities.includes(envelope.capability)) {
    return {
      decision: 'DENY',
      reasons: [
        `no granted capability covers '${envelope.capability}' ` +
          `(caller holds: ${ctx.grantedCapabilities.length ? ctx.grantedCapabilities.join(', ') : 'none'})`,
      ],
    };
  }
  reasons.push(`capability '${envelope.capability}' is granted`);

  // (4) High-risk actions must be VERIFIED. HAL supplies a confidence; POLICY,
  //     deterministically, decides whether it clears the bar. Absent or weak
  //     evidence → VERIFY (blocks), never ALLOW.
  if (envelope.riskClass === 'high') {
    const threshold = ctx.verifyThreshold ?? DEFAULT_VERIFY_THRESHOLD;
    const conf = ctx.evidence?.confidence;
    if (typeof conf !== 'number' || !Number.isFinite(conf) || conf < threshold) {
      return {
        decision: 'VERIFY',
        reasons: [
          ...reasons,
          `risk 'high' needs verification confidence >= ${threshold}; ` +
            `have ${conf === undefined ? 'none' : conf}`,
        ],
      };
    }
    reasons.push(`verification confidence ${conf} >= ${threshold}`);
  }

  // (5) Everything passed. This is the only path to ALLOW.
  reasons.push('no hard rule forbids, approvals met, verification met');
  return { decision: 'ALLOW', reasons };
}
