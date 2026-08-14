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
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.identity-check-'));

let did, disclosure, identity, proofProvider, controlProof, capability, nonceStore;
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
      '--outDir', outDir,
      '--module', 'commonjs',
      '--target', 'es2022',
      '--lib', 'es2022,dom',
      '--moduleResolution', 'node',
      '--esModuleInterop',
      '--strict',
    ],
    { stdio: 'pipe' }
  );
  // tsc roots the output at the common parent of the inputs, which is the
  // identity directory itself — so the .js files land directly in outDir.
  const base = outDir;
  did = await import(pathToFileURL(join(base, 'did.js')).href);
  disclosure = await import(pathToFileURL(join(base, 'disclosure.js')).href);
  identity = await import(pathToFileURL(join(base, 'identity.js')).href);
  proofProvider = await import(pathToFileURL(join(base, 'proof-provider.js')).href);
  controlProof = await import(pathToFileURL(join(base, 'control-proof.js')).href);
  capability = await import(pathToFileURL(join(base, 'capability.js')).href);
  nonceStore = await import(pathToFileURL(join(base, 'nonce-store.js')).href);
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
  const files = [
    'did.ts', 'disclosure.ts', 'identity.ts',
    'capability.ts', 'proof-provider.ts', 'control-proof.ts', 'nonce-store.ts',
  ];
  for (const f of files) {
    const buf = readFileSync(`lib/trustshell/identity/${f}`);
    for (const b of buf) {
      const isAllowedWhitespace = b === 0x09 || b === 0x0a || b === 0x0d;
      assert.ok(
        b >= 0x20 || isAllowedWhitespace,
        `${f} contains a raw control byte 0x${b.toString(16).padStart(2, '0')} — write it as an escape`
      );
    }
  }
});

rmSync(outDir, { recursive: true, force: true });

if (failed === 0) {
  console.log(`check:identity — VERIFIED. ${passed} assertions across did:key, selective disclosure, proof provider and dual-auth control proofs.`);
} else {
  console.error(`check:identity — ${failed} FAILED, ${passed} passed.`);
}
