// lib/trustshell/CustodyShadow.ts
//
// Shadow-mode comparison for the human-custody gate.
//
// THE PROBLEM THIS MEASURES (LESSONS A11). `VaultPermission.ts:48` denies vault
// access when `vault.requires_human_custody && !profile.humanCustodyVerified`.
// That boolean comes from `agent_kya_registry.human_custody_verified`, which is
// `true` for five agents while `custodian_zkp_proof` is NULL in all twelve rows.
// The column built to hold the evidence has never held any, so a live
// authorization decision rests on an assertion nobody can re-check.
//
// `ControlProof` can replace it with something verifiable. But switching a live
// gate on the strength of a finding is how you lock five agents out of their
// vaults at 3am, so this file changes NOTHING. It watches.
//
// THREE PROPERTIES, AND THE THIRD IS THE ONE THAT MATTERS MOST:
//
//   1. It never alters the decision. The legacy verdict is what the caller
//      acts on; the shadow verdict is only recorded.
//   2. It never throws into the caller. An observability path that can break
//      production is worse than no observability — so every failure inside this
//      module is caught and recorded as `error`, and the vault call continues.
//   3. IT EXPECTS TO BE UNINFORMATIVE AT FIRST, and says so. Nothing presents a
//      ControlProof to the vault path today, so early observations will be
//      almost entirely `not_comparable`. That is not the instrument failing —
//      it IS the measurement: it tells you adoption is zero, which is precisely
//      what you need to know before switching a gate. Reading a run of
//      `not_comparable` as "the shadow agrees" would be the same defect this
//      repo keeps finding, one layer up.
//
// THE ASYMMETRY WORTH WATCHING. `shadow_stricter` (legacy allows, proof denies)
// means switching would tighten access — annoying, recoverable, and arguably
// correct. `shadow_looser` (legacy denies, proof allows) means switching would
// GRANT access the current gate refuses. That direction is the one that must be
// understood before any cutover, and it is called out separately rather than
// averaged into a single "disagreement rate".

import type { ControlProof } from './identity/control-proof';
import { verifyControlProof } from './identity/control-proof';
import type { DelegatedControlProof } from './identity/delegation';
import { isDelegated, verifyDelegationChain } from './identity/delegation';
import type { NonceStore } from './identity/nonce-store';

/** The audience a vault-bound control proof must be minted for. */
export const VAULT_AUDIENCE = 'trinity:vault';

/** Capability a proof must carry to stand in for the custody boolean. */
export const VAULT_CAPABILITY = 'vault:access';

export type ShadowVerdict =
  /** Both say allow. Switching would change nothing here. */
  | 'agree_allow'
  /** Both say deny. Switching would change nothing here. */
  | 'agree_deny'
  /** Legacy allows, proof denies — switching TIGHTENS. Recoverable. */
  | 'shadow_stricter'
  /** Legacy denies, proof allows — switching GRANTS new access. Investigate. */
  | 'shadow_looser'
  /** No proof was presented, so there is nothing to compare. Expected early. */
  | 'not_comparable'
  /** The shadow path itself failed. Recorded, never propagated. */
  | 'error';

export interface ShadowObservation {
  verdict: ShadowVerdict;
  legacyPermits: boolean;
  /** Null whenever no proof was presented or the comparison errored. */
  proofPermits: boolean | null;
  agentName: string;
  vaultId: string;
  detail: string;
  observedAt: string;
}

/**
 * The structural minimum this module needs from a Supabase client.
 *
 * The row parameter is `any` deliberately. supabase-js types `insert` with a
 * generic `RejectExcessProperties<Row>` that a hand-written structural type
 * cannot satisfy, and narrowing it here would reject the real client at the
 * injection site — trading a genuine type error for a fake one. `any` is
 * confined to this one parameter of a third-party signature; the observation
 * itself is fully typed as `ShadowObservation` before it reaches this call.
 *
 * `PromiseLike` rather than `Promise` because a PostgrestFilterBuilder is a
 * thenable, not a Promise.
 */
type SupabaseLike = {
  from: (t: string) => {
    insert: (r: any) => PromiseLike<{ error: { message: string } | null }>;
  };
};

export class CustodyShadow {
  constructor(
    /**
     * Injected rather than imported, so this module never builds a Supabase
     * client at import time — `next build` imports every route module, and a
     * module-scope client fails the build when a key is absent (lib/CLAUDE.md).
     */
    private readonly getClient: () => SupabaseLike,
    private readonly nonceStore?: NonceStore
  ) {}

  /**
   * Compare and record. Returns the observation for tests and callers that want
   * it; the vault path may ignore the return entirely.
   *
   * NEVER THROWS. Every path is caught.
   */
  async observe(input: {
    agentName: string;
    vaultId: string;
    /** What the live gate decided, and will continue to decide. */
    legacyCustodyVerified: boolean;
    /** Whether this vault requires custody at all. */
    vaultRequiresCustody: boolean;
    /** Present only if the caller supplied one. Today: never. */
    controlProof?: ControlProof | DelegatedControlProof;
    now?: Date;
  }): Promise<ShadowObservation> {
    const observedAt = (input.now ?? new Date()).toISOString();
    const legacyPermits = !input.vaultRequiresCustody || input.legacyCustodyVerified;

    const base = {
      legacyPermits,
      agentName: input.agentName,
      vaultId: input.vaultId,
      observedAt,
    };

    let observation: ShadowObservation;
    try {
      if (!input.controlProof) {
        observation = {
          ...base,
          verdict: 'not_comparable',
          proofPermits: null,
          detail:
            'no ControlProof presented. Expected while adoption is zero — this ' +
            'records that the caller had nothing to verify, NOT that the two ' +
            'approaches agree.',
        };
      } else {
        const proofPermits = await this.evaluateProof(input.controlProof);
        observation = {
          ...base,
          proofPermits,
          ...classify(legacyPermits, proofPermits),
        };
      }
    } catch (err) {
      // Rule 2. A failure here must never reach the vault decision.
      observation = {
        ...base,
        verdict: 'error',
        proofPermits: null,
        detail: `shadow comparison failed (vault decision unaffected): ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }

    await this.record(observation);
    return observation;
  }

  private async evaluateProof(
    proof: ControlProof | DelegatedControlProof
  ): Promise<boolean> {
    const ctx = {
      audience: VAULT_AUDIENCE,
      nonceStore: this.nonceStore,
      requiredCapabilities: [VAULT_CAPABILITY],
    };
    if (isDelegated(proof)) {
      return (await verifyDelegationChain(proof, ctx)).valid;
    }
    return (await verifyControlProof(proof, ctx)).valid;
  }

  /**
   * Recording failures are swallowed too — but logged to stderr, so a silent
   * gap in the data is not mistaken for a run of clean observations.
   */
  private async record(o: ShadowObservation): Promise<void> {
    try {
      const { error } = await this.getClient()
        .from('trinity_agent_logs')
        .insert({
          agent_name: o.agentName,
          action: 'custody_shadow_observation',
          content: `${o.verdict}: legacy=${o.legacyPermits} proof=${String(o.proofPermits)} vault=${o.vaultId}`,
          metadata: { ...o, shadowMode: true, gateUnchanged: true },
        });
      if (error) {
        console.error(`[CustodyShadow] observation NOT recorded: ${error.message}`);
      }
    } catch (err) {
      console.error(
        `[CustodyShadow] observation NOT recorded: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

function classify(
  legacyPermits: boolean,
  proofPermits: boolean
): { verdict: ShadowVerdict; detail: string } {
  if (legacyPermits && proofPermits) {
    return { verdict: 'agree_allow', detail: 'both permit; switching changes nothing here' };
  }
  if (!legacyPermits && !proofPermits) {
    return { verdict: 'agree_deny', detail: 'both deny; switching changes nothing here' };
  }
  if (legacyPermits && !proofPermits) {
    return {
      verdict: 'shadow_stricter',
      detail:
        'legacy allows, proof denies — switching would TIGHTEN access. Recoverable, ' +
        'and possibly the correct outcome given the boolean has no evidence behind it.',
    };
  }
  return {
    verdict: 'shadow_looser',
    detail:
      'legacy denies, proof ALLOWS — switching would grant access the live gate ' +
      'currently refuses. Understand every instance of this before any cutover.',
  };
}

/**
 * The query to run after shadow mode has been live for a while.
 *
 * Exported as a string so the analysis is versioned with the code that produces
 * the data, rather than living in someone's history.
 */
export const SHADOW_ANALYSIS_SQL = `
-- Custody shadow: how would switching the gate change behaviour?
--
-- Read not_comparable FIRST. A high share means nothing is presenting proofs
-- yet, so the agree/disagree numbers are drawn from a tiny sample and say
-- little. That is a fact about adoption, not about the two approaches.
select
  metadata->>'verdict'            as verdict,
  count(*)                        as observations,
  count(distinct agent_name)      as agents,
  min(created_at)                 as first_seen,
  max(created_at)                 as last_seen
from trinity_agent_logs
where action = 'custody_shadow_observation'
group by 1
order by observations desc;
`.trim();
