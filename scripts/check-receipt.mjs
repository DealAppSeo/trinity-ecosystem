#!/usr/bin/env node
//
// check-receipt.mjs — assertions for lib/trustshell/receipt/* (TrustShell M2).
//
// M2's acceptance criterion is one sentence: "Receipt emitted, audit_hash stable
// across re-runs of the same transcript." That is asserted here, but it is the
// easy half. The properties worth protecting are the ones whose absence would
// make the receipt decorative:
//
//   - the marker must NEVER read VERIFIED when no claim tier ran. M2 checks no
//     claims, so a naive "nothing failed" test would emit VERIFIED on every
//     session. That is the same shape as the credential check that went green
//     with no credential, and the secret scan that reported a clean tree from a
//     `git grep` that exited 128. Third instance; caught here before shipping.
//   - tampering with any hashed field must change auditHash and be detected.
//   - a good signature over a modified core must NOT pass.
//   - "unsigned" must be NOT_CHECKED, not FAILED, and not VERIFIED.
//   - canonical form must not depend on key insertion order.
//
// Compiled into the repo (not /tmp) so `require('bs58')` resolves upward into
// node_modules — Node's resolver walks parents from the FILE's location.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.receipt-check-'));

let receipt, did, parser;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/receipt/index.ts',
      'lib/trustshell/receipt/store-sqlite.ts',
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
  receipt = await import(pathToFileURL(join(base, 'receipt', 'index.js')).href);
  did = await import(pathToFileURL(join(base, 'identity', 'did.js')).href);
  parser = await import(pathToFileURL(join(base, 'TranscriptParser.js')).href);
} catch (err) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('FAILED — receipt modules do not compile:\n' + `${err.stdout ?? ''}${err.stderr ?? ''}`);
  process.exit(1);
}

let pass = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) pass += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, actual, expected) =>
  ok(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const {
  buildReceipt, auditHashFor, markerFor, recomputeReceipt, canonicalJson,
  receiptIdFromAuditHash, signReceipt, verifyReceiptSignature, checkReceipt,
  formatMarker, M2_RULESET, RECEIPT_SCHEMA_VERSION,
} = receipt;

// ---------------------------------------------------------------------------
// A synthetic transcript. Two tool calls (one write, one read), one duplicate
// delivery, one orphan, spend across two models. Synthetic per the repo fence:
// no production rows, ids or proofs as fixtures.
// ---------------------------------------------------------------------------

const line = (o) => JSON.stringify(o);
const TRANSCRIPT = [
  line({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-08-15T10:00:00.000Z',
         sessionId: 's-1', cwd: '/repo', gitBranch: 'main',
         message: { role: 'user', content: [{ type: 'text', text: 'go' }] } }),
  line({ type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-08-15T10:00:01.000Z',
         sessionId: 's-1', cwd: '/repo', gitBranch: 'main', requestId: 'r1',
         message: { role: 'assistant', model: 'claude-opus-5',
                    usage: { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 5, cache_creation_input_tokens: 2 },
                    content: [{ type: 'tool_use', id: 'toolu_1', name: 'Write', input: { file_path: '/repo/a.ts' } }] } }),
  line({ type: 'user', uuid: 'u2', parentUuid: 'a1', timestamp: '2026-08-15T10:00:02.000Z',
         sessionId: 's-1', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }] } }),
  // Same result delivered twice — a retry or rejected-then-approved call.
  line({ type: 'user', uuid: 'u3', parentUuid: 'a1', timestamp: '2026-08-15T10:00:03.000Z',
         sessionId: 's-1', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }] } }),
  line({ type: 'assistant', uuid: 'a2', parentUuid: 'u2', timestamp: '2026-08-15T10:00:04.000Z',
         sessionId: 's-1', requestId: 'r2',
         message: { role: 'assistant', model: 'claude-haiku-4-5-20251001',
                    usage: { input_tokens: 50, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
                    content: [{ type: 'tool_use', id: 'toolu_2', name: 'Read', input: { file_path: '/repo/b.ts' } }] } }),
  line({ type: 'user', uuid: 'u4', parentUuid: 'a2', timestamp: '2026-08-15T10:00:05.000Z',
         sessionId: 's-1', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_2', content: 'contents' }] } }),
  // Orphan: a tool_use whose result never arrives.
  line({ type: 'assistant', uuid: 'a3', parentUuid: 'u4', timestamp: '2026-08-15T10:00:06.000Z',
         sessionId: 's-1', requestId: 'r3',
         message: { role: 'assistant', model: 'claude-opus-5',
                    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
                    content: [{ type: 'tool_use', id: 'toolu_3', name: 'Bash', input: { command: 'ls' } }] } }),
].join('\n');

const parsed = parser.parseTranscript(TRANSCRIPT, { sha256: 'a'.repeat(64) });

// ---------------------------------------------------------------------------
// Canonical form
// ---------------------------------------------------------------------------

eq('canonical: key order does not matter',
   canonicalJson({ b: 1, a: 2 }), canonicalJson({ a: 2, b: 1 }));
eq('canonical: nested key order does not matter',
   canonicalJson({ x: { z: 1, y: [{ q: 1, p: 2 }] } }),
   canonicalJson({ x: { y: [{ p: 2, q: 1 }] , z: 1 } }));
eq('canonical: array order DOES matter',
   canonicalJson([1, 2]) === canonicalJson([2, 1]), false);
eq('canonical: -0 normalises to 0', canonicalJson(-0), '0');
eq('canonical: null is encoded, not dropped', canonicalJson({ a: null }), '{"a":null}');

const throws = (name, fn) => {
  try { fn(); ok(name, false, 'did not throw'); }
  catch { pass += 1; }
};
throws('canonical: rejects undefined', () => canonicalJson({ a: undefined }));
throws('canonical: rejects NaN', () => canonicalJson({ a: NaN }));
throws('canonical: rejects Infinity', () => canonicalJson({ a: Infinity }));
throws('canonical: rejects a Date', () => canonicalJson({ a: new Date(0) }));
throws('canonical: rejects a Map', () => canonicalJson({ a: new Map() }));
throws('canonical: rejects a function', () => canonicalJson({ a: () => 1 }));

// ---------------------------------------------------------------------------
// M2's stated acceptance criterion
// ---------------------------------------------------------------------------

const r1 = await buildReceipt(parsed);
const r2 = await buildReceipt(parser.parseTranscript(TRANSCRIPT, { sha256: 'a'.repeat(64) }));

eq('M2: auditHash is stable across re-runs of the same transcript', r1.auditHash, r2.auditHash);
eq('M2: receiptId is stable too', r1.receiptId, r2.receiptId);
ok('M2: receiptId has the ts_ prefix and 16 base32 chars', /^ts_[a-z2-7]{16}$/.test(r1.receiptId), r1.receiptId);
eq('M2: receiptId derives from auditHash', r1.receiptId, receiptIdFromAuditHash(r1.auditHash));
eq('M2: schemaVersion is recorded in the hashed core', r1.core.schemaVersion, RECEIPT_SCHEMA_VERSION);
eq('M2: transcriptSha256 is pinned', r1.core.transcriptSha256, 'a'.repeat(64));

// Different bytes must give a different hash, or the previous assertion is vacuous.
const r3 = await buildReceipt(parser.parseTranscript(TRANSCRIPT.replace('/repo/a.ts', '/repo/z.ts'), { sha256: 'b'.repeat(64) }));
ok('M2: a different transcript gives a different auditHash', r3.auditHash !== r1.auditHash);

// ---------------------------------------------------------------------------
// Actions and spend actually reflect the transcript
// ---------------------------------------------------------------------------

eq('actions: three tool calls', r1.core.actions.toolCalls, 3);
eq('actions: one orphan', r1.core.actions.orphanCalls, 1);
eq('actions: one duplicate delivery', r1.core.actions.duplicateDeliveries, 1);
eq('actions: one write op', r1.core.actions.writeOps, 1);
eq('actions: files touched sorted and deduped', JSON.stringify(r1.core.actions.filesTouched), JSON.stringify(['/repo/a.ts']));
eq('actions: git reconcile is NOT_CHECKED by default', r1.core.actions.gitDiffReconciled, 'NOT_CHECKED');
eq('spend: turns are requestId groups, not records', r1.core.spend.turns, 3);
eq('spend: output tokens deduplicated', r1.core.spend.outputTokens, 55);
eq('spend: models sorted', JSON.stringify(r1.core.models), JSON.stringify(['claude-haiku-4-5-20251001', 'claude-opus-5']));
eq('spend: limit divergence is NOT_CHECKED when unbound', r1.core.spend.limitDivergence, 'NOT_CHECKED');

// Reconciliation, both directions — a check that only ever passes is broken.
const reconcileRuleset = { ...M2_RULESET, gitReconcile: true };
const rGood = await buildReceipt(parsed, { ruleset: reconcileRuleset, gitChangedFiles: ['/repo/a.ts'] });
eq('reconcile: VERIFIED when git agrees', rGood.core.actions.gitDiffReconciled, 'VERIFIED');
const rBad = await buildReceipt(parsed, { ruleset: reconcileRuleset, gitChangedFiles: [] });
eq('reconcile: FAILED when a claimed write did not change a file', rBad.core.actions.gitDiffReconciled, 'FAILED');
eq('reconcile: names the mismatched file', JSON.stringify(rBad.core.actions.reconcileMismatches), JSON.stringify(['/repo/a.ts']));
// The ruleset is hashed, so turning a check on changes the receipt identity.
ok('reconcile: enabling a check changes ruleHash', rGood.core.ruleHash !== r1.core.ruleHash);

// ---------------------------------------------------------------------------
// Porcelain parsing. This is here because it was WRONG, and no assertion about
// the receipt model could have caught it: the CLI trimmed git's output, which
// ate the leading status space of the first record and returned every path in
// it short by one character. On a real session that produced a bogus mismatch —
// a false accusation from the one check whose job is catching a false claim.
// ---------------------------------------------------------------------------

const { parsePorcelainZ, parseLogNameOnly } = receipt;

// The exact shape that broke: an unstaged modification leads with a space.
eq('porcelain: leading status space does not eat the first character',
   JSON.stringify(parsePorcelainZ(' M lib/a.ts\0?? lib/b.ts\0')),
   JSON.stringify(['lib/a.ts', 'lib/b.ts']));
// The hazard itself, stated as an assertion so the reason this module exists
// cannot be lost to a future tidy-up that "helpfully" trims the input again.
{
  const raw = ' M lib/a.ts\0';
  eq('porcelain: untrimmed input gives the whole path', parsePorcelainZ(raw)[0], 'lib/a.ts');
  ok('porcelain: trimming the stream is what corrupted it',
     parsePorcelainZ(raw.trim())[0] !== 'lib/a.ts',
     'trimmed input parsed correctly, so this regression guard proves nothing');
}
eq('porcelain: staged and unstaged both parse',
   JSON.stringify(parsePorcelainZ('M  a\0 M b\0MM c\0')), JSON.stringify(['a', 'b', 'c']));
eq('porcelain: a rename yields both paths',
   JSON.stringify(parsePorcelainZ('R  new.ts\0old.ts\0 M other.ts\0')),
   JSON.stringify(['new.ts', 'old.ts', 'other.ts']));
eq('porcelain: a copy yields both paths',
   JSON.stringify(parsePorcelainZ('C  copy.ts\0src.ts\0')), JSON.stringify(['copy.ts', 'src.ts']));
eq('porcelain: paths containing spaces survive',
   JSON.stringify(parsePorcelainZ('?? my dir/a b.ts\0')), JSON.stringify(['my dir/a b.ts']));
eq('porcelain: empty stream yields nothing', parsePorcelainZ('').length, 0);
eq('porcelain: a truncated record is skipped, not sliced into ""',
   JSON.stringify(parsePorcelainZ(' M\0')), JSON.stringify([]));

eq('git log: blank separator lines are not paths',
   JSON.stringify(parseLogNameOnly('a.ts\nb.ts\n\nc.ts\n')), JSON.stringify(['a.ts', 'b.ts', 'c.ts']));
eq('git log: empty output yields nothing', parseLogNameOnly('').length, 0);

// ---------------------------------------------------------------------------
// THE MARKER. The half of this file that matters most.
// ---------------------------------------------------------------------------

eq('marker: M2 emits NOT_CHECKED, never VERIFIED', r1.marker, 'NOT_CHECKED');
eq('marker: and it is NOT_CHECKED because no claim tier ran',
   markerFor({ claims: { total: 0, verified: 0, unchecked: 0, failed: 0, findings: [] },
               ruleset: M2_RULESET, internalErrors: [] }),
   'NOT_CHECKED');

// With a claim tier on and everything backed, VERIFIED is reachable — otherwise
// the rule above would be indistinguishable from a marker hardwired to amber.
eq('marker: VERIFIED is reachable once a tier runs and all claims are backed',
   markerFor({ claims: { total: 5, verified: 5, unchecked: 0, failed: 0, findings: [] },
               ruleset: { ...M2_RULESET, claimsT0: true }, internalErrors: [] }),
   'VERIFIED');
eq('marker: any unchecked claim forces NOT_CHECKED',
   markerFor({ claims: { total: 5, verified: 4, unchecked: 1, failed: 0, findings: [] },
               ruleset: { ...M2_RULESET, claimsT0: true }, internalErrors: [] }),
   'NOT_CHECKED');
eq('marker: a contradicted claim is FAILED',
   markerFor({ claims: { total: 5, verified: 4, unchecked: 0, failed: 1, findings: [] },
               ruleset: { ...M2_RULESET, claimsT0: true }, internalErrors: [] }),
   'FAILED');
// §11: a harness that broke halfway cannot report a clean session.
eq('marker: an internal error forces NOT_CHECKED even with everything backed',
   markerFor({ claims: { total: 5, verified: 5, unchecked: 0, failed: 0, findings: [] },
               ruleset: { ...M2_RULESET, claimsT0: true }, internalErrors: ['parser threw'] }),
   'NOT_CHECKED');
// ...but a real failure still outranks an internal error being absent.
eq('marker: FAILED outranks unchecked',
   markerFor({ claims: { total: 5, verified: 0, unchecked: 4, failed: 1, findings: [] },
               ruleset: { ...M2_RULESET, claimsT0: true }, internalErrors: [] }),
   'FAILED');

// ---------------------------------------------------------------------------
// Tamper detection — every hashed field
// ---------------------------------------------------------------------------

const tamper = async (name, mutate) => {
  const bad = JSON.parse(JSON.stringify(r1));
  mutate(bad);
  const re = await recomputeReceipt(bad);
  ok(`tamper detected: ${name}`, !re.auditHashMatches, 'auditHash still matched after mutation');
};

await tamper('tool call count', (r) => { r.core.actions.toolCalls = 999; });
await tamper('orphan count', (r) => { r.core.actions.orphanCalls = 0; });
await tamper('output tokens', (r) => { r.core.spend.outputTokens = 1; });
await tamper('files touched', (r) => { r.core.actions.filesTouched = []; });
await tamper('transcript sha', (r) => { r.core.transcriptSha256 = 'c'.repeat(64); });
await tamper('ruleset flag', (r) => { r.core.ruleset.claimsT0 = true; });
await tamper('claim counts', (r) => { r.core.claims.verified = 10; });
await tamper('internal errors removed', (r) => { r.core.internalErrors = ['x']; });
await tamper('git head sha', (r) => { r.core.gitHeadSha = 'deadbeef'; });

// The marker sits OUTSIDE the hash by design, so flipping it does not change
// auditHash — it must be caught by recomputation instead. This is exactly why
// SessionReceipt.marker is documented as "recompute, do not trust".
{
  const bad = JSON.parse(JSON.stringify(r1));
  bad.marker = 'VERIFIED';
  const re = await recomputeReceipt(bad);
  ok('tamper: flipping the stored marker does not change auditHash', re.auditHashMatches);
  ok('tamper: but recomputation catches it', !re.markerMatches);
  const check = await checkReceipt(bad);
  eq('tamper: checkReceipt reports FAILED on a flipped marker', check.outcome, 'FAILED');
}

// ---------------------------------------------------------------------------
// Signing — self-attestation, honestly labelled
// ---------------------------------------------------------------------------

const dev = await did.generateKeyPair();
const other = await did.generateKeyPair();

const unsignedCheck = await verifyReceiptSignature(r1);
eq('signature: unsigned is NOT_CHECKED, not FAILED', unsignedCheck.outcome, 'NOT_CHECKED');
eq('signature: unsigned is not independently attested', unsignedCheck.independentlyAttested, false);

const signed = await signReceipt(r1, dev);
eq('signature: kind defaults to self', signed.attestation.kind, 'self');
eq('signature: signerDid recorded', signed.attestation.signerDid, dev.did);
ok('signature: signing does not change auditHash', signed.auditHash === r1.auditHash);

const goodSig = await verifyReceiptSignature(signed);
eq('signature: a good self-signature VERIFIES', goodSig.outcome, 'VERIFIED');
eq('signature: self-attested is NOT independently attested', goodSig.independentlyAttested, false);

const orgSigned = await signReceipt(r1, dev, 'org');
eq('signature: org attestation is flagged independent', (await verifyReceiptSignature(orgSigned)).independentlyAttested, true);

// A signature from the wrong key must fail.
{
  const forged = { ...signed, attestation: { ...signed.attestation, signerDid: other.did } };
  eq('signature: wrong signerDid FAILS', (await verifyReceiptSignature(forged)).outcome, 'FAILED');
}
// A good signature over a modified core must NOT pass. This is the property the
// whole scheme rests on: the signature covers auditHash, and auditHash covers
// the core, so touching the core has to break the chain.
{
  const modified = JSON.parse(JSON.stringify(signed));
  modified.core.spend.outputTokens = 1;
  const c = await verifyReceiptSignature(modified);
  eq('signature: good signature over a modified core FAILS', c.outcome, 'FAILED');
  ok('signature: and says the core does not hash to the signed value',
     (c.reason ?? '').includes('does not hash'), c.reason ?? '');
}
// A malformed DID is a caller bug, not a failed verification.
{
  const broken = { ...signed, attestation: { ...signed.attestation, signerDid: 'did:key:zNOPE' } };
  eq('signature: malformed DID is NOT_CHECKED, not FAILED', (await verifyReceiptSignature(broken)).outcome, 'NOT_CHECKED');
}
// Signing a receipt whose hash is already stale must refuse.
{
  const stale = JSON.parse(JSON.stringify(r1));
  stale.core.spend.outputTokens = 12345;
  let threw = false;
  try { await signReceipt(stale, dev); } catch { threw = true; }
  ok('signature: refuses to sign a stale auditHash', threw);
}

// ---------------------------------------------------------------------------
// checkReceipt takes the FLOOR of its parts, never the ceiling
// ---------------------------------------------------------------------------

{
  const check = await checkReceipt(signed);
  eq('check: a perfectly signed M2 receipt is still NOT_CHECKED', check.outcome, 'NOT_CHECKED');
  eq('check: because the data marker is NOT_CHECKED', check.markerFromData, 'NOT_CHECKED');
  eq('check: while the signature itself VERIFIED', check.signature.outcome, 'VERIFIED');
  ok('check: auditHash matches', check.auditHashMatches);
  ok('check: receiptId matches', check.receiptIdMatches);

  const rendered = formatMarker(signed, check);
  ok('marker line: renders NOT CHECKED', rendered.includes('NOT CHECKED'), rendered);
  ok('marker line: says unchecked', rendered.includes('unchecked'), rendered);
  ok('marker line: labels self-attestation', rendered.includes('self-attested'), rendered);
  ok('marker line: carries the receipt id', rendered.includes(signed.receiptId), rendered);
}

// ---------------------------------------------------------------------------
// SQLite store. Availability is NOT_CHECKED-able, not fatal.
// ---------------------------------------------------------------------------

let storeState = 'NOT CHECKED';
{
  const { openReceiptStore } = await import(pathToFileURL(join(outDir, 'trustshell', 'receipt', 'store-sqlite.js')).href);
  const dbPath = join(outDir, 'receipts.db');
  const opened = await openReceiptStore(dbPath);

  if (!opened.available) {
    console.log(`NOT CHECKED — receipt store: ${opened.reason}`);
  } else {
    storeState = 'VERIFIED';
    const store = opened.store;
    store.put(signed);
    const got = store.get(signed.receiptId);
    ok('store: round-trips a receipt', got !== null && got.auditHash === signed.auditHash);
    ok('store: survives a JSON round trip with the hash intact',
       got !== null && (await recomputeReceipt(got)).auditHashMatches);
    ok('store: findable by auditHash', store.getByAuditHash(signed.auditHash)?.receiptId === signed.receiptId);
    store.put(signed);
    eq('store: put is idempotent', store.list().length, 1);

    // A truncated id colliding across two different receipts must be loud.
    const collide = { ...r3, receiptId: signed.receiptId };
    let threw = false;
    try { store.put(collide); } catch { threw = true; }
    ok('store: refuses to overwrite on a receiptId collision', threw);

    store.close();
  }
}

// ---------------------------------------------------------------------------

rmSync(outDir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`FAILED — ${failures.length} of ${pass + failures.length} assertions:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log(`VERIFIED — receipt (M2): ${pass} assertions, 0 failed. Store: ${storeState}.`);
