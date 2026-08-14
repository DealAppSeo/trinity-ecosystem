#!/usr/bin/env node
//
// check-zkp-attestation.mjs — assertions for lib/trustshell/ZKPAttestation.ts
//
// The properties worth protecting are the ones whose absence let a SHA-256 of a
// timestamp be published on-chain labelled `groth16`:
//
//   - it never claims to be proven
//   - signals are DERIVED from inputs, not asserted
//   - a claim with no check behind it is ABSENT, not `false`
//   - the commitment can actually be reopened
//
// The service touches Supabase in generateKYAAttestation, so these tests target
// the pure parts: commitment construction and verification. That is where the
// dishonesty lived.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(tmpdir(), 'trustshell-zkp-'));

// The module imports '@/lib/supabase-admin', which tsc cannot resolve standalone
// and which would build a client at import time. Compile a copy with that import
// stubbed: the commitment path under test never touches it.
const src = (await import('node:fs')).readFileSync('lib/trustshell/ZKPAttestation.ts', 'utf8')
  .replace(
    "import { getSupabaseAdmin } from '@/lib/supabase-admin';",
    'const getSupabaseAdmin = () => ({ from: (_t: string) => ({ insert: async (_r: unknown) => ({ error: null }) }) });'
  );
const shimPath = join(outDir, 'ZKPAttestation.ts');
writeFileSync(shimPath, src);

let M;
try {
  execFileSync(
    localTsc(),
    [shimPath, '--outDir', outDir, '--module', 'commonjs', '--target', 'es2022', '--lib', 'es2022,dom'],
    { stdio: 'pipe' }
  );
  M = await import(pathToFileURL(join(outDir, 'ZKPAttestation.js')).href);
} catch (err) {
  console.error('Could not compile lib/trustshell/ZKPAttestation.ts:');
  console.error(String(err.stdout ?? '') + String(err.stderr ?? err.message));
  process.exit(1);
}

let passed = 0;
const check = (name, fn) => {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') return r.then(() => { passed++; }, (e) => {
      console.error(`FAIL: ${name}\n  ${e.message}`); process.exitCode = 1;
    });
    passed++;
  } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

const svc = new M.ZKPAttestationService();
const base = {
  agentName: 'TORCH',
  repidScore: 6000,
  threshold: 5000,
  humanCustodyBound: true,
  salt: 'deadbeefdeadbeefdeadbeefdeadbeef',
  now: '2026-08-14T00:00:00.000Z',
};

const att = await svc.generateKYAAttestation(base);

await check('never claims to be proven', () => {
  assert.equal(att.proven, false);
  assert.equal(att.proofSystem, 'none');
  assert.equal(att.circuitType, null);
});

await check('does not emit anything shaped like an IPFS CID', () => {
  assert.ok(!att.commitment.startsWith('Qm'), `commitment looks like a CIDv0: ${att.commitment}`);
  assert.match(att.commitment, /^commit-sha256:[0-9a-f]{64}$/);
});

await check('carries no verificationKey or groth16 claim', () => {
  const blob = JSON.stringify(att);
  assert.ok(!/groth16/i.test(blob), 'groth16 appears in the attestation');
  assert.ok(!('verificationKey' in att), 'verificationKey is still present');
});

await check('signals are DERIVED — a failing agent is not asserted to pass', async () => {
  const failing = await svc.generateKYAAttestation({ ...base, repidScore: 10, threshold: 5000 });
  assert.equal(failing.publicSignals.repidMeetsThreshold, false,
    'a below-threshold agent still reported meeting the threshold');
  assert.equal(att.publicSignals.repidMeetsThreshold, true);
});

await check('humanCustodyBound reflects the input, both ways', async () => {
  const noCustody = await svc.generateKYAAttestation({ ...base, humanCustodyBound: false });
  assert.equal(noCustody.publicSignals.humanCustodyBound, false);
  assert.equal(att.publicSignals.humanCustodyBound, true);
});

await check('an unchecked claim is ABSENT, not false', () => {
  // false would assert the agent IS sanctioned. Absence is the honest encoding.
  assert.ok(!('entityNotSanctioned' in att.publicSignals),
    'entityNotSanctioned is being asserted as a signal again');
  assert.ok('entityNotSanctioned' in att.notAttested);
  assert.match(att.notAttested.entityNotSanctioned, /no sanctions screening/i);
});

await check('every publicSignal is a boolean derived value', () => {
  for (const [k, v] of Object.entries(att.publicSignals)) {
    assert.equal(typeof v, 'boolean', `${k} is not a boolean`);
  }
  assert.ok(Object.keys(att.publicSignals).length >= 2);
});

await check('the commitment can be reopened', async () => {
  assert.equal(await svc.verifyCommitment(base, att.commitment), true);
});

await check('a changed score breaks the commitment', async () => {
  assert.equal(await svc.verifyCommitment({ ...base, repidScore: 6001 }, att.commitment), false);
});

await check('a changed salt breaks the commitment', async () => {
  assert.equal(await svc.verifyCommitment({ ...base, salt: 'aa'.repeat(16) }, att.commitment), false);
});

await check('a changed agent breaks the commitment', async () => {
  assert.equal(await svc.verifyCommitment({ ...base, agentName: 'VERITAS' }, att.commitment), false);
});

await check('the same inputs are reproducible — no hidden clock in the preimage', async () => {
  const again = await svc.generateKYAAttestation({ ...base, now: '2030-01-01T00:00:00.000Z' });
  assert.equal(again.commitment, att.commitment,
    'commitment changed with the timestamp; it cannot be reopened from its inputs');
});

await check('salt is returned so the commitment is verifiable later', () => {
  assert.equal(att.salt, base.salt);
  assert.ok(att.commitmentPreimage.includes('salt'));
});

await check('a generated salt is random and long enough', async () => {
  const a = await svc.generateKYAAttestation({ ...base, salt: undefined });
  const b = await svc.generateKYAAttestation({ ...base, salt: undefined });
  assert.notEqual(a.salt, b.salt, 'two generated salts collided');
  assert.match(a.salt, /^[0-9a-f]{32}$/);
});

rmSync(outDir, { recursive: true, force: true });

if (process.exitCode) console.error(`\n${passed} passed, some failed`);
else console.log(`\n${passed} passed, 0 failed`);
