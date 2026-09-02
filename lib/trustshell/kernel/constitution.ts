// lib/trustshell/kernel/constitution.ts — the Personal Constitution (primitive #0).
//
// The Envelope (envelope.ts) describes an action; the policy engine (policy.ts)
// disposes of it; but the policy engine has to enforce SOMETHING, and that
// something is the Constitution. It is primitive #0 because it is the fixed point
// the whole kernel protects. (docs/TRUSTHARNESS-STRATEGY.md §3.0.)
//
// TWO LAYERS, ONE OF THEM IMMOVABLE.
//   * HARD rules are constitutional: the cortex (the PAI / any agent) can never
//     learn or argue its way past them. They are what stops a prompt-injected
//     model from granting itself a credential or raising its own spend limit.
//   * SOFT preferences are learnable (prefer local models, concise emails). They
//     are recorded here so the same object is the whole policy identity, but the
//     kernel core does not act on them — the router does, later.
//
// DECLARATIVE ON PURPOSE. A hard rule is DATA (a condition + an effect), not a
// predicate function, so the Constitution is fully serializable — it can be
// signed, fingerprinted, and named in every Trust Receipt ("which constitution
// governed this action"). A rule that was a closure could do none of that. The
// policy engine is the only interpreter of these conditions.
//
// FINGERPRINT, NOT A CRYPTOGRAPHIC COMMITMENT. `constitutionFingerprint` is a
// stable content id (canonical JSON + FNV-1a) so two identical constitutions
// share an id and any edit changes it. It is deliberately NOT called a hash or a
// commitment: turning it into a signed on-chain commitment is the AttestationSink
// interface's job, not this file's, and this repo does not label a fingerprint as
// a proof (cf. the "KYA object is not a ZK proof" lesson).

import type {
  TrustActionEnvelope,
  DataClassification,
  Reversibility,
} from './envelope';

/** A string-valued Envelope field a condition may test. */
export type StringField = 'principal' | 'capability' | 'tool' | 'targetResource';

/** The safe, regex-free condition vocabulary. `contains` is a plain substring
 *  test — no regular expressions reach the trust plane, so no rule can become a
 *  ReDoS surface on a hostile tool name. */
export type Condition =
  | { readonly field: StringField; readonly op: 'eq' | 'contains'; readonly value: string }
  | { readonly field: StringField; readonly op: 'in'; readonly value: readonly string[] }
  | { readonly field: 'dataClassification'; readonly op: 'eq'; readonly value: DataClassification }
  | { readonly field: 'reversibility'; readonly op: 'eq'; readonly value: Reversibility }
  | { readonly field: 'financialExposure'; readonly op: 'gte'; readonly value: number }
  | { readonly allOf: readonly Condition[] }
  | { readonly anyOf: readonly Condition[] };

/** What a matched hard rule does. `deny` is absolute; `require_approval` blocks
 *  with an ASK until a matching approval is presented to the gate. */
export type HardEffect = 'deny' | 'require_approval';

export interface HardRule {
  readonly id: string;
  /** Plain-language statement of what this forbids or gates — carried into the
   *  verdict so a DENY/ASK always says which rule fired. */
  readonly forbids: string;
  readonly effect: HardEffect;
  readonly when: Condition;
}

export interface SoftPreference {
  readonly id: string;
  readonly prefers: string;
}

export interface Constitution {
  readonly version: string;
  readonly hard: readonly HardRule[];
  readonly soft: readonly SoftPreference[];
}

/**
 * Evaluate one declarative condition against a normalized Envelope. Total and
 * deterministic; an unrecognized shape returns `false` (a rule that cannot be
 * understood does not fire) — but note the DEFAULT-DENY in policy.ts means "a
 * rule that does not fire" never itself grants anything.
 */
export function conditionMatches(cond: Condition, e: TrustActionEnvelope): boolean {
  if ('allOf' in cond) return cond.allOf.every((c) => conditionMatches(c, e));
  if ('anyOf' in cond) return cond.anyOf.some((c) => conditionMatches(c, e));

  if (cond.field === 'financialExposure') {
    return e.financialExposure >= cond.value;
  }
  if (cond.field === 'dataClassification') {
    return e.dataClassification === cond.value;
  }
  if (cond.field === 'reversibility') {
    return e.reversibility === cond.value;
  }

  const actual = e[cond.field]; // principal | capability | tool | targetResource
  if (cond.op === 'eq') return actual === cond.value;
  if (cond.op === 'contains') return actual.includes(cond.value);
  if (cond.op === 'in') return cond.value.includes(actual);
  return false;
}

/**
 * The default Personal Constitution. Small on purpose — three real hard rules
 * that each map to a stated invariant. Adding rules is how a lane records "this
 * boundary is now load-bearing"; the shape, not the exact list, is the primitive.
 */
export const DEFAULT_CONSTITUTION: Constitution = {
  version: 'constitution-v0',
  hard: [
    {
      id: 'no-credential-exfiltration',
      forbids: 'never reveal a credential or secret to a caller',
      effect: 'deny',
      when: {
        anyOf: [
          { field: 'capability', op: 'eq', value: 'credentials.reveal' },
          { field: 'tool', op: 'contains', value: 'reveal-secret' },
        ],
      },
    },
    {
      id: 'overspend-needs-approval',
      forbids: 'spending at or above 100 (constitution unit) requires human approval',
      effect: 'require_approval',
      when: { field: 'financialExposure', op: 'gte', value: 100 },
    },
    {
      id: 'irreversible-delete-needs-approval',
      forbids: 'an irreversible delete requires human approval',
      effect: 'require_approval',
      when: {
        allOf: [
          { field: 'reversibility', op: 'eq', value: 'irreversible' },
          { field: 'capability', op: 'contains', value: 'delete' },
        ],
      },
    },
  ],
  soft: [
    { id: 'prefer-local-models', prefers: 'use local/open models when they suffice' },
    { id: 'concise-output', prefers: 'prefer concise responses' },
  ],
};

/** Deterministic canonical JSON: object keys sorted at every level so two equal
 *  constitutions serialize identically regardless of key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * A stable content fingerprint of a Constitution — same content, same id; any
 * edit, a different id. FNV-1a over the canonical serialization, hex. NOT a
 * cryptographic commitment (see the file header): it identifies a version, it
 * does not prove one.
 */
export function constitutionFingerprint(c: Constitution): string {
  const s = canonical(c);
  let h = 0x811c9dc5; // FNV-1a 32-bit offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `cfp-${h.toString(16).padStart(8, '0')}`;
}
