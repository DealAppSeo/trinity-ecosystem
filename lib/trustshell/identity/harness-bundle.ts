// lib/trustshell/identity/harness-bundle.ts
//
// The portable harness: what an agent carries when it moves between hosts.
//
// The no-lock-in requirement is not satisfied by "our format is open". It is
// satisfied when a receiving host can verify everything the bundle asserts with
// no network, no registry, and no cooperation from the host that issued it.
// Every part below is checkable from the bundle plus the receiver's own clock.
//
// WHAT IS IN IT, AND WHY EACH IS THE SHAPE IT IS:
//
//   identity    the agent DID and its human controller. did:key, so the key IS
//               the identifier and resolution is local computation.
//   authority   a ControlProof (or a delegation chain). Audience-bound, so a
//               bundle is NOT a bearer token — see below.
//   reputation  a RepID predicate: the claim `repid >= bound` with evidence
//               quality public and the score private.
//   skills      names WITH content hashes. A manifest that lists skill names
//               and not their hashes lets the skill be swapped after the
//               harness is trusted, which is the whole SkillScan concern.
//   memory      a COMMITMENT to a snapshot, never the snapshot. A portable
//               bundle carrying memory contents is a data-exfiltration shape
//               wearing a portability costume.
//
// THE PROPERTY THAT MATTERS MOST: PARTS CANNOT BE SPLICED BETWEEN BUNDLES.
//
// Each part is individually verifiable, which is exactly why the bundle needs
// its own signature over all of them together. Without it, anyone could take
// agent A's authority and agent B's reputation — both parts genuinely valid,
// both genuinely signed — and assemble a harness that claims a good score for
// an agent that never earned it. Every part verifying is not the same as the
// bundle being coherent, and that gap is where this kind of format usually
// fails.
//
// A BUNDLE IS NOT A CAPABILITY. Verifying it establishes what the agent IS, not
// what it may do here. The embedded ControlProof is bound to a specific
// audience, so presenting a bundle to a service it was not minted for verifies
// the identity and grants nothing. Consumers must read `authority.outcome` and
// the granted capabilities, never `valid` alone.

import { verifyAs, type AgentIdentity } from './identity';
import { signAs } from './identity';
import type { Did } from './did';
import {
  verifyControlProof,
  type ControlProof,
  type VerificationContext,
} from './control-proof';
import { isDelegated, verifyDelegationChain, type DelegatedControlProof } from './delegation';
import type { PredicateStatement, ProofResult, IProofProvider } from './proof-provider';
import type { Disclosure } from './disclosure';
import { verifyDisclosure } from './disclosure';

export const HARNESS_DOMAIN = 'zkrepid:harness-bundle:v1';

export interface SkillEntry {
  name: string;
  /** `sha256:<64 hex>` over the skill's content. Names alone are not pinning. */
  contentHash: string;
}

export interface MemorySnapshotRef {
  /** `commit-sha256:<64 hex>` over the snapshot. The data itself stays behind. */
  commitment: string;
  /** Item count, so a receiver can see scale without seeing content. */
  itemCount: number;
  takenAt: string;
}

export interface HarnessBundle {
  version: typeof HARNESS_DOMAIN;
  agentDid: Did;
  agentName: string;
  /** The human this agent derives authority from, per the authority proof. */
  controllerDid: Did;
  authority: ControlProof | DelegatedControlProof;
  reputation?: { statement: PredicateStatement; result: ProofResult };
  disclosure?: Disclosure;
  skills: SkillEntry[];
  memory?: MemorySnapshotRef;
  packedAt: string;
  /** By the agent, over every field above. Binds the parts together. */
  bundleSignature: string;
}

export type PartOutcome = 'VERIFIED' | 'NOT_CHECKED' | 'FAILED';

export interface HarnessVerification {
  /** True only when integrity and authority both VERIFIED and nothing FAILED. */
  valid: boolean;
  parts: Record<string, { outcome: PartOutcome; detail: string }>;
  /** Capabilities the receiving host may rely on. Empty unless valid. */
  grantedCapabilities: string[];
}

/**
 * Canonical encoding of everything the bundle signature covers.
 *
 * Sorted and fully spelled out rather than `JSON.stringify(bundle)`: key order
 * is not guaranteed across a round trip, so a stringify-based signature would
 * verify on the machine that made it and fail everywhere else — the exact
 * failure a portable format cannot have.
 */
export function bundlePayload(b: Omit<HarnessBundle, 'bundleSignature'>): string {
  const skills = [...b.skills]
    .map((s) => `${s.name}@${s.contentHash}`)
    .sort()
    .join(',');
  return [
    HARNESS_DOMAIN,
    b.agentDid,
    b.agentName,
    b.controllerDid,
    // The authority's own signature identifies it uniquely without re-encoding
    // the whole nested structure.
    isDelegated(b.authority) ? b.authority.delegateSignature : b.authority.agentSignature,
    b.reputation?.result.commitment ?? '',
    b.disclosure?.root ?? '',
    skills,
    b.memory?.commitment ?? '',
    b.memory?.itemCount ?? '',
    b.packedAt,
  ].join('|');
}

export async function packHarness(input: {
  agent: AgentIdentity;
  controllerDid: Did;
  authority: ControlProof | DelegatedControlProof;
  reputation?: { statement: PredicateStatement; result: ProofResult };
  disclosure?: Disclosure;
  skills?: SkillEntry[];
  memory?: MemorySnapshotRef;
  now?: Date;
}): Promise<HarnessBundle> {
  for (const s of input.skills ?? []) {
    if (!/^sha256:[0-9a-f]{64}$/.test(s.contentHash)) {
      throw new Error(
        `skill '${s.name}' has no usable content hash ('${s.contentHash}'). A manifest ` +
          `that names skills without pinning them lets the skill be swapped after the ` +
          `harness is trusted.`
      );
    }
  }
  if (input.memory && !/^commit-sha256:[0-9a-f]{64}$/.test(input.memory.commitment)) {
    throw new Error(
      `memory snapshot commitment is malformed ('${input.memory.commitment}'). It must ` +
        `be a commitment, and the snapshot contents must NOT travel in the bundle.`
    );
  }

  const unsigned = {
    version: HARNESS_DOMAIN,
    agentDid: input.agent.did,
    agentName: input.agent.name,
    controllerDid: input.controllerDid,
    authority: input.authority,
    reputation: input.reputation,
    disclosure: input.disclosure,
    skills: input.skills ?? [],
    memory: input.memory,
    packedAt: (input.now ?? new Date()).toISOString(),
  } as const;

  return {
    ...unsigned,
    bundleSignature: await signAs(input.agent, bundlePayload(unsigned)),
  };
}

/**
 * Verify a bundle. Every part reports its own outcome.
 *
 * `ctx.audience` is the RECEIVING host's identity. A bundle whose authority was
 * minted for somewhere else verifies its identity and integrity and is refused
 * authority — which is the correct answer, not a failure of the bundle.
 */
export async function verifyHarness(
  bundle: HarnessBundle,
  ctx: VerificationContext & { predicateProvider?: IProofProvider }
): Promise<HarnessVerification> {
  const parts: HarnessVerification['parts'] = {};

  // --- integrity: are these parts actually one bundle? ---
  const { bundleSignature, ...unsigned } = bundle;
  const integrityOk =
    bundle.version === HARNESS_DOMAIN &&
    (await verifyAs(bundle.agentDid, bundlePayload(unsigned), bundleSignature));
  parts.integrity = integrityOk
    ? { outcome: 'VERIFIED', detail: `all parts signed together by ${bundle.agentDid}` }
    : {
        outcome: 'FAILED',
        detail:
          'bundle signature does not cover these parts — they may have been spliced ' +
          'from different bundles, each individually valid',
      };

  // --- authority ---
  const authResult = isDelegated(bundle.authority)
    ? await verifyDelegationChain(bundle.authority, ctx)
    : await verifyControlProof(bundle.authority, ctx);

  // The bundle's claimed agent must be the one the authority actually authorizes.
  const authorizedDid = isDelegated(bundle.authority)
    ? bundle.authority.grant.delegateDid
    : bundle.authority.grant.agentDid;
  const subjectMatches = authorizedDid === bundle.agentDid;

  if (!subjectMatches) {
    parts.authority = {
      outcome: 'FAILED',
      detail: `bundle claims ${bundle.agentDid} but its authority authorizes ${authorizedDid}`,
    };
  } else if (!authResult.valid) {
    parts.authority = { outcome: 'FAILED', detail: 'authority proof did not verify here' };
  } else {
    parts.authority = { outcome: 'VERIFIED', detail: `authorized for ${ctx.audience}` };
  }

  // --- reputation ---
  if (!bundle.reputation) {
    parts.reputation = { outcome: 'NOT_CHECKED', detail: 'no reputation claim in this bundle' };
  } else if (!ctx.predicateProvider) {
    parts.reputation = {
      outcome: 'NOT_CHECKED',
      detail: 'a reputation claim is present but no provider was supplied to check it',
    };
  } else {
    const ok = await ctx.predicateProvider.verify(
      bundle.reputation.result,
      bundle.reputation.statement
    );
    parts.reputation = ok
      ? {
          outcome: 'VERIFIED',
          detail:
            `predicate holds (${bundle.reputation.result.predicateHolds})` +
            (bundle.reputation.result.witnessHidden
              ? ' with the score hidden'
              : ' — but witnessHidden=false, so checking it revealed the score'),
        }
      : { outcome: 'FAILED', detail: 'reputation commitment does not reopen' };
  }

  // --- disclosure ---
  if (!bundle.disclosure) {
    parts.disclosure = { outcome: 'NOT_CHECKED', detail: 'no attributes disclosed' };
  } else {
    const res = await verifyDisclosure(bundle.disclosure);
    parts.disclosure = res.valid
      ? {
          outcome: 'VERIFIED',
          detail: `${bundle.disclosure.disclosed.length} of ${bundle.disclosure.totalClaims} claims verified`,
        }
      : { outcome: 'FAILED', detail: res.reason ?? 'disclosure did not verify' };
  }

  // --- skills ---
  //
  // The bundle pins hashes; it cannot prove the host will RUN that content.
  // Saying so is the honest position: this is an integrity claim about the
  // manifest, not an attestation that the skill executed is the skill pinned.
  parts.skills = bundle.skills.length
    ? {
        outcome: 'VERIFIED',
        detail:
          `${bundle.skills.length} skill(s) pinned by content hash and covered by the ` +
          `bundle signature. NOT an attestation that the host runs this content — ` +
          `the receiver must compare each hash against what it loads.`,
      }
    : { outcome: 'NOT_CHECKED', detail: 'no skills declared' };

  // --- memory ---
  parts.memory = bundle.memory
    ? {
        outcome: 'VERIFIED',
        detail:
          `snapshot commitment present for ${bundle.memory.itemCount} item(s), taken ` +
          `${bundle.memory.takenAt}. Contents deliberately absent — the receiver must ` +
          `obtain them through an authorized channel, not from this bundle.`,
      }
    : { outcome: 'NOT_CHECKED', detail: 'no memory snapshot referenced' };

  const anyFailed = Object.values(parts).some((p) => p.outcome === 'FAILED');
  // The two explicit clauses are defensive, not currently load-bearing:
  // `integrity` and `authority` are each only ever VERIFIED or FAILED, so
  // `!anyFailed` already implies both. Mutation-testing confirms removing them
  // changes nothing observable today — recorded rather than deleted, because
  // they become load-bearing the moment either part can report NOT_CHECKED,
  // and at that point their absence would silently admit "we did not look".
  const valid =
    !anyFailed &&
    parts.integrity.outcome === 'VERIFIED' &&
    parts.authority.outcome === 'VERIFIED';

  return {
    valid,
    parts,
    grantedCapabilities: valid ? [...authResult.grantedCapabilities] : [],
  };
}
