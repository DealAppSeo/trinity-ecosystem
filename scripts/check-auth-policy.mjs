#!/usr/bin/env node
//
// check-auth-policy.mjs — asserts the institution_config write allowlist still
// blocks what it is supposed to block.
//
//   node scripts/check-auth-policy.mjs
//
// Exits non-zero on any failure, so it can gate CI.
//
// Why this file exists. `POST /api/trustrails/settings` used to spread the
// request body straight into `.update()` with the service key and no
// authentication, which made every column of institution_config writable by
// anyone who could reach the endpoint — the Pythagorean veto toggle, the RepID
// floor, the daily spend cap, and the freeze flag among them. The allowlist in
// lib/institution-config-schema.ts is what stops that. A regression there is
// silent and severe, so it gets a test even though the repo has no test runner:
// this uses `node:assert` and the TypeScript compiler that is already a
// dependency, and adds nothing to package.json.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const SOURCE = 'lib/institution-config-schema.ts';

const outDir = mkdtempSync(join(tmpdir(), 'trustrails-authcheck-'));
let validateConfigPatch;
try {
  execFileSync(
    'npx',
    ['tsc', SOURCE, '--outDir', outDir, '--module', 'commonjs', '--target', 'es2019'],
    { stdio: 'pipe' }
  );
  const compiled = join(outDir, 'institution-config-schema.js');
  ({ validateConfigPatch } = await import(pathToFileURL(compiled).href));
} catch (err) {
  console.error(`Could not compile ${SOURCE}:\n${err.stdout?.toString() ?? err.message}`);
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`${name}: ${err.message.split('\n')[0]}`);
  }
}

// The precise shape of the original vulnerability: one unauthenticated body
// that disables the veto, zeroes the trust floor, raises the spend cap,
// unfreezes the institution, empties the jurisdiction allowlist, and reassigns
// the row to another institution.
const ATTACK = {
  pythagorean_veto_enabled: false,
  min_repid_payment: 0,
  max_aggregate_daily_usdc: 999_999_999,
  frozen: false,
  jurisdiction_allowlist: [],
  institution_id: 'someone-elses-institution',
};

check('viewer can write nothing', () => {
  assert.equal(Object.keys(validateConfigPatch(ATTACK, 'viewer').patch).length, 0);
});

check('operator cannot touch the freeze flag', () => {
  assert.ok(validateConfigPatch(ATTACK, 'operator').rejected.includes('frozen'));
});

check('no role can reassign institution_id', () => {
  for (const role of ['viewer', 'operator', 'owner']) {
    assert.ok(
      validateConfigPatch(ATTACK, role).rejected.includes('institution_id'),
      `role ${role} accepted institution_id`
    );
  }
});

check('no role can forge the audit columns', () => {
  const forged = { updated_by: 'someone-else', updated_at: '1970-01-01', frozen_by: 'x', frozen_at: '1970-01-01' };
  for (const role of ['viewer', 'operator', 'owner']) {
    const { patch } = validateConfigPatch(forged, role);
    assert.equal(Object.keys(patch).length, 0, `role ${role} accepted a forged audit column`);
  }
});

check('owner may freeze, and the flag survives validation', () => {
  assert.equal(validateConfigPatch({ frozen: true }, 'owner').patch.frozen, true);
});

check('numeric thresholds reject strings', () => {
  assert.ok(validateConfigPatch({ min_repid_payment: '0' }, 'operator').invalid.includes('min_repid_payment'));
});

check('numeric thresholds reject NaN and Infinity', () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.ok(
      validateConfigPatch({ max_aggregate_daily_usdc: bad }, 'operator').invalid.includes('max_aggregate_daily_usdc'),
      `accepted ${bad}`
    );
  }
});

check('integer fields reject fractions', () => {
  assert.ok(validateConfigPatch({ bft_min_llms: 2.5 }, 'operator').invalid.includes('bft_min_llms'));
});

check('columns with no database backing are rejected', () => {
  // These three appear in the dashboard's control panel but do not exist in
  // institution_config. They must not silently pass validation.
  for (const key of ['llm_version_pinning', 'air_gap_fallback_enabled', 'compartmentalized']) {
    assert.ok(validateConfigPatch({ [key]: true }, 'owner').rejected.includes(key), `${key} was accepted`);
  }
});

check('a legitimate operator change still goes through', () => {
  const { patch, rejected, invalid } = validateConfigPatch({ max_aggregate_daily_usdc: 250_000 }, 'operator');
  assert.equal(patch.max_aggregate_daily_usdc, 250_000);
  assert.deepEqual(rejected, []);
  assert.deepEqual(invalid, []);
});

check('a non-object body yields an empty patch rather than throwing', () => {
  for (const body of [null, undefined, 'string', 42, ['a']]) {
    assert.equal(Object.keys(validateConfigPatch(body, 'owner').patch).length, 0);
  }
});

rmSync(outDir, { recursive: true, force: true });

for (const failure of failures) console.error(`FAIL  ${failure}`);
console.log(`${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
