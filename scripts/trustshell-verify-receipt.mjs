#!/usr/bin/env node
//
// trustshell-verify-receipt.mjs — INDEPENDENT verification of a session receipt.
//
//   node scripts/trustshell-verify-receipt.mjs <receipt.json> [<session.jsonl>]
//
// TrustShell M3. §8: "The receipt is worthless if only TrustShell can check it."
//
// ============================================================================
// WHY THIS IS NOT @hyperdag/proof-verifier
// ============================================================================
//
// TRUSTSHELL-V1 §10 specified M3 as "proof-verifier accepts it". Measured
// 2026-08-15 against the published package: `@hyperdag/proof-verifier@0.2.0` is
// a **Plonky3 STARK verifier** whose public statement is
// `{agent_id, repid_score, threshold, tier}`. It deserializes STARK proof bytes
// and checks a 16-bit range argument. It has no concept of a session receipt,
// and teaching it one means a Rust/WASM rebuild (blocked in agent containers by
// task #75) plus an irreversible npm publish, which is Sean's call.
//
// The spec named a mechanism without checking it. Same class as the §4.1 git
// bug that M2 found. §10 and §8 are corrected; this file is what M3 actually
// needed.
//
// ============================================================================
// THE ONE RULE THAT MAKES THIS WORTH ANYTHING
// ============================================================================
//
// This file imports NOTHING from lib/trustshell, and has no npm dependencies.
// Canonical JSON, base58, base32, the did:key decode, the marker rule — all
// re-implemented here from the spec, not shared with the builder.
//
// That is the entire point. A "verifier" that calls `canonicalJson` from the
// module that produced the hash agrees with the builder by construction and
// proves nothing. Two independent implementations agreeing is evidence; one
// implementation agreeing with itself is a tautology. If these two ever
// disagree, one of them has a bug, and finding out which is the job.
//
// ============================================================================
// WHAT A PASS HERE DOES AND DOES NOT MEAN
// ============================================================================
//
//   Proves: the receipt's bytes are internally consistent; it commits to the
//           exact transcript you supplied; the signature (if any) is good; and
//           the marker matches the data rather than being asserted.
//
//   Does NOT prove: that the COUNTS are right. Re-deriving "82 tool calls" from
//           the transcript would need a second implementation of
//           TranscriptParser, which does not exist. What pins that instead is
//           the pair (`transcriptSha256`, `parserVersion`): anyone holding the
//           same bytes and the same parser version re-runs and compares hashes.
//           That is a weaker claim than a re-derivation and it is stated as
//           such rather than rounded up.
//
//   Also not proven: independence of the AUTHOR. This verifier lives in the
//           same repo, written by the same hand as the builder. It catches
//           asymmetries between build and verify; it is not a third party.
//           A genuine third party is M6.

import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
if (argv.length < 1 || argv.includes('--help')) {
  console.error(
    'usage: trustshell-verify-receipt <receipt.json> [<session.jsonl>]\n' +
      '\n' +
      'Verifies a session receipt with no TrustShell code and no dependencies.\n' +
      'Supply the transcript to also confirm the receipt commits to those exact bytes.\n'
  );
  process.exit(argv.includes('--help') ? 0 : 2);
}

// ---------------------------------------------------------------------------
// Primitives, re-implemented. Deliberately not imported.
// ---------------------------------------------------------------------------

const AUDIT_DOMAIN = 'zkrepid:session-receipt:v1';

/** Sorted-key, whitespace-free JSON. Rejects anything without one encoding. */
function canonical(value, path = '$') {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'string') return JSON.stringify(value);
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path}: non-finite number`);
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (t === 'undefined') throw new Error(`${path}: undefined`);
  if (Array.isArray(value)) return `[${value.map((v, i) => canonical(v, `${path}[${i}]`)).join(',')}]`;
  if (t !== 'object') throw new Error(`${path}: ${t} is not serialisable`);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new Error(`${path}: not a plain object`);
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k], `${path}.${k}`)}`)
    .join(',')}}`;
}

async function sha256Hex(str) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256HexBytes(bytes) {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** base58btc decode. Hand-rolled so this file needs no bs58. */
function b58decode(s) {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes = [0];
  for (const ch of s) {
    const v = A.indexOf(ch);
    if (v < 0) throw new Error(`invalid base58 character: ${ch}`);
    let carry = v;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Leading '1's are leading zero bytes.
  for (let k = 0; k < s.length && s[k] === '1'; k++) bytes.push(0);
  return new Uint8Array(bytes.reverse());
}

/** RFC 4648 base32, lowercase, unpadded. */
function b32(bytes) {
  const A = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += A[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += A[(acc << (5 - bits)) & 31];
  return out;
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** did:key:z<base58btc(0xed 0x01 || pubkey)> -> raw 32-byte Ed25519 key. */
function pubkeyFromDid(did) {
  if (!did.startsWith('did:key:')) throw new Error('not a did:key');
  const mb = did.slice('did:key:'.length);
  if (!mb.startsWith('z')) throw new Error('did:key is not base58btc (expected multibase "z")');
  const bytes = b58decode(mb.slice(1));
  if (bytes[0] !== 0xed || bytes[1] !== 0x01) throw new Error('not an Ed25519 multicodec key');
  const raw = bytes.slice(2);
  if (raw.length !== 32) throw new Error(`Ed25519 key must be 32 bytes, got ${raw.length}`);
  return raw;
}

/**
 * The marker rule, re-implemented from §6 and §12.5.
 *
 * Re-implementing rather than importing is the difference between checking the
 * receipt and taking its word: the stored `marker` sits outside `auditHash`, so
 * a verifier that reads it instead of recomputing it can be lied to by editing
 * one string.
 */
function markerFor(core) {
  if ((core.internalErrors ?? []).length > 0) return 'NOT_CHECKED';
  if (core.claims.failed > 0) return 'FAILED';
  if (core.claims.unchecked > 0) return 'NOT_CHECKED';
  const r = core.ruleset;
  if (!(r.claimsT0 || r.claimsT1 || r.claimsT2)) return 'NOT_CHECKED';
  return 'VERIFIED';
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

const checks = [];
const record = (name, outcome, detail) => checks.push({ name, outcome, detail });

let receipt;
try {
  receipt = JSON.parse(readFileSync(argv[0], 'utf8'));
  // The CLI's --json wraps the receipt alongside its check; accept either.
  if (receipt.receipt && receipt.check) receipt = receipt.receipt;
} catch (err) {
  console.error(`FAILED — cannot read receipt: ${err.message}`);
  process.exit(1);
}

// 1. auditHash over an independently canonicalised core.
let expectedAudit = null;
try {
  expectedAudit = await sha256Hex(`${AUDIT_DOMAIN}|${canonical(receipt.core)}`);
  record(
    'auditHash covers the core',
    expectedAudit === receipt.auditHash ? 'VERIFIED' : 'FAILED',
    expectedAudit === receipt.auditHash ? null : `expected ${expectedAudit}, receipt says ${receipt.auditHash}`
  );
} catch (err) {
  record('auditHash covers the core', 'FAILED', `core is not canonicalisable: ${err.message}`);
}

// 2. receiptId derives from auditHash.
if (expectedAudit) {
  const expectedId = `ts_${b32(hexToBytes(expectedAudit)).slice(0, 16)}`;
  record(
    'receiptId derives from auditHash',
    expectedId === receipt.receiptId ? 'VERIFIED' : 'FAILED',
    expectedId === receipt.receiptId ? null : `expected ${expectedId}, receipt says ${receipt.receiptId}`
  );
}

// 3. The marker matches the data. Recomputed, never read.
{
  const expected = markerFor(receipt.core);
  record(
    'marker matches the data',
    expected === receipt.marker ? 'VERIFIED' : 'FAILED',
    expected === receipt.marker ? null : `data says ${expected}, receipt claims ${receipt.marker}`
  );
}

// 4. The signature, if there is one.
{
  const a = receipt.attestation ?? { kind: 'unsigned' };
  if (a.kind === 'unsigned' || !a.signature || !a.signerDid) {
    record(
      'signature',
      'NOT_CHECKED',
      'receipt is unsigned — integrity rests on auditHash and transcriptSha256 alone'
    );
  } else {
    try {
      const raw = pubkeyFromDid(a.signerDid);
      const key = await crypto.subtle.importKey('raw', raw.slice().buffer, { name: 'Ed25519' }, true, [
        'verify',
      ]);
      const sig = b58decode(a.signature);
      if (sig.length !== 64) throw new Error(`signature must be 64 bytes, got ${sig.length}`);

      // TWO ACCEPTABLE MESSAGES, STRONGEST FIRST.
      //
      // Current signatures cover `${AUDIT_DOMAIN}:attestation|${kind}|${auditHash}`,
      // which BINDS the attestation kind. Before that binding existed the signature
      // covered bare `auditHash`, and `kind` sat outside everything signed — so a
      // `self` receipt could be relabelled `org` and still verify. Editing `kind`
      // now leaves a signature over a message nobody signed.
      //
      // The legacy form is still accepted, because those signatures are genuine and
      // the bytes really are intact. It is reported differently: it proves the core,
      // it does NOT attest to the label. Silently treating the two alike would
      // grandfather the escalation this binding exists to stop.
      const encoded = (m) => new TextEncoder().encode(m);
      const check = (m) => crypto.subtle.verify({ name: 'Ed25519' }, key, sig.slice().buffer, encoded(m));

      let good = await check(`${AUDIT_DOMAIN}:attestation|${a.kind}|${receipt.auditHash}`);
      const kindBound = good;
      if (!good) good = await check(receipt.auditHash);

      record(
        'signature',
        good ? 'VERIFIED' : 'FAILED',
        !good
          ? 'does not verify against signerDid'
          : kindBound
            ? `${a.kind}-attested by ${a.signerDid.slice(0, 24)}…`
            : `signed by ${a.signerDid.slice(0, 24)}… — pre-binding signature, so it does ` +
              `NOT attest to kind='${a.kind}'; treat as self-attested`
      );
    } catch (err) {
      // A malformed DID is a caller problem, not a failed signature. Conflating
      // them lets a typo read as forgery.
      record('signature', 'NOT_CHECKED', `cannot check: ${err.message}`);
    }
  }
}

// 5. Does the receipt commit to the transcript in front of us?
if (argv[1]) {
  const actual = await sha256HexBytes(readFileSync(argv[1]));
  const claimed = receipt.core.transcriptSha256;
  if (!claimed) {
    record('transcript binding', 'NOT_CHECKED', 'receipt records no transcriptSha256');
  } else {
    record(
      'transcript binding',
      actual === claimed ? 'VERIFIED' : 'FAILED',
      actual === claimed
        ? `receipt commits to these exact ${readFileSync(argv[1]).length} bytes`
        : `transcript hashes to ${actual}, receipt commits to ${claimed}`
    );
  }
} else {
  record(
    'transcript binding',
    'NOT_CHECKED',
    'no transcript supplied — pass one to confirm the receipt describes it'
  );
}

// 6. The counts themselves. Named so their absence is visible.
record(
  'counts re-derived from the transcript',
  'NOT_CHECKED',
  `would need a second TranscriptParser implementation; instead the input is pinned by ` +
    `transcriptSha256 and the producer by parserVersion=${receipt.core.parserVersion}`
);

// ---------------------------------------------------------------------------
// Report. The floor of the parts, never the ceiling.
// ---------------------------------------------------------------------------

const failed = checks.filter((c) => c.outcome === 'FAILED');
const unchecked = checks.filter((c) => c.outcome === 'NOT_CHECKED');
const overall = failed.length > 0 ? 'FAILED' : unchecked.length > 0 ? 'NOT_CHECKED' : 'VERIFIED';
const glyph = { VERIFIED: '✓', NOT_CHECKED: '⚠', FAILED: '✗' }[overall];

console.log(`${glyph} ${overall.replace('_', ' ')}  ${receipt.receiptId}`);
console.log('  (independent verifier — no TrustShell code, no dependencies)');
for (const c of checks) {
  const g = { VERIFIED: '✓', NOT_CHECKED: '⚠', FAILED: '✗' }[c.outcome];
  console.log(`  ${g} ${c.name}${c.detail ? `: ${c.detail}` : ''}`);
}

process.exit(overall === 'FAILED' ? 1 : 0);
