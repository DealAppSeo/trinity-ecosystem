// app/api/trustshell/control-proof/verify/route.ts
//
// Verifies a dual-auth ControlProof and returns the full check ledger.
//
// PURELY ADDITIVE. This route grants nothing and gates nothing. It does not
// touch KYAValidator, VaultPermission, or the payment path — changing a live
// authorization gate is Sean-gated (see LESSONS A11, where a vault decision was
// found resting on an unbacked boolean). This endpoint exists so the identity
// path is exercised over real HTTP with a real handler, rather than only in
// unit assertions, and so a verifier can be pointed at it.
//
// AUDIENCE IS FIXED BY THIS SERVICE, NOT SUPPLIED BY THE CALLER.
//
// The obvious API — take `audience` from the request body — would destroy the
// property audience binding exists for. A proof minted for `trinity:vault`
// would verify here simply because the caller said `trinity:vault`, and this
// endpoint would become an oracle that launders proofs for any audience. A
// verifier may only ever check proofs addressed to itself, so the constant
// below is this service's identity and the only audience it accepts.
//
// The returned ledger reports VERIFIED / NOT_CHECKED / FAILED per check. A
// caller must gate on `valid`, never on the presence of the ledger.

import { NextResponse } from 'next/server';
import {
  verifyControlProof,
  type ControlProof,
} from '@/lib/trustshell/identity/control-proof';
import { InMemoryNonceStore } from '@/lib/trustshell/identity/nonce-store';
import {
  isDelegated,
  verifyDelegationChain,
  type DelegatedControlProof,
} from '@/lib/trustshell/identity/delegation';

/** Never cached: the same proof must not be replayable via a cached 200. */
export const dynamic = 'force-dynamic';

/** This service's own identifier. Proofs bound elsewhere are rejected. */
const AUDIENCE = 'trinity:control-proof-verify';

/**
 * Per-instance replay defence.
 *
 * Module scope is safe here — it reads no environment and builds no client, so
 * it cannot break `next build` the way a module-scope Supabase client does
 * (lib/CLAUDE.md). It persists across requests in a warm instance, which is
 * what makes replay detectable at all.
 *
 * NOT correct across instances: a proof replayed against a different serverless
 * instance is not caught. The durable store needs
 * `20260814090000_control_proof_nonces.sql`, which is deliberately unapplied
 * pending Sean. The response says so rather than implying full protection.
 */
const nonceStore = new InMemoryNonceStore();

const REPLAY_SCOPE =
  'per-instance only: this process has its own spent-nonce set, so a replay ' +
  'against a different serverless instance would not be caught here. Durable ' +
  'defence needs migration 20260814090000_control_proof_nonces.sql (unapplied).';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'body must be JSON' }, { status: 400 });
  }

  const { proof, requiredCapabilities } = (body ?? {}) as {
    proof?: ControlProof | DelegatedControlProof;
    requiredCapabilities?: string[];
  };

  // Shape-check before verifying. Without this a missing field surfaces as a
  // signature failure, which reads as "someone forged a proof" rather than
  // "the caller sent the wrong thing".
  //
  // A delegated proof carries `parent` and is shaped differently at the top
  // level, so the two are validated separately rather than through a lowest
  // common denominator that would accept neither properly.
  const delegated = !!proof && isDelegated(proof as DelegatedControlProof);
  if (delegated) {
    const d = proof as DelegatedControlProof;
    if (!d.grant || !d.delegatorSignature || !d.delegateSignature || !d.parent) {
      return NextResponse.json(
        {
          error:
            'delegated proof must carry { parent, grant, delegatorSignature, delegateSignature }',
        },
        { status: 400 }
      );
    }
  } else {
    const c = proof as ControlProof | undefined;
    if (!c?.grant || !c.humanSignature || !c.agentSignature) {
      return NextResponse.json(
        { error: 'proof must carry { grant, humanSignature, agentSignature }' },
        { status: 400 }
      );
    }
  }
  if (requiredCapabilities !== undefined && !Array.isArray(requiredCapabilities)) {
    return NextResponse.json({ error: 'requiredCapabilities must be an array' }, { status: 400 });
  }

  let result;
  let chain: Awaited<ReturnType<typeof verifyDelegationChain>> | undefined;
  try {
    if (delegated) {
      // The chain walks to its root ControlProof and verifies that with the
      // same context, so audience and replay still apply — and the required
      // capabilities are checked against the LEAF, which is what delegation
      // narrowed. Checking them at the root would pass whenever the root is
      // broad, defeating the point.
      chain = await verifyDelegationChain(proof as DelegatedControlProof, {
        audience: AUDIENCE,
        nonceStore,
        requiredCapabilities,
      });
      result = {
        valid: chain.valid,
        checks: chain.rootVerification?.checks ?? {},
        disclosedClaims: chain.rootVerification?.disclosedClaims ?? {},
        grantedCapabilities: chain.grantedCapabilities,
      };
    } else {
      result = await verifyControlProof(proof as ControlProof, {
        audience: AUDIENCE,
        nonceStore,
        requiredCapabilities,
      });
    }
  } catch (err) {
    // A malformed DID throws by design (did.ts) — it is a caller error, not a
    // failed verification, and conflating them would let a typo read as
    // "not authorized" and hide the real problem.
    return NextResponse.json(
      { error: `could not verify: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      valid: result.valid,
      audience: AUDIENCE,
      checks: result.checks,
      disclosedClaims: result.disclosedClaims,
      grantedCapabilities: result.grantedCapabilities,
      // Present only for a chain, so a caller cannot mistake a single proof for
      // a delegation that was never checked link by link.
      ...(chain ? { delegation: { depth: chain.depth, links: chain.links } } : {}),
      replayScope: REPLAY_SCOPE,
    },
    // 200 for a well-formed request even when the proof is invalid: the
    // verification ran and produced an answer. 4xx is reserved for a request
    // this endpoint could not process. A caller must read `valid`.
    { status: 200 }
  );
}
