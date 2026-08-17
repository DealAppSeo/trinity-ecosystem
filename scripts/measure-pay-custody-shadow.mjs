#!/usr/bin/env node
// scripts/measure-pay-custody-shadow.mjs — measure the payment ControlProof
// shadow. Does not flip it.
//
// Run: node scripts/measure-pay-custody-shadow.mjs
//
// ── WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT ───────────────────────────
//
// The live route (`app/api/trustrails/pay/route.ts`) is not reachable from
// this session — no live Next.js server, no live Supabase, and this PR is not
// merged, so there is no production `custody_shadow_observation_pay` traffic
// to query even if it were. This is the "smallest fixture that constructs the
// same CustodyShadow call" instead: it builds the IDENTICAL instance the
// route builds — `new CustodyShadow(getClient, undefined, PAY_AUDIENCE,
// PAY_CAPABILITY, PAY_ACTION)` — and drives it through the same `.observe()`
// shape the route calls, with a Supabase client that records rows instead of
// writing them.
//
// This measures the INSTRUMENT, not production adoption. It reports real
// counts from real (fixture) calls — nothing here is invented traffic, and
// where the honest answer is zero (no live proof exists in production today)
// it is reported as zero, not rounded up to look like activity.
//
// THE ONE THING THIS SCRIPT DOES NOT DO: it never reads the observation's
// return value to make a decision. Matches the route exactly, and is the same
// property `pay-shadow-becomes-the-gate` (scripts/mutations.mjs) protects at
// the source level — this script is runtime evidence for the same claim.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.measure-pay-shadow-'));
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
  console.error('Could not compile CustodyShadow for measurement:');
  console.error(String(err.stdout ?? '') + String(err.stderr ?? err.message));
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}

/** Captures rows instead of writing them — same pattern as check-custody-shadow.mjs. */
function recorder() {
  const rows = [];
  return { rows, client: () => ({ from: () => ({ insert: async (r) => { rows.push(r); return { error: null }; } }) }) };
}

/** The EXACT construction app/api/trustrails/pay/route.ts uses. */
function newPayShadow(client) {
  return new shadow.CustodyShadow(client, undefined, shadow.PAY_AUDIENCE, shadow.PAY_CAPABILITY, shadow.PAY_ACTION);
}

async function validProof(agentName) {
  const human = await idm.createHumanSSID();
  const agent = await idm.createAgentIdentity(agentName);
  return cp.issueControlProof({
    human, agent,
    audience: shadow.PAY_AUDIENCE,
    capabilities: [shadow.PAY_CAPABILITY],
    ttlSeconds: 300,
  });
}

const results = { before: [], after: [] };

// ═════════════════════════════════════════════════════════════════════════
// BEFORE — today's real state: no caller presents a controlProof.
// ═════════════════════════════════════════════════════════════════════════
//
// Varying legacyCustodyVerified across the range a real KYA registry can
// return (both true and false rows exist), because `not_comparable` should
// hold regardless of what the legacy signal says — the shadow has nothing to
// compare against either way.

{
  const r = recorder();
  const s = newPayShadow(r.client);
  for (const legacyCustodyVerified of [true, false, true, false, true]) {
    const o = await s.observe({
      agentName: 'MEASURE-BEFORE-AGENT',
      vaultId: crypto.randomUUID(),
      legacyCustodyVerified,
      vaultRequiresCustody: true,
    });
    results.before.push(o);
  }
}

// ═════════════════════════════════════════════════════════════════════════
// AFTER — once a holder starts presenting proofs.
// ═════════════════════════════════════════════════════════════════════════
//
// A realistic spread: a valid proof against both legacy states (the two
// COMPARABLE cases), plus the two failure shapes CustodyShadow's own suite
// already covers for the VAULT audience but had never been exercised through
// the PAY-parameterised instance specifically — an expired proof and a
// wrong-audience proof, both of which read `proofPermits: false` and so
// disagree with a legacy `true`.

{
  const r = recorder();
  const s = newPayShadow(r.client);

  results.after.push(await s.observe({
    agentName: 'MEASURE-AFTER-AGREE-ALLOW', vaultId: crypto.randomUUID(),
    legacyCustodyVerified: true, vaultRequiresCustody: true,
    controlProof: await validProof('MEASURE-AFTER-AGREE-ALLOW'),
  }));

  // legacy DENIES, proof ALLOWS — the dangerous direction (shadow_looser):
  // switching would grant access the live gate currently refuses.
  results.after.push(await s.observe({
    agentName: 'MEASURE-AFTER-SHADOW-LOOSER', vaultId: crypto.randomUUID(),
    legacyCustodyVerified: false, vaultRequiresCustody: true,
    controlProof: await validProof('MEASURE-AFTER-SHADOW-LOOSER'),
  }));

  // Expired: an otherwise-valid proof, past its TTL. proofPermits=false.
  const expiredHuman = await idm.createHumanSSID();
  const expiredAgent = await idm.createAgentIdentity('MEASURE-AFTER-EXPIRED');
  const expiredProof = await cp.issueControlProof({
    human: expiredHuman, agent: expiredAgent,
    audience: shadow.PAY_AUDIENCE, capabilities: [shadow.PAY_CAPABILITY],
    ttlSeconds: 60, now: new Date('2026-08-01T00:00:00Z'),
  });
  results.after.push(await s.observe({
    agentName: 'MEASURE-AFTER-EXPIRED', vaultId: crypto.randomUUID(),
    legacyCustodyVerified: true, vaultRequiresCustody: true,
    controlProof: expiredProof,
  }));

  // Wrong audience: a proof minted for the VAULT gate, replayed at the
  // payment gate. This is exactly the case ci-integrity's
  // `pay-shadow-wrong-audience` mutation protects against happening the OTHER
  // direction (this instance accidentally accepting it) — here it is the
  // CALLER'S mistake, and the correct behaviour is still proofPermits=false.
  const vaultProof = await cp.issueControlProof({
    human: await idm.createHumanSSID(), agent: await idm.createAgentIdentity('MEASURE-AFTER-WRONG-AUD'),
    audience: shadow.VAULT_AUDIENCE, capabilities: [shadow.PAY_CAPABILITY], ttlSeconds: 300,
  });
  results.after.push(await s.observe({
    agentName: 'MEASURE-AFTER-WRONG-AUDIENCE', vaultId: crypto.randomUUID(),
    legacyCustodyVerified: true, vaultRequiresCustody: true,
    controlProof: vaultProof,
  }));

  // Both deny — legacy already refuses, and a broken proof refuses too. The
  // fourth quadrant, for completeness: switching would change nothing here.
  const alsoExpiredProof = await cp.issueControlProof({
    human: await idm.createHumanSSID(), agent: await idm.createAgentIdentity('MEASURE-AFTER-AGREE-DENY'),
    audience: shadow.PAY_AUDIENCE, capabilities: [shadow.PAY_CAPABILITY],
    ttlSeconds: 60, now: new Date('2026-08-01T00:00:00Z'),
  });
  results.after.push(await s.observe({
    agentName: 'MEASURE-AFTER-AGREE-DENY', vaultId: crypto.randomUUID(),
    legacyCustodyVerified: false, vaultRequiresCustody: true,
    controlProof: alsoExpiredProof,
  }));
}

// ═════════════════════════════════════════════════════════════════════════
// REPORT
// ═════════════════════════════════════════════════════════════════════════

function tally(observations) {
  const byVerdict = {};
  for (const o of observations) byVerdict[o.verdict] = (byVerdict[o.verdict] ?? 0) + 1;
  const disagreements = observations.filter((o) => o.verdict === 'shadow_stricter' || o.verdict === 'shadow_looser').length;
  return { total: observations.length, byVerdict, disagreements };
}

const before = tally(results.before);
const after = tally(results.after);

console.log('measure-pay-custody-shadow — fixture-driven, not live production traffic\n');
console.log(`BEFORE (no controlProof presented — today's real state):`);
console.log(`  observations: ${before.total}`);
console.log(`  by verdict:   ${JSON.stringify(before.byVerdict)}`);
console.log(`  disagreements vs kyaResult.humanCustodyBound: ${before.disagreements}\n`);

console.log(`AFTER (controlProof presented — the adoption case):`);
console.log(`  observations: ${after.total}`);
console.log(`  by verdict:   ${JSON.stringify(after.byVerdict)}`);
console.log(`  disagreements vs kyaResult.humanCustodyBound: ${after.disagreements}`);
for (const o of results.after) console.log(`    ${o.agentName.padEnd(28)} legacy=${String(o.legacyPermits).padEnd(5)} proof=${String(o.proofPermits).padEnd(5)} -> ${o.verdict}`);

console.log('\nLIVE PRODUCTION STATE: zero. This PR is not merged and no route calls');
console.log('CustodyShadow with PAY_AUDIENCE in production. The BEFORE numbers above are');
console.log('what the instrument reports on a fixture standing in for that state, not a');
console.log('claim about real traffic — 0 real payment ControlProofs exist today, and');
console.log('that is reported as zero, not invented.');

console.log('\nwitnessHidden / provenWithoutSecret: NOT INVOLVED in this shadow at all.');
console.log('CustodyShadow.observe() never supplies a predicateProvider to verifyControlProof,');
console.log('so the predicate check stays NOT_CHECKED on every call regardless of what the');
console.log('proof carries — this gate compares dual-auth identity (human+agent signatures),');
console.log('not a hidden-witness predicate. Both flags remain permanently false, unchanged,');
console.log('pending the Plonky3 provider (task #75).');

rmSync(outDir, { recursive: true, force: true });
