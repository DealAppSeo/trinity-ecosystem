// lib/trustshell/identity/memory-authz.ts
//
// Dual-auth access control for agent memory.
//
// Memory in this repo has NO access control today. `MemoryRecall` decides how
// to retrieve (hybrid / vector / keyword, RRF fusion, budgets) and never asks
// whether the caller may. That is fine while one process owns one memory, and
// wrong the moment agents share a mesh: an agent reading another agent's memory
// is indistinguishable from reading its own.
//
// This is the primitive that answers "may this caller touch this namespace?".
// It is deliberately NOT wired into any live memory path — same discipline as
// the vault gate (LESSONS A11). Adding enforcement to a surface that has none
// would break every existing caller at once, so wiring is a separate, decided
// change.
//
// WHAT MAKES IT DUAL-AUTH. Nothing here re-invents authorization: a verified
// `ControlProof` already carries both halves — a human authorized this agent,
// AND the agent proved possession of its key. This file adds the memory-shaped
// questions on top: which operation, which namespace, and whether a delegated
// sub-agent inherited enough to do it.
//
// CAPABILITY SHAPE: `memory:<operation>:<namespace>`
//
//   memory:read:agent/TORCH     read one agent's namespace
//   memory:read:agent/*         read any agent namespace
//   memory:write:agent/TORCH    write one
//   memory:*                    EVERYTHING, INCLUDING WRITE AND DELETE
//
// That last line is the trap. `memory:*` reads like "memory access" and grants
// destructive operations. Anyone meaning "all reads" must write `memory:read:*`.
// A test asserts the distinction, because the failure is silent: an over-broad
// grant works perfectly until the day the agent deletes something.
//
// READ AND WRITE ARE SEPARATE AUTHORITIES. A read grant never implies write.
// This is stated because the opposite is a common convenience — "it can already
// see the data, letting it update is barely more" — and it is wrong: reading is
// recoverable, writing is not, and memory poisoning is a live attack on exactly
// this surface.

import { excess } from './capability';
import {
  verifyControlProof,
  type ControlProof,
  type VerificationContext,
} from './control-proof';
import { isDelegated, verifyDelegationChain, type DelegatedControlProof } from './delegation';

export type MemoryOperation = 'read' | 'write' | 'delete';

/** Build the capability string a request requires. */
export function memoryCapability(operation: MemoryOperation, namespace: string): string {
  if (!namespace.trim()) {
    throw new Error(
      'namespace is required. An empty namespace would render as `memory:read:` ' +
        'and match nothing, which reads as a denial caused by a typo rather than by policy.'
    );
  }
  if (namespace.includes(':')) {
    throw new Error(
      `namespace '${namespace}' contains ':', which is the capability separator. ` +
        `It would silently split into extra segments and change what the grant means.`
    );
  }
  return `memory:${operation}:${namespace}`;
}

export interface MemoryAccessRequest {
  operation: MemoryOperation;
  /** e.g. `agent/TORCH`, `session/abc123`. Must not contain ':'. */
  namespace: string;
}

export type MemoryAuthzOutcome = 'GRANTED' | 'DENIED' | 'NOT_CHECKED';

export interface MemoryAuthzResult {
  outcome: MemoryAuthzOutcome;
  /** The capability the request needed. */
  required: string;
  /** Present only when GRANTED. Never populated on a denial. */
  grantedTo?: string;
  reason: string;
}

/**
 * Decide whether a proof authorizes a memory operation.
 *
 * FAILS CLOSED. No proof is `DENIED`, not `NOT_CHECKED` — an absent proof on a
 * gated surface is a refusal, and reporting it as "we did not look" would let a
 * caller treat it as permissive. `NOT_CHECKED` is reserved for the one case
 * where this function genuinely cannot decide: a proof was supplied but the
 * verifier was given no audience to check it against, which is a caller bug.
 */
export async function authorizeMemoryAccess(
  proof: ControlProof | DelegatedControlProof | undefined,
  request: MemoryAccessRequest,
  ctx: VerificationContext
): Promise<MemoryAuthzResult> {
  const required = memoryCapability(request.operation, request.namespace);

  if (!ctx?.audience) {
    return {
      outcome: 'NOT_CHECKED',
      required,
      reason:
        'no audience supplied, so the proof could not be checked against this ' +
        'verifier. This is a caller bug, not a policy decision — treat it as a ' +
        'refusal.',
    };
  }

  if (!proof) {
    return {
      outcome: 'DENIED',
      required,
      reason: `no ControlProof presented; ${required} is required`,
    };
  }

  // requiredCapabilities is passed through so the SAME attenuation logic that
  // guards payments and vaults guards memory. A second implementation here
  // would drift from that one, and the drift would be a privilege bug.
  const verifyCtx: VerificationContext = { ...ctx, requiredCapabilities: [required] };

  const result = isDelegated(proof)
    ? await verifyDelegationChain(proof, verifyCtx)
    : await verifyControlProof(proof, verifyCtx);

  if (!result.valid) {
    const missing = excess(result.grantedCapabilities, [required]);
    return {
      outcome: 'DENIED',
      required,
      reason: missing.length
        ? `proof does not carry ${required}`
        : 'proof failed verification (signature, audience, expiry, replay or attenuation)',
    };
  }

  return {
    outcome: 'GRANTED',
    required,
    grantedTo: isDelegated(proof) ? proof.grant.delegateDid : proof.grant.agentDid,
    reason: `${required} covered by the presented grant`,
  };
}

/** Convenience: true only on GRANTED. NOT_CHECKED is never permissive. */
export function memoryAccessPermitted(r: MemoryAuthzResult): boolean {
  return r.outcome === 'GRANTED';
}
