// lib/trustshell/identity/delegation.ts
//
// Sub-agent delegation: an agent hands part of its authority to a worker it
// spawns. This is what Priority 4 — concurrent sub-agents under constraints —
// needs before it can be built safely.
//
// THE ONE RULE: authority only ever narrows. A delegate can receive a subset of
// what its delegator holds and nothing more, and that is checked mechanically
// at every link rather than trusted to the delegator behaving. A parent able to
// mint a child with `pay:*` while holding only `pay:usdc` is a
// privilege-escalation primitive wearing a delegation costume.
//
// FOUR THINGS ATTENUATE, AND THE THIRD IS THE ONE PEOPLE FORGET:
//
//   1. capabilities — child ⊆ parent, wildcard-aware (capability.ts)
//   2. audience     — a chain is minted for one verifier; a link cannot retarget
//   3. TIME         — child.expiresAt <= parent.expiresAt
//   4. start        — child.notBefore >= parent.notBefore
//
// Time is the one that gets missed. If a child may outlive its parent, then
// revoking the parent by letting it expire does nothing: the sub-agent keeps
// acting on authority whose source is gone. Expiry is the only revocation this
// system has (there is deliberately no revocation registry — see did.ts), so a
// chain that does not attenuate time has no revocation at all.
//
// SUBJECT CONTINUITY. Each link's delegator must be the principal the previous
// link authorized. Without that check a chain is just a pile of signatures: any
// agent could append a link delegating authority it was never given, and every
// individual signature would still verify.

import type { Did } from './did';
import { verifyAs, type AgentIdentity } from './identity';
import { signAs } from './identity';
import { isAttenuationOf, excess } from './capability';
import { encodeCaveats, caveatViolations, type Caveat } from './caveat';
import {
  verifyControlProof,
  type CheckOutcome,
  type ControlProof,
  type VerificationContext,
} from './control-proof';

export const DELEGATION_DOMAIN = {
  // v2 alongside the control-grant bump: `caveats` are part of the signed
  // payload now, so the tag moves with the layout.
  grant: 'zkrepid:delegation-grant:v2',
  countersign: 'zkrepid:delegation-countersign:v2',
} as const;

/**
 * How deep a chain may go.
 *
 * A bound is required, not tidiness: verification is linear in depth and the
 * whole chain arrives from whoever presents it, so an unbounded chain is a
 * cheap way to make a verifier do unbounded work. Four links is far past any
 * real supervisor→worker→helper shape.
 */
export const MAX_DELEGATION_DEPTH = 4;

export interface DelegationGrant {
  delegatorDid: Did;
  delegateDid: Did;
  delegateName: string;
  capabilities: string[];
  /** Always present. See AuthorizationGrant.caveats for why not optional. */
  caveats: Caveat[];
  audience: string;
  nonce: string;
  notBefore: string;
  expiresAt: string;
}

export interface DelegatedControlProof {
  /** The link above. A `ControlProof` terminates the chain at a human. */
  parent: ControlProof | DelegatedControlProof;
  grant: DelegationGrant;
  /** By the delegator, over the grant. */
  delegatorSignature: string;
  /** By the delegate, over grant || delegatorSignature. Proves possession. */
  delegateSignature: string;
}

export function isDelegated(
  p: ControlProof | DelegatedControlProof
): p is DelegatedControlProof {
  return 'parent' in p;
}

export function delegationPayload(grant: DelegationGrant): string {
  return [
    DELEGATION_DOMAIN.grant,
    grant.delegatorDid,
    grant.delegateDid,
    grant.delegateName,
    [...grant.capabilities].sort().join(','),
    encodeCaveats(grant.caveats ?? []),
    grant.audience,
    grant.nonce,
    grant.notBefore,
    grant.expiresAt,
  ].join('|');
}

function delegationCounterSignPayload(grant: DelegationGrant, delegatorSignature: string): string {
  return `${DELEGATION_DOMAIN.countersign}|${delegationPayload(grant)}|${delegatorSignature}`;
}

/** The principal a link authorizes, and the limits it carries. */
function subjectOf(p: ControlProof | DelegatedControlProof): {
  did: Did;
  capabilities: string[];
  caveats: Caveat[];
  audience: string;
  notBefore: string;
  expiresAt: string;
} {
  if (isDelegated(p)) {
    return {
      did: p.grant.delegateDid,
      capabilities: p.grant.capabilities,
      caveats: p.grant.caveats ?? [],
      audience: p.grant.audience,
      notBefore: p.grant.notBefore,
      expiresAt: p.grant.expiresAt,
    };
  }
  return {
    did: p.grant.agentDid,
    capabilities: p.grant.capabilities,
    caveats: p.grant.caveats ?? [],
    audience: p.grant.audience,
    notBefore: p.grant.notBefore,
    expiresAt: p.grant.expiresAt,
  };
}

/**
 * Delegate a subset of `delegator`'s authority to `delegate`.
 *
 * Refuses at construction whenever the result would be broader than the parent.
 * Catching it here rather than only at verification means a supervisor cannot
 * mint a chain that silently fails downstream — the failure names the offending
 * capability at the moment it is written.
 */
export async function delegate(input: {
  parent: ControlProof | DelegatedControlProof;
  delegator: AgentIdentity;
  delegate: AgentIdentity;
  capabilities: string[];
  /** Must tighten or equal the parent's. Dropping one is loosening it. */
  caveats?: Caveat[];
  ttlSeconds: number;
  now?: Date;
  nonce?: string;
}): Promise<DelegatedControlProof> {
  const parentSubject = subjectOf(input.parent);
  const now = input.now ?? new Date();

  if (input.delegator.did !== parentSubject.did) {
    throw new Error(
      `${input.delegator.did} cannot delegate: the parent link authorizes ` +
        `${parentSubject.did}, not this identity.`
    );
  }

  const over = excess(parentSubject.capabilities, input.capabilities);
  if (over.length) {
    throw new Error(
      `refusing to widen authority: [${over.join(', ')}] not covered by the ` +
        `parent grant [${parentSubject.capabilities.join(', ')}]. Delegation may ` +
        `only narrow.`
    );
  }

  // Caveats attenuate too, and dropping one counts as loosening — an absent
  // caveat is an unconstrained one. Refused at construction so a supervisor
  // cannot mint a chain that fails downstream for a reason it could have known.
  const childCaveats = input.caveats ?? parentSubject.caveats;
  const caveatIssues = caveatViolations(childCaveats, parentSubject.caveats);
  if (caveatIssues.length) {
    throw new Error(`refusing to loosen caveats: ${caveatIssues.join('; ')}`);
  }

  // Time attenuates. Clamp rather than reject: a supervisor asking for a longer
  // TTL than it holds is normal (it does not track its own expiry), and
  // silently shortening is the safe reading of that intent. Widening never is.
  const requested = new Date(now.getTime() + input.ttlSeconds * 1000);
  const parentExpiry = new Date(parentSubject.expiresAt);
  const expiresAt = requested < parentExpiry ? requested : parentExpiry;

  if (expiresAt <= now) {
    throw new Error(
      `cannot delegate: the parent grant expires at ${parentSubject.expiresAt}, ` +
        `which is not in the future. A child cannot outlive its parent.`
    );
  }

  const grant: DelegationGrant = {
    delegatorDid: input.delegator.did,
    delegateDid: input.delegate.did,
    delegateName: input.delegate.name,
    capabilities: [...input.capabilities].sort(),
    caveats: childCaveats,
    audience: parentSubject.audience,
    nonce: input.nonce ?? randomNonce(),
    notBefore: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const delegatorSignature = await signAs(input.delegator, delegationPayload(grant));
  const delegateSignature = await signAs(
    input.delegate,
    delegationCounterSignPayload(grant, delegatorSignature)
  );

  return { parent: input.parent, grant, delegatorSignature, delegateSignature };
}

export interface ChainVerification {
  valid: boolean;
  depth: number;
  /** Per-link results, root first. */
  links: Array<{ subject: Did; outcome: CheckOutcome; detail: string }>;
  /** What the leaf may actually do. Empty whenever `valid` is false. */
  grantedCapabilities: string[];
  rootVerification?: Awaited<ReturnType<typeof verifyControlProof>>;
}

/**
 * Verify a delegation chain from leaf to root.
 *
 * The root `ControlProof` is verified with the caller's full context, so the
 * human authorization, audience and replay checks all still apply. Each
 * delegation link is then checked for signatures, subject continuity and
 * attenuation of capability and time.
 */
export async function verifyDelegationChain(
  leaf: ControlProof | DelegatedControlProof,
  ctx: VerificationContext
): Promise<ChainVerification> {
  const now = ctx.now ?? new Date();
  const links: ChainVerification['links'] = [];

  // Walk to the root, collecting links leaf-first.
  const chain: DelegatedControlProof[] = [];
  let cursor: ControlProof | DelegatedControlProof = leaf;
  while (isDelegated(cursor)) {
    chain.push(cursor);
    if (chain.length > MAX_DELEGATION_DEPTH) {
      return {
        valid: false,
        depth: chain.length,
        links: [
          {
            subject: cursor.grant.delegateDid,
            outcome: 'FAILED',
            detail: `chain deeper than MAX_DELEGATION_DEPTH (${MAX_DELEGATION_DEPTH})`,
          },
        ],
        grantedCapabilities: [],
      };
    }
    cursor = cursor.parent;
  }
  chain.reverse(); // root-most delegation first

  // The root is a ControlProof. Its own capabilities/replay checks run here.
  // requiredCapabilities is deliberately NOT forwarded: the caller's requirement
  // applies to the LEAF, and enforcing it at the root would pass whenever the
  // root is broad, which is exactly what delegation narrows.
  const { requiredCapabilities, ...rootCtx } = ctx;
  const rootVerification = await verifyControlProof(cursor as ControlProof, rootCtx);
  links.push({
    subject: (cursor as ControlProof).grant.agentDid,
    outcome: rootVerification.valid ? 'VERIFIED' : 'FAILED',
    detail: rootVerification.valid
      ? 'root control proof verified'
      : `root control proof failed: ${Object.entries(rootVerification.checks)
          .filter(([, c]) => c.outcome === 'FAILED')
          .map(([k]) => k)
          .join(', ')}`,
  });

  let ok = rootVerification.valid;
  let parent: ControlProof | DelegatedControlProof = cursor;

  for (const link of chain) {
    const parentSubject = subjectOf(parent);
    const failures: string[] = [];

    if (link.grant.delegatorDid !== parentSubject.did) {
      failures.push(
        `delegator ${link.grant.delegatorDid} is not the principal the parent ` +
          `authorized (${parentSubject.did})`
      );
    }
    if (!(await verifyAs(link.grant.delegatorDid, delegationPayload(link.grant), link.delegatorSignature))) {
      failures.push('delegator signature does not verify');
    }
    if (
      !(await verifyAs(
        link.grant.delegateDid,
        delegationCounterSignPayload(link.grant, link.delegatorSignature),
        link.delegateSignature
      ))
    ) {
      failures.push('delegate counter-signature does not verify (possession unproven)');
    }
    if (!isAttenuationOf(link.grant.capabilities, parentSubject.capabilities)) {
      failures.push(
        `widens authority: [${excess(parentSubject.capabilities, link.grant.capabilities).join(', ')}]`
      );
    }
    const cv = caveatViolations(link.grant.caveats ?? [], parentSubject.caveats);
    if (cv.length) failures.push(`loosens caveats: ${cv.join('; ')}`);
    if (link.grant.audience !== parentSubject.audience) {
      failures.push(
        `retargets audience from '${parentSubject.audience}' to '${link.grant.audience}'`
      );
    }
    if (new Date(link.grant.expiresAt) > new Date(parentSubject.expiresAt)) {
      failures.push(
        `outlives its parent (${link.grant.expiresAt} > ${parentSubject.expiresAt})`
      );
    }
    if (new Date(link.grant.notBefore) < new Date(parentSubject.notBefore)) {
      failures.push(
        `starts before its parent (${link.grant.notBefore} < ${parentSubject.notBefore})`
      );
    }
    if (now < new Date(link.grant.notBefore) || now >= new Date(link.grant.expiresAt)) {
      failures.push(`outside its own validity window`);
    }

    links.push({
      subject: link.grant.delegateDid,
      outcome: failures.length ? 'FAILED' : 'VERIFIED',
      detail: failures.length ? failures.join('; ') : `delegated ${link.grant.capabilities.join(', ')}`,
    });
    if (failures.length) ok = false;
    parent = link;
  }

  // The caller's requirement is checked against the LEAF's authority.
  const leafSubject = subjectOf(leaf);
  if (ok && requiredCapabilities?.length) {
    const missing = excess(leafSubject.capabilities, requiredCapabilities);
    if (missing.length) {
      links.push({
        subject: leafSubject.did,
        outcome: 'FAILED',
        detail: `leaf lacks required capabilities: ${missing.join(', ')}`,
      });
      ok = false;
    }
  }

  return {
    valid: ok,
    depth: chain.length,
    links,
    grantedCapabilities: ok ? [...leafSubject.capabilities] : [],
    rootVerification,
  };
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
