// lib/trustshell/identity/loop-authorizer.ts
//
// Binds the agent loop's `Authorizer` port to this repo's authorization
// artifacts: `ControlProof`, the capability algebra, and caveats.
//
// WHY IT LIVES HERE AND NOT IN harness/. The kernel may not import anything
// outside its own directory — that constraint is what lets it ship as a package
// and run under a different trust system. So the kernel declares a port and
// this module is the adapter. Reimplementing the capability algebra inside the
// kernel would have been the alternative, and two copies of an authorization
// rule disagree silently, which is the worse failure by a distance.
//
// ── WHAT THIS CLOSES ─────────────────────────────────────────────────────────
//
// Before this file, the entire identity layer — 168 assertions, dual-auth
// grants, attenuation, delegation chains, caveats — was reachable from exactly
// one place: an E2E verify route. Nothing in the system asked it for permission
// before doing something. This is the thing that asks.
//
// It also settles a debt `caveat.ts` has been carrying since it was written.
// Stateful caveats (`maxCalls`) reported NOT_CHECKED because nothing counted
// calls across requests, and that file says plainly that an unenforced caveat
// is worse than no caveat. The loop counts. Passing `session.totalCalls` as
// `callsSoFar` is what turns that NOT_CHECKED into a real verdict — the first
// time this system can enforce "at most N calls" rather than record that it
// did not look.
//
// ── WHAT IS VERIFIED WHEN, AND WHY IT IS SPLIT ───────────────────────────────
//
//   ONCE, at construction   signatures, audience binding, delegation chain,
//                           attenuation per link, and the nonce.
//   ON EVERY CALL           the validity window, the capability required by
//                           this tool, and every caveat.
//
// The split is forced rather than lazy. Cryptographic facts cannot change
// during a session: the same bytes verify against the same key on turn 25 as on
// turn 1, so re-checking them per call buys nothing. The NONCE in particular
// must be consumed exactly once — `NonceStore.consume()` is atomic and single
// use, so calling it per tool call would refuse the second call of every
// session as a replay of the first.
//
// TIME is the thing that does change. A 25-turn loop can outlive its grant, and
// a grant that expires mid-run must stop authorizing immediately — otherwise
// the expiry is decorative for the whole remainder of the session, which is the
// longest and least supervised part of it.

import { verifyControlProof, type ControlProof } from './control-proof';
import {
  isDelegated,
  verifyDelegationChain,
  type DelegatedControlProof,
} from './delegation';
import { permits } from './capability';
import {
  evaluateCaveats,
  caveatsPermit,
  type ActionContext,
  type Caveat,
  type CaveatResult,
} from './caveat';
import type { NonceStore } from './nonce-store';
import type {
  Authorizer,
  AuthorizationRequest,
  AuthorizationVerdict,
  ToolCall,
} from '../harness/loop';

/**
 * Which capability a tool requires.
 *
 * A tool ABSENT from this map is DENIED, never allowed. The mapping is the only
 * thing connecting a tool name to the authorization language, so an unmapped
 * tool is one nobody has decided about — and the safe reading of an undecided
 * permission is no.
 *
 * This is the same rule as the kernel's empty allowlist, for the same reason: a
 * default that widens on absence makes the least-configured deployment the most
 * permissive one.
 */
export type ToolCapabilityMap = Readonly<Record<string, string>>;

/**
 * Extracts the value an action moves, for the `maxValue` caveat.
 *
 * Returning `undefined` makes `maxValue` report NOT_CHECKED rather than pass —
 * `caveat.ts` is explicit that an undeclared value means the caller failed to
 * declare it, not that the action is free. Supply one for any tool that can
 * move value.
 */
export type ValueExtractor = (call: ToolCall) => { asset: string; amount: number } | undefined;

export interface ControlProofAuthorizerInput {
  proof: ControlProof | DelegatedControlProof;
  /** This verifier's identity. Must equal the grant's audience. */
  audience: string;
  toolCapabilities: ToolCapabilityMap;
  declaredValue?: ValueExtractor;
  /** Injected so tests can move time without sleeping. */
  now?: () => Date;
  /** Durable and atomic. Preferred — the only option correct across instances. */
  nonceStore?: NonceStore;
  /** Single-process fallback. Ignored when `nonceStore` is supplied. */
  seenNonces?: Set<string>;
}

/** Everything the caller needs to run a loop, plus what the proof actually granted. */
export interface ControlProofAuthorizerResult {
  authorizer: Authorizer;
  /** What the LEAF may do. Empty whenever the proof did not verify. */
  grantedCapabilities: string[];
  /** The leaf's caveats — the tightest in the chain, since caveats attenuate. */
  caveats: Caveat[];
  /** Set when the proof is a delegation chain. 0 for a direct grant. */
  delegationDepth: number;
}

/**
 * Raised when the proof does not verify at session start.
 *
 * A THROW RATHER THAN AN AUTHORIZER THAT REFUSES EVERYTHING. Both are safe, and
 * they say different things: an authorizer that denies every call looks, in a
 * transcript, exactly like an agent whose tools were all out of scope. A
 * refused session says the grant was bad. Collapsing the two would hide a
 * configuration failure inside what reads as normal agent behaviour.
 */
export class ProofRejected extends Error {
  constructor(readonly detail: string) {
    super(`the control proof did not verify, so no session may start: ${detail}`);
    this.name = 'ProofRejected';
  }
}

export async function createControlProofAuthorizer(
  input: ControlProofAuthorizerInput
): Promise<ControlProofAuthorizerResult> {
  const now = input.now ?? (() => new Date());

  // Chain verification handles both shapes: a plain ControlProof walks zero
  // links and is verified directly. `requiredCapabilities` is deliberately not
  // supplied — the per-tool requirement is checked per call against the tool
  // actually being invoked, which is stricter than one requirement fixed at
  // session start.
  const chain = await verifyDelegationChain(input.proof, {
    audience: input.audience,
    now: now(),
    nonceStore: input.nonceStore,
    seenNonces: input.seenNonces,
  });

  if (!chain.valid) {
    const failed = chain.links
      .filter((l) => l.outcome !== 'VERIFIED')
      .map((l) => `${l.subject}: ${l.detail}`)
      .join('; ');
    throw new ProofRejected(failed || 'no link verified');
  }

  // RECORD THE NONCE. `verifyControlProof` only READS `seenNonces` — its own
  // doc says "the caller adds the nonce after a successful verification" — so
  // an adapter that passes the set and walks away has replay defence that
  // reports VERIFIED and prevents nothing. Found by a test asserting the set
  // grew, which it did not.
  //
  // Only for the `seenNonces` path. `NonceStore.consume()` is atomic and
  // records as part of the same operation; there is deliberately no
  // has()-then-add() seam to duplicate here.
  if (!input.nonceStore && input.seenNonces) {
    input.seenNonces.add(rootNonce(input.proof));
  }

  const leaf = leafGrant(input.proof);
  const granted = chain.grantedCapabilities;
  const caveats = leaf.caveats ?? [];

  const authorizer: Authorizer = {
    async authorize(request: AuthorizationRequest): Promise<AuthorizationVerdict> {
      return decide({
        request,
        granted,
        caveats,
        expiresAt: leaf.expiresAt,
        notBefore: leaf.notBefore,
        toolCapabilities: input.toolCapabilities,
        declaredValue: input.declaredValue,
        now: now(),
      });
    },
  };

  return {
    authorizer,
    grantedCapabilities: granted,
    caveats,
    delegationDepth: chain.depth,
  };
}

// ---------------------------------------------------------------------------

/**
 * The nonce `verifyControlProof` actually checks — the ROOT's.
 *
 * Delegation links carry their own nonces, but the replay check runs against
 * the root ControlProof, so recording a link's nonce would record a value
 * nothing ever tests.
 */
function rootNonce(proof: ControlProof | DelegatedControlProof): string {
  let cursor: ControlProof | DelegatedControlProof = proof;
  while (isDelegated(cursor)) cursor = cursor.parent;
  return (cursor as ControlProof).grant.nonce;
}

function leafGrant(proof: ControlProof | DelegatedControlProof): {
  caveats: Caveat[];
  notBefore: string;
  expiresAt: string;
} {
  const g = proof.grant;
  return { caveats: g.caveats ?? [], notBefore: g.notBefore, expiresAt: g.expiresAt };
}

function decide(args: {
  request: AuthorizationRequest;
  granted: string[];
  caveats: Caveat[];
  notBefore: string;
  expiresAt: string;
  toolCapabilities: ToolCapabilityMap;
  declaredValue?: ValueExtractor;
  now: Date;
}): AuthorizationVerdict {
  const { request, now } = args;
  const tool = request.call.name;

  // --- time, re-checked on every call ---
  //
  // The whole reason this adapter re-runs anything per call. A grant that
  // expires on turn 12 must stop authorizing on turn 12.
  if (now < new Date(args.notBefore)) {
    return {
      allowed: false,
      kind: 'authorizer_denied',
      reason: `the grant is not yet valid (notBefore ${args.notBefore})`,
    };
  }
  if (now >= new Date(args.expiresAt)) {
    return {
      allowed: false,
      kind: 'authorizer_denied',
      reason:
        `the grant expired at ${args.expiresAt} and this call is at ` +
        `${now.toISOString()}. A session may outlive its authority; the authority ` +
        'does not stretch to cover it.',
    };
  }

  // --- what does this tool require? ---
  const required = args.toolCapabilities[tool];
  if (required === undefined) {
    return {
      allowed: false,
      kind: 'authorizer_denied',
      reason:
        `no capability is mapped for tool '${tool}', so nobody has decided what ` +
        'authorizes it. An undecided permission reads as no.',
    };
  }

  // --- does the grant permit it? ---
  //
  // `permits` fails closed on anything malformed, and whole-segment wildcards
  // only: `pay:usd*` does NOT cover `pay:usdt`.
  if (!args.granted.some((held) => permits(held, required))) {
    return {
      allowed: false,
      kind: 'authorizer_denied',
      reason:
        `'${tool}' requires '${required}', which is not permitted by the granted ` +
        `capabilities [${args.granted.join(', ') || 'none'}]`,
    };
  }

  // --- caveats, now including the stateful one ---
  const ctx: ActionContext = {
    tool,
    value: args.declaredValue?.(request.call),
    // The debt `caveat.ts` was carrying. `SessionCounters` excludes the call
    // being authorized, which is exactly what `callsSoFar < limit` expects.
    callsSoFar: request.session.totalCalls,
  };
  const results = evaluateCaveats(args.caveats, ctx);
  if (!caveatsPermit(results)) {
    return {
      allowed: false,
      kind: 'authorizer_denied',
      reason: `caveat refused: ${describeFailed(results)}`,
    };
  }

  return { allowed: true, reason: describeAllowed(tool, required, results) };
}

function describeFailed(results: CaveatResult[]): string {
  return results
    .filter((r) => r.outcome === 'FAILED')
    .map((r) => `${r.caveat.type} — ${r.detail}`)
    .join('; ');
}

/**
 * State what was checked AND what was not.
 *
 * A NOT_CHECKED caveat does not refuse the action — `caveatsPermit` is explicit
 * about that — but it must not vanish into an "allowed" that reads as fully
 * verified. The loop records this string per call, so an operator reading a
 * transcript can see that a cap existed and went unapplied.
 */
function describeAllowed(tool: string, required: string, results: CaveatResult[]): string {
  const verified = results.filter((r) => r.outcome === 'VERIFIED').length;
  const notChecked = results.filter((r) => r.outcome === 'NOT_CHECKED');
  const head = `'${tool}' authorized by '${required}'; ${verified} caveat(s) VERIFIED`;
  if (notChecked.length === 0) return head;
  return (
    `${head}; ${notChecked.length} NOT_CHECKED — ` +
    notChecked.map((r) => `${r.caveat.type}: ${r.detail}`).join('; ')
  );
}
