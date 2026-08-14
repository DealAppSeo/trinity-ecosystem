#!/usr/bin/env node
//
// check-custody-shadow.mjs — assertions for lib/trustshell/CustodyShadow.ts
//
// This module sits beside a LIVE authorization gate (VaultPermission.ts:48), so
// the properties that matter are the ones whose absence would let an
// observability feature break vault access, or let a run of "we could not
// compare" be read as "the two approaches agree".
//
//   - it NEVER throws, whatever the proof or the database does
//   - "no proof presented" is not_comparable, and says it is not agreement
//   - shadow_looser is distinguishable from shadow_stricter
//   - a recording failure does not propagate

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.custody-shadow-check-'));

let shadow, idm, cp;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/CustodyShadow.ts',
      'lib/trustshell/identity/identity.ts',
      'lib/trustshell/identity/control-proof.ts',
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
  shadow = await import(pathToFileURL(join(outDir, 'trustshell', 'CustodyShadow.js')).href);
  idm = await import(pathToFileURL(join(outDir, 'trustshell', 'identity', 'identity.js')).href);
  cp = await import(pathToFileURL(join(outDir, 'trustshell', 'identity', 'control-proof.js')).href);
} catch (err) {
  console.error('Could not compile CustodyShadow:');
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

/** Captures rows instead of writing them. */
const recorder = () => {
  const rows = [];
  return {
    rows,
    client: () => ({ from: () => ({ insert: async (r) => { rows.push(r); return { error: null }; } }) }),
  };
};

/** A client whose insert always fails, to prove recording errors are contained. */
const brokenClient = () => ({
  from: () => ({ insert: async () => ({ error: { message: 'table missing' } }) }),
});

/** A client whose insert THROWS, which is different from returning an error. */
const throwingClient = () => ({
  from: () => ({ insert: async () => { throw new Error('connection reset'); } }),
});

const validProof = async () => {
  const human = await idm.createHumanSSID();
  const agent = await idm.createAgentIdentity('VAULTBOT');
  return cp.issueControlProof({
    human, agent,
    audience: shadow.VAULT_AUDIENCE,
    capabilities: [shadow.VAULT_CAPABILITY],
    ttlSeconds: 300,
  });
};

const base = { agentName: 'VAULTBOT', vaultId: 'v1', vaultRequiresCustody: true };

// --- the expected-early case -------------------------------------------------

await check('NO PROOF IS not_comparable, AND SAYS IT IS NOT AGREEMENT', async () => {
  // The failure mode this guards: reading a long run of not_comparable as "the
  // shadow agrees with the gate" and switching on that basis.
  const r = recorder();
  const s = new shadow.CustodyShadow(r.client);
  const o = await s.observe({ ...base, legacyCustodyVerified: true });
  assert.equal(o.verdict, 'not_comparable');
  assert.equal(o.proofPermits, null);
  assert.match(o.detail, /NOT that the two/);
  assert.equal(r.rows.length, 1, 'the observation was not recorded');
});

// --- the four comparable verdicts -------------------------------------------

await check('legacy allow + proof allow -> agree_allow', async () => {
  const r = recorder();
  const s = new shadow.CustodyShadow(r.client);
  const o = await s.observe({ ...base, legacyCustodyVerified: true, controlProof: await validProof() });
  assert.equal(o.verdict, 'agree_allow', o.detail);
  assert.equal(o.proofPermits, true);
});

await check('legacy DENY + proof allow -> shadow_looser (the dangerous direction)', async () => {
  const r = recorder();
  const s = new shadow.CustodyShadow(r.client);
  const o = await s.observe({ ...base, legacyCustodyVerified: false, controlProof: await validProof() });
  assert.equal(o.verdict, 'shadow_looser', o.detail);
  assert.match(o.detail, /grant access the live gate/);
});

await check('legacy allow + proof deny -> shadow_stricter', async () => {
  const r = recorder();
  const s = new shadow.CustodyShadow(r.client);
  // An expired proof denies.
  const human = await idm.createHumanSSID();
  const agent = await idm.createAgentIdentity('VAULTBOT');
  const t0 = new Date('2026-08-14T00:00:00Z');
  const proof = await cp.issueControlProof({
    human, agent, audience: shadow.VAULT_AUDIENCE,
    capabilities: [shadow.VAULT_CAPABILITY], ttlSeconds: 60, now: t0,
  });
  const o = await s.observe({ ...base, legacyCustodyVerified: true, controlProof: proof });
  assert.equal(o.verdict, 'shadow_stricter', o.detail);
  assert.match(o.detail, /TIGHTEN/);
});

await check('legacy deny + proof deny -> agree_deny', async () => {
  const r = recorder();
  const s = new shadow.CustodyShadow(r.client);
  const human = await idm.createHumanSSID();
  const agent = await idm.createAgentIdentity('VAULTBOT');
  const t0 = new Date('2026-08-14T00:00:00Z');
  const proof = await cp.issueControlProof({
    human, agent, audience: shadow.VAULT_AUDIENCE,
    capabilities: [shadow.VAULT_CAPABILITY], ttlSeconds: 60, now: t0,
  });
  const o = await s.observe({ ...base, legacyCustodyVerified: false, controlProof: proof });
  assert.equal(o.verdict, 'agree_deny', o.detail);
});

await check('a proof minted for another audience does NOT satisfy the vault gate', async () => {
  const r = recorder();
  const s = new shadow.CustodyShadow(r.client);
  const human = await idm.createHumanSSID();
  const agent = await idm.createAgentIdentity('VAULTBOT');
  const proof = await cp.issueControlProof({
    human, agent, audience: 'trinity:pay',          // wrong audience
    capabilities: [shadow.VAULT_CAPABILITY], ttlSeconds: 300,
  });
  const o = await s.observe({ ...base, legacyCustodyVerified: true, controlProof: proof });
  assert.equal(o.proofPermits, false, 'a trinity:pay proof was accepted for the vault');
  assert.equal(o.verdict, 'shadow_stricter');
});

await check('a proof lacking vault:access does NOT satisfy the gate', async () => {
  const r = recorder();
  const s = new shadow.CustodyShadow(r.client);
  const human = await idm.createHumanSSID();
  const agent = await idm.createAgentIdentity('VAULTBOT');
  const proof = await cp.issueControlProof({
    human, agent, audience: shadow.VAULT_AUDIENCE,
    capabilities: ['read:memory'], ttlSeconds: 300,
  });
  const o = await s.observe({ ...base, legacyCustodyVerified: true, controlProof: proof });
  assert.equal(o.proofPermits, false);
});

// --- containment: this must never break the vault ---------------------------

await check('A MALFORMED PROOF IS RECORDED AS error, NOT THROWN', async () => {
  const r = recorder();
  const s = new shadow.CustodyShadow(r.client);
  // A grant naming a DID that cannot parse makes did.ts throw by design.
  const o = await s.observe({
    ...base, legacyCustodyVerified: true,
    controlProof: {
      grant: { humanDid: 'did:web:nope', agentDid: 'did:web:nope', agentName: 'x',
               capabilities: [], caveats: [], audience: shadow.VAULT_AUDIENCE,
               nonce: 'n', notBefore: '2026-01-01T00:00:00Z', expiresAt: '2030-01-01T00:00:00Z' },
      humanSignature: 'zzz', agentSignature: 'zzz',
    },
  });
  assert.equal(o.verdict, 'error', 'a throwing verification escaped as something else');
  assert.equal(o.proofPermits, null);
  assert.match(o.detail, /vault decision unaffected/);
});

await check('A FAILED RECORDING DOES NOT PROPAGATE', async () => {
  const s = new shadow.CustodyShadow(brokenClient);
  const o = await s.observe({ ...base, legacyCustodyVerified: true });
  assert.equal(o.verdict, 'not_comparable', 'an insert error changed the verdict');
});

await check('A THROWING DATABASE CLIENT DOES NOT PROPAGATE', async () => {
  // Different path from an error-returning insert: this one throws.
  const s = new shadow.CustodyShadow(throwingClient);
  const o = await s.observe({ ...base, legacyCustodyVerified: false });
  assert.equal(o.verdict, 'not_comparable');
  assert.equal(o.legacyPermits, false);
});

// --- the legacy verdict is reported faithfully ------------------------------

await check('a vault not requiring custody permits regardless of the boolean', async () => {
  const r = recorder();
  const s = new shadow.CustodyShadow(r.client);
  const o = await s.observe({
    ...base, vaultRequiresCustody: false, legacyCustodyVerified: false,
  });
  assert.equal(o.legacyPermits, true, 'custody was enforced on a vault that does not require it');
});

await check('every observation is marked shadowMode with the gate unchanged', async () => {
  const r = recorder();
  const s = new shadow.CustodyShadow(r.client);
  await s.observe({ ...base, legacyCustodyVerified: true });
  const row = r.rows[0];
  assert.equal(row.action, 'custody_shadow_observation');
  assert.equal(row.metadata.shadowMode, true);
  assert.equal(row.metadata.gateUnchanged, true,
    'a recorded observation did not state that the gate was left alone');
});

await check('the analysis query reads not_comparable first', () => {
  // The query is versioned with the code that produces the data so the caveat
  // travels with it, rather than living in someone's shell history.
  assert.match(shadow.SHADOW_ANALYSIS_SQL, /not_comparable FIRST/);
  assert.match(shadow.SHADOW_ANALYSIS_SQL, /custody_shadow_observation/);
});

rmSync(outDir, { recursive: true, force: true });

if (failed === 0) {
  console.log(`check:custody-shadow — VERIFIED. ${passed} assertions; shadow mode observes and never decides.`);
} else {
  console.error(`check:custody-shadow — ${failed} FAILED, ${passed} passed.`);
}
