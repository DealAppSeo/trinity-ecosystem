// lib/trustshell/kernel/gate.ts — the fail-closed tool-gate.
//
// This is the chokepoint. Nothing in the optimization plane calls a tool; it
// proposes an Envelope, and `guardedExecute` is the ONLY thing that runs the
// underlying action — and only when the deterministic policy says ALLOW. Every
// other verdict (DENY / ASK / VERIFY), every malformed proposal, every thrown
// policy error, blocks execution. The action function is never even called
// unless the verdict is ALLOW. (docs/TRUSTHARNESS-STRATEGY.md §3.1, §5.)
//
// FAIL-CLOSED IS THE WHOLE POINT, SO IT IS BELT AND BRACES:
//   * A malformed Envelope never reaches policy — it is a DENY at normalization.
//   * `dispose` is total (policy.ts) and should never throw, but if some future
//     edit makes it throw, the catch here treats that as DENY and does not run
//     the action. A gate that let a thrown authorizer error fall through to
//     execution would be a fail-OPEN reached by a bug — the exact shape this repo
//     names as its defining defect.
//   * The action runs inside the ALLOW branch and nowhere else. There is no code
//     path that both skips the verdict and calls `action`.

import type { TrustActionEnvelope } from './envelope';
import { normalizeEnvelope } from './envelope';
import type { Constitution } from './constitution';
import type { DecisionContext, Verdict } from './policy';
import { dispose } from './policy';

export interface GateAllowed<T> {
  readonly ran: true;
  readonly decision: 'ALLOW';
  readonly verdict: Verdict;
  readonly envelope: TrustActionEnvelope;
  readonly value: T;
}

export interface GateBlocked {
  readonly ran: false;
  readonly decision: 'DENY' | 'ASK' | 'VERIFY';
  /** Present unless the proposal failed to normalize (then `verdict` is null and
   *  `reason` carries why). */
  readonly verdict: Verdict | null;
  readonly reason: string;
  /** The normalized Envelope, when normalization succeeded. */
  readonly envelope: TrustActionEnvelope | null;
}

export type GateResult<T> = GateAllowed<T> | GateBlocked;

/**
 * Run `action` iff policy disposes the proposal to ALLOW.
 *
 * `proposal` is UNTRUSTED — it is whatever an upstream agent/model emitted, so it
 * is normalized here, not assumed well-formed. On any non-ALLOW outcome the
 * action is not invoked and a blocked result explains why.
 *
 * @param proposal    the untrusted proposed action (normalized internally)
 * @param constitution the hard/soft rule set to enforce
 * @param ctx         granted capabilities, approvals, evidence
 * @param action      the side effect; called ONLY on ALLOW
 */
export async function guardedExecute<T>(
  proposal: unknown,
  constitution: Constitution,
  ctx: DecisionContext,
  action: (envelope: TrustActionEnvelope) => Promise<T>
): Promise<GateResult<T>> {
  const norm = normalizeEnvelope(proposal);
  if (!norm.ok) {
    // Malformed → DENY, and the action never sees it.
    return { ran: false, decision: 'DENY', verdict: null, reason: norm.reason, envelope: null };
  }
  const envelope = norm.envelope;

  let verdict: Verdict;
  try {
    verdict = dispose(envelope, constitution, ctx);
  } catch (e) {
    // `dispose` is total; if a future edit breaks that, do NOT run the action.
    const message = e instanceof Error ? e.message : String(e);
    return {
      ran: false,
      decision: 'DENY',
      verdict: null,
      reason: `policy evaluation threw (treated as DENY): ${message}`,
      envelope,
    };
  }

  if (verdict.decision === 'ALLOW') {
    const value = await action(envelope);
    return { ran: true, decision: 'ALLOW', verdict, envelope, value };
  }

  // DENY / ASK / VERIFY all block. The action is not called.
  return {
    ran: false,
    decision: verdict.decision,
    verdict,
    reason: verdict.reasons.join('; '),
    envelope,
  };
}
