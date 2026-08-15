// lib/trustshell/receipt/canonical.ts — deterministic serialisation and hashing.
//
// M2's acceptance criterion is that `auditHash` is stable across re-runs of the
// same transcript. That reduces to one property: the same logical value must
// always produce the same bytes. `JSON.stringify` does not give that — key order
// follows insertion order, so two structurally identical objects built by
// different code paths serialise differently and hash differently.
//
// WHY NOT THE PIPE LAYOUT USED BY identity/control-proof.ts. `grantPayload`
// joins a fixed, flat field list with `|`. That is the right shape for ten
// scalar fields and the wrong shape here: the receipt core is nested, holds
// arrays of objects, and will grow. A pipe layout over that becomes an unwritten
// schema, and a field added in the middle silently reinterprets every older
// signature. Sorted-key canonical JSON keeps the mapping mechanical, and
// `schemaVersion` inside the hashed region carries the versioning the domain tag
// carries there.
//
// REJECT RATHER THAN COERCE. Every function below throws on input it cannot
// serialise deterministically — `undefined`, `NaN`, `Infinity`, a Date, a Map, a
// function. Silently dropping an `undefined` field is how a receipt ends up
// hashing a shape nobody wrote down, and this repo's whole failure mode is a
// system reporting success over something it did not actually handle.

/**
 * Deterministic JSON: keys sorted by code unit, no insignificant whitespace.
 *
 * Not RFC 8785 — that specifies a number canonicalisation this does not need,
 * because every number in a receipt is a non-negative integer count or a ratio
 * produced by one code path. Numbers are rejected unless finite; the ratio is
 * rounded at construction, not here.
 */
export function canonicalJson(value: unknown, path = '$'): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);

    case 'boolean':
      return value ? 'true' : 'false';

    case 'number':
      if (!Number.isFinite(value)) {
        throw new Error(
          `canonicalJson: ${path} is ${String(value)}. A non-finite number has no ` +
            'stable serialisation; fix it at the source rather than encoding it.'
        );
      }
      // -0 and 0 are the same value but stringify differently. Normalise, or two
      // runs that differ only in sign-of-zero produce two different hashes.
      return Object.is(value, -0) ? '0' : JSON.stringify(value);

    case 'undefined':
      throw new Error(
        `canonicalJson: ${path} is undefined. Use null for "absent" — dropping the ` +
          'key would make two different shapes hash identically.'
      );

    case 'bigint':
    case 'function':
    case 'symbol':
      throw new Error(`canonicalJson: ${path} is a ${typeof value}, which is not serialisable.`);
  }

  if (Array.isArray(value)) {
    // Array order is significant and preserved. Callers that need order not to
    // matter must sort before calling — doing it here would silently reorder a
    // list whose order was meaningful.
    return `[${value.map((v, i) => canonicalJson(v, `${path}[${i}]`)).join(',')}]`;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new Error(
      `canonicalJson: ${path} is a ${value.constructor?.name ?? 'non-plain object'}. ` +
        'Dates, Maps and class instances each have more than one reasonable encoding; ' +
        'convert to a plain value at the call site so the choice is visible.'
    );
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k], `${path}.${k}`)}`);
  return `{${parts.join(',')}}`;
}

/** sha256 hex. WebCrypto, so this runs unchanged in Node and in a browser. */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * RFC 4648 base32 without padding, lowercased.
 *
 * Used for the receipt id, where the point is a short token a human can read
 * aloud and type. Hex would need 26 characters to carry what 16 base32
 * characters do.
 */
export function base32(bytes: Uint8Array): string {
  const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(acc << (5 - bits)) & 31];
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * `ts_` + the first 16 base32 characters of the audit hash — 80 bits.
 *
 * Truncation is deliberate and its consequence is stated: this id is an
 * ADDRESS, not the integrity check. Anything verifying a receipt compares the
 * full `auditHash`, never the id. Two receipts with identical cores share an id
 * because they are the same receipt.
 */
export function receiptIdFromAuditHash(auditHash: string): string {
  return `ts_${base32(hexToBytes(auditHash)).slice(0, 16)}`;
}
