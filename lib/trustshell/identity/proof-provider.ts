// lib/trustshell/identity/proof-provider.ts
//
// The seam a real prover plugs into. One interface, two implementations: the
// WebCrypto one that works tonight, and the Plonky3 one that replaces it when
// task #75 unblocks cargo — without the surrounding system changing.
//
// THE HONEST DIFFERENCE BETWEEN THEM, which is the entire reason this seam
// exists and must not be smoothed over:
//
//   A commitment provider can BIND a value. It cannot HIDE one.
//
// To verify `commit-sha256:<h>` opens to repid=3723, a verifier needs the
// preimage — the value and the salt. Give it to them and they know the score.
// Withhold it and they cannot check anything. There is no third option with
// hashes alone. So `witnessHidden` is false for WebCryptoProofProvider, always,
// and no amount of wrapping changes that.
//
// A SNARK is what buys the third option: the verifier learns `repid >= 3000` is
// true and learns nothing else. That is a genuinely different capability, not a
// faster version of the same one — which is why this is an interface boundary
// rather than a config flag.
//
// This file exists because the previous version of this system erased that
// distinction: it labelled a SHA-256 of a timestamp `groth16` and published it
// on-chain. The type below makes the distinction unstateable-away — a caller
// reading `witnessHidden: false` cannot conclude the value is private.

/**
 * Mirrors `ProofSystem` in ../ZKPAttestation.ts.
 *
 * Declared here rather than imported so this layer compiles and verifies with
 * no dependency on Supabase — the identity path must work offline and at the
 * edge, and ZKPAttestation reaches a database. `check:identity` asserts the two
 * unions are identical, so the duplication cannot drift silently.
 */
export type ProofSystem = 'none' | 'groth16' | 'halo2' | 'plonky3';

/** A predicate to be proven over a witness the verifier should not learn. */
export interface PredicateStatement {
  /** `gte` is the only predicate the roadmap circuit covers today. */
  predicate: 'gte';
  /** What the verifier is allowed to learn. */
  publicInputs: Record<string, string | number | boolean>;
  /** What the verifier should NOT learn. Whether it stays hidden is per-provider. */
  privateWitness: Record<string, string | number>;
}

export interface ProofResult {
  /** True only when a prover actually ran. Gate on this, never on `commitment`. */
  proven: boolean;
  system: ProofSystem;

  /** Reproducible binding over the statement. Present for every provider. */
  commitment: string;
  /** Needed to reopen the commitment — and therefore to learn the witness. */
  salt: string;
  commitmentPreimage: string;

  /**
   * Whether the private witness stayed private from a verifier who checks this
   * result. FALSE for any commitment-only provider. A caller that needs real
   * privacy must branch on this rather than assume it.
   */
  witnessHidden: boolean;

  /** The predicate's truth value, when the provider can compute it. */
  predicateHolds: boolean;

  /** Present whenever `proven` is false: what is missing and what would fix it. */
  notProven?: string;
}

export interface IProofProvider {
  /** Stable identifier for logs and receipts: 'webcrypto-commitment', 'plonky3-sd'. */
  readonly name: string;
  readonly system: ProofSystem;
  /**
   * Whether this provider proves predicates without revealing the witness.
   *
   * The single most consequential bit in this file. It is a property of the
   * PROVIDER, mirrored onto every ProofResult it emits, so neither the
   * provider nor an individual result can claim privacy the other denies.
   */
  readonly isZeroKnowledge: boolean;
  prove(statement: PredicateStatement): Promise<ProofResult>;
  /** Recompute and check. Needs the witness for commitment-only providers. */
  verify(result: ProofResult, statement: PredicateStatement): Promise<boolean>;
}

/**
 * Works today. Binds the statement so it can be audited later, and evaluates
 * the predicate honestly — but does not hide the witness from anyone who can
 * verify it.
 */
export class WebCryptoProofProvider implements IProofProvider {
  readonly name = 'webcrypto-commitment';
  readonly system: ProofSystem = 'none';
  /**
   * False, permanently, for this implementation. Not a TODO — a hash
   * commitment cannot be made zero-knowledge by improving this class. Only a
   * different provider changes this bit.
   */
  readonly isZeroKnowledge = false;
  readonly witnessHidden = false;

  constructor(private readonly saltSource: () => string = randomSalt) {}

  async prove(statement: PredicateStatement): Promise<ProofResult> {
    const salt = this.saltSource();
    const preimage = canonicalPreimage(statement, salt);
    const predicateHolds = evaluate(statement);

    return {
      proven: false,
      system: 'none',
      commitment: `commit-sha256:${await sha256Hex(preimage)}`,
      salt,
      commitmentPreimage: PREIMAGE_LAYOUT,
      witnessHidden: false,
      predicateHolds,
      notProven:
        'no prover ran. This is a hash commitment: it binds the statement so the ' +
        'decision can be audited later, but verifying it requires the witness, so ' +
        'the witness is not private from a verifier. A Plonky3 range-check circuit ' +
        'over (value, bound) would make `predicateHolds` checkable while keeping ' +
        '`privateWitness` hidden. Blocked: cargo cannot fetch crates (task #75).',
    };
  }

  async verify(result: ProofResult, statement: PredicateStatement): Promise<boolean> {
    const preimage = canonicalPreimage(statement, result.salt);
    if (result.commitment !== `commit-sha256:${await sha256Hex(preimage)}`) return false;
    // Recompute rather than trusting the transmitted flag: a result whose
    // commitment opens correctly but whose predicate was flipped in transit
    // would otherwise verify.
    return result.predicateHolds === evaluate(statement);
  }
}

const PREIMAGE_LAYOUT = 'predicate|publicInputs(sorted k=v;)|privateWitness(sorted k=v;)|salt';

/**
 * Canonical, order-independent encoding. Object key order is not guaranteed
 * across a JSON round trip, so a preimage built from insertion order would fail
 * to reopen after transport — a commitment that cannot be reopened is the exact
 * defect ZKPAttestation was fixed for.
 */
function canonicalPreimage(statement: PredicateStatement, salt: string): string {
  const enc = (o: Record<string, string | number | boolean>) =>
    Object.keys(o)
      .sort()
      .map((k) => `${k}=${String(o[k])}`)
      .join(';');
  return [statement.predicate, enc(statement.publicInputs), enc(statement.privateWitness), salt].join('|');
}

/**
 * Evaluate the predicate. Named inputs are required — positional ones would let
 * a caller silently compare the wrong pair.
 */
function evaluate(statement: PredicateStatement): boolean {
  if (statement.predicate !== 'gte') {
    throw new Error(`unsupported predicate '${statement.predicate}'`);
  }
  const value = statement.privateWitness.value;
  const bound = statement.publicInputs.bound;
  if (typeof value !== 'number' || typeof bound !== 'number') {
    throw new Error(
      `gte needs numeric privateWitness.value and publicInputs.bound, got ` +
        `${typeof value} and ${typeof bound}`
    );
  }
  return value >= bound;
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
