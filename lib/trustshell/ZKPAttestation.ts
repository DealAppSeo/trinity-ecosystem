// lib/trustshell/ZKPAttestation.ts
//
// Binds a KYA decision to a reproducible commitment. It does NOT produce a
// zero-knowledge proof, and it no longer says that it does.
//
// WHAT THIS USED TO CLAIM. The object it returned carried
// `proofSystem: 'groth16'` and a `verificationKey` address, while the "proof"
// was a SHA-256 of a timestamp, base64'd, truncated to 44 characters and
// prefixed `Qm` so it resembled an IPFS CIDv0. No Groth16 code exists in this
// repo, nothing was ever pinned to IPFS, and the string is not a valid CID —
// `Qm` CIDs are base58 of a multihash, not base64 of hex. Four public signals
// were hardcoded `true`, including `entity_not_sanctioned`, for which no
// sanctions check exists anywhere in the codebase. That value then reached an
// on-chain Solana memo through SolanaExecutor, so the claim was published.
//
// WHAT IT DOES NOW. A commitment: SHA-256 over the decision inputs plus a
// recorded salt. That is a real, useful primitive — it binds this decision so a
// later proof or audit can be checked against it — and it is honestly labelled.
// `proven` is false and `proofSystem` is 'none' until a prover actually runs.
//
// TWO PROPERTIES THE OLD VERSION LACKED:
//   1. Reproducible. The old preimage used `Date.now()` and discarded it, so the
//      value could never be recomputed and therefore could never be checked
//      against anything. A commitment you cannot reopen is decoration. The salt
//      is now returned and stored.
//   2. Derived. Signals are computed from the arguments. `repidMeetsThreshold`
//      is `repidScore >= threshold` rather than the literal `true` it used to be
//      — which meant a FAILING agent still received an attestation asserting it
//      passed.
//
// Claims with no evidence behind them are not downgraded to `false`; they are
// removed from `publicSignals` and listed in `notAttested`. False would assert
// the agent IS sanctioned. Absence is the only honest encoding of "not checked".

import { getSupabaseAdmin } from '@/lib/supabase-admin';

/** 'none' until a prover runs. Never default this to a real system. */
export type ProofSystem = 'none' | 'groth16' | 'halo2' | 'plonky3';

export interface ZKPAttestation {
  /**
   * False whenever no prover ran. Consumers must gate on this rather than on
   * the presence of `commitment`, which exists in both cases.
   */
  proven: boolean;
  proofSystem: ProofSystem;

  /**
   * Reproducible commitment over the decision. Self-describing prefix so it can
   * never again be mistaken for an IPFS CID or a proof.
   * Format: `commit-sha256:<64 hex>`
   */
  commitment: string;
  /** Recorded so the commitment can be recomputed and verified. */
  salt: string;
  /** Exact preimage layout, so a verifier need not read this file. */
  commitmentPreimage: string;

  /** Only claims actually derived from the inputs. */
  publicSignals: Record<string, boolean>;
  /** Claims this attestation deliberately does NOT make, and why. */
  notAttested: Record<string, string>;

  circuitType: string | null;
  generatedAt: string;
  roadmap: string;
}

export interface KYAAttestationInput {
  agentName: string;
  repidScore: number;
  threshold: number;
  /** From the KYA registry. A registered fact, not a proven one. */
  humanCustodyBound: boolean;
  /** Injected for deterministic tests; random in production. */
  salt?: string;
  now?: string;
}

const PREIMAGE_LAYOUT = 'agentName|repidScore|threshold|meetsThreshold|humanCustodyBound|salt';

export class ZKPAttestationService {
  private get supabase() {
    return getSupabaseAdmin();
  }

  async generateKYAAttestation(input: KYAAttestationInput): Promise<ZKPAttestation> {
    const { agentName, repidScore, threshold, humanCustodyBound } = input;
    const salt = input.salt ?? randomSalt();
    const generatedAt = input.now ?? new Date().toISOString();

    const meetsThreshold = repidScore >= threshold;

    const preimage = [
      agentName,
      String(repidScore),
      String(threshold),
      String(meetsThreshold),
      String(humanCustodyBound),
      salt,
    ].join('|');

    const commitment = `commit-sha256:${await sha256Hex(preimage)}`;

    const attestation: ZKPAttestation = {
      proven: false,
      proofSystem: 'none',
      commitment,
      salt,
      commitmentPreimage: PREIMAGE_LAYOUT,
      publicSignals: {
        // Derived, not asserted.
        repidMeetsThreshold: meetsThreshold,
        humanCustodyBound,
      },
      notAttested: {
        entityNotSanctioned:
          'no sanctions screening exists in this codebase. Previously asserted as ' +
          'true. Absent rather than false, because false would assert the opposite.',
        agentKyaVerified:
          'KYAValidator decides this upstream and gates the request; repeating it ' +
          'here would restate a caller input as an independent finding.',
        repidScoreCorrectness:
          'the commitment binds the score that was supplied. It does not prove the ' +
          'score was computed correctly — that needs the circuit named in roadmap.',
      },
      circuitType: null,
      generatedAt,
      roadmap:
        'To become proven: a circuit over (repidScore, threshold) emitting ' +
        'repidScore >= threshold without revealing repidScore. services/zkp-postcard ' +
        'contains a real Plonky3 AIR for exactly this range check; it currently ' +
        'discards its proof object, so it cannot yet back this attestation.',
    };

    // Recording failures must not fail a payment that has otherwise succeeded,
    // but a swallowed error would make an unlogged attestation look logged.
    const { error } = await this.supabase.from('trinity_agent_logs').insert({
      agent_name: agentName,
      action: 'kya_commitment_generated',
      content: `commitment ${commitment} (proven=false, proofSystem=none)`,
      metadata: { ...attestation, repidScore, threshold },
    });
    if (error) {
      console.error(
        `[ZKPAttestation] commitment ${commitment} was NOT recorded: ${error.message}`
      );
    }

    return attestation;
  }

  /**
   * Recompute a commitment from its inputs and salt.
   *
   * This is the whole point of the change: the previous value could not be
   * reopened, so nothing could ever be checked against it.
   */
  async verifyCommitment(input: Required<Pick<KYAAttestationInput,
    'agentName' | 'repidScore' | 'threshold' | 'humanCustodyBound' | 'salt'>>,
    commitment: string
  ): Promise<boolean> {
    const preimage = [
      input.agentName,
      String(input.repidScore),
      String(input.threshold),
      String(input.repidScore >= input.threshold),
      String(input.humanCustodyBound),
      input.salt,
    ].join('|');
    return commitment === `commit-sha256:${await sha256Hex(preimage)}`;
  }
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
