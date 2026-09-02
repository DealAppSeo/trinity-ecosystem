// lib/trustshell/runtime/capability.ts — minimal CapabilityMinter (TTL, attenuate-only).
//
// The kernel's policy engine (lib/trustshell/kernel/policy.ts) is default-deny: an
// action is ALLOWed only when an explicit grant covers its capability. This file
// is the seam that fills that grant — but a grant here is NOT a master credential.
// It is a scoped, short-lived, capability NAME with an expiry; it carries no
// secret, no token, no key. (docs/TRUSTHARNESS-STRATEGY.md §6; the brief:
// "capabilities TTL'd and attenuate-only; root credentials never enter agent/model
// context".) A compromised agent that steals a grant steals the right to do ONE
// named thing until it expires — not a wallet.
//
// ATTENUATE-ONLY IS THE LOAD-BEARING PROPERTY. A holder can derive a NARROWER
// grant from one it holds (a sub-capability, a shorter TTL) but never a broader
// one. Rights only shrink down a delegation chain, so handing a sub-agent a
// capability can never hand it more than you had. `attenuate` refuses to widen.

/** A minted capability. Just a name + scope + lifetime — never a secret. */
export interface CapabilityGrant {
  /** The exact capability this authorizes, e.g. `fs.write`. */
  readonly capability: string;
  /** Who it was minted for. */
  readonly principal: string;
  /** ms epoch when minted. */
  readonly issuedAt: number;
  /** ms epoch when it stops being valid (TTL). */
  readonly expiresAt: number;
  /** Unique per mint — an idempotency / audit handle, not a secret. */
  readonly nonce: string;
  /** The nonce of the grant this was attenuated from, or null if a root mint. */
  readonly parentNonce: string | null;
}

export interface MintInput {
  readonly capability: string;
  readonly principal: string;
  /** Time-to-live in ms; must be > 0. */
  readonly ttlMs: number;
  readonly now: number;
  readonly nonce: string;
}

/** Mint a fresh, scoped, TTL'd capability grant. */
export function mintCapability(input: MintInput): CapabilityGrant {
  if (!input.capability) throw new Error('mintCapability: capability is required');
  if (!input.principal) throw new Error('mintCapability: principal is required');
  if (!(input.ttlMs > 0)) throw new Error('mintCapability: ttlMs must be > 0');
  return {
    capability: input.capability,
    principal: input.principal,
    issuedAt: input.now,
    expiresAt: input.now + input.ttlMs,
    nonce: input.nonce,
    parentNonce: null,
  };
}

export interface AttenuateInput {
  /** The narrower capability. Must equal the parent's or be a dotted sub-path of
   *  it (`fs.write` → `fs.write.scratch`). Never a broader or sibling name. */
  readonly capability: string;
  /** New TTL in ms; the derived expiry may not exceed the parent's. */
  readonly ttlMs: number;
  readonly now: number;
  readonly nonce: string;
}

export interface AttenuateOk {
  readonly ok: true;
  readonly grant: CapabilityGrant;
}
export interface AttenuateErr {
  readonly ok: false;
  readonly reason: string;
}

/**
 * Derive a NARROWER grant from `parent`. Refuses to widen: the child capability
 * must be the parent's or a sub-path of it, the child expiry may not exceed the
 * parent's, and the principal is inherited. Any attempt to broaden is rejected.
 */
export function attenuate(parent: CapabilityGrant, input: AttenuateInput): AttenuateOk | AttenuateErr {
  if (!isSubCapability(parent.capability, input.capability)) {
    return {
      ok: false,
      reason:
        `cannot widen: '${input.capability}' is not '${parent.capability}' or a sub-path of it — ` +
        'attenuation only narrows',
    };
  }
  if (!(input.ttlMs > 0)) return { ok: false, reason: 'ttlMs must be > 0' };
  const expiresAt = input.now + input.ttlMs;
  if (expiresAt > parent.expiresAt) {
    return {
      ok: false,
      reason: `cannot extend TTL beyond the parent (parent expires ${parent.expiresAt}, requested ${expiresAt})`,
    };
  }
  return {
    ok: true,
    grant: {
      capability: input.capability,
      principal: parent.principal,
      issuedAt: input.now,
      expiresAt,
      nonce: input.nonce,
      parentNonce: parent.nonce,
    },
  };
}

/** True when `child` is `parent` exactly or a dotted sub-path (`a.b` ⊑ `a.b.c`). */
export function isSubCapability(parent: string, child: string): boolean {
  return child === parent || child.startsWith(parent + '.');
}

/** A grant is valid while `now` is within [issuedAt, expiresAt). */
export function isGrantValid(grant: CapabilityGrant, now: number): boolean {
  return now >= grant.issuedAt && now < grant.expiresAt;
}

/**
 * The capability names of every currently-valid grant — exactly the list the
 * kernel's `dispose` reads as `ctx.grantedCapabilities`. An expired grant simply
 * is not in the list, so an expired capability fails default-deny with no special
 * case: TTL enforcement is just absence.
 */
export function resolveGrantedCapabilities(grants: readonly CapabilityGrant[], now: number): string[] {
  return grants.filter((g) => isGrantValid(g, now)).map((g) => g.capability);
}
