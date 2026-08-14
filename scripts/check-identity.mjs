#!/usr/bin/env node
//
// check-identity.mjs — assertions for lib/trustshell/identity/*
//
// This is the dual-auth linking path: a human SSID authorizes an agent, the
// agent proves it holds its key, and attributes are disclosed selectively.
//
// The properties worth protecting are the ones whose absence would make the
// whole thing decorative:
//
//   - a forged or lifted signature must FAIL, not merely warn
//   - an undisclosed claim must not be recoverable from the root (salting)
//   - a commitment provider must never report the witness as hidden
//   - "we did not look" must stay distinguishable from "it passed"
//
// Compiled into the repo (not /tmp) so `require('bs58')` resolves upward into
// node_modules. Node's resolver walks parent directories from the FILE's
// location, so a temp dir outside the repo would fail to find any dependency.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.identity-check-'));

let did, disclosure, identity, proofProvider, controlProof, capability, nonceStore, delegation, repidPredicate, nullifier, caveat, memAuthz, harness, transition;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/identity/did.ts',
      'lib/trustshell/identity/disclosure.ts',
      'lib/trustshell/identity/identity.ts',
      'lib/trustshell/identity/proof-provider.ts',
      'lib/trustshell/identity/control-proof.ts',
      'lib/trustshell/identity/capability.ts',
      'lib/trustshell/identity/nonce-store.ts',
      'lib/trustshell/identity/delegation.ts',
      'lib/trustshell/identity/repid-predicate.ts',
      'lib/trustshell/identity/nullifier.ts',
      'lib/trustshell/identity/caveat.ts',
      'lib/trustshell/identity/memory-authz.ts',
      'lib/trustshell/identity/harness-bundle.ts',
      'lib/trustshell/identity/reputation-transition.ts',
      '--outDir', outDir,
      // Pin the root so output layout does not move when a module gains an
      // import from outside identity/ — repid-predicate.ts imports
      // ../EarnedMetrics, which silently relocated every .js file.
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
  const base = join(outDir, 'trustshell', 'identity');
  did = await import(pathToFileURL(join(base, 'did.js')).href);
  disclosure = await import(pathToFileURL(join(base, 'disclosure.js')).href);
  identity = await import(pathToFileURL(join(base, 'identity.js')).href);
  proofProvider = await import(pathToFileURL(join(base, 'proof-provider.js')).href);
  controlProof = await import(pathToFileURL(join(base, 'control-proof.js')).href);
  capability = await import(pathToFileURL(join(base, 'capability.js')).href);
  nonceStore = await import(pathToFileURL(join(base, 'nonce-store.js')).href);
  delegation = await import(pathToFileURL(join(base, 'delegation.js')).href);
  repidPredicate = await import(pathToFileURL(join(base, 'repid-predicate.js')).href);
  nullifier = await import(pathToFileURL(join(base, 'nullifier.js')).href);
  caveat = await import(pathToFileURL(join(base, 'caveat.js')).href);
  memAuthz = await import(pathToFileURL(join(base, 'memory-authz.js')).href);
  harness = await import(pathToFileURL(join(base, 'harness-bundle.js')).href);
  transition = await import(pathToFileURL(join(base, 'reputation-transition.js')).href);
} catch (err) {
  console.error('Could not compile lib/trustshell/identity:');
  console.error(String(err.stdout ?? '') + String(err.stderr ?? err.message));
  
rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}

let passed = 0;
let failed = 0;
const check = async (name, fn) => {
  try {
    await fn();
    passed++;
  } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    failed++;
    process.exitCode = 1;
  }
};

// --- did:key ----------------------------------------------------------------

await check('did:key round-trips through its multibase encoding', async () => {
  const kp = await did.generateKeyPair();
  assert.match(kp.did, /^did:key:z[1-9A-HJ-NP-Za-km-z]+$/, `bad did: ${kp.did}`);
  const raw = did.publicKeyBytesFromDid(kp.did);
  assert.equal(raw.length, 32);
  assert.equal(did.didFromPublicKeyBytes(raw), kp.did);
});

await check('did:key encodes the ed25519 multicodec (z6Mk prefix)', async () => {
  const kp = await did.generateKeyPair();
  // 0xed01 + 32 bytes in base58btc always renders as z6Mk...
  assert.ok(kp.did.startsWith('did:key:z6Mk'), `unexpected prefix: ${kp.did.slice(0, 16)}`);
});

await check('a malformed DID throws rather than returning no key', () => {
  assert.throws(() => did.publicKeyBytesFromDid('did:web:example.com'), /not a did:key/);
  assert.throws(() => did.publicKeyBytesFromDid('did:key:Qabc'), /base58btc/);
});

await check('a wrong-length public key is refused', () => {
  assert.throws(() => did.didFromPublicKeyBytes(new Uint8Array(31)), /32 bytes/);
});

await check('signature verifies, and a tampered payload does not', async () => {
  const kp = await did.generateKeyPair();
  const sig = await did.sign(kp.privateKey, 'authorize');
  assert.equal(await did.verify(kp.did, 'authorize', sig), true);
  assert.equal(await did.verify(kp.did, 'authorise', sig), false);
});

await check("another key's signature does not verify", async () => {
  const a = await did.generateKeyPair();
  const b = await did.generateKeyPair();
  const sig = await did.sign(b.privateKey, 'authorize');
  assert.equal(await did.verify(a.did, 'authorize', sig), false);
});

await check('a garbage signature returns false instead of throwing', async () => {
  const kp = await did.generateKeyPair();
  assert.equal(await did.verify(kp.did, 'x', 'not-base58-!!!'), false);
  assert.equal(await did.verify(kp.did, 'x', '11111'), false);
});

await check('private keys are non-extractable unless explicitly requested', async () => {
  const normal = await did.generateKeyPair();
  assert.equal(normal.privateKey.extractable, false);
  const exportable = await did.generateExportableKeyPair();
  assert.equal(exportable.privateKey.extractable, true);
});

// --- selective disclosure ---------------------------------------------------

const CLAIMS = [
  { key: 'legalName', value: 'Sean Goodwin' },
  { key: 'country', value: 'US' },
  { key: 'tier', value: 'Silver' },
  { key: 'over18', value: true },
  { key: 'accountAgeDays', value: 412 },
];

await check('a disclosed claim verifies against the root', async () => {
  const cred = await disclosure.buildCredential(CLAIMS);
  const d = await disclosure.toDisclosure(cred, ['country', 'over18']);
  const res = await disclosure.verifyDisclosure(d);
  assert.equal(res.valid, true, res.reason);
  assert.deepEqual(res.claims, { country: 'US', over18: true });
});

await check('undisclosed claims are absent from the disclosure entirely', async () => {
  const cred = await disclosure.buildCredential(CLAIMS);
  const d = await disclosure.toDisclosure(cred, ['country']);

  // Structural, not substring. A disclosure is mostly random hex, so
  // `blob.includes('412')` matches by chance inside a hash roughly one run in
  // three — a test that passes on luck is worse than no test. Assert on the
  // parsed shape, then substring-check only values that cannot occur in hex.
  assert.deepEqual(d.disclosed.map((x) => x.key), ['country']);
  for (const withheld of ['legalName', 'tier', 'over18', 'accountAgeDays']) {
    assert.ok(
      !d.disclosed.some((x) => x.key === withheld),
      `withheld claim '${withheld}' appeared in the disclosed set`
    );
  }
  const blob = JSON.stringify(d);
  assert.ok(!blob.includes('Sean Goodwin'), 'legalName leaked into the disclosure');
  assert.ok(!blob.includes('Silver'), 'tier leaked into the disclosure');
});

await check('the salt of an undisclosed claim is never serialized', async () => {
  const cred = await disclosure.buildCredential(CLAIMS);
  const d = await disclosure.toDisclosure(cred, ['country']);
  const blob = JSON.stringify(d);
  const withheld = cred.claims.filter((c) => c.key !== 'country');
  for (const c of withheld) {
    assert.ok(!blob.includes(c.salt), `salt for withheld claim '${c.key}' was serialized`);
  }
});

await check('THE SALT WORKS: a withheld low-entropy claim is not brute-forceable', async () => {
  // Without per-claim salts, an attacker holding only the root hashes every
  // candidate value and matches. This asserts the leaf preimage actually
  // depends on unguessable material: two credentials with IDENTICAL claims must
  // produce different roots.
  const a = await disclosure.buildCredential(CLAIMS);
  const b = await disclosure.buildCredential(CLAIMS);
  assert.notEqual(a.root, b.root, 'identical claims produced identical roots — claims are unsalted');
  assert.equal(a.claims.length, b.claims.length);
  for (let i = 0; i < a.claims.length; i++) {
    assert.notEqual(a.claims[i].salt, b.claims[i].salt, 'salt was reused across credentials');
  }
});

await check('a tampered disclosed value FAILS verification', async () => {
  const cred = await disclosure.buildCredential(CLAIMS);
  const d = await disclosure.toDisclosure(cred, ['tier']);
  d.disclosed[0].value = 'Gold';
  const res = await disclosure.verifyDisclosure(d);
  assert.equal(res.valid, false, 'a forged claim value verified');
  assert.deepEqual(res.claims, {});
});

await check('a claim from a different credential FAILS against this root', async () => {
  const mine = await disclosure.buildCredential(CLAIMS);
  const theirs = await disclosure.buildCredential([{ key: 'tier', value: 'Gold' }, { key: 'x', value: 1 }]);
  const d = await disclosure.toDisclosure(theirs, ['tier']);
  d.root = mine.root;
  const res = await disclosure.verifyDisclosure(d);
  assert.equal(res.valid, false, "another credential's claim verified against this root");
});

await check('disclosure reveals how many claims were withheld', async () => {
  const cred = await disclosure.buildCredential(CLAIMS);
  const d = await disclosure.toDisclosure(cred, ['country']);
  assert.equal(d.totalClaims, 5);
  assert.equal(d.disclosed.length, 1);
});

await check('type-tagging stops 1 and "1" colliding', async () => {
  const numeric = await disclosure.buildCredential([{ key: 'v', value: 1 }]);
  const string = await disclosure.buildCredential([{ key: 'v', value: '1' }]);
  // Different salts already differ; force the same salt to isolate the tagging.
  numeric.claims[0].salt = 'fixedsalt';
  string.claims[0].salt = 'fixedsalt';
  const a = await disclosure.toDisclosure(numeric, ['v']);
  const b = await disclosure.toDisclosure(string, ['v']);
  assert.notEqual(a.root === b.root, true, 'numeric 1 and string "1" hashed identically');
});

await check('leaf and node hashing are domain-separated (second-preimage guard)', () => {
  // RFC 6962's reason for prefixing: without distinct leaf/node tags, an
  // internal node's hash can be presented AS a leaf, letting a holder "prove" a
  // claim the issuer never made. Asserted structurally because constructing the
  // full second-preimage requires grinding a salt to hit a chosen digest, which
  // is not something a test suite should spend minutes on. A mutation setting
  // the two prefixes equal is caught here.
  const src = readFileSync('lib/trustshell/identity/disclosure.ts', 'utf8');
  const leaf = src.match(/const LEAF_PREFIX = (0x[0-9a-f]+);/);
  const node = src.match(/const NODE_PREFIX = (0x[0-9a-f]+);/);
  assert.ok(leaf && node, 'LEAF_PREFIX/NODE_PREFIX not found');
  assert.notEqual(leaf[1], node[1],
    'leaf and node hashing share a prefix — an internal node can be presented as a leaf');
});

await check('duplicate claim keys are refused', async () => {
  await assert.rejects(
    disclosure.buildCredential([{ key: 'a', value: 1 }, { key: 'a', value: 2 }]),
    /duplicate claim key/
  );
});

await check('disclosing a nonexistent key throws instead of silently skipping', async () => {
  const cred = await disclosure.buildCredential(CLAIMS);
  await assert.rejects(disclosure.toDisclosure(cred, ['nope']), /cannot disclose/);
});

await check('odd claim counts still verify (carry-up path)', async () => {
  for (const n of [1, 3, 5, 7, 9]) {
    const claims = Array.from({ length: n }, (_, i) => ({ key: `k${i}`, value: i }));
    const cred = await disclosure.buildCredential(claims);
    for (let i = 0; i < n; i++) {
      const d = await disclosure.toDisclosure(cred, [`k${i}`]);
      const res = await disclosure.verifyDisclosure(d);
      assert.equal(res.valid, true, `n=${n} index=${i} failed: ${res.reason}`);
    }
  }
});

// --- proof provider ---------------------------------------------------------

await check('WebCryptoProofProvider NEVER reports the witness as hidden', async () => {
  const p = new proofProvider.WebCryptoProofProvider();
  assert.equal(p.witnessHidden, false);
  const r = await p.prove({ predicate: 'gte', publicInputs: { bound: 3000 }, privateWitness: { value: 3723 } });
  assert.equal(r.witnessHidden, false);
  assert.equal(r.proven, false);
  assert.equal(r.system, 'none');
  assert.ok(r.notProven && r.notProven.length > 0);
});

await check('the predicate is DERIVED, not asserted', async () => {
  const p = new proofProvider.WebCryptoProofProvider();
  const pass = await p.prove({ predicate: 'gte', publicInputs: { bound: 3000 }, privateWitness: { value: 3723 } });
  const fail = await p.prove({ predicate: 'gte', publicInputs: { bound: 5000 }, privateWitness: { value: 3723 } });
  assert.equal(pass.predicateHolds, true);
  assert.equal(fail.predicateHolds, false, 'a failing agent got predicateHolds=true');
});

await check('the commitment reopens, and a flipped predicate does not verify', async () => {
  const p = new proofProvider.WebCryptoProofProvider();
  const stmt = { predicate: 'gte', publicInputs: { bound: 3000 }, privateWitness: { value: 3723 } };
  const r = await p.prove(stmt);
  assert.equal(await p.verify(r, stmt), true);
  assert.equal(await p.verify({ ...r, predicateHolds: !r.predicateHolds }, stmt), false);
});

await check('the commitment survives a JSON round trip (canonical ordering)', async () => {
  const p = new proofProvider.WebCryptoProofProvider();
  const stmt = { predicate: 'gte', publicInputs: { bound: 3000, agent: 'TORCH' }, privateWitness: { value: 3723 } };
  const r = JSON.parse(JSON.stringify(await p.prove(stmt)));
  // Reorder the keys as a transport might.
  const reordered = { predicate: 'gte', publicInputs: { agent: 'TORCH', bound: 3000 }, privateWitness: { value: 3723 } };
  assert.equal(await p.verify(r, reordered), true, 'commitment did not reopen after key reordering');
});

await check('a different witness does not open the same commitment', async () => {
  const p = new proofProvider.WebCryptoProofProvider();
  const stmt = { predicate: 'gte', publicInputs: { bound: 3000 }, privateWitness: { value: 3723 } };
  const r = await p.prove(stmt);
  const other = { predicate: 'gte', publicInputs: { bound: 3000 }, privateWitness: { value: 9999 } };
  assert.equal(await p.verify(r, other), false);
});

await check('ProofSystem union has not drifted from ZKPAttestation.ts', () => {
  const grab = (f) => {
    const src = readFileSync(f, 'utf8');
    const m = src.match(/export type ProofSystem =\s*([^;]+);/);
    assert.ok(m, `no ProofSystem union found in ${f}`);
    return m[1].split('|').map((s) => s.trim().replace(/['"]/g, '')).sort().join(',');
  };
  assert.equal(
    grab('lib/trustshell/identity/proof-provider.ts'),
    grab('lib/trustshell/ZKPAttestation.ts'),
    'the duplicated ProofSystem unions have drifted'
  );
});

// --- control proof (the dual-auth linking path) -----------------------------

const AUD = 'trinity:pay';

const mkPrincipals = async () => ({
  human: await identity.createHumanSSID(),
  agent: await identity.createAgentIdentity('TORCH'),
});

await check('a well-formed control proof verifies end to end', async () => {
  const { human, agent } = await mkPrincipals();
  const proof = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['pay', 'read:memory'], ttlSeconds: 3600,
  });
  const v = await controlProof.verifyControlProof(proof, { audience: AUD,
    seenNonces: new Set(),
    requiredCapabilities: ['pay'],
  });
  assert.equal(v.valid, true, JSON.stringify(v.checks, null, 2));
  assert.equal(v.checks.humanAuthorization.outcome, 'VERIFIED');
  assert.equal(v.checks.agentPossession.outcome, 'VERIFIED');
  assert.deepEqual(v.grantedCapabilities, ['pay', 'read:memory']);
});

await check('A FORGED HUMAN SIGNATURE FAILS', async () => {
  const { human, agent } = await mkPrincipals();
  const impostor = await identity.createHumanSSID();
  const proof = await controlProof.issueControlProof({ human: impostor, agent, audience: AUD, capabilities: ['pay'], ttlSeconds: 3600 });
  // Claim the real human authorized it.
  proof.grant.humanDid = human.did;
  const v = await controlProof.verifyControlProof(proof, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, false, 'an impostor-signed grant verified');
  assert.equal(v.checks.humanAuthorization.outcome, 'FAILED');
  assert.deepEqual(v.grantedCapabilities, [], 'capabilities were granted on an invalid proof');
});

await check('AN AGENT THAT DOES NOT HOLD ITS KEY FAILS', async () => {
  const { human, agent } = await mkPrincipals();
  const other = await identity.createAgentIdentity('IMPOSTOR');
  const proof = await controlProof.issueControlProof({ human, agent: other, audience: AUD, capabilities: ['pay'], ttlSeconds: 3600 });
  // Human names an agent DID whose key nobody in this proof holds.
  proof.grant.agentDid = agent.did;
  proof.humanSignature = await identity.signAs(human, controlProof.grantPayload(proof.grant));
  const v = await controlProof.verifyControlProof(proof, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, false, 'a grant naming an unheld agent key verified');
  assert.equal(v.checks.agentPossession.outcome, 'FAILED');
});

await check('A LIFTED COUNTER-SIGNATURE FAILS (it is bound to one grant)', async () => {
  // NOTE ON WHAT THIS DOES AND DOES NOT COVER. This proves the counter-signature
  // cannot be moved between grants. It does NOT isolate the `humanSignature`
  // component of the countersign payload: removing that component leaves this
  // test green, because the two grants already differ by nonce. That mutation
  // survives deliberately and is documented in control-proof.ts — with the whole
  // grant covered and Ed25519 deterministic, the component is defence in depth
  // rather than load-bearing. Claiming this test covers it would be the exact
  // "a skipped check scored as a pass" defect this repo keeps finding.
  const { human, agent } = await mkPrincipals();
  const a = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['pay'], ttlSeconds: 3600,
  });
  const b = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['pay'], ttlSeconds: 3600,
  });
  assert.notEqual(a.grant.nonce, b.grant.nonce, 'two grants shared a nonce');
  b.agentSignature = a.agentSignature;
  const v = await controlProof.verifyControlProof(b, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, false, 'a counter-signature was replayable across grants');
  assert.equal(v.checks.agentPossession.outcome, 'FAILED');
});

await check('the counter-signature is bound to the grant CONTENT, not just its nonce', async () => {
  // Same nonce, different capabilities: isolates content binding from nonce
  // uniqueness, which the test above cannot separate.
  const { human, agent } = await mkPrincipals();
  const fixed = 'fixednonce00000000000000000000ff';
  const a = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['read:memory'], ttlSeconds: 3600, nonce: fixed,
  });
  const b = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['pay:usdc'], ttlSeconds: 3600, nonce: fixed,
  });
  assert.equal(a.grant.nonce, b.grant.nonce);
  b.agentSignature = a.agentSignature;
  const v = await controlProof.verifyControlProof(b, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, false, 'counter-signature transferred between grants sharing a nonce');
  assert.equal(v.checks.agentPossession.outcome, 'FAILED');
});

await check('CAPABILITY ESCALATION FAILS', async () => {
  const { human, agent } = await mkPrincipals();
  const proof = await controlProof.issueControlProof({ human, agent, audience: AUD, capabilities: ['read:memory'], ttlSeconds: 3600 });
  const v = await controlProof.verifyControlProof(proof, { audience: AUD,
    seenNonces: new Set(), requiredCapabilities: ['pay'],
  });
  assert.equal(v.valid, false, 'an agent acted outside its granted capabilities');
  assert.equal(v.checks.capabilities.outcome, 'FAILED');
});

await check('adding a capability after signing FAILS', async () => {
  const { human, agent } = await mkPrincipals();
  const proof = await controlProof.issueControlProof({ human, agent, audience: AUD, capabilities: ['read:memory'], ttlSeconds: 3600 });
  proof.grant.capabilities.push('pay');
  const v = await controlProof.verifyControlProof(proof, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, false, 'capabilities were editable after signing');
  assert.equal(v.checks.humanAuthorization.outcome, 'FAILED');
});

await check('AN EXPIRED GRANT FAILS', async () => {
  const { human, agent } = await mkPrincipals();
  const t0 = new Date('2026-08-14T00:00:00Z');
  const proof = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['pay'], ttlSeconds: 60, now: t0,
  });
  const later = new Date('2026-08-14T00:02:00Z');
  const v = await controlProof.verifyControlProof(proof, { audience: AUD, now: later, seenNonces: new Set() });
  assert.equal(v.valid, false, 'an expired grant verified');
  assert.equal(v.checks.validityWindow.outcome, 'FAILED');
});

await check('a not-yet-valid grant FAILS', async () => {
  const { human, agent } = await mkPrincipals();
  const t0 = new Date('2026-08-14T12:00:00Z');
  const proof = await controlProof.issueControlProof({ human, agent, audience: AUD, capabilities: ['pay'], ttlSeconds: 60, now: t0 });
  const earlier = new Date('2026-08-14T11:00:00Z');
  const v = await controlProof.verifyControlProof(proof, { audience: AUD, now: earlier, seenNonces: new Set() });
  assert.equal(v.valid, false);
  assert.equal(v.checks.validityWindow.outcome, 'FAILED');
});

await check('A REPLAYED NONCE FAILS', async () => {
  const { human, agent } = await mkPrincipals();
  const proof = await controlProof.issueControlProof({ human, agent, audience: AUD, capabilities: ['pay'], ttlSeconds: 3600 });
  const seen = new Set([proof.grant.nonce]);
  const v = await controlProof.verifyControlProof(proof, { audience: AUD, seenNonces: seen });
  assert.equal(v.valid, false, 'a replayed proof verified');
  assert.equal(v.checks.replay.outcome, 'FAILED');
});

await check('replay is NOT_CHECKED when the caller keeps no nonce state', async () => {
  const { human, agent } = await mkPrincipals();
  const proof = await controlProof.issueControlProof({ human, agent, audience: AUD, capabilities: ['pay'], ttlSeconds: 3600 });
  const v = await controlProof.verifyControlProof(proof, { audience: AUD });
  // Core checks hold, so it is valid — but the gap is reported, not hidden.
  assert.equal(v.checks.replay.outcome, 'NOT_CHECKED');
  assert.match(v.checks.replay.detail, /seenNonces/);
});

await check('a grant with no expiry cannot be issued', async () => {
  const { human, agent } = await mkPrincipals();
  await assert.rejects(
    controlProof.issueControlProof({ human, agent, audience: AUD, capabilities: ['pay'], ttlSeconds: 0 }),
    /ttlSeconds must be positive/
  );
});

await check('unchecked scope is NOT_CHECKED, not a silent pass', async () => {
  const { human, agent } = await mkPrincipals();
  const proof = await controlProof.issueControlProof({ human, agent, audience: AUD, capabilities: ['pay'], ttlSeconds: 3600 });
  const v = await controlProof.verifyControlProof(proof, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.checks.capabilities.outcome, 'NOT_CHECKED');
  assert.equal(v.checks.disclosure.outcome, 'NOT_CHECKED');
  assert.equal(v.checks.predicate.outcome, 'NOT_CHECKED');
});

await check('a control proof carries selective disclosure end to end', async () => {
  const { human, agent } = await mkPrincipals();
  const cred = await disclosure.buildCredential(CLAIMS);
  const d = await disclosure.toDisclosure(cred, ['country', 'over18']);
  const proof = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['pay'], ttlSeconds: 3600, disclosure: d,
  });
  const v = await controlProof.verifyControlProof(proof, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, true, JSON.stringify(v.checks, null, 2));
  assert.equal(v.checks.disclosure.outcome, 'VERIFIED');
  assert.deepEqual(v.disclosedClaims, { country: 'US', over18: true });
  assert.ok(!JSON.stringify(proof).includes('Sean Goodwin'), 'legalName leaked through the control proof');
});

await check('a tampered disclosure inside a control proof FAILS', async () => {
  const { human, agent } = await mkPrincipals();
  const cred = await disclosure.buildCredential(CLAIMS);
  const d = await disclosure.toDisclosure(cred, ['tier']);
  const proof = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['pay'], ttlSeconds: 3600, disclosure: d,
  });
  proof.disclosure.disclosed[0].value = 'Gold';
  const v = await controlProof.verifyControlProof(proof, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, false, 'a forged disclosed claim rode through a valid control proof');
  assert.equal(v.checks.disclosure.outcome, 'FAILED');
  assert.deepEqual(v.disclosedClaims, {});
});

await check('a predicate proof rides along and reports its privacy honestly', async () => {
  const { human, agent } = await mkPrincipals();
  const provider = new proofProvider.WebCryptoProofProvider();
  const statement = { predicate: 'gte', publicInputs: { bound: 3000 }, privateWitness: { value: 3723 } };
  const proof = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['pay'], ttlSeconds: 3600, predicate: { statement, provider },
  });
  const v = await controlProof.verifyControlProof(proof, { audience: AUD,
    seenNonces: new Set(), predicateProvider: provider,
  });
  assert.equal(v.valid, true, JSON.stringify(v.checks, null, 2));
  assert.equal(v.checks.predicate.outcome, 'VERIFIED');
  assert.match(v.checks.predicate.detail, /witnessHidden=false/);
  assert.match(v.checks.predicate.detail, /task #75/);
});

await check('an attached predicate proof with no provider is NOT_CHECKED', async () => {
  const { human, agent } = await mkPrincipals();
  const provider = new proofProvider.WebCryptoProofProvider();
  const statement = { predicate: 'gte', publicInputs: { bound: 3000 }, privateWitness: { value: 3723 } };
  const proof = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['pay'], ttlSeconds: 3600, predicate: { statement, provider },
  });
  const v = await controlProof.verifyControlProof(proof, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.checks.predicate.outcome, 'NOT_CHECKED');
});

// --- ERC-8004 binding -------------------------------------------------------

await check('an ERC-8004 binding is CLAIMED, never silently proven', async () => {
  const agent = await identity.createAgentIdentity('TORCH');
  const b = identity.claimErc8004Binding({
    agentDid: agent.did, agentId: 3747,
    ownerAddress: '0xdf6b8215d193b11b4903d223729c3cf7a6de271d', chainId: 84532,
  });
  assert.equal(b.status, 'claimed');
  assert.ok(b.unprovenReason.includes('secp256k1'));
  assert.equal(typeof identity.proveErc8004Binding, 'undefined',
    'a prove* function exists that cannot actually prove the binding');
});

await check('signing without a private key throws instead of returning a fake', async () => {
  await assert.rejects(
    identity.signAs({ did: 'did:key:z6MkTest', name: 'x', createdAt: '' }, 'payload'),
    /no private key held/
  );
});

// --- capability attenuation -------------------------------------------------

await check('a wildcard permits everything beneath it', () => {
  assert.equal(capability.permits('pay:*', 'pay:usdc'), true);
  assert.equal(capability.permits('pay:*', 'pay:usdc:mainnet'), true);
  assert.equal(capability.permits('*', 'anything:at:all'), true);
  assert.equal(capability.permits('pay:usdc', 'pay:usdc:mainnet'), true);
  assert.equal(capability.permits('pay:usdc', 'pay:usdc'), true);
});

await check('ATTENUATION IS ONE-WAY: a narrow grant never permits a broader one', () => {
  assert.equal(capability.permits('pay:usdc', 'pay'), false);
  assert.equal(capability.permits('pay:usdc', 'pay:*'), false);
  assert.equal(capability.permits('pay:usdc', 'pay:usdt'), false);
  assert.equal(capability.permits('pay:usdc:mainnet', 'pay:usdc'), false);
  assert.equal(capability.permits('read:memory', 'write:memory'), false);
});

await check('a wildcard is only a wildcard as a whole segment', () => {
  // 'pay:usd*' must NOT cover pay:usdt — a partial-segment match would make a
  // typo silently authorize a different asset.
  assert.equal(capability.permits('pay:usd*', 'pay:usdt'), false);
  assert.equal(capability.permits('pay:usd*', 'pay:usd*'), true);
});

await check('capability matching fails closed on malformed input', () => {
  assert.equal(capability.permits('', 'pay'), false);
  assert.equal(capability.permits('pay', ''), false);
});

await check('isAttenuationOf accepts narrowing and rejects widening', () => {
  assert.equal(capability.isAttenuationOf(['pay:usdc'], ['pay:*']), true);
  assert.equal(capability.isAttenuationOf([], ['pay:*']), true, 'delegating nothing must be legal');
  assert.equal(capability.isAttenuationOf(['pay:*'], ['pay:usdc']), false, 'a child widened its parent');
  assert.equal(capability.isAttenuationOf(['pay:usdc', 'admin'], ['pay:*']), false);
});

await check('excess names exactly the uncovered capabilities', () => {
  assert.deepEqual(capability.excess(['pay:*'], ['pay:usdc', 'admin:keys']), ['admin:keys']);
  assert.deepEqual(capability.excess(['pay:*'], ['pay:usdc']), []);
});

// --- audience binding -------------------------------------------------------

await check('AUDIENCE MISMATCH FAILS (a proof minted for another service)', async () => {
  const { human, agent } = await mkPrincipals();
  const proof = await controlProof.issueControlProof({
    human, agent, audience: 'trinity:pay', capabilities: ['pay'], ttlSeconds: 3600,
  });
  // A different service, trusting the same human, receives the captured proof.
  const v = await controlProof.verifyControlProof(proof, {
    audience: 'trinity:vault', seenNonces: new Set(),
  });
  assert.equal(v.valid, false, 'a proof minted for another audience verified');
  assert.equal(v.checks.audience.outcome, 'FAILED');
  assert.deepEqual(v.grantedCapabilities, []);
});

await check('audience cannot be edited after signing', async () => {
  const { human, agent } = await mkPrincipals();
  const proof = await controlProof.issueControlProof({
    human, agent, audience: 'trinity:pay', capabilities: ['pay'], ttlSeconds: 3600,
  });
  proof.grant.audience = 'trinity:vault';
  const v = await controlProof.verifyControlProof(proof, {
    audience: 'trinity:vault', seenNonces: new Set(),
  });
  assert.equal(v.valid, false, 'audience was editable after signing');
  assert.equal(v.checks.humanAuthorization.outcome, 'FAILED');
});

await check('a grant with no audience cannot be issued', async () => {
  const { human, agent } = await mkPrincipals();
  await assert.rejects(
    controlProof.issueControlProof({
      human, agent, audience: '  ', capabilities: ['pay'], ttlSeconds: 3600,
    }),
    /audience is required/
  );
});

await check('a wildcard grant satisfies a narrower requirement', async () => {
  const { human, agent } = await mkPrincipals();
  const proof = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['pay:*'], ttlSeconds: 3600,
  });
  const v = await controlProof.verifyControlProof(proof, {
    audience: AUD, seenNonces: new Set(), requiredCapabilities: ['pay:usdc'],
  });
  assert.equal(v.valid, true, JSON.stringify(v.checks, null, 2));
  assert.equal(v.checks.capabilities.outcome, 'VERIFIED');
});

await check('a narrow grant does NOT satisfy a broader requirement', async () => {
  const { human, agent } = await mkPrincipals();
  const proof = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['pay:usdc'], ttlSeconds: 3600,
  });
  const v = await controlProof.verifyControlProof(proof, {
    audience: AUD, seenNonces: new Set(), requiredCapabilities: ['pay:*'],
  });
  assert.equal(v.valid, false, 'a narrow grant satisfied a wildcard requirement');
  assert.equal(v.checks.capabilities.outcome, 'FAILED');
});

await check('the proof provider declares itself non-zero-knowledge and named', () => {
  const p = new proofProvider.WebCryptoProofProvider();
  assert.equal(p.isZeroKnowledge, false);
  assert.equal(p.name, 'webcrypto-commitment');
});

// --- nonce store / replay defence -------------------------------------------

await check('a nonce can be consumed exactly once', async () => {
  const store = new nonceStore.InMemoryNonceStore();
  const exp = new Date(Date.now() + 60_000);
  assert.equal(await store.consume('n1', 'trinity:pay', exp), true);
  assert.equal(await store.consume('n1', 'trinity:pay', exp), false);
});

await check('nonces are scoped per audience', async () => {
  const store = new nonceStore.InMemoryNonceStore();
  const exp = new Date(Date.now() + 60_000);
  assert.equal(await store.consume('n1', 'trinity:pay', exp), true);
  assert.equal(await store.consume('n1', 'trinity:vault', exp), true,
    'the same nonce under a different audience must be independent');
});

await check('expired nonces are pruned rather than accumulating', async () => {
  const store = new nonceStore.InMemoryNonceStore();
  await store.consume('old', 'a', new Date(Date.now() - 1000));
  await store.consume('new', 'a', new Date(Date.now() + 60_000));
  assert.equal(store.size, 1, 'expired nonce was retained');
});

await check('THE STORE HAS NO has(): the racy pattern is not offered', () => {
  const store = new nonceStore.InMemoryNonceStore();
  assert.equal(typeof store.has, 'undefined',
    'a read-only check exists, which invites check-then-record and loses the race');
});

await check('A REPLAYED PROOF FAILS against the nonce store', async () => {
  const { human, agent } = await mkPrincipals();
  const store = new nonceStore.InMemoryNonceStore();
  const proof = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['pay'], ttlSeconds: 3600,
  });
  const first = await controlProof.verifyControlProof(proof, { audience: AUD, nonceStore: store });
  assert.equal(first.valid, true, JSON.stringify(first.checks, null, 2));
  assert.equal(first.checks.replay.outcome, 'VERIFIED');

  const second = await controlProof.verifyControlProof(proof, { audience: AUD, nonceStore: store });
  assert.equal(second.valid, false, 'a replayed proof verified a second time');
  assert.equal(second.checks.replay.outcome, 'FAILED');
});

await check('AN INVALID PROOF CANNOT BURN A VALID NONCE', async () => {
  // Otherwise anyone who learns a nonce can deny service to its real holder by
  // presenting a broken proof carrying it — the holder's genuine proof then
  // reads as a replay.
  const { human, agent } = await mkPrincipals();
  const store = new nonceStore.InMemoryNonceStore();
  const real = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['pay'], ttlSeconds: 3600,
  });

  const forged = JSON.parse(JSON.stringify(real));
  forged.humanSignature = await identity.signAs(
    await identity.createHumanSSID(), controlProof.grantPayload(forged.grant)
  );
  const attack = await controlProof.verifyControlProof(forged, { audience: AUD, nonceStore: store });
  assert.equal(attack.valid, false);
  assert.equal(attack.checks.replay.outcome, 'NOT_CHECKED',
    'a failing proof consumed the nonce');
  assert.equal(store.size, 0, 'the nonce was burned by an invalid proof');

  // The real holder is unaffected.
  const legit = await controlProof.verifyControlProof(real, { audience: AUD, nonceStore: store });
  assert.equal(legit.valid, true, 'the genuine proof was denied after a forgery attempt');
});

await check('a wrong-audience proof does not burn its nonce either', async () => {
  const { human, agent } = await mkPrincipals();
  const store = new nonceStore.InMemoryNonceStore();
  const proof = await controlProof.issueControlProof({
    human, agent, audience: 'trinity:pay', capabilities: ['pay'], ttlSeconds: 3600,
  });
  const v = await controlProof.verifyControlProof(proof, {
    audience: 'trinity:vault', nonceStore: store,
  });
  assert.equal(v.valid, false);
  assert.equal(store.size, 0, 'a misdirected proof burned its nonce');
});

await check('SupabaseNonceStore fails CLOSED when the table is missing', async () => {
  const store = new nonceStore.SupabaseNonceStore(() => ({
    from: () => ({ insert: async () => ({ error: { code: '42P01', message: 'relation does not exist' } }) }),
  }));
  await assert.rejects(
    store.consume('n', 'a', new Date()),
    /refusing to assume this proof is unspent/,
    'an unavailable nonce store returned "unspent" instead of throwing'
  );
});

await check('SupabaseNonceStore reads 23505 as a replay, not an error', async () => {
  const store = new nonceStore.SupabaseNonceStore(() => ({
    from: () => ({ insert: async () => ({ error: { code: '23505', message: 'duplicate key' } }) }),
  }));
  assert.equal(await store.consume('n', 'a', new Date()), false);
});

await check('no raw control bytes in identity source (wire format must be readable)', () => {
  // A literal control byte in a template literal is invisible in review, makes
  // the file read as binary to grep, and — the real cost — makes the wire
  // format impossible to read off the source. This suite shipped exactly that
  // bug: the Merkle leaf separator was a NUL that looked like a space, so the
  // interop spec handed to another implementer was wrong. Escapes only.
  //
  // ENUMERATED, NOT LISTED. This was a hardcoded list of seven filenames, and
  // it covered none of the six modules added after it was written — including
  // the one where a raw U+001F landed the same day this comment was updated.
  // A guard that has to be maintained is a guard that silently stops guarding.
  // This script is scanned too, because the second raw byte landed here.
  const files = [
    ...readdirSync('lib/trustshell/identity')
      .filter((f) => f.endsWith('.ts'))
      .map((f) => `lib/trustshell/identity/${f}`),
    'scripts/check-identity.mjs',
  ];
  assert.ok(files.length > 10, 'the directory scan found suspiciously few files');
  for (const f of files) {
    const buf = readFileSync(f);
    for (const b of buf) {
      const isAllowedWhitespace = b === 0x09 || b === 0x0a || b === 0x0d;
      assert.ok(
        b >= 0x20 || isAllowedWhitespace,
        `${f} contains a raw control byte 0x${b.toString(16).padStart(2, '0')} — write it as an escape`
      );
    }
  }
});

// --- delegation chains (sub-agents under constraints) -----------------------

const mkChain = async (parentCaps, childCaps, opts = {}) => {
  const human = await identity.createHumanSSID();
  const supervisor = await identity.createAgentIdentity('SUPERVISOR');
  const worker = await identity.createAgentIdentity('WORKER');
  const root = await controlProof.issueControlProof({
    human, agent: supervisor, audience: AUD,
    capabilities: parentCaps, ttlSeconds: opts.parentTtl ?? 3600,
  });
  const link = await delegation.delegate({
    parent: root, delegator: supervisor, delegate: worker,
    capabilities: childCaps, ttlSeconds: opts.childTtl ?? 600,
  });
  return { human, supervisor, worker, root, link };
};

// Sign an arbitrary (possibly malicious) delegation grant with REAL keys.
//
// Editing a grant after `delegate()` returns breaks the signature, so such a
// test fails at the signature check and never reaches the rule it claims to
// exercise. Three mutations survived because of exactly that. To test
// attenuation, audience and possession independently, the malicious link must
// be genuinely well-signed — only its CONTENT is hostile.
const forgeLink = async (parent, delegator, delegateIdent, grant) => {
  const delegatorSignature = await identity.signAs(delegator, delegation.delegationPayload(grant));
  const delegateSignature = await identity.signAs(
    delegateIdent,
    `${delegation.DELEGATION_DOMAIN.countersign}|${delegation.delegationPayload(grant)}|${delegatorSignature}`
  );
  return { parent, grant, delegatorSignature, delegateSignature };
};

await check('a narrowed delegation chain verifies end to end', async () => {
  const { link } = await mkChain(['pay:*', 'read:memory'], ['pay:usdc']);
  const v = await delegation.verifyDelegationChain(link, {
    audience: AUD, seenNonces: new Set(), requiredCapabilities: ['pay:usdc'],
  });
  assert.equal(v.valid, true, JSON.stringify(v.links, null, 2));
  assert.equal(v.depth, 1);
  assert.deepEqual(v.grantedCapabilities, ['pay:usdc']);
});

await check('DELEGATION CANNOT WIDEN AUTHORITY (refused at construction)', async () => {
  await assert.rejects(
    mkChain(['pay:usdc'], ['pay:*']),
    /refusing to widen authority/,
    'a supervisor minted a child broader than itself'
  );
});

await check('ATTENUATION IS ENFORCED AT VERIFY, not just at construction', async () => {
  // A well-signed link that widens. `delegate()` would refuse to build this, but
  // the verifier must not depend on the delegator having used delegate() at all.
  const human = await identity.createHumanSSID();
  const supervisor = await identity.createAgentIdentity('SUPERVISOR');
  const worker = await identity.createAgentIdentity('WORKER');
  const root = await controlProof.issueControlProof({
    human, agent: supervisor, audience: AUD, capabilities: ['pay:usdc'], ttlSeconds: 3600,
  });
  const rogue = await forgeLink(root, supervisor, worker, {
    delegatorDid: supervisor.did, delegateDid: worker.did, delegateName: 'WORKER',
    capabilities: ['pay:*'],                       // <-- wider than the parent
    audience: AUD, nonce: 'n-widen-0000000000000000',
    notBefore: root.grant.notBefore, expiresAt: root.grant.expiresAt,
  });
  const v = await delegation.verifyDelegationChain(rogue, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, false, 'a well-signed widening verified');
  assert.ok(v.links.some((l) => /widens authority/.test(l.detail)), JSON.stringify(v.links));
  assert.deepEqual(v.grantedCapabilities, []);
});


await check('TIME ATTENUATES: a child is clamped to its parent expiry', async () => {
  const { root, link } = await mkChain(['pay:*'], ['pay:usdc'], { parentTtl: 60, childTtl: 86400 });
  assert.ok(new Date(link.grant.expiresAt) <= new Date(root.grant.expiresAt),
    `child outlives parent: ${link.grant.expiresAt} > ${root.grant.expiresAt}`);
});

await check('a child forged to OUTLIVE its parent FAILS', async () => {
  const { root, link } = await mkChain(['pay:*'], ['pay:usdc'], { parentTtl: 60 });
  link.grant.expiresAt = new Date(new Date(root.grant.expiresAt).getTime() + 86_400_000).toISOString();
  const v = await delegation.verifyDelegationChain(link, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, false, 'a sub-agent outliving its parent verified');
  assert.ok(v.links.some((l) => /outlives its parent/.test(l.detail)), JSON.stringify(v.links));
});

await check('SUBJECT CONTINUITY: a stranger cannot append a link', async () => {
  const { root, worker } = await mkChain(['pay:*'], ['pay:usdc']);
  const stranger = await identity.createAgentIdentity('STRANGER');
  const helper = await identity.createAgentIdentity('HELPER');
  // The stranger signs a perfectly valid link the root never authorized.
  const rogue = await delegation.delegate({
    parent: { ...root, grant: { ...root.grant, agentDid: stranger.did } },
    delegator: stranger, delegate: helper, capabilities: ['pay:usdc'], ttlSeconds: 300,
  }).catch(() => null);
  assert.ok(rogue, 'setup failed');
  rogue.parent = root; // splice the real root back underneath
  const v = await delegation.verifyDelegationChain(rogue, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, false, 'a link signed by a stranger verified against the real root');
  assert.ok(v.links.some((l) => /not the principal the parent authorized/.test(l.detail)),
    JSON.stringify(v.links));
});

await check('POSSESSION IS PROVEN: naming a delegate whose key nobody holds FAILS', async () => {
  const human = await identity.createHumanSSID();
  const supervisor = await identity.createAgentIdentity('SUPERVISOR');
  const victim = await identity.createAgentIdentity('VICTIM');
  const attacker = await identity.createAgentIdentity('ATTACKER');
  const root = await controlProof.issueControlProof({
    human, agent: supervisor, audience: AUD, capabilities: ['pay:*'], ttlSeconds: 3600,
  });
  // Grant names VICTIM as the delegate; ATTACKER supplies the counter-signature.
  const grant = {
    delegatorDid: supervisor.did, delegateDid: victim.did, delegateName: 'VICTIM',
    capabilities: ['pay:usdc'], audience: AUD, nonce: 'n-possess-00000000000',
    notBefore: root.grant.notBefore, expiresAt: root.grant.expiresAt,
  };
  const rogue = await forgeLink(root, supervisor, attacker, grant);
  const v = await delegation.verifyDelegationChain(rogue, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, false, 'a delegate that never counter-signed was accepted');
  assert.ok(v.links.some((l) => /possession unproven/.test(l.detail)), JSON.stringify(v.links));
});


await check('a well-signed link cannot RETARGET the audience', async () => {
  const human = await identity.createHumanSSID();
  const supervisor = await identity.createAgentIdentity('SUPERVISOR');
  const worker = await identity.createAgentIdentity('WORKER');
  const root = await controlProof.issueControlProof({
    human, agent: supervisor, audience: AUD, capabilities: ['pay:*'], ttlSeconds: 3600,
  });
  const rogue = await forgeLink(root, supervisor, worker, {
    delegatorDid: supervisor.did, delegateDid: worker.did, delegateName: 'WORKER',
    capabilities: ['pay:usdc'],
    audience: 'trinity:vault',                     // <-- retargeted
    nonce: 'n-retarget-000000000000', notBefore: root.grant.notBefore,
    expiresAt: root.grant.expiresAt,
  });
  const v = await delegation.verifyDelegationChain(rogue, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, false, 'a delegation retargeted the audience');
  assert.ok(v.links.some((l) => /retargets audience/.test(l.detail)), JSON.stringify(v.links));
});


await check('an invalid ROOT invalidates the whole chain', async () => {
  const { link } = await mkChain(['pay:*'], ['pay:usdc']);
  link.parent.humanSignature = await identity.signAs(
    await identity.createHumanSSID(), controlProof.grantPayload(link.parent.grant)
  );
  const v = await delegation.verifyDelegationChain(link, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, false, 'a chain survived a forged root');
  assert.equal(v.links[0].outcome, 'FAILED');
});

await check('the requirement is checked against the LEAF, not the root', async () => {
  // The root holds pay:* — if the requirement were checked there, a narrowed
  // leaf would pass for capabilities it does not have.
  const { link } = await mkChain(['pay:*', 'read:memory'], ['read:memory']);
  const v = await delegation.verifyDelegationChain(link, {
    audience: AUD, seenNonces: new Set(), requiredCapabilities: ['pay:usdc'],
  });
  assert.equal(v.valid, false, 'the leaf passed on its root\'s broader authority');
  assert.ok(v.links.some((l) => /leaf lacks required/.test(l.detail)), JSON.stringify(v.links));
});

await check('chains deeper than MAX_DELEGATION_DEPTH are refused', async () => {
  const { root, supervisor } = await mkChain(['pay:*'], ['pay:*']);
  let parent = root;
  let delegator = supervisor;
  for (let i = 0; i < delegation.MAX_DELEGATION_DEPTH + 1; i++) {
    const next = await identity.createAgentIdentity(`W${i}`);
    parent = await delegation.delegate({
      parent, delegator, delegate: next, capabilities: ['pay:*'], ttlSeconds: 300,
    });
    delegator = next;
  }
  const v = await delegation.verifyDelegationChain(parent, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, false, 'an over-deep chain verified');
  assert.ok(v.links.some((l) => /MAX_DELEGATION_DEPTH/.test(l.detail)), JSON.stringify(v.links));
});

await check('a two-link chain narrows monotonically', async () => {
  const { link, worker } = await mkChain(['pay:*', 'read:memory'], ['pay:usdc', 'read:memory']);
  const helper = await identity.createAgentIdentity('HELPER');
  const second = await delegation.delegate({
    parent: link, delegator: worker, delegate: helper,
    capabilities: ['read:memory'], ttlSeconds: 120,
  });
  const v = await delegation.verifyDelegationChain(second, {
    audience: AUD, seenNonces: new Set(), requiredCapabilities: ['read:memory'],
  });
  assert.equal(v.valid, true, JSON.stringify(v.links, null, 2));
  assert.equal(v.depth, 2);
  assert.deepEqual(v.grantedCapabilities, ['read:memory']);
});

// --- RepID predicate (Priority 2: measured score -> disclosable claim) ------

const EVIDENCE = (over) => ({
  measured: ['bftAccuracy', 'veritasCatchRate', 'x402SuccessRate', 'latencyMs'],
  insufficient: [], unmeasured: [], fullyMeasured: true, weakestConfidence: 0.8,
  detail: {}, ...over,
});

await check('a measured score becomes a gte predicate over a private witness', () => {
  const st = repidPredicate.repidPredicate({
    score: 3723, threshold: 3000, evidence: EVIDENCE(), agentName: 'TORCH',
  });
  assert.equal(st.predicate, 'gte');
  assert.equal(st.privateWitness.value, 3723);
  assert.equal(st.publicInputs.bound, 3000);
  assert.equal(st.publicInputs.agent, 'TORCH');
});

await check('EVIDENCE QUALITY IS PUBLIC, not collapsed into the boolean', () => {
  const thin = repidPredicate.repidPredicate({
    score: 3723, threshold: 3000,
    evidence: EVIDENCE({
      measured: ['x402SuccessRate'], unmeasured: ['bftAccuracy', 'veritasCatchRate'],
      insufficient: ['latencyMs'], fullyMeasured: false, weakestConfidence: 0.02,
    }),
  });
  const solid = repidPredicate.repidPredicate({ score: 3723, threshold: 3000, evidence: EVIDENCE() });
  // Same score, same bound, same verdict — but distinguishable to a verifier.
  assert.equal(thin.publicInputs.fullyMeasured, false);
  assert.equal(solid.publicInputs.fullyMeasured, true);
  assert.equal(thin.publicInputs.measuredSignals, 1);
  assert.equal(thin.publicInputs.unmeasuredSignals, 2);
  assert.equal(thin.publicInputs.insufficientSignals, 1);
  assert.notEqual(thin.publicInputs.weakestConfidence, solid.publicInputs.weakestConfidence);
});

await check('THE SCORE STAYS OUT OF THE PUBLIC INPUTS', () => {
  const st = repidPredicate.repidPredicate({ score: 3723, threshold: 3000, evidence: EVIDENCE() });
  const pub = JSON.stringify(st.publicInputs);
  assert.ok(!pub.includes('3723'), `the private witness leaked into publicInputs: ${pub}`);
});

await check('A NON-POSITIVE THRESHOLD IS REFUSED (0 >= 0 passes an unevidenced agent)', () => {
  const ev = EVIDENCE({ measured: [], unmeasured: ['bftAccuracy','veritasCatchRate','x402SuccessRate','latencyMs'], fullyMeasured: false, weakestConfidence: 0 });
  assert.throws(() => repidPredicate.repidPredicate({ score: 0, threshold: 0, evidence: ev }), /threshold must be > 0/);
  assert.throws(() => repidPredicate.repidPredicate({ score: 0, threshold: -1, evidence: ev }), /threshold must be > 0/);
});

await check('an unevidenced agent scores 0 and FAILS a real threshold', async () => {
  const provider = new proofProvider.WebCryptoProofProvider();
  const st = repidPredicate.repidPredicate({
    score: 0, threshold: 3000,
    evidence: EVIDENCE({ measured: [], unmeasured: ['bftAccuracy','veritasCatchRate','x402SuccessRate','latencyMs'], fullyMeasured: false, weakestConfidence: 0 }),
  });
  const r = await provider.prove(st);
  assert.equal(r.predicateHolds, false, 'an agent with no evidence cleared the bar');
});

await check('evidence policy rejects a thin pass and accepts a solid one', () => {
  const policy = { requireFullyMeasured: true, minWeakestConfidence: 0.5, minMeasuredSignals: 4 };
  const thin = repidPredicate.repidPredicate({
    score: 3723, threshold: 3000,
    evidence: EVIDENCE({ measured: ['x402SuccessRate'], unmeasured: ['bftAccuracy'], insufficient: ['latencyMs'], fullyMeasured: false, weakestConfidence: 0.02 }),
  });
  const solid = repidPredicate.repidPredicate({ score: 3723, threshold: 3000, evidence: EVIDENCE() });

  const a = repidPredicate.evidenceMeetsPolicy(thin, policy);
  assert.equal(a.ok, false);
  assert.equal(a.reasons.length, 3, JSON.stringify(a.reasons));

  const b = repidPredicate.evidenceMeetsPolicy(solid, policy);
  assert.equal(b.ok, true, JSON.stringify(b.reasons));
});

await check('policy and predicate stay SEPARATE questions', async () => {
  // A thin record can still clear the bound. Policy is what decides whether to
  // act on it — merging the two would let a policy change alter what the
  // commitment binds.
  const provider = new proofProvider.WebCryptoProofProvider();
  const thin = repidPredicate.repidPredicate({
    score: 5000, threshold: 3000,
    evidence: EVIDENCE({ measured: ['x402SuccessRate'], unmeasured: ['bftAccuracy'], fullyMeasured: false, weakestConfidence: 0.01 }),
  });
  const r = await provider.prove(thin);
  assert.equal(r.predicateHolds, true, 'the score does clear the bound');
  assert.equal(repidPredicate.evidenceMeetsPolicy(thin, { requireFullyMeasured: true }).ok, false,
    'but the evidence should not satisfy a strict policy');
});

await check('a repid predicate rides inside a real control proof', async () => {
  const { human, agent } = await mkPrincipals();
  const provider = new proofProvider.WebCryptoProofProvider();
  const statement = repidPredicate.repidPredicate({
    score: 3723, threshold: 3000, evidence: EVIDENCE(), agentName: 'TORCH',
  });
  const proof = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['pay:usdc'], ttlSeconds: 300,
    predicate: { statement, provider },
  });
  const v = await controlProof.verifyControlProof(proof, {
    audience: AUD, seenNonces: new Set(), predicateProvider: provider,
  });
  assert.equal(v.valid, true, JSON.stringify(v.checks, null, 2));
  assert.equal(v.checks.predicate.outcome, 'VERIFIED');
  // Still honest about privacy.
  assert.match(v.checks.predicate.detail, /witnessHidden=false/);
});

// --- hash agility / interop tagging -----------------------------------------

await check('a disclosure names the hash that produced its root', async () => {
  const cred = await disclosure.buildCredential(CLAIMS);
  const d = await disclosure.toDisclosure(cred, ['country']);
  assert.equal(cred.alg, 'sha256-us-v1');
  assert.equal(d.alg, 'sha256-us-v1');
});

await check('AN UNSUPPORTED ALG IS A NAMED REFUSAL, not a hash mismatch', async () => {
  // The distinction matters: "I do not implement poseidon2" and "this proof is
  // forged" must not look the same to an operator. A parallel implementation
  // using a different hash should be diagnosable in one line.
  const cred = await disclosure.buildCredential(CLAIMS);
  const d = await disclosure.toDisclosure(cred, ['country']);
  d.alg = 'poseidon2-v1';
  const res = await disclosure.verifyDisclosure(d);
  assert.equal(res.valid, false);
  assert.match(res.reason, /unsupported hash 'poseidon2-v1'/);
  assert.match(res.reason, /this verifier supports/);
});

await check('the alg tag cannot be swapped to smuggle a root past verification', async () => {
  const cred = await disclosure.buildCredential(CLAIMS);
  const d = await disclosure.toDisclosure(cred, ['country']);
  d.alg = 'poseidon2-v1';
  const res = await disclosure.verifyDisclosure(d);
  assert.equal(res.valid, false);
  assert.deepEqual(res.claims, {});
});

await check('re-hashing a credential under a different alg is refused at source', async () => {
  const cred = await disclosure.buildCredential(CLAIMS);
  const fakePoseidon = {
    alg: 'poseidon2-v1',
    leaf: async (parts) => 'f' + parts.length,
    node: async (l, r) => 'f' + l + r,
  };
  await assert.rejects(
    disclosure.toDisclosure(cred, ['country'], fakePoseidon),
    /root the issuer never signed/
  );
});

await check('a custom hasher round-trips through build/disclose/verify', async () => {
  // Proves the seam is real — the tree logic does not assume SHA-256. Uses a
  // deliberately trivial hasher; it is testing the plumbing, not the crypto.
  let calls = 0;
  const toy = {
    alg: 'poseidon2-v1',
    leaf: async (parts) => { calls++; return 'L(' + parts.join('~') + ')'; },
    node: async (l, r) => { calls++; return 'N(' + l + '|' + r + ')'; },
  };
  const cred = await disclosure.buildCredential(CLAIMS, toy);
  assert.equal(cred.alg, 'poseidon2-v1');
  assert.ok(calls > 0, 'the custom hasher was never called');
  const d = await disclosure.toDisclosure(cred, ['country', 'tier'], toy);
  const res = await disclosure.verifyDisclosure(d, [toy]);
  assert.equal(res.valid, true, res.reason);
  assert.deepEqual(res.claims, { country: 'US', tier: 'Silver' });
});

await check('the default verifier still rejects a toy-hasher disclosure', async () => {
  const toy = {
    alg: 'poseidon2-v1',
    leaf: async (parts) => 'L(' + parts.join('~') + ')',
    node: async (l, r) => 'N(' + l + '|' + r + ')',
  };
  const cred = await disclosure.buildCredential(CLAIMS, toy);
  const d = await disclosure.toDisclosure(cred, ['country'], toy);
  const res = await disclosure.verifyDisclosure(d); // default: sha256 only
  assert.equal(res.valid, false, 'a verifier accepted an algorithm it does not implement');
  assert.match(res.reason, /unsupported hash/);
});

// --- nullifier / commitment binding contract --------------------------------

await check('THE POSEIDON2 PLACEHOLDER REFUSES TO COMPUTE', async () => {
  const s = new nullifier.PendingPoseidon2Scheme();
  assert.equal(s.parametersKnown, false);
  await assert.rejects(s.commit('secret'), /parameters are not available/);
  await assert.rejects(s.nullify('secret', 'd', 'sc'), /parameters are not available/);
  await assert.rejects(s.hashPair('a', 'b'), /parameters are not available/);
});

await check('the refusal names exactly what is missing', async () => {
  const s = new nullifier.PendingPoseidon2Scheme();
  const msg = await s.commit('x').then(() => '', (e) => e.message);
  for (const needed of ['field', 'width', 'round constants', 'test vectors']) {
    assert.ok(msg.includes(needed), `refusal does not name '${needed}'`);
  }
  assert.match(msg, /POSEIDON2-PARAMETER-REQUEST/);
});

await check('commit and nullifier tags are distinct', () => {
  assert.notEqual(nullifier.BINDING_TAGS.commit, nullifier.BINDING_TAGS.nullifier);
});

// Toy scheme for the CONTRACT only. Not Poseidon2, not cryptographically
// meaningful — it exists so the statement/witness plumbing is testable before
// the real parameters land. SHA-256 rather than a template, so it cannot echo
// its input and make a leak assertion pass vacuously.
const toyDigest = async (...parts) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('\u001f')));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
};
const toyScheme = {
  scheme: 'poseidon2-v1-PENDING-PARAMETERS',
  parametersKnown: false,
  commit: async (secret) => toyDigest('toy:commit', secret),
  nullify: async (secret, domain, scope) => toyDigest('toy:null', secret, domain, scope),
  hashPair: async (l, r) => toyDigest('toy:node', l, r),
};

const mkGroup = async (secrets) => {
  const commitments = await Promise.all(secrets.map((s) => toyScheme.commit(s)));
  const group = await nullifier.buildGroup(commitments, toyScheme);
  return { commitments, group };
};

await check('THE COMMITMENT IS PRIVATE — it is never a public input', async () => {
  // The correction. A public commitment is stable across presentations, so it
  // links every action of a holder; scope-varying nullifiers do not help when a
  // fixed identifier travels beside them.
  const { commitments, group } = await mkGroup(['s1', 's2', 's3', 's4']);
  const st = await nullifier.buildBindingStatement({
    secret: 's1', domain: 'trinity', scope: 'ownership:3747',
    groupRoot: group.root, membership: group.pathFor(commitments[0]), scheme: toyScheme,
  });
  assert.equal('commitment' in st.publicInputs, false, 'the commitment is public again');
  assert.equal(st.privateWitness.commitment, commitments[0]);
  const pub = JSON.stringify(st.publicInputs);
  assert.ok(!pub.includes(commitments[0]), 'the commitment leaked into publicInputs');
  assert.ok(!pub.includes('s1'), 'the secret leaked into publicInputs');
  assert.ok(nullifier.CIRCUIT_CONTRACT.publicInputs.includes('groupRoot'));
  assert.ok(!nullifier.CIRCUIT_CONTRACT.publicInputs.includes('commitment'));
});

await check('membership verifies for every member of the group', async () => {
  const secrets = ['s1', 's2', 's3', 's4', 's5'];
  const { commitments, group } = await mkGroup(secrets);
  for (let i = 0; i < secrets.length; i++) {
    const st = await nullifier.buildBindingStatement({
      secret: secrets[i], domain: 'trinity', scope: 'sc',
      groupRoot: group.root, membership: group.pathFor(commitments[i]), scheme: toyScheme,
    });
    const v = await nullifier.verifyBindingByRecomputation(st, toyScheme);
    assert.equal(v.valid, true, `member ${i}: ${v.reason}`);
  }
});

await check('A NON-MEMBER FAILS even with a valid secret and nullifier', async () => {
  const { commitments, group } = await mkGroup(['s1', 's2', 's3', 's4']);
  const st = await nullifier.buildBindingStatement({
    secret: 'outsider', domain: 'trinity', scope: 'sc',
    groupRoot: group.root, membership: group.pathFor(commitments[0]), scheme: toyScheme,
  });
  const v = await nullifier.verifyBindingByRecomputation(st, toyScheme);
  assert.equal(v.valid, false, 'a non-member proved membership');
  assert.match(v.reason, /not a member of the group/);
});

await check('THE BORROWED-MEMBER ATTACK IS REJECTED', async () => {
  // Present a commitment that IS in the group while nullifying with a different
  // secret. Recomputation must reject it.
  //
  // NOTE ON WHAT THIS PROVES. It rejects at the `commitment does not reopen`
  // check, which fires BEFORE the membership walk — so this does not isolate
  // "membership is walked from the computed commitment". A mutation swapping
  // that source survives this suite, because the reopen check already forces
  // the two equal in the TypeScript path. The property is only load-bearing in
  // the CIRCUIT, where no separate reopen step exists; it is recorded in
  // CIRCUIT_CONTRACT.mustAlsoHold[1] for the lane that builds it.
  const { commitments, group } = await mkGroup(['s1', 's2', 's3', 's4']);
  const st = await nullifier.buildBindingStatement({
    secret: 's1', domain: 'trinity', scope: 'sc',
    groupRoot: group.root, membership: group.pathFor(commitments[0]), scheme: toyScheme,
  });
  // Swap in member 2's commitment and path; the secret stays s1.
  st.privateWitness.commitment = commitments[1];
  st.privateWitness.membership = group.pathFor(commitments[1]);
  const v = await nullifier.verifyBindingByRecomputation(st, toyScheme);
  assert.equal(v.valid, false, "a prover borrowed another member's commitment");
  assert.match(v.reason, /commitment does not reopen/);
});

await check('different scopes yield different nullifiers (unlinkability across scopes)', async () => {
  const { commitments, group } = await mkGroup(['s1', 's2']);
  const mk = (scope) => nullifier.buildBindingStatement({
    secret: 's1', domain: 'trinity', scope,
    groupRoot: group.root, membership: group.pathFor(commitments[0]), scheme: toyScheme,
  });
  const a = await mk('ownership:3747');
  const b = await mk('ownership:3748');
  assert.notEqual(a.publicInputs.nullifier, b.publicInputs.nullifier,
    'one nullifier across scopes — contexts are linkable');
  assert.equal(a.publicInputs.groupRoot, b.publicInputs.groupRoot,
    'the group root should be stable across scopes');
});

await check('ANONYMITY SET SIZE IS REPORTED, not assumed', async () => {
  // A group of one is sound and offers no privacy. The number must travel.
  const one = nullifier.describeAnonymitySet(1);
  assert.equal(one.adequate, false);
  assert.match(one.note, /identifies the holder exactly/);
  assert.match(one.note, /Do not describe this as unlinkable/);
  const few = nullifier.describeAnonymitySet(3);
  assert.equal(few.adequate, false);
  const many = nullifier.describeAnonymitySet(64);
  assert.equal(many.adequate, true);
  assert.match(many.note, /one of 64/);
});

await check('a statement cannot be built without a group anchor', async () => {
  await assert.rejects(
    nullifier.buildBindingStatement({
      secret: 's', domain: 'd', scope: 'sc', groupRoot: '', membership: [], scheme: toyScheme,
    }),
    /groupRoot is required/
  );
});

await check('domain and scope are REQUIRED', async () => {
  const { commitments, group } = await mkGroup(['s1', 's2']);
  const base = {
    secret: 's1', domain: 'd', scope: 'sc',
    groupRoot: group.root, membership: group.pathFor(commitments[0]), scheme: toyScheme,
  };
  await assert.rejects(nullifier.buildBindingStatement({ ...base, domain: '' }), /domain is required/);
  await assert.rejects(nullifier.buildBindingStatement({ ...base, scope: '' }), /scope is required/);
  await assert.rejects(nullifier.buildBindingStatement({ ...base, secret: '' }), /secret is required/);
});

await check('RECOMPUTATION IS NOT A ZK PROOF, and says so', async () => {
  const { commitments, group } = await mkGroup(['s1', 's2']);
  const st = await nullifier.buildBindingStatement({
    secret: 's1', domain: 'trinity', scope: 'sc',
    groupRoot: group.root, membership: group.pathFor(commitments[0]), scheme: toyScheme,
  });
  const v = await nullifier.verifyBindingByRecomputation(st, toyScheme);
  assert.equal(v.valid, true, v.reason);
  assert.equal(v.provenWithoutSecret, false,
    'a recomputation that required the secret claimed to prove without it');
  assert.match(v.reason, /honest-prover binding/);
});

await check('a tampered nullifier FAILS recomputation', async () => {
  const { commitments, group } = await mkGroup(['s1', 's2']);
  const st = await nullifier.buildBindingStatement({
    secret: 's1', domain: 'trinity', scope: 'sc',
    groupRoot: group.root, membership: group.pathFor(commitments[0]), scheme: toyScheme,
  });
  st.publicInputs.nullifier = await toyScheme.nullify('other', 'trinity', 'sc');
  assert.equal((await nullifier.verifyBindingByRecomputation(st, toyScheme)).valid, false);
});

await check('a scheme mismatch is refused rather than recomputed', async () => {
  const { commitments, group } = await mkGroup(['s1', 's2']);
  const st = await nullifier.buildBindingStatement({
    secret: 's1', domain: 'd', scope: 'sc',
    groupRoot: group.root, membership: group.pathFor(commitments[0]), scheme: toyScheme,
  });
  const v = await nullifier.verifyBindingByRecomputation(st, { ...toyScheme, scheme: 'other-set' });
  assert.equal(v.valid, false);
  assert.match(v.reason, /but the supplied scheme is/);
});

await check('the circuit contract names membership and the trusted-root hazard', () => {
  const c = nullifier.CIRCUIT_CONTRACT;
  assert.equal(c.version, 'zkrepid-binding-v2');
  assert.ok(c.privateWitness.includes('commitment'), 'commitment must be witness');
  assert.ok(c.publicInputs.includes('groupRoot'));
  assert.equal(c.relations.length, 3, 'the membership relation is missing');
  assert.ok(c.relations.some((r) => /MerkleVerify/.test(r)));
  assert.ok(c.mustAlsoHold.some((s) => /COMMITMENT THE CIRCUIT COMPUTED/.test(s)));
  assert.ok(c.mustAlsoHold.some((s) => /VERIFIER independently trusts/.test(s)));
  assert.match(c.privacyCaveat, /bounded by the group size/);
});

// --- caveats ----------------------------------------------------------------

await check('maxValue is enforced against the action', () => {
  const cap = [{ type: 'maxValue', asset: 'USDC', amount: 100 }];
  const under = caveat.evaluateCaveats(cap, { value: { asset: 'USDC', amount: 50 } });
  assert.equal(under[0].outcome, 'VERIFIED');
  const over = caveat.evaluateCaveats(cap, { value: { asset: 'USDC', amount: 101 } });
  assert.equal(over[0].outcome, 'FAILED');
  assert.equal(caveat.caveatsPermit(over), false);

  // THE BOUNDARY. A cap of 100 must ALLOW 100 — "up to and including" is what a
  // spending limit means. Tested explicitly because 50-vs-101 leaves the
  // inclusive/exclusive choice unobserved, and a `<=` → `<` mutation survived
  // this suite until this line existed.
  const exact = caveat.evaluateCaveats(cap, { value: { asset: 'USDC', amount: 100 } });
  assert.equal(exact[0].outcome, 'VERIFIED', 'a cap of 100 refused exactly 100');
});

await check('A CAP CANNOT BE ROUTED AROUND BY SWITCHING ASSET', () => {
  // A cap on USDC says nothing about USDT. Treating it as inapplicable would
  // let a holder move unlimited value in another asset.
  const cap = [{ type: 'maxValue', asset: 'USDC', amount: 100 }];
  const r = caveat.evaluateCaveats(cap, { value: { asset: 'USDT', amount: 10_000 } });
  assert.equal(r[0].outcome, 'FAILED');
  assert.match(r[0].detail, /denominated in USDC/);
});

await check('toolAllowlist admits only listed tools', () => {
  const c = [{ type: 'toolAllowlist', tools: ['read', 'search'] }];
  assert.equal(caveat.evaluateCaveats(c, { tool: 'read' })[0].outcome, 'VERIFIED');
  assert.equal(caveat.evaluateCaveats(c, { tool: 'delete' })[0].outcome, 'FAILED');
});

await check('MAXCALLS REPORTS NOT_CHECKED RATHER THAN PASSING', () => {
  // A limit nobody counts is not a limit. Passing it silently would make the
  // grant misleading — worse than never claiming the limit at all.
  const c = [{ type: 'maxCalls', limit: 5 }];
  const r = caveat.evaluateCaveats(c, {});
  assert.equal(r[0].outcome, 'NOT_CHECKED');
  assert.match(r[0].detail, /needs a counter/);
  // And it does NOT fail the action — it is reported, not fatal.
  assert.equal(caveat.caveatsPermit(r), true);
});

await check('maxCalls IS enforced once a counter is supplied', () => {
  const c = [{ type: 'maxCalls', limit: 3 }];
  assert.equal(caveat.evaluateCaveats(c, { callsSoFar: 2 })[0].outcome, 'VERIFIED');
  assert.equal(caveat.evaluateCaveats(c, { callsSoFar: 3 })[0].outcome, 'FAILED');
});

await check('an undeclared value leaves maxValue NOT_CHECKED, not passed', () => {
  const r = caveat.evaluateCaveats([{ type: 'maxValue', asset: 'USDC', amount: 100 }], {});
  assert.equal(r[0].outcome, 'NOT_CHECKED');
});

await check('CAVEAT ATTENUATION: tightening allowed, loosening refused', () => {
  const parent = [{ type: 'maxValue', asset: 'USDC', amount: 100 }];
  assert.equal(caveat.isCaveatAttenuationOf([{ type: 'maxValue', asset: 'USDC', amount: 50 }], parent), true);
  assert.equal(caveat.isCaveatAttenuationOf([{ type: 'maxValue', asset: 'USDC', amount: 500 }], parent), false);
});

await check('DROPPING A CAVEAT COUNTS AS LOOSENING IT', () => {
  // The case most likely to be missed: an absent caveat looks like "nothing to
  // check" rather than "the limit was removed".
  const parent = [{ type: 'maxValue', asset: 'USDC', amount: 100 }];
  assert.equal(caveat.isCaveatAttenuationOf([], parent), false);
  assert.match(caveat.caveatViolations([], parent)[0], /drops maxValue/);
});

await check('a child may ADD caveats its parent did not have', () => {
  const parent = [{ type: 'maxValue', asset: 'USDC', amount: 100 }];
  const child = [
    { type: 'maxValue', asset: 'USDC', amount: 100 },
    { type: 'toolAllowlist', tools: ['read'] },
  ];
  assert.equal(caveat.isCaveatAttenuationOf(child, parent), true, 'adding a limit is narrowing');
});

await check('a toolAllowlist child must be a SUBSET of its parent', () => {
  const parent = [{ type: 'toolAllowlist', tools: ['read', 'search'] }];
  assert.equal(caveat.isCaveatAttenuationOf([{ type: 'toolAllowlist', tools: ['read'] }], parent), true);
  assert.equal(caveat.isCaveatAttenuationOf([{ type: 'toolAllowlist', tools: ['read', 'delete'] }], parent), false);
});

await check('caveat encoding is order-independent', () => {
  const a = caveat.encodeCaveats([{ type: 'maxCalls', limit: 3 }, { type: 'maxValue', asset: 'USDC', amount: 1 }]);
  const b = caveat.encodeCaveats([{ type: 'maxValue', asset: 'USDC', amount: 1 }, { type: 'maxCalls', limit: 3 }]);
  assert.equal(a, b, 'a JSON round trip could reorder these and break the signature');
});

await check('STRIPPING A CAVEAT FROM A SIGNED GRANT BREAKS THE SIGNATURE', () => {
  // Empty encodes distinctly from populated, so removal is always detectable.
  assert.notEqual(caveat.encodeCaveats([]), caveat.encodeCaveats([{ type: 'maxCalls', limit: 5 }]));
});

await check('caveats ride in a signed control proof and cannot be edited', async () => {
  const { human, agent } = await mkPrincipals();
  const proof = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['pay:usdc'], ttlSeconds: 300,
    caveats: [{ type: 'maxValue', asset: 'USDC', amount: 100 }],
  });
  const ok = await controlProof.verifyControlProof(proof, { audience: AUD, seenNonces: new Set() });
  assert.equal(ok.valid, true, JSON.stringify(ok.checks));

  proof.grant.caveats = [{ type: 'maxValue', asset: 'USDC', amount: 1_000_000 }];
  const tampered = await controlProof.verifyControlProof(proof, { audience: AUD, seenNonces: new Set() });
  assert.equal(tampered.valid, false, 'a raised cap survived signature verification');
  assert.equal(tampered.checks.humanAuthorization.outcome, 'FAILED');
});

await check('a delegation CANNOT loosen a parent caveat', async () => {
  const human = await identity.createHumanSSID();
  const supervisor = await identity.createAgentIdentity('SUPERVISOR');
  const worker = await identity.createAgentIdentity('WORKER');
  const root = await controlProof.issueControlProof({
    human, agent: supervisor, audience: AUD, capabilities: ['pay:*'], ttlSeconds: 3600,
    caveats: [{ type: 'maxValue', asset: 'USDC', amount: 100 }],
  });
  await assert.rejects(
    delegation.delegate({
      parent: root, delegator: supervisor, delegate: worker,
      capabilities: ['pay:usdc'], ttlSeconds: 300,
      caveats: [{ type: 'maxValue', asset: 'USDC', amount: 5000 }],
    }),
    /refusing to loosen caveats/
  );
  await assert.rejects(
    delegation.delegate({
      parent: root, delegator: supervisor, delegate: worker,
      capabilities: ['pay:usdc'], ttlSeconds: 300, caveats: [],
    }),
    /refusing to loosen caveats/
  );
});

await check('a delegation INHERITS parent caveats by default', async () => {
  const human = await identity.createHumanSSID();
  const supervisor = await identity.createAgentIdentity('SUPERVISOR');
  const worker = await identity.createAgentIdentity('WORKER');
  const root = await controlProof.issueControlProof({
    human, agent: supervisor, audience: AUD, capabilities: ['pay:*'], ttlSeconds: 3600,
    caveats: [{ type: 'maxValue', asset: 'USDC', amount: 100 }],
  });
  const link = await delegation.delegate({
    parent: root, delegator: supervisor, delegate: worker,
    capabilities: ['pay:usdc'], ttlSeconds: 300,
  });
  assert.deepEqual(link.grant.caveats, root.grant.caveats,
    'a delegation that named no caveats silently became unconstrained');
  const v = await delegation.verifyDelegationChain(link, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, true, JSON.stringify(v.links));
});

await check('a WELL-SIGNED loosened link FAILS at verification', async () => {
  const human = await identity.createHumanSSID();
  const supervisor = await identity.createAgentIdentity('SUPERVISOR');
  const worker = await identity.createAgentIdentity('WORKER');
  const root = await controlProof.issueControlProof({
    human, agent: supervisor, audience: AUD, capabilities: ['pay:*'], ttlSeconds: 3600,
    caveats: [{ type: 'maxValue', asset: 'USDC', amount: 100 }],
  });
  const rogue = await forgeLink(root, supervisor, worker, {
    delegatorDid: supervisor.did, delegateDid: worker.did, delegateName: 'WORKER',
    capabilities: ['pay:usdc'],
    caveats: [{ type: 'maxValue', asset: 'USDC', amount: 999999 }],
    audience: AUD, nonce: 'cav-loosen-0000000000',
    notBefore: root.grant.notBefore, expiresAt: root.grant.expiresAt,
  });
  const v = await delegation.verifyDelegationChain(rogue, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, false, 'a well-signed loosening verified');
  assert.ok(v.links.some((l) => /loosens caveats/.test(l.detail)), JSON.stringify(v.links));
});

// --- dual-auth memory access ------------------------------------------------

const memProof = async (capabilities) => {
  const human = await identity.createHumanSSID();
  const agent = await identity.createAgentIdentity('TORCH');
  const proof = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities, ttlSeconds: 300,
  });
  return { human, agent, proof };
};
const memCtx = () => ({ audience: AUD, seenNonces: new Set() });

await check('a matching grant permits the operation', async () => {
  const { proof } = await memProof(['memory:read:agent/TORCH']);
  const r = await memAuthz.authorizeMemoryAccess(
    proof, { operation: 'read', namespace: 'agent/TORCH' }, memCtx());
  assert.equal(r.outcome, 'GRANTED', r.reason);
  assert.equal(memAuthz.memoryAccessPermitted(r), true);
});

await check('NO PROOF IS DENIED, not NOT_CHECKED (fails closed)', async () => {
  const r = await memAuthz.authorizeMemoryAccess(
    undefined, { operation: 'read', namespace: 'agent/TORCH' }, memCtx());
  assert.equal(r.outcome, 'DENIED', 'an absent proof was reported as unchecked');
  assert.equal(memAuthz.memoryAccessPermitted(r), false);
});

await check('A READ GRANT NEVER PERMITS WRITE', async () => {
  // Reading is recoverable; writing is not. Memory poisoning is a live attack
  // on exactly this surface, so the convenience of "it can already see it" is
  // refused.
  const { proof } = await memProof(['memory:read:agent/TORCH']);
  const r = await memAuthz.authorizeMemoryAccess(
    proof, { operation: 'write', namespace: 'agent/TORCH' }, memCtx());
  assert.equal(r.outcome, 'DENIED', 'a read grant authorized a write');
  assert.equal(r.grantedTo, undefined, 'a denial still named a grantee');
});

await check('a write grant does not permit read either — they are separate', async () => {
  const { proof } = await memProof(['memory:write:agent/TORCH']);
  const r = await memAuthz.authorizeMemoryAccess(
    proof, { operation: 'read', namespace: 'agent/TORCH' }, memCtx());
  assert.equal(r.outcome, 'DENIED');
});

await check('CROSS-NAMESPACE READ IS DENIED', async () => {
  // The case that matters in a shared mesh: one agent reading another's memory.
  const { proof } = await memProof(['memory:read:agent/TORCH']);
  const r = await memAuthz.authorizeMemoryAccess(
    proof, { operation: 'read', namespace: 'agent/NEXUS' }, memCtx());
  assert.equal(r.outcome, 'DENIED', "an agent read another agent's namespace");
});

await check('a namespace wildcard covers namespaces but not operations', async () => {
  const { proof } = await memProof(['memory:read:*']);
  const ok = await memAuthz.authorizeMemoryAccess(
    proof, { operation: 'read', namespace: 'agent/ANYONE' }, memCtx());
  assert.equal(ok.outcome, 'GRANTED', ok.reason);
  const no = await memAuthz.authorizeMemoryAccess(
    proof, { operation: 'write', namespace: 'agent/ANYONE' }, memCtx());
  assert.equal(no.outcome, 'DENIED', 'memory:read:* authorized a write');
});

await check('`memory:*` GRANTS DELETE — the documented trap', async () => {
  // Reads as "memory access", grants destruction. Asserted so the hazard is
  // observable rather than a comment nobody runs.
  const { proof } = await memProof(['memory:*']);
  const r = await memAuthz.authorizeMemoryAccess(
    proof, { operation: 'delete', namespace: 'agent/TORCH' }, memCtx());
  assert.equal(r.outcome, 'GRANTED',
    'memory:* did not grant delete — if this changed, update the docs that warn about it');
});

await check('an expired proof is DENIED', async () => {
  const human = await identity.createHumanSSID();
  const agent = await identity.createAgentIdentity('TORCH');
  const t0 = new Date('2026-08-14T00:00:00Z');
  const proof = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['memory:read:agent/TORCH'],
    ttlSeconds: 60, now: t0,
  });
  const r = await memAuthz.authorizeMemoryAccess(
    proof, { operation: 'read', namespace: 'agent/TORCH' },
    { audience: AUD, seenNonces: new Set(), now: new Date('2026-08-14T01:00:00Z') });
  assert.equal(r.outcome, 'DENIED');
});

await check('a proof for another audience is DENIED', async () => {
  const human = await identity.createHumanSSID();
  const agent = await identity.createAgentIdentity('TORCH');
  // Deliberately NOT AUD. The first draft used 'trinity:pay', which IS AUD in
  // this suite, so the proof matched and the test asserted the opposite of what
  // it claimed. A fixture that accidentally satisfies the condition it means to
  // violate is a test that cannot fail.
  assert.notEqual(AUD, 'trinity:vault', 'pick an audience that is not AUD');
  const proof = await controlProof.issueControlProof({
    human, agent, audience: 'trinity:vault',
    capabilities: ['memory:read:agent/TORCH'], ttlSeconds: 300,
  });
  const r = await memAuthz.authorizeMemoryAccess(
    proof, { operation: 'read', namespace: 'agent/TORCH' }, memCtx());
  assert.equal(r.outcome, 'DENIED', 'a proof minted elsewhere opened memory');
});

await check('a DELEGATED sub-agent inherits narrowed memory access', async () => {
  const human = await identity.createHumanSSID();
  const supervisor = await identity.createAgentIdentity('SUPERVISOR');
  const worker = await identity.createAgentIdentity('WORKER');
  const root = await controlProof.issueControlProof({
    human, agent: supervisor, audience: AUD,
    capabilities: ['memory:read:*', 'memory:write:agent/SUPERVISOR'], ttlSeconds: 3600,
  });
  const link = await delegation.delegate({
    parent: root, delegator: supervisor, delegate: worker,
    capabilities: ['memory:read:agent/TORCH'], ttlSeconds: 300,
  });
  const ok = await memAuthz.authorizeMemoryAccess(
    link, { operation: 'read', namespace: 'agent/TORCH' }, memCtx());
  assert.equal(ok.outcome, 'GRANTED', ok.reason);
  assert.equal(ok.grantedTo, worker.did, 'the grantee should be the delegate, not the supervisor');

  // The worker did NOT receive the supervisor's write capability.
  const no = await memAuthz.authorizeMemoryAccess(
    link, { operation: 'write', namespace: 'agent/SUPERVISOR' }, memCtx());
  assert.equal(no.outcome, 'DENIED', 'a sub-agent inherited a capability it was not delegated');
});

await check('a missing audience is NOT_CHECKED and still not permissive', async () => {
  const { proof } = await memProof(['memory:read:agent/TORCH']);
  const r = await memAuthz.authorizeMemoryAccess(
    proof, { operation: 'read', namespace: 'agent/TORCH' }, {});
  assert.equal(r.outcome, 'NOT_CHECKED');
  assert.equal(memAuthz.memoryAccessPermitted(r), false, 'NOT_CHECKED was treated as permission');
});

await check('a namespace containing ":" is refused at construction', () => {
  assert.throws(() => memAuthz.memoryCapability('read', 'agent:TORCH'), /capability separator/);
  assert.throws(() => memAuthz.memoryCapability('read', '  '), /namespace is required/);
});

// --- portable harness bundle ------------------------------------------------

const H = '0'.repeat(64);
const mkBundle = async (over = {}) => {
  const human = await identity.createHumanSSID();
  const agent = await identity.createAgentIdentity(over.agentName ?? 'TORCH');
  const authority = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['pay:usdc'], ttlSeconds: 300,
  });
  const bundle = await harness.packHarness({
    agent, controllerDid: human.did, authority,
    skills: [{ name: 'trade', contentHash: `sha256:${H}` }],
    memory: { commitment: `commit-sha256:${H}`, itemCount: 42, takenAt: '2026-08-14T00:00:00Z' },
    ...over.pack,
  });
  return { human, agent, authority, bundle };
};

await check('a packed harness verifies end to end', async () => {
  const { bundle } = await mkBundle();
  const v = await harness.verifyHarness(bundle, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, true, JSON.stringify(v.parts, null, 2));
  assert.equal(v.parts.integrity.outcome, 'VERIFIED');
  assert.equal(v.parts.authority.outcome, 'VERIFIED');
  assert.deepEqual(v.grantedCapabilities, ['pay:usdc']);
});

await check('PARTS CANNOT BE SPLICED BETWEEN BUNDLES', async () => {
  // The central property. Both bundles are genuine and every individual part is
  // validly signed — but the combination was never asserted by anyone.
  const a = await mkBundle();
  const b = await mkBundle({ agentName: 'NEXUS' });
  const frankenstein = { ...a.bundle, authority: b.bundle.authority };
  const v = await harness.verifyHarness(frankenstein, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, false, "one agent's authority rode inside another's bundle");
  assert.equal(v.parts.integrity.outcome, 'FAILED');
  assert.match(v.parts.integrity.detail, /spliced/);
  assert.deepEqual(v.grantedCapabilities, []);
});

await check('a bundle claiming an agent its authority does not authorize FAILS', async () => {
  const a = await mkBundle();
  const other = await identity.createAgentIdentity('IMPOSTOR');
  // Re-sign so integrity passes; only the subject claim is wrong.
  const unsigned = { ...a.bundle, agentDid: other.did };
  delete unsigned.bundleSignature;
  const spoofed = {
    ...unsigned,
    bundleSignature: await identity.signAs(other, harness.bundlePayload(unsigned)),
  };
  const v = await harness.verifyHarness(spoofed, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, false, 'a bundle claimed an agent its authority never named');
  assert.equal(v.parts.authority.outcome, 'FAILED');
  assert.match(v.parts.authority.detail, /but its authority authorizes/);
});

await check('A BUNDLE IS NOT A BEARER TOKEN — wrong audience grants nothing', async () => {
  const { bundle } = await mkBundle();
  const v = await harness.verifyHarness(bundle, {
    audience: 'trinity:vault', seenNonces: new Set(),
  });
  assert.equal(v.valid, false, 'a bundle minted elsewhere granted authority here');
  assert.equal(v.parts.integrity.outcome, 'VERIFIED', 'integrity should still hold');
  assert.equal(v.parts.authority.outcome, 'FAILED');
  assert.deepEqual(v.grantedCapabilities, []);
});

await check('editing any covered field breaks the bundle signature', async () => {
  const { bundle } = await mkBundle();
  const edits = [
    ['agentName', (b) => { b.agentName = 'RENAMED'; }],
    ['controllerDid', (b) => { b.controllerDid = 'did:key:z6MkOther'; }],
    ['skills.contentHash', (b) => { b.skills = [{ name: 'trade', contentHash: `sha256:${'1'.repeat(64)}` }]; }],
    ['memory.itemCount', (b) => { b.memory.itemCount = 99999; }],
    ['packedAt', (b) => { b.packedAt = '2020-01-01T00:00:00Z'; }],
  ];
  for (const [field, mutate] of edits) {
    const tampered = JSON.parse(JSON.stringify(bundle));
    mutate(tampered);
    const v = await harness.verifyHarness(tampered, { audience: AUD, seenNonces: new Set() });
    assert.equal(v.parts.integrity.outcome, 'FAILED', `a covered field was editable: ${field}`);
  }
});

await check('SKILLS MUST BE HASH-PINNED, names alone are refused', async () => {
  const human = await identity.createHumanSSID();
  const agent = await identity.createAgentIdentity('TORCH');
  const authority = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['pay:usdc'], ttlSeconds: 300,
  });
  await assert.rejects(
    harness.packHarness({
      agent, controllerDid: human.did, authority,
      skills: [{ name: 'trade', contentHash: 'trust-me' }],
    }),
    /no usable content hash/
  );
});

await check('MEMORY CONTENTS NEVER TRAVEL IN THE BUNDLE', async () => {
  const { bundle } = await mkBundle();
  const blob = JSON.stringify(bundle);
  assert.ok(!blob.includes('"items"'), 'memory items appeared in the bundle');
  assert.match(bundle.memory.commitment, /^commit-sha256:[0-9a-f]{64}$/);
  // A malformed commitment is refused rather than accepted as opaque data.
  const human = await identity.createHumanSSID();
  const agent = await identity.createAgentIdentity('T');
  const authority = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['x'], ttlSeconds: 300,
  });
  await assert.rejects(
    harness.packHarness({
      agent, controllerDid: human.did, authority,
      memory: { commitment: 'here-is-all-my-memory', itemCount: 1, takenAt: 'now' },
    }),
    /must be a commitment/
  );
});

await check('the skills verdict does NOT claim the host runs that content', async () => {
  const { bundle } = await mkBundle();
  const v = await harness.verifyHarness(bundle, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.parts.skills.outcome, 'VERIFIED');
  assert.match(v.parts.skills.detail, /NOT an attestation/);
});

await check('a reputation claim rides along and reports its privacy honestly', async () => {
  const human = await identity.createHumanSSID();
  const agent = await identity.createAgentIdentity('TORCH');
  const authority = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['pay:usdc'], ttlSeconds: 300,
  });
  const provider = new proofProvider.WebCryptoProofProvider();
  const statement = repidPredicate.repidPredicate({
    score: 3723, threshold: 3000,
    evidence: { measured: ['a','b','c','d'], insufficient: [], unmeasured: [],
                fullyMeasured: true, weakestConfidence: 0.8, detail: {} },
  });
  const bundle = await harness.packHarness({
    agent, controllerDid: human.did, authority,
    reputation: { statement, result: await provider.prove(statement) },
  });
  const v = await harness.verifyHarness(bundle, {
    audience: AUD, seenNonces: new Set(), predicateProvider: provider,
  });
  assert.equal(v.valid, true, JSON.stringify(v.parts, null, 2));
  assert.equal(v.parts.reputation.outcome, 'VERIFIED');
  assert.match(v.parts.reputation.detail, /witnessHidden=false/);
  assert.ok(!JSON.stringify(v.parts).includes('3723'), 'the score leaked into the verdict');
});

await check('absent parts are NOT_CHECKED, never silently fine', async () => {
  const human = await identity.createHumanSSID();
  const agent = await identity.createAgentIdentity('BARE');
  const authority = await controlProof.issueControlProof({
    human, agent, audience: AUD, capabilities: ['x'], ttlSeconds: 300,
  });
  const bundle = await harness.packHarness({ agent, controllerDid: human.did, authority });
  const v = await harness.verifyHarness(bundle, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, true);
  for (const p of ['reputation', 'disclosure', 'skills', 'memory']) {
    assert.equal(v.parts[p].outcome, 'NOT_CHECKED', `${p} should be NOT_CHECKED when absent`);
  }
});

await check('a DELEGATED sub-agent can carry its own harness', async () => {
  const human = await identity.createHumanSSID();
  const supervisor = await identity.createAgentIdentity('SUPERVISOR');
  const worker = await identity.createAgentIdentity('WORKER');
  const root = await controlProof.issueControlProof({
    human, agent: supervisor, audience: AUD, capabilities: ['pay:*'], ttlSeconds: 3600,
  });
  const link = await delegation.delegate({
    parent: root, delegator: supervisor, delegate: worker,
    capabilities: ['pay:usdc'], ttlSeconds: 300,
  });
  const bundle = await harness.packHarness({
    agent: worker, controllerDid: human.did, authority: link,
  });
  const v = await harness.verifyHarness(bundle, { audience: AUD, seenNonces: new Set() });
  assert.equal(v.valid, true, JSON.stringify(v.parts, null, 2));
  assert.deepEqual(v.grantedCapabilities, ['pay:usdc'], 'the worker should carry only what it was delegated');
});

// --- reputation as a constrained transition ---------------------------------
//
// The claim under test is narrow on purpose: the SEQUENCE, not the score. Every
// assertion here either defends that claim or defends the boundary around it.

const TX_DOMAIN = 'trinity:reputation';
const TX_SECRETS = ['w1', 'w2', 'w3', 'w4'];
const TX_EVENT = {
  subject: 'agent:TORCH',
  signal: 'bft_vote_correct',
  observedAt: '2026-08-14T00:00:00Z',
};

const mkTransition = async (opts = {}) => {
  const { commitments, group } = await mkGroup(TX_SECRETS);
  const event = opts.event ?? TX_EVENT;
  const secret = opts.secret ?? 'w1';
  const scope = opts.scope ?? transition.scopeForSubject(event.subject, opts.epoch ?? '2026-08-14');
  const prevRoot = opts.prevRoot ?? transition.GENESIS_ROOT;
  const eventCommitment = await transition.commitEvent(event, toyScheme);
  return {
    publicInputs: {
      prevRoot,
      newRoot: await transition.appendEvent(prevRoot, eventCommitment, toyScheme),
      nullifier: await toyScheme.nullify(secret, TX_DOMAIN, scope),
      domain: TX_DOMAIN,
      scope,
      groupRoot: group.root,
    },
    privateWitness: {
      event,
      eventCommitment,
      secret,
      appenderCommitment: await toyScheme.commit(secret),
      membership: group.pathFor(commitments[0]),
    },
  };
};

await check('a well-formed transition recomputes, and never claims to be a proof', async () => {
  const st = await mkTransition();
  const v = await transition.verifyTransitionByRecomputation(st, toyScheme);
  assert.equal(v.valid, true, v.reason);
  assert.equal(v.provenWithoutWitness, false, 'recomputation reported itself as witness-free');
});

await check('THE VERDICT STATES THE BOUNDARY — sequence, not score', async () => {
  const st = await mkTransition();
  const v = await transition.verifyTransitionByRecomputation(st, toyScheme);
  assert.match(v.reason, /SEQUENCE, never the score/);
  // The two things it genuinely cannot establish must be named in the verdict
  // itself, not only in the contract — a caller reads the verdict.
  assert.match(v.reason, /unspent/);
  assert.match(v.reason, /prevRoot is the head/);
});

await check('EVERY PUBLIC INPUT IS LOAD-BEARING — mutating any one fails', async () => {
  // The generic form of the `frontier` bug: a field declared in the contract
  // that nothing actually constrains. Enumerated from the contract, so adding a
  // field without wiring it in fails here rather than shipping unconstrained.
  const mutators = {
    prevRoot: (st) => { st.publicInputs.prevRoot = 'zkrepid:reputation-genesis:v0'; },
    newRoot: (st) => { st.publicInputs.newRoot = 'f'.repeat(64); },
    nullifier: (st) => { st.publicInputs.nullifier = '0'.repeat(64); },
    domain: (st) => { st.publicInputs.domain = 'trinity:other'; },
    scope: (st) => { st.publicInputs.scope = transition.scopeForSubject('agent:RIVAL', '2026-08-14'); },
    groupRoot: (st) => { st.publicInputs.groupRoot = 'a'.repeat(64); },
  };
  for (const field of transition.TRANSITION_CONTRACT.publicInputs) {
    assert.ok(mutators[field], `no mutation defined for public input '${field}'`);
    const st = await mkTransition();
    mutators[field](st);
    const v = await transition.verifyTransitionByRecomputation(st, toyScheme);
    assert.equal(v.valid, false, `mutating public input '${field}' still verified`);
  }
});

await check('EVERY WITNESS FIELD IS LOAD-BEARING — mutating any one fails', async () => {
  const mutators = {
    event: (st) => { st.privateWitness.event = { ...st.privateWitness.event, signal: 'veritas_miss' }; },
    eventCommitment: (st) => { st.privateWitness.eventCommitment = 'b'.repeat(64); },
    secret: (st) => { st.privateWitness.secret = 'w2'; },
    appenderCommitment: (st) => { st.privateWitness.appenderCommitment = 'c'.repeat(64); },
    membership: (st) => { st.privateWitness.membership = []; },
  };
  for (const field of transition.TRANSITION_CONTRACT.privateWitness) {
    assert.ok(mutators[field], `no mutation defined for witness field '${field}'`);
    const st = await mkTransition();
    mutators[field](st);
    const v = await transition.verifyTransitionByRecomputation(st, toyScheme);
    assert.equal(v.valid, false, `mutating witness field '${field}' still verified`);
  }
});

await check('AN OUTSIDER CANNOT APPEND — non-membership fails even with a consistent statement', async () => {
  const st = await mkTransition({ secret: 'outsider' });
  const v = await transition.verifyTransitionByRecomputation(st, toyScheme);
  assert.equal(v.valid, false, 'a non-member extended a subject\'s reputation history');
  assert.match(v.reason, /not a member of the group/);
});

await check('THE BORROWED-MEMBER ATTACK FAILS — a real commitment, someone else\'s secret', async () => {
  // Found by COMPOUND mutation: deleting the appender reopen check AND walking
  // membership from the witness commitment left every other assertion green,
  // because no fixture separated the two values. Group leaves are public by
  // construction — that is what makes the root shareable — so an outsider can
  // always obtain a member's commitment and path. What they cannot obtain is
  // the secret behind it, and that is the only thing standing between them and
  // an append. Tested at the point where the two come apart.
  const { commitments, group } = await mkGroup(TX_SECRETS);
  const st = await mkTransition({ secret: 'outsider' });
  st.privateWitness.appenderCommitment = commitments[0];   // a genuine member's
  st.privateWitness.membership = group.pathFor(commitments[0]);
  const v = await transition.verifyTransitionByRecomputation(st, toyScheme);
  assert.equal(v.valid, false, 'an outsider appended using a borrowed commitment');
  assert.match(v.reason, /appender commitment does not reopen/);
});

await check('THE SCOPE MUST BIND THE SUBJECT', async () => {
  // A scope that does not name the subject makes one write authorization valid
  // against every agent's history — the cheapest possible reputation attack.
  const st = await mkTransition({ scope: 'reputation:everything' });
  const v = await transition.verifyTransitionByRecomputation(st, toyScheme);
  assert.equal(v.valid, false);
  assert.match(v.reason, /does not bind this subject/);
});

await check('the scope must carry a NON-EMPTY epoch, not just the subject', async () => {
  // A subject prefix with nothing after it is a scope that never rotates, i.e.
  // one authorization appending forever. Rejected at both ends.
  assert.throws(() => transition.scopeForSubject('agent:TORCH', ''), /epoch is required/);
  const bare = ['reputation', 'agent:TORCH', ''].join(String.fromCharCode(31));
  const st = await mkTransition({ scope: bare });
  const v = await transition.verifyTransitionByRecomputation(st, toyScheme);
  assert.equal(v.valid, false, 'an epoch-less scope was accepted');
});

await check('nullifiers separate by subject and by epoch', async () => {
  const a = transition.scopeForSubject('agent:TORCH', 'e1');
  const b = transition.scopeForSubject('agent:RIVAL', 'e1');
  const c = transition.scopeForSubject('agent:TORCH', 'e2');
  const [na, nb, nc] = await Promise.all(
    [a, b, c].map((s) => toyScheme.nullify('w1', TX_DOMAIN, s))
  );
  assert.notEqual(na, nb, 'one nullifier across subjects — a write grant leaks to other agents');
  assert.notEqual(na, nc, 'one nullifier across epochs — the write budget is unbounded');
});

await check('THE APPEND IS POSITIONAL — H(prev, event) is not H(event, prev)', async () => {
  // Found by mutation: replacing the append with a SORTED two-input hash left
  // every other assertion here green, because the multi-event order test
  // compares chains whose inner roots already differ. A commutative node hash
  // makes "root R extended by event E" indistinguishable from "root E extended
  // by R", so an attacker can reinterpret which value was the history and which
  // was the event. Asserted at the single-append level, where it is visible.
  const a = 'aa'.repeat(16);
  const b = 'bb'.repeat(16);
  assert.notEqual(
    await transition.appendEvent(a, b, toyScheme),
    await transition.appendEvent(b, a, toyScheme),
    'the append is order-insensitive — history and event are interchangeable'
  );
});

await check('APPEND ORDER IS PART OF THE HISTORY', async () => {
  const mk = (signal) => transition.commitEvent(
    { subject: 'agent:TORCH', signal, observedAt: '2026-08-14T00:00:00Z' }, toyScheme
  );
  const [a, b] = await Promise.all([mk('bft_vote_correct'), mk('veritas_catch')]);
  const ab = await transition.appendEvent(
    await transition.appendEvent(transition.GENESIS_ROOT, a, toyScheme), b, toyScheme);
  const ba = await transition.appendEvent(
    await transition.appendEvent(transition.GENESIS_ROOT, b, toyScheme), a, toyScheme);
  assert.notEqual(ab, ba, 'reordering two events left the root unchanged');
});

await check('DROPPING AN EVENT CHANGES THE ROOT', async () => {
  const mk = (signal) => transition.commitEvent(
    { subject: 'agent:TORCH', signal, observedAt: '2026-08-14T00:00:00Z' }, toyScheme
  );
  const [a, b] = await Promise.all([mk('bft_vote_incorrect'), mk('x402_settled')]);
  let full = transition.GENESIS_ROOT;
  for (const c of [a, b]) full = await transition.appendEvent(full, c, toyScheme);
  const truncated = await transition.appendEvent(transition.GENESIS_ROOT, b, toyScheme);
  assert.notEqual(full, truncated, 'removing the unflattering event was invisible');
});

await check('TWO EVENTS CANNOT SHARE AN ENCODING — the concatenation collision', async () => {
  // The bug this encoding exists to prevent. Joined with '', these two produce
  // the identical string: '1' + '2026' === '12' + '026'. One commitment, two
  // reopenings, and "which event was committed" has two answers.
  const one = { subject: 'a', signal: 'latency_sample', value: 1, observedAt: '2026' };
  const two = { subject: 'a', signal: 'latency_sample', value: 12, observedAt: '026' };
  assert.equal(
    [one.value, one.observedAt].join('') , [two.value, two.observedAt].join(''),
    'the fixture no longer exercises the collision it was written for'
  );
  const [c1, c2] = await Promise.all([
    transition.commitEvent(one, toyScheme), transition.commitEvent(two, toyScheme),
  ]);
  assert.notEqual(c1, c2, 'two distinct events share one commitment');
});

await check('a field containing the separator is REFUSED, not escaped', async () => {
  const sep = String.fromCharCode(31);
  await assert.rejects(
    transition.commitEvent(
      { subject: `a${sep}b`, signal: 'x402_settled', observedAt: '2026' }, toyScheme),
    /field separator/
  );
  assert.throws(() => transition.scopeForSubject(`a${sep}b`, 'e1'), /field separator/);
});

await check('an unknown signal is refused rather than committed', async () => {
  await assert.rejects(
    transition.commitEvent(
      { subject: 'a', signal: 'totally_made_up', observedAt: '2026' }, toyScheme),
    /unknown signal/
  );
  // Type and runtime list must agree, or the boundary check is decorative.
  assert.equal(transition.REPUTATION_SIGNALS.length, 7);
});

await check('an incomplete event is refused at commit time', async () => {
  const base = { subject: 'a', signal: 'x402_settled', observedAt: '2026' };
  await assert.rejects(transition.commitEvent({ ...base, subject: '' }, toyScheme), /subject is required/);
  await assert.rejects(transition.commitEvent({ ...base, observedAt: '' }, toyScheme), /observedAt is required/);
});

await check('GENESIS_ROOT is not hash-shaped, so a history root cannot pass as a group root', async () => {
  const g = transition.GENESIS_ROOT;
  assert.ok(!/^[0-9a-f]{64}$/i.test(g), 'the genesis constant looks like a digest');
  assert.notEqual(g, '');
  const commitments = await Promise.all(TX_SECRETS.map((s) => toyScheme.commit(s)));
  assert.ok(!commitments.includes(g), 'the genesis constant collides with a member commitment');
  // And the contract must not rely on this argument silently.
  assert.ok(
    transition.TRANSITION_CONTRACT.mustAlsoHold.some((s) => /domain-separated in the circuit/.test(s)),
    'the circuit is left to inherit an argument instead of a constraint'
  );
});

await check('the event tag is distinct from the identity tags', () => {
  assert.notEqual(transition.TRANSITION_TAG, transition.IDENTITY_TAGS.commit);
  assert.notEqual(transition.TRANSITION_TAG, transition.IDENTITY_TAGS.nullifier);
  assert.deepEqual(transition.IDENTITY_TAGS, nullifier.BINDING_TAGS);
});

await check('RECOMPUTATION DOES NOT DETECT A REPLAY — and the contract says whose job it is', async () => {
  // Verifying the same statement twice succeeds twice. That is correct: a spent
  // set is state this function does not have. The failure would be pretending
  // otherwise, so this asserts the limit rather than a fix.
  const st = await mkTransition();
  const first = await transition.verifyTransitionByRecomputation(st, toyScheme);
  const second = await transition.verifyTransitionByRecomputation(st, toyScheme);
  assert.equal(first.valid, true);
  assert.equal(second.valid, true, 'the fixture no longer demonstrates the limit');
  assert.ok(
    transition.TRANSITION_CONTRACT.mustAlsoHold.some((s) => /SPENT against a durable set/.test(s)),
    'replay protection is not assigned to anyone'
  );
});

await check('the transition contract names the four things no circuit can discharge', () => {
  const c = transition.TRANSITION_CONTRACT;
  assert.equal(c.version, 'zkrepid-reputation-transition-v2');
  for (const [name, re] of [
    ['spent set', /SPENT against a durable set/],
    ['head-of-chain', /CURRENT head the verifier holds/],
    ['trusted group root', /VERIFIER independently trusts/],
    ['epoch schedule', /epoch inside scope advances on a schedule/],
    ['borrowed member', /appenderCommitment the circuit COMPUTED/],
    ['tag separation', /event tag is distinct/],
    ['positional node hash', /chain node hash is POSITIONAL/],
  ]) {
    assert.ok(c.mustAlsoHold.some((s) => re.test(s)), `mustAlsoHold does not name: ${name}`);
  }
  assert.equal(c.relations.length, 6);
  assert.match(c.provesTheSequenceNotTheScore, /does NOT prove\s+the resulting score/);
  assert.match(c.observedAtIsAsserted, /A prover controls it/);
});

await check('the read-time half points at a file that exists and shrinks toward ZERO', () => {
  const r = transition.READ_TIME_SCORING;
  // A dangling pointer here is how the two halves drift apart: the contract
  // would keep saying "the other half lives over there" after it moved.
  readFileSync(join(process.cwd(), r.implementedBy), 'utf8');
  assert.ok(
    r.appliedAtReadTime.some((s) => /shrinkage toward ZERO/.test(s)),
    'shrinking toward the fleet mean is the reputation-laundering vector'
  );
  assert.equal(r.publicInputRequired, 'now');
});

rmSync(outDir, { recursive: true, force: true });

if (failed === 0) {
  console.log(`check:identity — VERIFIED. ${passed} assertions across did:key, selective disclosure, proof provider and dual-auth control proofs.`);
} else {
  console.error(`check:identity — ${failed} FAILED, ${passed} passed.`);
}
