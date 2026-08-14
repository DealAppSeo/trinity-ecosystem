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
