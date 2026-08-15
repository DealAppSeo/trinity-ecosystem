#!/usr/bin/env node
//
// check-receipt-verifier.mjs — assertions for TrustShell M3.
//
// M3's deliverable is INDEPENDENT verification: "the receipt is worthless if
// only TrustShell can check it" (§8). `scripts/trustshell-verify-receipt.mjs`
// re-implements canonical JSON, base58, base32, the did:key decode, the marker
// rule and Ed25519 verification with no TrustShell imports and no dependencies.
//
// This file is what makes that claim testable, in two parts:
//
//   1. DIFFERENTIAL. Both implementations hash the same cores and must agree.
//      This is the assertion with real information in it — a canonical-JSON
//      divergence (unicode key ordering, nested arrays, -0, empty containers)
//      would make the verifier reject receipts the builder produced, and no
//      single-implementation test can see that. Every disagreement is a bug in
//      one of them, and the differential says which cases to look at.
//
//   2. TAMPER. The verifier must FAIL on every mutated field. A verifier that
//      only ever passes is indistinguishable from `exit 0`.
//
// The verifier is invoked as a SUBPROCESS, not imported. Importing it would
// share this process's module state and defeat the point.

import { execFileSync, execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { localTsc } from './local-tsc.mjs';

const execFileAsync = promisify(execFile);
const outDir = mkdtempSync(join(process.cwd(), '.m3-check-'));
const VERIFIER = 'scripts/trustshell-verify-receipt.mjs';

let receiptLib, didLib, parserLib;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/receipt/index.ts',
      'lib/trustshell/identity/did.ts',
      'lib/trustshell/TranscriptParser.ts',
      '--outDir', outDir,
      '--rootDir', 'lib',
      '--module', 'commonjs',
      '--target', 'es2022',
      '--lib', 'es2022,dom',
      '--moduleResolution', 'node',
      '--esModuleInterop',
      '--strict',
    ],
    { stdio: 'pipe' }
  );
  const base = join(outDir, 'trustshell');
  receiptLib = await import(pathToFileURL(join(base, 'receipt', 'index.js')).href);
  didLib = await import(pathToFileURL(join(base, 'identity', 'did.js')).href);
  parserLib = await import(pathToFileURL(join(base, 'TranscriptParser.js')).href);
} catch (err) {
  rmSync(outDir, { recursive: true, force: true });
  console.error(`FAILED — modules do not compile:\n${err.stdout ?? ''}${err.stderr ?? ''}`);
  process.exit(1);
}

let pass = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) pass += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, a, b) =>
  ok(name, Object.is(a, b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

/** Run the independent verifier as a subprocess and parse its report. */
async function runVerifier(receipt, transcriptPath) {
  const rp = join(outDir, `r-${Math.abs(hashish(receipt.receiptId))}.json`);
  writeFileSync(rp, JSON.stringify(receipt));
  const args = [VERIFIER, rp];
  if (transcriptPath) args.push(transcriptPath);
  try {
    const { stdout } = await execFileAsync(process.execPath, args, { encoding: 'utf8' });
    return { exitCode: 0, out: stdout };
  } catch (err) {
    return { exitCode: err.code ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}
const hashish = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
const overallOf = (out) => (out.match(/^[✓⚠✗]\s+(VERIFIED|NOT CHECKED|FAILED)/m) ?? [])[1] ?? '(none)';

// ---------------------------------------------------------------------------
// A real receipt over a synthetic transcript.
// ---------------------------------------------------------------------------

const line = (o) => JSON.stringify(o);
const TRANSCRIPT = [
  line({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-08-15T10:00:00.000Z',
         sessionId: 's-m3', cwd: '/repo', gitBranch: 'main',
         message: { role: 'user', content: [{ type: 'text', text: 'go' }] } }),
  line({ type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-08-15T10:00:01.000Z',
         sessionId: 's-m3', cwd: '/repo', gitBranch: 'main', requestId: 'r1',
         message: { role: 'assistant', model: 'claude-opus-5',
                    usage: { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 5, cache_creation_input_tokens: 2 },
                    content: [{ type: 'tool_use', id: 'toolu_1', name: 'Write', input: { file_path: '/repo/a.ts' } }] } }),
  line({ type: 'user', uuid: 'u2', parentUuid: 'a1', timestamp: '2026-08-15T10:00:02.000Z',
         sessionId: 's-m3', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }] } }),
].join('\n');

const transcriptPath = join(outDir, 'session.jsonl');
writeFileSync(transcriptPath, TRANSCRIPT);
const sha = await receiptLib.sha256Hex(TRANSCRIPT);
const parsed = parserLib.parseTranscript(TRANSCRIPT, { sha256: sha });

const unsigned = await receiptLib.buildReceipt(parsed);
const dev = await didLib.generateKeyPair();
const signed = await receiptLib.signReceipt(unsigned, dev);

// ---------------------------------------------------------------------------
// Happy paths
// ---------------------------------------------------------------------------

{
  const r = await runVerifier(signed, transcriptPath);
  eq('signed receipt + transcript: verifier does not fail', r.exitCode, 0);
  eq('signed receipt + transcript: overall NOT CHECKED (counts unverifiable)', overallOf(r.out), 'NOT CHECKED');
  ok('independent auditHash agrees', r.out.includes('✓ auditHash covers the core'), r.out);
  ok('independent receiptId agrees', r.out.includes('✓ receiptId derives from auditHash'), r.out);
  ok('independent marker agrees', r.out.includes('✓ marker matches the data'), r.out);
  ok('independent Ed25519 verify agrees', /✓ signature: self-attested/.test(r.out), r.out);
  ok('transcript binding confirmed', r.out.includes('✓ transcript binding'), r.out);
  // The limit must be visible in the output, not only in a comment.
  ok('counts are reported NOT CHECKED, not silently omitted',
     r.out.includes('⚠ counts re-derived from the transcript'), r.out);
}

{
  const r = await runVerifier(unsigned, transcriptPath);
  ok('unsigned receipt: signature is NOT_CHECKED, not FAILED', r.out.includes('⚠ signature'), r.out);
  eq('unsigned receipt: does not exit non-zero', r.exitCode, 0);
}

{
  const r = await runVerifier(signed, null);
  ok('no transcript: binding is NOT_CHECKED', /⚠ transcript binding/.test(r.out), r.out);
}

{
  // Wrong transcript must FAIL, or the binding check is decorative.
  const wrong = join(outDir, 'other.jsonl');
  writeFileSync(wrong, `${TRANSCRIPT}\n`);
  const r = await runVerifier(signed, wrong);
  eq('wrong transcript: overall FAILED', overallOf(r.out), 'FAILED');
  eq('wrong transcript: exit 1', r.exitCode, 1);
  ok('wrong transcript: says which hash it got', /✗ transcript binding/.test(r.out), r.out);
}

// ---------------------------------------------------------------------------
// Tamper. Every mutated field must be caught by the INDEPENDENT verifier.
// ---------------------------------------------------------------------------

const tamper = async (name, mutate, expectLine) => {
  const bad = JSON.parse(JSON.stringify(signed));
  mutate(bad);
  const r = await runVerifier(bad, transcriptPath);
  ok(`tamper caught: ${name}`, overallOf(r.out) === 'FAILED', `overall was ${overallOf(r.out)}\n${r.out}`);
  if (expectLine) ok(`tamper reported precisely: ${name}`, r.out.includes(expectLine), r.out);
};

await tamper('tool call count', (r) => { r.core.actions.toolCalls = 999; }, '✗ auditHash covers the core');
await tamper('output tokens', (r) => { r.core.spend.outputTokens = 1; });
await tamper('files touched emptied', (r) => { r.core.actions.filesTouched = []; });
await tamper('transcriptSha256 swapped', (r) => { r.core.transcriptSha256 = 'f'.repeat(64); });
await tamper('ruleset claims tier flipped on', (r) => { r.core.ruleset.claimsT0 = true; });
await tamper('claim counts inflated', (r) => { r.core.claims.verified = 10; });
await tamper('internal errors hidden', (r) => { r.core.internalErrors = ['was here']; });
await tamper('sessionId rewritten', (r) => { r.core.sessionId = 'someone-elses'; });
await tamper('parserVersion downgraded', (r) => { r.core.parserVersion = 'trustshell-transcript/0.0.1'; });

// The marker sits outside auditHash by design, so this one has to be caught by
// recomputing the rule rather than by the hash. If the verifier ever starts
// READING receipt.marker instead of deriving it, this is the assertion that goes.
await tamper('marker upgraded to VERIFIED', (r) => { r.marker = 'VERIFIED'; }, '✗ marker matches the data');

// Signature-layer tampering.
{
  const other = await didLib.generateKeyPair();
  const bad = JSON.parse(JSON.stringify(signed));
  bad.attestation.signerDid = other.did;
  const r = await runVerifier(bad, transcriptPath);
  eq('tamper caught: signature attributed to another key', overallOf(r.out), 'FAILED');
}
{
  const bad = JSON.parse(JSON.stringify(signed));
  bad.attestation.kind = 'org'; // claim independent attestation over a self-signature
  const r = await runVerifier(bad, transcriptPath);
  // The signature still verifies — the key really did sign this hash — so the
  // verifier reports it as org-attested. That is a REAL limit of self-custody
  // and is asserted here so nobody later mistakes it for a caught forgery.
  ok('known limit: attestation.kind is not itself signed',
     r.out.includes('org-attested'), r.out);
}
{
  const bad = JSON.parse(JSON.stringify(signed));
  bad.attestation.signature = bad.attestation.signature.slice(0, -2) + 'aa';
  const r = await runVerifier(bad, transcriptPath);
  ok('tamper caught: mangled signature', overallOf(r.out) === 'FAILED' || /⚠ signature: cannot check/.test(r.out), r.out);
}
{
  const bad = JSON.parse(JSON.stringify(signed));
  bad.attestation.signerDid = 'did:key:zNOTAKEY';
  const r = await runVerifier(bad, transcriptPath);
  ok('malformed DID is NOT_CHECKED, not forgery', /⚠ signature: cannot check/.test(r.out), r.out);
}

// ---------------------------------------------------------------------------
// DIFFERENTIAL. Both canonicalisers over awkward shapes.
//
// This is the part that can actually find something. The two implementations
// were written independently; anywhere they disagree, valid receipts would be
// rejected in production and no single-implementation test would notice.
// ---------------------------------------------------------------------------

const AWKWARD = [
  { label: 'empty containers', v: { a: {}, b: [], c: '' } },
  { label: 'unicode keys', v: { 'é': 1, e: 2, 'Z': 3, a: 4, 'éx': 5 } },
  { label: 'keys differing only by case', v: { A: 1, a: 2, B: 3, b: 4 } },
  { label: 'keys with escapes', v: { 'a"b': 1, 'a\\b': 2, 'a\nb': 3 } },
  { label: 'digit-like keys', v: { '10': 1, '9': 2, '1': 3 } },
  { label: 'nested arrays of objects', v: { x: [{ b: 1, a: 2 }, { d: [3, { f: 4, e: 5 }] }] } },
  { label: 'negative zero', v: { z: -0, y: 0 } },
  { label: 'large integers', v: { n: Number.MAX_SAFE_INTEGER, m: 0 } },
  { label: 'floats', v: { r: 2.3612345, s: 1 } },
  { label: 'nulls beside absent-looking values', v: { a: null, b: false, c: 0, d: '' } },
  { label: 'deep nesting', v: { a: { b: { c: { d: { e: { f: [1, { g: 'h' }] } } } } } } },
  { label: 'emoji and surrogate pairs', v: { '🔒': 'ok', k: '✓ NOT CHECKED' } },
];

// The verifier's canonicaliser is not importable by design, so exercise it the
// only honest way: hang the awkward shape off the core and confirm the
// subprocess still agrees on the hash.
//
// The shape is attached STRUCTURALLY, not JSON.stringify-ed into a string field.
// An earlier draft did the latter, and it was nearly worthless: `JSON.stringify`
// had already collapsed -0 to 0 and fixed the key order before either
// canonicaliser saw it, so the cases that matter — nested key ordering, -0,
// unicode collation — were being answered by V8 rather than by the two
// implementations under test. Both canonicalisers walk whatever is on the
// object, so putting it there is what actually compares them.
for (const { label, v } of AWKWARD) {
  const core = JSON.parse(JSON.stringify(signed.core));
  core.differentialProbe = v;
  // -0 does not survive JSON.parse round-tripping, so re-plant it structurally.
  if (label === 'negative zero') core.differentialProbe = { z: -0, y: 0 };
  core.actions.filesTouched = Object.keys(v).sort();
  const auditHash = await receiptLib.auditHashFor(core);
  const candidate = {
    receiptId: receiptLib.receiptIdFromAuditHash(auditHash),
    core,
    auditHash,
    marker: receiptLib.markerFor(core),
    attestation: { kind: 'unsigned', signerDid: null, signature: null },
  };
  const r = await runVerifier(candidate, transcriptPath);
  ok(`differential: ${label}`, r.out.includes('✓ auditHash covers the core'),
     `implementations disagree on canonical form\n${r.out}`);
  ok(`differential id: ${label}`, r.out.includes('✓ receiptId derives from auditHash'), r.out);
}

// Marker rule, differentially, across every branch.
const MARKER_CASES = [
  { label: 'no tier enabled', claims: { total: 0, verified: 0, unchecked: 0, failed: 0, findings: [] }, ruleset: {}, errs: [] },
  { label: 'tier on, all backed', claims: { total: 3, verified: 3, unchecked: 0, failed: 0, findings: [] }, ruleset: { claimsT0: true }, errs: [] },
  { label: 'tier on, one unchecked', claims: { total: 3, verified: 2, unchecked: 1, failed: 0, findings: [] }, ruleset: { claimsT0: true }, errs: [] },
  { label: 'tier on, one failed', claims: { total: 3, verified: 2, unchecked: 0, failed: 1, findings: [] }, ruleset: { claimsT0: true }, errs: [] },
  { label: 'internal error outranks clean', claims: { total: 3, verified: 3, unchecked: 0, failed: 0, findings: [] }, ruleset: { claimsT0: true }, errs: ['boom'] },
  { label: 'T2 only', claims: { total: 1, verified: 1, unchecked: 0, failed: 0, findings: [] }, ruleset: { claimsT2: true }, errs: [] },
];

for (const c of MARKER_CASES) {
  const core = JSON.parse(JSON.stringify(signed.core));
  core.claims = c.claims;
  core.ruleset = { ...core.ruleset, ...c.ruleset };
  core.internalErrors = c.errs;
  const auditHash = await receiptLib.auditHashFor(core);
  const candidate = {
    receiptId: receiptLib.receiptIdFromAuditHash(auditHash),
    core,
    auditHash,
    marker: receiptLib.markerFor(core),
    attestation: { kind: 'unsigned', signerDid: null, signature: null },
  };
  const r = await runVerifier(candidate, transcriptPath);
  ok(`differential marker: ${c.label}`, r.out.includes('✓ marker matches the data'),
     `lib says ${candidate.marker}; verifier disagreed\n${r.out}`);
}

// ---------------------------------------------------------------------------

rmSync(outDir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`FAILED — ${failures.length} of ${pass + failures.length} assertions:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log(`VERIFIED — receipt verifier (M3): ${pass} assertions, 0 failed.`);
