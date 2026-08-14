// lib/trustshell/identity/control-proof.ts
//
// The dual-auth linking proof: evidence that a specific human authorized a
// specific agent to act, within stated limits, and that the agent actually
// holds the key it claims.
//
// This is the thing `humanCustodyBound` was standing in for. That field is a
// boolean read out of a registry row — it records that somebody once wrote
// "yes". Nothing in the codebase could check it, and an attestation carrying it
// was asserting a fact it had not verified. A ControlProof is checkable by
// anyone, offline, with no registry and no network.
//
// WHY TWO SIGNATURES. The human's signature authorizes. The agent's
// counter-signature proves possession — without it, a human could name any DID,
// including one whose key nobody holds, and the grant would look valid. That is
// the same class of gap as an unsigned dual-signature: a gate that only ever
// closes is indistinguishable from a broken one (see the E2E suite's WHALE
// fixture, PR #25 §5).
//
// THE COUNTER-SIGNATURE COVERS THE HUMAN'S SIGNATURE as well as the grant.
//
// Be precise about what that buys, because it is less than it first appears.
// The load-bearing property is that the counter-signature covers the WHOLE
// grant — including `humanDid` and a random `nonce` — so it cannot be moved to
// any other grant. Appending `humanSignature` on top adds no security today:
// Ed25519 is deterministic, so for a given grant there is exactly one valid
// human signature, and a forged one fails `humanAuthorization` regardless.
//
// It is kept as defence in depth. If a future change ever narrows what the
// grant payload covers — dropping the nonce, say, or splitting the grant across
// two structures — this line is what stops the counter-signature from becoming
// transferable. Removing it today is undetectable by the test suite, which is
// itself recorded in LESSONS: a mutation that survives is either an untested
// property or an unnecessary one, and here it is honestly the latter.

import type { Did } from './did';
import { verifyAs, type AgentIdentity, type HumanSSID } from './identity';
import { signAs } from './identity';
import { verifyDisclosure, type Disclosure } from './disclosure';
import { excess } from './capability';
import { encodeCaveats, type Caveat } from './caveat';
import type { NonceStore } from './nonce-store';
import type { IProofProvider, PredicateStatement, ProofResult } from './proof-provider';

/** What the human is authorizing. Deliberately explicit — no implicit powers. */
export interface AuthorizationGrant {
  humanDid: Did;
  agentDid: Did;
  agentName: string;
  /** Named capabilities. An empty list authorizes nothing, and verifies as such. */
  capabilities: string[];
  /**
   * Who may accept this proof — a service identifier ('trinity:pay') or a DID.
   *
   * MANDATORY. Without audience binding, a proof the agent legitimately presents
   * to one service can be lifted from that exchange and replayed against a
   * different service that trusts the same human. The signature is valid in both
   * places, so nothing downstream can tell the difference. Audience is what
   * makes a captured proof useless outside the context it was minted for.
   */
  audience: string;
  /**
   * Limits capabilities cannot express — `maxValue`, `toolAllowlist`, `maxCalls`.
   *
   * ALWAYS present, even when empty. If "no caveats" were encoded by omission,
   * an attacker stripping a caveat from a grant would produce the same signed
   * bytes as a grant that never had one, and the signature would still verify.
   * An empty array encodes as an empty field, which is distinct from a populated
   * one, so removal always breaks the signature.
   */
  caveats: Caveat[];
  /** Replay defence within the audience. The verifier remembers spent nonces. */
  nonce: string;
  /** ISO timestamps. A grant with no expiry is refused at construction. */
  notBefore: string;
  expiresAt: string;
}

/**
 * What a verifier states about itself before checking a proof.
 *
 * Passing this as one object rather than loose arguments is deliberate: a
 * verifier that forgets to pass `audience` should not silently get the
 * permissive behaviour. `audience` is required by the type.
 */
export interface VerificationContext {
  /** This verifier's own identifier. Must equal the grant's audience. */
  audience: string;
  now?: Date;
  /**
   * Durable, atomic replay defence. Preferred over `seenNonces` — it is the
   * only option that is correct across instances.
   */
  nonceStore?: NonceStore;
  /**
   * Caller-managed spent set. Single-process only; the caller adds the nonce
   * after a successful verification. Ignored when `nonceStore` is supplied.
   */
  seenNonces?: Set<string>;
  /** Required capabilities. Missing ones FAIL rather than warn. */
  requiredCapabilities?: string[];
  /** Needed to check a commitment-only predicate proof. */
  predicateProvider?: IProofProvider;
}

export interface ControlProof {
  grant: AuthorizationGrant;
  humanSignature: string;
  /** Over `grant || humanSignature`. Proves possession, binds to this grant. */
  agentSignature: string;
  /** Optional: attributes about the human, revealed selectively. */
  disclosure?: Disclosure;
  /** Optional: a predicate over a value the verifier should not learn. */
  predicateProof?: { statement: PredicateStatement; result: ProofResult };
}

/** Three outcomes, never two. NOT_CHECKED is not a pass. */
export type CheckOutcome = 'VERIFIED' | 'NOT_CHECKED' | 'FAILED';

export interface ControlProofVerification {
  /** True only if every check that ran VERIFIED and none FAILED. */
  valid: boolean;
  checks: Record<string, { outcome: CheckOutcome; detail: string }>;
  /** Claims that verified against the disclosure root. Empty if none disclosed. */
  disclosedClaims: Record<string, string | number | boolean>;
  /**
   * Capabilities the caller may rely on. Empty whenever `valid` is false, so a
   * consumer that reads this without checking `valid` still cannot act.
   */
  grantedCapabilities: string[];
}

/**
 * Domain separation tags. Every signature in this system is prefixed with the
 * exact context it was made in, so a signature produced for one purpose cannot
 * be presented as a signature for another. Version numbers are part of the tag:
 * changing a payload layout without bumping the tag would let old signatures
 * verify against new semantics.
 */
export const DOMAIN = {
  // v2: `caveats` joined the signed payload. The tag is bumped in the same
  // change, because a layout change without a tag change lets a v1 signature
  // verify against v2 semantics — i.e. a grant signed before caveats existed
  // would read as a grant with no limits.
  grant: 'zkrepid:control-grant:v2',
  countersign: 'zkrepid:control-countersign:v2',
} as const;

export const GRANT_PAYLOAD_LAYOUT =
  `${DOMAIN.grant}|humanDid|agentDid|agentName|capabilities(sorted,comma)|caveats(sorted,comma)|audience|nonce|notBefore|expiresAt`;

/**
 * Canonical grant encoding. Sorted capabilities and a version tag, so the bytes
 * a signer signed are the bytes a verifier reconstructs after a JSON round trip.
 */
export function grantPayload(grant: AuthorizationGrant): string {
  return [
    DOMAIN.grant,
    grant.humanDid,
    grant.agentDid,
    grant.agentName,
    [...grant.capabilities].sort().join(','),
    encodeCaveats(grant.caveats ?? []),
    grant.audience,
    grant.nonce,
    grant.notBefore,
    grant.expiresAt,
  ].join('|');
}

/** Domain-separated so an agent signature can never be replayed as a human one. */
function counterSignPayload(grant: AuthorizationGrant, humanSignature: string): string {
  return `${DOMAIN.countersign}|${grantPayload(grant)}|${humanSignature}`;
}

export async function issueControlProof(input: {
  human: HumanSSID;
  agent: AgentIdentity;
  capabilities: string[];
  /** Optional limits. Omitted means none, and encodes distinctly from any. */
  caveats?: Caveat[];
  /** Who may accept the result. Required — see AuthorizationGrant.audience. */
  audience: string;
  ttlSeconds: number;
  now?: Date;
  nonce?: string;
  disclosure?: Disclosure;
  predicate?: { statement: PredicateStatement; provider: IProofProvider };
}): Promise<ControlProof> {
  const now = input.now ?? new Date();
  if (input.ttlSeconds <= 0) {
    throw new Error(
      'ttlSeconds must be positive. A grant that never expires cannot be revoked ' +
        'without a revocation registry, and this system deliberately has none.'
    );
  }
  if (!input.audience?.trim()) {
    throw new Error(
      'audience is required. An unbound proof is replayable against every service ' +
        'that trusts this human, which is the difference between a capability and a ' +
        'bearer token.'
    );
  }

  const grant: AuthorizationGrant = {
    humanDid: input.human.did,
    agentDid: input.agent.did,
    agentName: input.agent.name,
    capabilities: [...input.capabilities].sort(),
    caveats: input.caveats ?? [],
    audience: input.audience,
    nonce: input.nonce ?? randomNonce(),
    notBefore: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.ttlSeconds * 1000).toISOString(),
  };

  const humanSignature = await signAs(input.human, grantPayload(grant));
  const agentSignature = await signAs(input.agent, counterSignPayload(grant, humanSignature));

  const proof: ControlProof = { grant, humanSignature, agentSignature };
  if (input.disclosure) proof.disclosure = input.disclosure;
  if (input.predicate) {
    proof.predicateProof = {
      statement: input.predicate.statement,
      result: await input.predicate.provider.prove(input.predicate.statement),
    };
  }
  return proof;
}

/**
 * Verify a control proof. Every check reports its own outcome, so a caller can
 * see WHICH part held — a single boolean would collapse "the human's signature
 * is invalid" and "no attributes were disclosed" into the same answer.
 */
export async function verifyControlProof(
  proof: ControlProof,
  ctx: VerificationContext
): Promise<ControlProofVerification> {
  const opts = ctx;
  const now = ctx.now ?? new Date();
  const checks: ControlProofVerification['checks'] = {};
  let disclosedClaims: Record<string, string | number | boolean> = {};

  // --- audience ---
  // Checked before anything else: a proof minted for another service is not
  // this verifier's business regardless of how valid its signatures are.
  checks.audience =
    proof.grant.audience === ctx.audience
      ? { outcome: 'VERIFIED', detail: `bound to this verifier (${ctx.audience})` }
      : {
          outcome: 'FAILED',
          detail:
            `proof is bound to audience '${proof.grant.audience}' but this verifier ` +
            `is '${ctx.audience}'. Accepting it would honour a proof minted for ` +
            `someone else.`,
        };

  // --- human authorization ---
  const humanOk = await verifyAs(
    proof.grant.humanDid,
    grantPayload(proof.grant),
    proof.humanSignature
  );
  checks.humanAuthorization = humanOk
    ? { outcome: 'VERIFIED', detail: `signed by ${proof.grant.humanDid}` }
    : { outcome: 'FAILED', detail: 'human signature does not verify over the grant' };

  // --- agent possession ---
  const agentOk = await verifyAs(
    proof.grant.agentDid,
    counterSignPayload(proof.grant, proof.humanSignature),
    proof.agentSignature
  );
  checks.agentPossession = agentOk
    ? { outcome: 'VERIFIED', detail: `${proof.grant.agentDid} holds its key and bound this grant` }
    : {
        outcome: 'FAILED',
        detail:
          'agent counter-signature does not verify. Either the agent does not hold ' +
          'the key, or the signature was lifted from a different grant.',
      };

  // --- validity window ---
  const notBefore = new Date(proof.grant.notBefore);
  const expiresAt = new Date(proof.grant.expiresAt);
  if (Number.isNaN(notBefore.getTime()) || Number.isNaN(expiresAt.getTime())) {
    checks.validityWindow = { outcome: 'FAILED', detail: 'unparseable notBefore/expiresAt' };
  } else if (now < notBefore) {
    checks.validityWindow = { outcome: 'FAILED', detail: `not valid until ${proof.grant.notBefore}` };
  } else if (now >= expiresAt) {
    checks.validityWindow = { outcome: 'FAILED', detail: `expired at ${proof.grant.expiresAt}` };
  } else {
    checks.validityWindow = { outcome: 'VERIFIED', detail: `within ${proof.grant.notBefore}..${proof.grant.expiresAt}` };
  }

  // --- replay ---
  //
  // ORDERING MATTERS. The nonce is claimed only after the cryptographic checks
  // pass. Consuming it first would let anyone burn a legitimate nonce by
  // presenting a proof with a valid nonce and a broken signature — denying
  // service to the real holder, whose proof then reads as a replay. So an
  // invalid proof never spends anything.
  const cryptoOk =
    checks.audience.outcome === 'VERIFIED' &&
    checks.humanAuthorization.outcome === 'VERIFIED' &&
    checks.agentPossession.outcome === 'VERIFIED' &&
    checks.validityWindow.outcome === 'VERIFIED';

  if (!cryptoOk) {
    checks.replay = {
      outcome: 'NOT_CHECKED',
      detail:
        'core checks did not pass, so the nonce was deliberately not consumed — ' +
        'an invalid proof must not be able to burn a valid nonce.',
    };
  } else if (opts?.nonceStore) {
    // Atomic claim. See nonce-store.ts: there is no has()-then-add() path.
    const first = await opts.nonceStore.consume(
      proof.grant.nonce,
      proof.grant.audience,
      new Date(proof.grant.expiresAt)
    );
    checks.replay = first
      ? { outcome: 'VERIFIED', detail: `nonce ${proof.grant.nonce} claimed atomically` }
      : { outcome: 'FAILED', detail: `nonce ${proof.grant.nonce} already spent` };
  } else if (opts?.seenNonces) {
    // Caller-managed set. Fine for a single process; it is the caller's job to
    // add the nonce after a successful verification.
    checks.replay = opts.seenNonces.has(proof.grant.nonce)
      ? { outcome: 'FAILED', detail: `nonce ${proof.grant.nonce} already spent` }
      : { outcome: 'VERIFIED', detail: `nonce ${proof.grant.nonce} unseen` };
  } else {
    checks.replay = {
      outcome: 'NOT_CHECKED',
      detail:
        'no nonceStore or seenNonces supplied. Replay defence needs state the ' +
        'verifier keeps; this proof could be presented again and would verify ' +
        'identically.',
    };
  }

  // --- capabilities ---
  if (opts?.requiredCapabilities?.length) {
    // Wildcard-aware: a grant of `pay:*` covers a request for `pay:usdc`.
    // Exact string matching would force callers to over-grant to make anything
    // work, which is how least-privilege dies in practice.
    const missing = excess(proof.grant.capabilities, opts.requiredCapabilities);
    checks.capabilities = missing.length
      ? { outcome: 'FAILED', detail: `grant lacks: ${missing.join(', ')}` }
      : { outcome: 'VERIFIED', detail: `grant covers ${opts.requiredCapabilities.join(', ')}` };
  } else {
    checks.capabilities = {
      outcome: 'NOT_CHECKED',
      detail: 'caller named no required capabilities, so scope was not enforced',
    };
  }

  // --- selective disclosure ---
  if (!proof.disclosure) {
    checks.disclosure = { outcome: 'NOT_CHECKED', detail: 'no attributes disclosed' };
  } else {
    const res = await verifyDisclosure(proof.disclosure);
    if (res.valid) {
      disclosedClaims = res.claims;
      const withheld = proof.disclosure.totalClaims - proof.disclosure.disclosed.length;
      checks.disclosure = {
        outcome: 'VERIFIED',
        detail: `${proof.disclosure.disclosed.length} of ${proof.disclosure.totalClaims} claims disclosed and verified against the root (${withheld} withheld)`,
      };
    } else {
      checks.disclosure = { outcome: 'FAILED', detail: res.reason ?? 'disclosure did not verify' };
    }
  }

  // --- predicate ---
  if (!proof.predicateProof) {
    checks.predicate = { outcome: 'NOT_CHECKED', detail: 'no predicate proof attached' };
  } else if (!opts?.predicateProvider) {
    checks.predicate = {
      outcome: 'NOT_CHECKED',
      detail: 'a predicate proof is attached but no provider was supplied to check it',
    };
  } else {
    const { statement, result } = proof.predicateProof;
    const ok = await opts.predicateProvider.verify(result, statement);
    if (!ok) {
      checks.predicate = { outcome: 'FAILED', detail: 'predicate proof does not verify' };
    } else if (!result.witnessHidden) {
      // Verified, but say plainly what it did not buy.
      checks.predicate = {
        outcome: 'VERIFIED',
        detail:
          `predicate holds (${result.predicateHolds}) and the commitment reopens — ` +
          `but witnessHidden=false, so checking it revealed the witness. Privacy ` +
          `needs the Plonky3 provider (task #75).`,
      };
    } else {
      checks.predicate = {
        outcome: 'VERIFIED',
        detail: `predicate holds (${result.predicateHolds}) with the witness hidden`,
      };
    }
  }

  const anyFailed = Object.values(checks).some((c) => c.outcome === 'FAILED');
  // Core checks must be VERIFIED, not merely non-failing. NOT_CHECKED on any of
  // them means we did not look, which is not the same as passing.
  const coreVerified = (
    ['humanAuthorization', 'agentPossession', 'validityWindow', 'audience'] as const
  ).every((k) => checks[k].outcome === 'VERIFIED');
  const valid = !anyFailed && coreVerified;

  return {
    valid,
    checks,
    disclosedClaims: valid ? disclosedClaims : {},
    grantedCapabilities: valid ? [...proof.grant.capabilities] : [],
  };
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
