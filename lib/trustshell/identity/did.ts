// lib/trustshell/identity/did.ts
//
// did:key — a DID you can resolve with no network, no registry, and no vendor.
// The public key IS the identifier, so verification is pure local computation.
// That is the property the no-lock-in requirement actually needs: an identity
// that keeps working when every service in this repo is switched off.
//
// WHY did:key AND NOT did:web. did:web resolves over HTTPS against a domain you
// control, which reintroduces exactly the dependency we are trying to remove —
// the identity stops verifying when DNS, TLS or the host does. did:key cannot
// be revoked for the same reason it cannot be censored; revocation belongs in
// the authorization layer (see linking-proof.ts), not the identifier.
//
// PORTABILITY. Everything here runs on WebCrypto, not node:crypto, so the same
// code verifies in a browser, a Cloudflare/Vercel edge runtime and Node >= 22.
// Ed25519 in WebCrypto is the reason the engines floor is 22 — see package.json.

import bs58 from 'bs58';

/**
 * Multicodec prefix for an Ed25519 public key: varint 0xed 0x01.
 * This is what makes a did:key self-describing — a resolver reads the prefix to
 * learn the key type instead of being told out of band.
 */
const ED25519_MULTICODEC = new Uint8Array([0xed, 0x01]);

/** did:key uses base58btc, whose multibase prefix is 'z'. */
const MULTIBASE_BASE58BTC = 'z';

export type Did = string;

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------
//
// WHY THIS IS A FUNCTION AND NOT `a === b`. Every place in this system that
// enforces `checker_must_not_be_doer` does it by comparing two DIDs, which
// makes a string comparison the whole of a constitutional invariant. It was
// written inline nine times, and mutation testing found the same one-character
// bypass — a DID with a trailing space is not equal to itself — in FOUR of
// them, on four separate days. Each was fixed locally. The fifth was going to
// happen too.
//
// The other half is subtler and had no bug yet only because every caller
// happened to guard for it: **two ABSENT DIDs must not compare equal, and must
// not compare unequal either.** `undefined === undefined` is true, so a naive
// check turns "neither party identified itself" into "they are the same
// identity" — a spurious constitutional violation. Flipping it to `!==` turns
// the same input into "they are provably different", which certifies
// independence on no evidence. Both readings are wrong, which is why the
// primitive below has three outcomes rather than two.

/**
 * What a DID comparison can conclude.
 *
 * `indeterminate` is the load-bearing one, and it is not a nicety: it is the
 * only honest answer when a DID is missing, and neither boolean is safe to
 * substitute for it.
 */
export type DidComparison = 'same' | 'different' | 'indeterminate';

/**
 * Normalize for comparison.
 *
 * Trim only. **Case is NOT folded**: `did:key` is base58btc, which is
 * case-sensitive, so two DIDs differing in case are two different keys and
 * folding them would silently merge distinct identities — the exact opposite of
 * this module's job. No Unicode normalization either: a valid did:key is ASCII,
 * where NFC is a no-op, so it would buy nothing on well-formed input while
 * potentially merging malformed input that ought to stay distinct.
 */
function normalizeDid(did: string | undefined | null): string | null {
  if (typeof did !== 'string') return null;
  const trimmed = did.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Compare two DIDs, with an explicit third outcome for "cannot tell".
 *
 * Use this when the question is *"are these independent?"* — where an unknown
 * must stay unknown. Use `sameDid` when the question is *"must I refuse?"*.
 */
export function compareDids(a: string | undefined | null, b: string | undefined | null): DidComparison {
  const left = normalizeDid(a);
  const right = normalizeDid(b);
  if (left === null || right === null) return 'indeterminate';
  return left === right ? 'same' : 'different';
}

/**
 * Are these certainly the same identity?
 *
 * FALSE WHEN EITHER IS ABSENT, which is the safe polarity for the way this is
 * actually used: every caller asks it in order to REFUSE something. Returning
 * true on absent DIDs would refuse legitimate work; the residual risk — failing
 * to refuse when identity is unknown — belongs to `compareDids`, whose
 * `indeterminate` the caller must then handle rather than coerce.
 *
 * Never write `!sameDid(a, b)` to mean "different". Absent is not different,
 * and that expression is exactly how an unknown becomes a certified
 * independence claim.
 */
export function sameDid(a: string | undefined | null, b: string | undefined | null): boolean {
  return compareDids(a, b) === 'same';
}

export interface KeyPair {
  did: Did;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

/**
 * Generate a fresh Ed25519 identity.
 *
 * `extractable` is true on the public key only. The private key is deliberately
 * NOT extractable by default: a key that cannot be exported cannot be logged,
 * serialized into a memory record, or shipped to a provider by accident. Callers
 * that genuinely need to persist a private key must ask for it explicitly via
 * `generateExportableKeyPair`, so that decision shows up in a diff.
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const kp = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  return finishKeyPair(kp);
}

/** As above, but the private key can be exported. Use only when persisting. */
export async function generateExportableKeyPair(): Promise<KeyPair> {
  const kp = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  return finishKeyPair(kp);
}

/**
 * DER prefix for a PKCS#8-wrapped Ed25519 private key, per RFC 8410 §7.
 *
 *   30 2e             SEQUENCE (46 bytes)
 *     02 01 00        INTEGER 0                      -- version
 *     30 05           SEQUENCE (5 bytes)             -- AlgorithmIdentifier
 *       06 03 2b6570  OID 1.3.101.112                -- id-Ed25519
 *     04 22           OCTET STRING (34 bytes)        -- PrivateKey
 *       04 20         OCTET STRING (32 bytes)        -- CurvePrivateKey
 *
 * WebCrypto will not import a bare 32-byte Ed25519 seed — 'raw' is public-key
 * only — so a stored seed has to be wrapped before it can be used. The bytes are
 * fixed for every Ed25519 key, which is why this is a constant rather than a DER
 * encoder.
 */
const PKCS8_ED25519_PREFIX = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

/**
 * Rebuild a key pair from a stored 32-byte seed, bs58-encoded.
 *
 * This is what per-developer key custody needs: a receipt signed today must be
 * signable by the same identity next week, which means the key has to come from
 * somewhere durable rather than being generated per run.
 *
 * The seed is the private key. Anything that can read it can sign as this
 * identity, so it belongs in a secret store or an environment variable that is
 * not committed — never in a repo, and never in a receipt.
 */
export async function keyPairFromSeed(seedBs58: string): Promise<KeyPair> {
  let seed: Uint8Array;
  try {
    seed = bs58.decode(seedBs58);
  } catch {
    throw new Error('Ed25519 seed is not valid base58.');
  }
  if (seed.length !== 32) {
    // A 64-byte value is the common mistake: some libraries call the
    // seed-plus-public-key concatenation "the private key". Say so, because the
    // wrong half silently produces a different identity.
    throw new Error(
      `Ed25519 seed must be 32 bytes, got ${seed.length}. If you have 64, that is ` +
        'the seed concatenated with the public key — pass the first 32 bytes.'
    );
  }

  const pkcs8 = new Uint8Array(PKCS8_ED25519_PREFIX.length + 32);
  pkcs8.set(PKCS8_ED25519_PREFIX, 0);
  pkcs8.set(seed, PKCS8_ED25519_PREFIX.length);

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8.slice().buffer as ArrayBuffer,
    { name: 'Ed25519' },
    false,
    ['sign']
  );

  // WebCrypto cannot derive the public key from a private one, and there is no
  // portable Ed25519 scalar multiplication here. Recover it by signing a fixed
  // probe and testing candidate keys is not viable either — so instead, derive
  // it the only way WebCrypto allows: import the seed as a JWK with `d` set and
  // let the implementation compute `x`.
  const jwk = await crypto.subtle.exportKey('jwk', await importSeedAsJwkPrivate(seed));
  if (typeof jwk.x !== 'string') {
    throw new Error('WebCrypto did not return a public component for this seed.');
  }
  const raw = base64UrlToBytes(jwk.x);

  const publicKey = await crypto.subtle.importKey(
    'raw',
    raw.slice().buffer as ArrayBuffer,
    { name: 'Ed25519' },
    true,
    ['verify']
  );

  return { did: didFromPublicKeyBytes(raw), publicKey, privateKey };
}

/** Import the seed as an extractable JWK purely to read back the public `x`. */
async function importSeedAsJwkPrivate(seed: Uint8Array): Promise<CryptoKey> {
  const pkcs8 = new Uint8Array(PKCS8_ED25519_PREFIX.length + 32);
  pkcs8.set(PKCS8_ED25519_PREFIX, 0);
  pkcs8.set(seed, PKCS8_ED25519_PREFIX.length);
  return crypto.subtle.importKey(
    'pkcs8',
    pkcs8.slice().buffer as ArrayBuffer,
    { name: 'Ed25519' },
    true,
    ['sign']
  );
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function finishKeyPair(kp: CryptoKeyPair): Promise<KeyPair> {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  return {
    did: didFromPublicKeyBytes(raw),
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
  };
}

/** Encode raw 32-byte Ed25519 public key bytes as a did:key string. */
export function didFromPublicKeyBytes(raw: Uint8Array): Did {
  if (raw.length !== 32) {
    throw new Error(
      `Ed25519 public key must be 32 bytes, got ${raw.length}. A wrong-length ` +
        `key would still encode to a plausible-looking did:key, so this throws ` +
        `rather than producing an identifier that can never verify.`
    );
  }
  const prefixed = new Uint8Array(ED25519_MULTICODEC.length + raw.length);
  prefixed.set(ED25519_MULTICODEC, 0);
  prefixed.set(raw, ED25519_MULTICODEC.length);
  return `did:key:${MULTIBASE_BASE58BTC}${bs58.encode(prefixed)}`;
}

/**
 * Recover the raw public key from a did:key. This is the whole point of the
 * method: verification needs no resolver, no cache and no network.
 *
 * Throws on anything malformed rather than returning null — a caller that
 * silently treats an unparseable DID as "no key" would skip signature
 * verification entirely, which is the failure mode this repo keeps finding.
 */
export function publicKeyBytesFromDid(did: Did): Uint8Array {
  if (!did.startsWith('did:key:')) {
    throw new Error(`not a did:key: ${did}`);
  }
  const multibase = did.slice('did:key:'.length);
  if (!multibase.startsWith(MULTIBASE_BASE58BTC)) {
    throw new Error(
      `did:key must be base58btc (multibase prefix 'z'), got '${multibase[0] ?? ''}'`
    );
  }
  const decoded = bs58.decode(multibase.slice(1));
  if (
    decoded.length !== ED25519_MULTICODEC.length + 32 ||
    decoded[0] !== ED25519_MULTICODEC[0] ||
    decoded[1] !== ED25519_MULTICODEC[1]
  ) {
    throw new Error(
      `did:key is not an Ed25519 key (expected multicodec 0xed01 and 34 bytes, ` +
        `got 0x${decoded[0]?.toString(16)}${decoded[1]?.toString(16)} and ${decoded.length})`
    );
  }
  return decoded.slice(ED25519_MULTICODEC.length);
}

/** Import a did:key as a WebCrypto verify key. Pure local computation. */
export async function verifyKeyFromDid(did: Did): Promise<CryptoKey> {
  const raw = publicKeyBytesFromDid(did);
  return crypto.subtle.importKey(
    'raw',
    // BufferSource: copy into a fresh ArrayBuffer so callers cannot mutate it.
    raw.slice().buffer as ArrayBuffer,
    { name: 'Ed25519' },
    true,
    ['verify']
  );
}

export async function sign(privateKey: CryptoKey, payload: string): Promise<string> {
  const sig = await crypto.subtle.sign(
    { name: 'Ed25519' },
    privateKey,
    new TextEncoder().encode(payload)
  );
  return bs58.encode(new Uint8Array(sig));
}

/**
 * Verify a signature against the key embedded in the DID itself.
 *
 * Returns false rather than throwing on a bad signature, because a failed
 * verification is a normal outcome. It DOES throw on a malformed DID, which is
 * a caller bug — conflating the two would let a typo read as "not authorized"
 * and hide the real problem.
 */
export async function verify(did: Did, payload: string, signature: string): Promise<boolean> {
  const key = await verifyKeyFromDid(did);
  let sigBytes: Uint8Array;
  try {
    sigBytes = bs58.decode(signature);
  } catch {
    return false;
  }
  if (sigBytes.length !== 64) return false;
  return crypto.subtle.verify(
    { name: 'Ed25519' },
    key,
    sigBytes.slice().buffer as ArrayBuffer,
    new TextEncoder().encode(payload)
  );
}
