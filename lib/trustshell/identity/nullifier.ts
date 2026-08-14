// lib/trustshell/identity/nullifier.ts
//
// The statement/witness contract for the nullifier ↔ commitment circuit.
//
// THIS FILE OWNS THE SHAPE. It does not own the hash. The Plonky3 circuit lives
// in the lane with a working cargo toolchain; this side defines exactly what
// that circuit must prove, so both implementations are writing against one
// written contract instead of two compatible-looking guesses.
//
// WHAT THE CIRCUIT PROVES
//
//   public:  commitment, nullifier, domain, scope
//   private: secret
//
//   commitment = H(tagCommit    ‖ secret)
//   nullifier  = H(tagNullifier ‖ secret ‖ domain ‖ scope)
//
// A verifier learns that ONE secret produced both values, without learning the
// secret. Different (domain, scope) pairs yield unlinkable nullifiers, so a
// commitment can be published once and used across contexts without becoming a
// correlation handle.
//
// WHY THIS SITS ALONGSIDE ControlProof RATHER THAN REPLACING IT.
// They answer different questions and neither subsumes the other:
//
//   ControlProof  — WHO authorized WHAT, legibly. Revocable, auditable,
//                   capability-attenuated, expires. A human can read it.
//   this binding  — that the presenter privately CONTROLS the identity, without
//                   revealing which identity it is.
//
// A signed grant cannot be unlinkable: the signature names the signer. A
// nullifier cannot express "may spend up to X USDC until Tuesday". Keeping both
// is the design, not indecision.
//
// TWO LEVELS OF ASSURANCE, NEVER CONFLATED:
//
//   recomputed  — the verifier holds the secret and recomputes both values.
//                 Real evidence, but the secret is disclosed, so it only works
//                 where the verifier is already trusted with it. This is
//                 "honest-prover binding".
//   proven      — a circuit checked the relations with the secret hidden. This
//                 is the actual identity proof, and it needs the Plonky3 side.
//
// `BindingVerification.provenWithoutSecret` is the bit that separates them, and
// it is false for every scheme in this file today.

/**
 * Identifies a parameter set, not just a hash family.
 *
 * "poseidon2" alone is not enough to interoperate: field, width, round counts,
 * S-box degree, round constants and the MDS/internal matrix all change the
 * output. Two implementations both correctly named "poseidon2" will disagree.
 * The tag therefore names a SET, and an unknown one is refused rather than
 * approximated.
 */
export type BindingScheme = 'poseidon2-v1-PENDING-PARAMETERS';

/** Domain separation tags. Distinct so a commitment can never read as a nullifier. */
export const BINDING_TAGS = {
  commit: 'zkrepid:commit:v1',
  nullifier: 'zkrepid:nullifier:v1',
} as const;

export interface BindingStatement {
  scheme: BindingScheme;
  /** What the verifier is allowed to learn. */
  publicInputs: {
    commitment: string;
    nullifier: string;
    /** Application/domain separator for this authorization context. */
    domain: string;
    /** The specific scope, e.g. `ownership:<agentId>`. */
    scope: string;
    tagCommit: string;
    tagNullifier: string;
  };
  /** Never serialized into anything a verifier receives. */
  privateWitness: { secret: string };
}

/**
 * The scheme interface. One implementation per parameter set.
 *
 * `parametersKnown` exists so a caller can branch on availability rather than
 * discovering it by catching an exception — the same reason `IProofProvider`
 * exposes `isZeroKnowledge` instead of leaving privacy implicit.
 */
export interface IBindingScheme {
  readonly scheme: BindingScheme;
  readonly parametersKnown: boolean;
  commit(secret: string): Promise<string>;
  nullify(secret: string, domain: string, scope: string): Promise<string>;
}

/**
 * Placeholder for Poseidon2 that REFUSES TO COMPUTE.
 *
 * This is the whole point of it. An implementation with invented parameters
 * would produce plausible field elements, pass its own round-trip tests, and
 * agree with no other implementation on earth — and nothing downstream would
 * notice until two systems compared roots in production. That failure is
 * expensive and silent, so this class throws instead, naming exactly what is
 * missing.
 *
 * It is the same discipline as `proven: false` on ZKPAttestation: a component
 * that cannot do the job says so rather than emitting something shaped like an
 * answer.
 */
export class PendingPoseidon2Scheme implements IBindingScheme {
  readonly scheme: BindingScheme = 'poseidon2-v1-PENDING-PARAMETERS';
  readonly parametersKnown = false;

  async commit(): Promise<string> {
    throw new Error(MISSING_PARAMETERS);
  }
  async nullify(): Promise<string> {
    throw new Error(MISSING_PARAMETERS);
  }
}

export const MISSING_PARAMETERS =
  'Poseidon2 parameters are not available in this lane, and inventing them is ' +
  'refused: a guessed parameter set produces values that look correct, pass ' +
  'their own tests, and agree with no other implementation. Required from the ' +
  'lane with a working Plonky3 build — field, width (t), full/partial round ' +
  'counts, S-box degree, round constants, MDS/internal matrix, sponge ' +
  'absorption order and padding, and at least 3 input/output test vectors. ' +
  'See docs/POSEIDON2-PARAMETER-REQUEST.md.';

/** Build the statement. Requires a scheme that can actually compute. */
export async function buildBindingStatement(input: {
  secret: string;
  domain: string;
  scope: string;
  scheme: IBindingScheme;
}): Promise<BindingStatement> {
  if (!input.secret) throw new Error('secret is required');
  if (!input.domain) throw new Error('domain is required — it separates authorization contexts');
  if (!input.scope) throw new Error('scope is required — it is what makes nullifiers unlinkable');

  return {
    scheme: input.scheme.scheme,
    publicInputs: {
      commitment: await input.scheme.commit(input.secret),
      nullifier: await input.scheme.nullify(input.secret, input.domain, input.scope),
      domain: input.domain,
      scope: input.scope,
      tagCommit: BINDING_TAGS.commit,
      tagNullifier: BINDING_TAGS.nullifier,
    },
    privateWitness: { secret: input.secret },
  };
}

export interface BindingVerification {
  valid: boolean;
  /**
   * FALSE whenever the check required the secret.
   *
   * Gate on this, never on `valid`. A recomputation is real evidence that one
   * secret produced both values — but the verifier had to be handed the secret
   * to get it, so it proves nothing to anyone who should not see it.
   */
  provenWithoutSecret: boolean;
  reason: string;
}

/**
 * Recompute both relations from the witness.
 *
 * Honest-prover binding: available today, and genuinely useful where the
 * verifier legitimately holds the secret. It is NOT the identity proof, and
 * the return type refuses to let a caller pretend otherwise.
 */
export async function verifyBindingByRecomputation(
  statement: BindingStatement,
  scheme: IBindingScheme
): Promise<BindingVerification> {
  if (statement.scheme !== scheme.scheme) {
    return {
      valid: false,
      provenWithoutSecret: false,
      reason: `statement uses '${statement.scheme}' but the supplied scheme is '${scheme.scheme}'`,
    };
  }

  const commitment = await scheme.commit(statement.privateWitness.secret);
  const nullifier = await scheme.nullify(
    statement.privateWitness.secret,
    statement.publicInputs.domain,
    statement.publicInputs.scope
  );

  if (commitment !== statement.publicInputs.commitment) {
    return { valid: false, provenWithoutSecret: false, reason: 'commitment does not reopen' };
  }
  if (nullifier !== statement.publicInputs.nullifier) {
    return { valid: false, provenWithoutSecret: false, reason: 'nullifier does not reopen' };
  }

  return {
    valid: true,
    provenWithoutSecret: false,
    reason:
      'both relations recomputed from the witness. This required the secret, so ' +
      'it is honest-prover binding, not a zero-knowledge identity proof — the ' +
      'circuit is what removes the secret from the verifier.',
  };
}

/**
 * The exact obligations the Plonky3 circuit must discharge.
 *
 * Written as data rather than prose so both lanes can assert against the same
 * list, and so a circuit that silently drops one is detectable.
 */
export const CIRCUIT_CONTRACT = {
  version: 'zkrepid-binding-v1',
  publicInputs: ['commitment', 'nullifier', 'domain', 'scope', 'tagCommit', 'tagNullifier'],
  privateWitness: ['secret'],
  relations: [
    'commitment == H(tagCommit || secret)',
    'nullifier  == H(tagNullifier || secret || domain || scope)',
  ],
  /**
   * Properties a reviewer should check the circuit actually has, not just that
   * it produces a proof. Each is a way the circuit can be "working" and wrong.
   */
  mustAlsoHold: [
    'the same secret is used in BOTH relations — two independent secrets would ' +
      'satisfy each relation separately and prove nothing about their linkage',
    'domain and scope are PUBLIC inputs, not witness — as witness, a prover ' +
      'could choose them after seeing the challenge and forge unlinkability',
    'the tags are distinct and constrained, so a commitment cannot be replayed ' +
      'as a nullifier for some (domain, scope)',
    'the absorption order is fixed and constrained, not merely conventional — ' +
      'a permuted order is a different function that still verifies internally',
  ],
} as const;
