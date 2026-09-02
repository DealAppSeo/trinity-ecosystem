// lib/trustshell/kernel/kernel-laws.ts — the immutable Kernel Laws.
//
// SEPARATE FROM THE PERSONAL CONSTITUTION, AND IMMUTABLE BY CONSTRUCTION.
// The Personal Constitution (constitution.ts) is the USER's rule set — they can
// edit it, and a caller passes it into `dispose`. The Kernel Laws are neither:
// they are absolute denials the kernel enforces on EVERY disposition, and they
// are NOT a parameter of `dispose` — no caller can supply, weaken, or omit them.
// That is the immutability guarantee expressed in code: policy.ts imports
// KERNEL_LAWS directly and checks them before it ever looks at the (caller-
// supplied) constitution. (docs/TRUSTHARNESS-STRATEGY.md §3.0; the user's brief:
// "Separate immutable Kernel Laws from the user's Personal Constitution".)
//
// WHY THESE FIVE. They are the invariants a compromised model must never be able
// to reach past, and — crucially — each is expressed over the `capability` /
// `tool` the action names, NOT over a self-attested risk field. `capability` is
// exact-matched against the caller's minted grant (policy.ts), so it cannot be
// lied about the way `financialExposure` or `reversibility` can; a Kernel Law is
// therefore NON-EVADABLE by mis-declaration, which is the property that makes it
// a law rather than a preference. (This is the load-bearing half of the
// declared-Envelope boundary documented in policy.ts / constitution.ts.)
//
// A held capability CANNOT buy past a Kernel Law: the law fires even when the
// capability is granted. There is no self-grant, no escalation, no exception.

import type { TrustActionEnvelope } from './envelope';
import type { Condition } from './constitution';
import { conditionMatches } from './constitution';

export interface KernelLaw {
  readonly id: string;
  /** Plain-language statement, surfaced in the verdict when the law fires. */
  readonly law: string;
  /** Matching this condition is an ABSOLUTE deny. */
  readonly when: Condition;
}

/**
 * The immutable Kernel Laws. Frozen so nothing can mutate the array or its
 * entries at runtime — an edit to this file is the only way to change them, and
 * that is a reviewed code change, never a runtime or user action.
 */
export const KERNEL_LAWS: readonly KernelLaw[] = Object.freeze([
  {
    id: 'no-privilege-self-escalation',
    law: 'an action may never grant, mint, or escalate its own (or another agent’s) authority',
    when: {
      anyOf: [
        { field: 'capability', op: 'contains', value: 'capability.grant' },
        { field: 'capability', op: 'contains', value: 'capability.mint' },
        { field: 'capability', op: 'contains', value: 'privilege.escalate' },
        { field: 'capability', op: 'contains', value: 'authority.grant' },
        { field: 'capability', op: 'contains', value: 'role.grant' },
        { field: 'tool', op: 'contains', value: 'self-escalate' },
      ],
    },
  },
  {
    id: 'no-envelope-bypass',
    law: 'an action may never bypass or disable the Trust/Action Envelope gate',
    when: {
      anyOf: [
        { field: 'capability', op: 'contains', value: 'kernel.bypass' },
        { field: 'capability', op: 'contains', value: 'gate.bypass' },
        { field: 'capability', op: 'contains', value: 'gate.disable' },
        { field: 'capability', op: 'contains', value: 'envelope.skip' },
        { field: 'tool', op: 'contains', value: 'bypass-gate' },
      ],
    },
  },
  {
    id: 'no-secret-exposure',
    law: 'an action may never reveal or export a credential or secret',
    when: {
      anyOf: [
        { field: 'capability', op: 'eq', value: 'credentials.reveal' },
        { field: 'capability', op: 'contains', value: 'secret.reveal' },
        { field: 'capability', op: 'contains', value: 'secret.export' },
        { field: 'capability', op: 'contains', value: 'credential.export' },
        { field: 'capability', op: 'contains', value: 'key.export' },
        { field: 'tool', op: 'contains', value: 'reveal-secret' },
      ],
    },
  },
  {
    id: 'no-evidence-rewriting',
    law: 'an action may never rewrite or delete recorded evidence or receipts',
    when: {
      anyOf: [
        { field: 'capability', op: 'contains', value: 'evidence.write' },
        { field: 'capability', op: 'contains', value: 'evidence.delete' },
        { field: 'capability', op: 'contains', value: 'evidence.modify' },
        { field: 'capability', op: 'contains', value: 'receipt.rewrite' },
        { field: 'capability', op: 'contains', value: 'receipt.delete' },
        { field: 'capability', op: 'contains', value: 'ledger.rewrite' },
      ],
    },
  },
  {
    id: 'no-silent-constitution-change',
    law: 'an action may never silently edit the Personal Constitution or the Kernel Laws',
    when: {
      anyOf: [
        { field: 'capability', op: 'contains', value: 'constitution.write' },
        { field: 'capability', op: 'contains', value: 'constitution.edit' },
        { field: 'capability', op: 'contains', value: 'constitution.delete' },
        { field: 'capability', op: 'contains', value: 'kernel.law' },
        { field: 'capability', op: 'contains', value: 'governance.write' },
      ],
    },
  },
]);

/**
 * The first Kernel Law an envelope violates, or null. Total and deterministic.
 * Evaluated by `dispose` before anything else and independent of any grant.
 */
export function kernelLawViolated(e: TrustActionEnvelope): KernelLaw | null {
  for (const law of KERNEL_LAWS) {
    if (conditionMatches(law.when, e)) return law;
  }
  return null;
}
