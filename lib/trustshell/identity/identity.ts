// lib/trustshell/identity/identity.ts
//
// The two principals in dual-auth: a human (SSID) and an agent (AgentIdentity),
// plus the mapping from an agent's DID onto its ERC-8004 on-chain registration.
//
// WHY BOTH. Every existing authorization surface in this repo answers "which
// agent is this?" and none of them answers "which human is accountable for it?"
// KYAValidator checks the agent against a registry; the payment path records an
// agent name. `humanCustodyBound` in ZKPAttestation is a boolean read out of
// that registry — a registered FACT, asserted by whoever wrote the row, with
// nothing to check it against. This module is what turns that boolean into
// something verifiable: a signature chain from a human key to an agent key.
//
// THE ERC-8004 SEAM. On-chain identity is an integer agentId owned by an EVM
// address. That address is secp256k1; the DID here is Ed25519. They are
// different curves and neither can sign for the other, so the binding between
// them is an ATTESTATION, not a derivation — the human signs a statement that
// this DID and that agentId are the same agent. `Erc8004Binding` records that
// honestly, including which direction has been proven. Deriving one from the
// other would be a lie about what was checked.

import { type Did, generateKeyPair, generateExportableKeyPair, sign, verify } from './did';

/**
 * A human's self-sovereign identity. The root of accountability: agents derive
 * their authority from a human, and the chain is checkable offline.
 */
export interface HumanSSID {
  did: Did;
  /** Present only for a locally-held identity. Absent when verifying someone else's. */
  privateKey?: CryptoKey;
  createdAt: string;
}

export interface AgentIdentity {
  did: Did;
  privateKey?: CryptoKey;
  /** Human-readable handle used by KYAValidator and the payment path. */
  name: string;
  createdAt: string;
}

/**
 * Binds an agent DID to its ERC-8004 registration.
 *
 * `proven` is deliberately narrow. Anyone can WRITE that agentId 3747 is this
 * DID; that is a claim. It becomes proven only when the EVM key that owns the
 * token signs the same statement — which needs the on-chain owner's signature,
 * and for three of this project's four identities that key is compromised and
 * awaiting rotation (PR #25, task #73). Until then this stays `claimed`, and a
 * consumer that needs certainty must check the chain itself.
 */
export interface Erc8004Binding {
  agentDid: Did;
  agentId: number;
  /** The EVM address that owns the ERC-8004 token, per the registry. */
  ownerAddress: string;
  chainId: number;
  status: 'claimed' | 'proven';
  /** Why it is not proven, when it is not. */
  unprovenReason?: string;
}

export async function createHumanSSID(opts?: { exportable?: boolean }): Promise<HumanSSID> {
  const kp = opts?.exportable ? await generateExportableKeyPair() : await generateKeyPair();
  return { did: kp.did, privateKey: kp.privateKey, createdAt: new Date().toISOString() };
}

export async function createAgentIdentity(
  name: string,
  opts?: { exportable?: boolean }
): Promise<AgentIdentity> {
  if (!name.trim()) throw new Error('agent name is required — KYAValidator keys on it');
  const kp = opts?.exportable ? await generateExportableKeyPair() : await generateKeyPair();
  return { did: kp.did, privateKey: kp.privateKey, name, createdAt: new Date().toISOString() };
}

/**
 * Record an ERC-8004 binding as CLAIMED.
 *
 * There is no `proveErc8004Binding` in this module on purpose: proving it needs
 * an EVM signature from the token owner, which is a different curve and a
 * different key custody story. Writing a function that returned `proven` without
 * that signature is exactly how `humanCustodyBound` became an unverifiable
 * boolean in the first place.
 */
export function claimErc8004Binding(input: {
  agentDid: Did;
  agentId: number;
  ownerAddress: string;
  chainId: number;
}): Erc8004Binding {
  return {
    ...input,
    status: 'claimed',
    unprovenReason:
      'the ERC-8004 token owner is a secp256k1 EVM address and this DID is Ed25519; ' +
      'neither key can sign for the other. Proving the binding requires a signature ' +
      'from the owning EVM key over this agentDid. For agent ids 3747/3748/3750 that ' +
      'key is in git history and awaiting rotation (task #73), so a signature from it ' +
      'would prove nothing about who controls the agent today.',
  };
}

/** Sign a payload as a principal. Throws if the identity has no private key. */
export async function signAs(
  principal: HumanSSID | AgentIdentity,
  payload: string
): Promise<string> {
  if (!principal.privateKey) {
    throw new Error(
      `cannot sign as ${principal.did}: no private key held. This identity was ` +
        `reconstructed for verification only.`
    );
  }
  return sign(principal.privateKey, payload);
}

/** Verify a payload signed by a DID. Local computation; no registry lookup. */
export async function verifyAs(did: Did, payload: string, signature: string): Promise<boolean> {
  return verify(did, payload, signature);
}
