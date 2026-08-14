// lib/trustshell/identity/disclosure.ts
//
// Selective disclosure over a credential's claims, via a salted Merkle tree.
// The holder reveals SOME claims and proves they belong to the same credential
// the issuer signed, without handing over the rest.
//
// WHAT THIS IS AND IS NOT. This is the same mechanism SD-JWT and several W3C VC
// profiles use, and it is genuinely selective disclosure. It is NOT zero
// knowledge: a disclosed claim is revealed in full to the verifier. Proving a
// PREDICATE over a hidden value — "repid >= threshold" without revealing repid
// — needs a circuit, and that is the Plonky3 work blocked by task #75. The two
// are different capabilities and this file must never be described as the
// second one. `linking-proof.ts` encodes the distinction in its result type.
//
// THE SALT IS NOT DECORATION. Without a per-claim salt, an undisclosed claim is
// recoverable by brute force whenever its value is low-entropy — and real
// credential claims are exactly that: `country=US`, `tier=Silver`, `age=35`.
// An attacker holding only the Merkle root hashes every candidate value and
// compares. A fresh 16-byte salt per claim makes each leaf preimage
// unguessable, so withholding a claim actually withholds it. Salts for
// undisclosed claims are never serialized (see `toDisclosure`).
//
// DOMAIN SEPARATION. Leaves are hashed with a 0x00 prefix and internal nodes
// with 0x01 (the RFC 6962 construction). Without it, an internal node's hash
// could be presented as a leaf, letting a holder "prove" a claim the issuer
// never made. Odd nodes are carried up unchanged rather than duplicated;
// duplicating the last node makes two different trees share a root.

const LEAF_PREFIX = 0x00;
const NODE_PREFIX = 0x01;

/**
 * The hash a credential was built with, carried ON THE WIRE.
 *
 * Added after a parallel implementation of this same layer chose Poseidon2
 * while this one uses SHA-256. Without an algorithm tag the two produce
 * different roots from identical claims and neither can say why — the
 * disclosure simply "does not verify", which reads as tampering. An explicit
 * tag turns a silent mismatch into a named one.
 *
 * Poseidon2 is likely the right long-run choice here: the stated endpoint is a
 * Plonky3 circuit over these commitments, and SHA-256 inside an arithmetic
 * circuit costs orders of magnitude more constraints than a ZK-friendly sponge.
 * That migration needs the other implementation's exact parameters and test
 * vectors, so it is deliberately not guessed at here. The seam is what this
 * commit buys; the swap is a separate, evidenced change.
 */
export type MerkleAlg = 'sha256-us-v1' | 'poseidon2-v1';

export const DEFAULT_ALG: MerkleAlg = 'sha256-us-v1';

/**
 * Pluggable so the hash can change without reshaping the tree logic.
 *
 * Deliberately NOT a byte-oriented `(bytes) => bytes`: Poseidon2 consumes field
 * elements, not octets, so a byte interface would force an encoding decision
 * into the wrong layer and quietly fix the format to a hash family.
 */
export interface MerkleHasher {
  readonly alg: MerkleAlg;
  leaf(parts: string[]): Promise<string>;
  node(left: string, right: string): Promise<string>;
}

export interface Claim {
  key: string;
  value: string | number | boolean;
}

interface SaltedClaim extends Claim {
  salt: string;
}

/** What the holder keeps. Contains every salt, so it is secret material. */
export interface DisclosableCredential {
  alg: MerkleAlg;
  root: string;
  claims: SaltedClaim[];
}

/** One revealed claim plus the path proving it is in the tree. */
export interface DisclosedClaim {
  key: string;
  value: string | number | boolean;
  salt: string;
  /** Sibling hashes, leaf-to-root. `left` says which side the sibling is on. */
  path: Array<{ hash: string; left: boolean }>;
}

/** What the holder sends. Undisclosed claims appear only as a count. */
export interface Disclosure {
  /** Which hash produced `root`. A verifier MUST check this before hashing. */
  alg: MerkleAlg;
  root: string;
  disclosed: DisclosedClaim[];
  /**
   * How many claims exist in total. Revealed so a verifier can see that claims
   * were withheld at all — a disclosure that hid the fact it was partial would
   * let a holder present a 1-claim view as the whole credential.
   */
  totalClaims: number;
}

export async function buildCredential(
  claims: Claim[],
  hasher: MerkleHasher = sha256Hasher
): Promise<DisclosableCredential> {
  if (claims.length === 0) {
    throw new Error('a credential needs at least one claim');
  }
  const seen = new Set<string>();
  for (const c of claims) {
    if (seen.has(c.key)) {
      // Duplicate keys would make disclosure ambiguous: two leaves, same key,
      // different values, and the verifier cannot tell which the issuer meant.
      throw new Error(`duplicate claim key '${c.key}'`);
    }
    seen.add(c.key);
  }
  const salted: SaltedClaim[] = claims.map((c) => ({ ...c, salt: randomSalt() }));
  const leaves = await Promise.all(salted.map((c) => leafHash(c, hasher)));
  return { alg: hasher.alg, root: await merkleRoot(leaves, hasher), claims: salted };
}

/** Produce a disclosure revealing only `keys`. */
export async function toDisclosure(
  credential: DisclosableCredential,
  keys: string[],
  hasher: MerkleHasher = sha256Hasher
): Promise<Disclosure> {
  if (credential.alg !== hasher.alg) {
    throw new Error(
      `credential was built with '${credential.alg}' but disclosure was asked for ` +
        `'${hasher.alg}'. Re-hashing under a different algorithm would produce a ` +
        `root the issuer never signed.`
    );
  }
  const leaves = await Promise.all(credential.claims.map((c) => leafHash(c, hasher)));
  const disclosed: DisclosedClaim[] = [];

  for (const key of keys) {
    const index = credential.claims.findIndex((c) => c.key === key);
    if (index === -1) {
      throw new Error(
        `cannot disclose '${key}': not in this credential. Silently skipping it ` +
          `would produce a disclosure missing a claim the caller believes it made.`
      );
    }
    const claim = credential.claims[index];
    disclosed.push({
      key: claim.key,
      value: claim.value,
      salt: claim.salt,
      path: await merklePath(leaves, index, hasher),
    });
  }

  // Note what is NOT here: the salts of undisclosed claims. Including them would
  // hand the verifier every leaf preimage and undo the whole mechanism.
  return { alg: credential.alg, root: credential.root, disclosed, totalClaims: credential.claims.length };
}

/**
 * Verify every disclosed claim against the root.
 *
 * Returns the verified claims rather than a bare boolean, so a caller cannot
 * check the signature and then read the values from somewhere else — the only
 * values it gets back are the ones that actually verified.
 */
export async function verifyDisclosure(
  disclosure: Disclosure,
  hashers: MerkleHasher[] = [sha256Hasher]
): Promise<{ valid: boolean; claims: Record<string, string | number | boolean>; reason?: string }> {
  const claims: Record<string, string | number | boolean> = {};

  // Resolve the algorithm BEFORE hashing anything. An unknown alg must be a
  // named refusal, not a hash mismatch — otherwise an implementation this
  // verifier simply does not support is indistinguishable from a forgery.
  const hasher = hashers.find((h) => h.alg === disclosure.alg);
  if (!hasher) {
    return {
      valid: false,
      claims: {},
      reason:
        `unsupported hash '${disclosure.alg}'; this verifier supports ` +
        `[${hashers.map((h) => h.alg).join(', ')}]. Refusing rather than ` +
        `re-hashing under an algorithm the issuer did not use.`,
    };
  }

  if (disclosure.disclosed.length > disclosure.totalClaims) {
    return {
      valid: false,
      claims: {},
      reason: `disclosed ${disclosure.disclosed.length} claims but credential has ${disclosure.totalClaims}`,
    };
  }

  const seen = new Set<string>();
  for (const d of disclosure.disclosed) {
    if (seen.has(d.key)) {
      return { valid: false, claims: {}, reason: `claim '${d.key}' disclosed twice` };
    }
    seen.add(d.key);

    let hash = await leafHash(d, hasher);
    for (const step of d.path) {
      hash = step.left
        ? await hasher.node(step.hash, hash)
        : await hasher.node(hash, step.hash);
    }
    if (hash !== disclosure.root) {
      return {
        valid: false,
        claims: {},
        reason: `claim '${d.key}' does not verify against the root`,
      };
    }
    claims[d.key] = d.value;
  }

  return { valid: true, claims };
}

// --- Merkle internals -------------------------------------------------------
// Hand-rolled rather than merkletreejs because that library needs a SYNCHRONOUS
// hash, which would mean node:crypto and would stop this verifying in an edge
// runtime or a browser. WebCrypto is async-only, so the tree is async.

/**
 * ASCII Unit Separator. Written as an escape so it is visible in source and the
 * file stays plain text — an earlier revision of this line carried a literal
 * control byte, which made the file read as binary to grep and, worse, made the
 * wire format impossible to read off the source correctly.
 *
 * WHY NOT A SPACE. Field separators must not be able to occur inside a field,
 * or two different claims encode to the same bytes: with a space,
 * `{key: 'a b', value: 'c'}` and `{key: 'a', value: 'b c'}` produce an
 * identical preimage and therefore an identical leaf. Claim keys and values are
 * arbitrary caller-supplied strings, so a space is not safe. 0x1F cannot appear
 * in a DID, a JSON-sourced key, or any realistic claim value.
 */
const FIELD_SEP = '\u001f';

/** The default: SHA-256 with RFC 6962 prefixes and a U+001F field separator. */
export const sha256Hasher: MerkleHasher = {
  alg: 'sha256-us-v1',
  async leaf(parts: string[]): Promise<string> {
    return sha256Prefixed(LEAF_PREFIX, new TextEncoder().encode(parts.join(FIELD_SEP)));
  },
  async node(left: string, right: string): Promise<string> {
    return sha256Prefixed(NODE_PREFIX, new TextEncoder().encode(`${left}${right}`));
  },
};

async function leafHash(
  c: SaltedClaim | DisclosedClaim,
  hasher: MerkleHasher
): Promise<string> {
  // Type-tagged so 1 and "1" cannot collide into the same leaf.
  return hasher.leaf([c.key, typeof c.value, String(c.value), c.salt]);
}

async function merkleRoot(leaves: string[], hasher: MerkleHasher): Promise<string> {
  let level = leaves;
  while (level.length > 1) level = await nextLevel(level, hasher);
  return level[0];
}

async function nextLevel(level: string[], hasher: MerkleHasher): Promise<string[]> {
  const next: string[] = [];
  for (let i = 0; i < level.length; i += 2) {
    // Odd node carried up unchanged, not duplicated.
    next.push(i + 1 < level.length ? await hasher.node(level[i], level[i + 1]) : level[i]);
  }
  return next;
}

async function merklePath(
  leaves: string[],
  index: number,
  hasher: MerkleHasher
): Promise<Array<{ hash: string; left: boolean }>> {
  const path: Array<{ hash: string; left: boolean }> = [];
  let level = leaves;
  let idx = index;
  while (level.length > 1) {
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    if (siblingIdx < level.length) {
      path.push({ hash: level[siblingIdx], left: isRight });
    }
    // else: this node was carried up alone, so there is no sibling to record.
    level = await nextLevel(level, hasher);
    idx = Math.floor(idx / 2);
  }
  return path;
}

async function sha256Prefixed(prefix: number, data: Uint8Array): Promise<string> {
  const buf = new Uint8Array(data.length + 1);
  buf[0] = prefix;
  buf.set(data, 1);
  const digest = await crypto.subtle.digest('SHA-256', buf.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
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
