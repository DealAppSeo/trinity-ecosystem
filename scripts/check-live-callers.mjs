#!/usr/bin/env node
// scripts/check-live-callers.mjs — /pay and /review must invoke the spine.
//
// Claim: live callers call runContractedWork / Evaluator, or fail closed
// with an explicit reason — not a silent skip.
//
// Runtime half drives evaluateContractedPayment with real Ed25519 seeds.
// Source half reads the routes so deleting the call cannot stay green.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import bs58 from 'bs58';
import { localTsc } from './local-tsc.mjs';

function tscBin() {
  const js = join('node_modules', 'typescript', 'bin', 'tsc');
  if (existsSync(js)) return js;
  return localTsc();
}

const ROOT = process.cwd();
const outDir = mkdtempSync(join(ROOT, '.live-callers-check-'));
process.on('exit', () => rmSync(outDir, { recursive: true, force: true }));

let pay;
try {
  execFileSync(
    process.execPath,
    [
      tscBin(),
      'lib/trustshell/identity/payment-contract.ts',
      'lib/trustshell/floor-decay-consult.ts',
      '--outDir',
      outDir,
      '--rootDir',
      'lib',
      '--module',
      'commonjs',
      '--target',
      'es2022',
      '--lib',
      'es2022,dom',
      '--moduleResolution',
      'node',
      '--esModuleInterop',
      '--strict',
    ],
    { stdio: 'pipe' }
  );
  pay = await import(
    pathToFileURL(join(outDir, 'trustshell', 'identity', 'payment-contract.js')).href
  );
} catch (err) {
  console.error(
    `check:live-callers — FAILED. module does not compile:\n${err.stdout ?? ''}${err.stderr ?? ''}`
  );
  process.exit(1);
}

const { evaluateContractedPayment, evaluateContractedPaymentWith, mayApproveAfterContract, paymentBindingTiers } =
  pay;

const floor = await import(
  pathToFileURL(join(outDir, 'trustshell', 'floor-decay-consult.js')).href
);

let passed = 0;
const failures = [];
const eq = (a, b, label) => {
  if (a === b) passed += 1;
  else failures.push(`${label} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const truthy = (v, label) => {
  if (v) passed += 1;
  else failures.push(`${label} — expected truthy, got ${JSON.stringify(v)}`);
};

const mkSeed = () => bs58.encode(randomBytes(32));

const envOk = {
  TRUSTSHELL_DOER_SEED: mkSeed(),
  TRUSTSHELL_AUDITOR_SEEDS: `${mkSeed()},${mkSeed()}`,
  TRUSTSHELL_MIN_AUDITOR_TIER: '0',
};

const brief = {
  paymentId: 'pay-fixture-1',
  agentName: 'TORCH',
  amountUSDC: 100,
  recipientAddress: 'So11111111111111111111111111111111111111112',
  purpose: 'live-caller check',
};

const deny = evaluateContractedPayment({ brief, env: {} });
const denyDecision = await deny;
eq(denyDecision.invoked, false, 'missing seeds does not pretend to evaluate');
eq(denyDecision.code, 'SEEDS_MISSING', 'names the missing config');
eq(mayApproveAfterContract(denyDecision), false, 'cannot approve when not invoked');

const ok = await evaluateContractedPayment({ brief, env: envOk });
eq(ok.invoked, true, 'seeds present → spine invoked');
eq(ok.outcome, 'VERIFIED', 'bound payment brief verifies');
eq(ok.boundToPayment, true, 'verdict bound to this payment id');
truthy(ok.checkerDid !== ok.doerDid, 'checker_must_not_be_doer on the pay path');
eq(mayApproveAfterContract(ok), true, 'VERIFIED + bound + independent → may approve');

const unbound = await evaluateContractedPaymentWith({
  brief,
  env: envOk,
  tiers: [
    {
      name: 'payment-binding',
      judge: {
        async judge() {
          return { outcome: 'FAILED', score: 0, detail: 'unbound' };
        },
      },
    },
  ],
});
eq(unbound.invoked, true, 'a reject is still an invoked evaluation');
eq(unbound.outcome, 'FAILED', 'unbound brief fails');
eq(mayApproveAfterContract(unbound), false, 'FAILED cannot approve');

const outage = await evaluateContractedPaymentWith({
  brief,
  env: envOk,
  tiers: [
    {
      name: 'payment-binding',
      judge: {
        async judge() {
          throw new Error('evaluator outage');
        },
      },
    },
  ],
});
eq(mayApproveAfterContract(outage), false, 'outage cannot approve');
truthy(
  outage.invoked === false || outage.outcome !== 'VERIFIED',
  'outage is fail-closed, not a silent pass'
);

const self = await evaluateContractedPaymentWith({
  brief,
  env: envOk,
  tiers: paymentBindingTiers(brief),
  selfJudge: true,
});
eq(self.invoked, false, 'same-DID pool is refused, never certified');
eq(mayApproveAfterContract(self), false, 'self-judge cannot approve');

// Floor consult: missing rate is not_checked, never an invented hold/decay.
const noRate = floor.consultFloor({
  peakRepid: 8000,
  currentRepid: 100,
  floorOverride: 8000,
  isHuman: false,
  lastReEarnedAt: null,
  now: Date.now(),
  env: {},
});
eq(noRate.kind, 'not_checked', 'missing staleAfterMs is not_checked');
truthy(/TRUSTSHELL_FLOOR_STALE_AFTER_MS/.test(noRate.reason), 'names the variable');

const noAge = floor.consultFloor({
  peakRepid: 8000,
  currentRepid: 100,
  floorOverride: 8000,
  isHuman: false,
  lastReEarnedAt: null,
  now: Date.now(),
  env: { TRUSTSHELL_FLOOR_STALE_AFTER_MS: String(30 * 86400000) },
});
eq(noAge.kind, 'not_checked', 'unknown last-demonstration is not_checked, not a decay');

// Source: routes actually call the gate.
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const payRoute = strip(readFileSync('app/api/trustrails/pay/route.ts', 'utf8'));
const reviewRoute = strip(readFileSync('app/api/trustshell/review/route.ts', 'utf8'));

truthy(
  /evaluateContractedPayment\s*\(/.test(payRoute),
  '/pay calls evaluateContractedPayment'
);
truthy(
  /if\s*\(\s*!\s*mayApproveAfterContract\s*\(\s*contracted\s*\)\s*\)/.test(payRoute),
  '/pay denies unless mayApproveAfterContract is true'
);
truthy(
  /stage:\s*'contracted_evaluation'/.test(payRoute),
  '/pay names the fail-closed stage'
);
truthy(
  !/from\s*'@\/lib\/trustshell\/CustodyShadow'/.test(payRoute),
  '/pay does not import CustodyShadow as a live gate'
);
truthy(/runReviewSession\s*\(/.test(reviewRoute), '/review POST calls runReviewSession');

// Contract × pay state machine: these transitions are illegal.
const illegal = [
  { from: 'no_contract', action: 'accept', ok: false },
  { from: 'evaluated_failed', action: 'accept', ok: false },
  { from: 'outage', action: 'accept', ok: false },
  { from: 'self_judge', action: 'accept', ok: false },
  { from: 'evaluated_verified', action: 'accept', ok: true },
];
const machine = {
  no_contract: denyDecision,
  evaluated_failed: unbound,
  outage,
  self_judge: self,
  evaluated_verified: ok,
};
for (const t of illegal) {
  const allowed = mayApproveAfterContract(machine[t.from]);
  eq(allowed, t.ok, `${t.from} + ${t.action} allowed=${t.ok}`);
}

if (failures.length) {
  console.error(`check:live-callers — ${failures.length} FAILED, ${passed} passed`);
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`check:live-callers — VERIFIED. ${passed} assertions; /pay cannot approve without the spine.`);
