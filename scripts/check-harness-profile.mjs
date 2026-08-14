#!/usr/bin/env node
//
// check-harness-profile.mjs — asserts the harness resolver still refuses what it
// is supposed to refuse.
//
//   node scripts/check-harness-profile.mjs
//
// Exits non-zero on any failure, so it can gate CI.
//
// Why this file exists. lib/trustshell/HarnessProfile.ts decides what an agent
// is allowed to do. Its whole value rests on a handful of refusals — an earned
// setting cannot be set by a user, a grant with no receipts is not a grant, an
// expired grant falls to the floor rather than to its last value, and an agent
// may tighten its own harness but never loosen it. Every one of those is a
// silent failure if it regresses: the profile still resolves, the session still
// runs, and the agent simply has authority nobody granted it.
//
// Same shape as check-auth-policy.mjs: node:assert plus the TypeScript compiler
// that is already a dependency, so this adds nothing to package.json.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { localTsc } from './local-tsc.mjs';

const SOURCE = 'lib/trustshell/HarnessProfile.ts';

const outDir = mkdtempSync(join(tmpdir(), 'trustshell-harness-'));
let mod;
try {
  execFileSync(
    localTsc(),
    [SOURCE, '--outDir', outDir, '--module', 'commonjs', '--target', 'es2019'],
    { stdio: 'pipe' }
  );
  mod = await import(pathToFileURL(join(outDir, 'HarnessProfile.js')).href);
} catch (err) {
  console.error(`Could not compile ${SOURCE}:\n${err.stdout?.toString() ?? err.message}`);
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}

const { resolveHarnessProfile, personalisationReport, HARNESS_SETTINGS, getSettingSpec } = mod;

const NOW = '2026-08-13T00:00:00.000Z';
const base = (over = {}) => resolveHarnessProfile({ layers: {}, earned: [], now: NOW, ...over });

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
  }
}

// -- the registry itself -----------------------------------------------------

check('every setting declares why it exists', () => {
  for (const s of HARNESS_SETTINGS) {
    assert.ok(s.why && s.why.length > 20, `${s.key} has no meaningful 'why'`);
  }
});

check('every earned setting names the evidence that unlocks it', () => {
  for (const s of HARNESS_SETTINGS.filter((s) => s.authority === 'earned')) {
    assert.ok(s.unlockedBy, `${s.key} is earned but names no unlockedBy evidence`);
  }
});

check('every earned numeric setting defaults to its own floor', () => {
  for (const s of HARNESS_SETTINGS.filter((s) => s.authority === 'earned' && s.type === 'number')) {
    assert.equal(s.default, s.min, `${s.key} defaults above its floor; absence of evidence must mean least privilege`);
  }
});

check('all six dimensions are covered', () => {
  const dims = new Set(HARNESS_SETTINGS.map((s) => s.dimension));
  for (const d of ['loops', 'tools', 'memory', 'reliability', 'permissions', 'verification']) {
    assert.ok(dims.has(d), `no settings for dimension ${d}`);
  }
});

// -- defaults ----------------------------------------------------------------

check('a profile with no layers is least-privileged', () => {
  const p = base();
  assert.equal(p.settings['permissions.tier'].value, 'observer');
  assert.equal(p.settings['permissions.spend_limit_per_tx_usdc'].value, 0);
  assert.equal(p.settings['loops.can_spawn_subtasks'].value, false);
  assert.equal(p.settings['loops.max_concurrent_tasks'].value, 1);
});

check('every earned setting is listed as unearned when nothing is granted', () => {
  const p = base();
  const earnedKeys = HARNESS_SETTINGS.filter((s) => s.authority === 'earned').map((s) => s.key);
  assert.deepEqual([...p.unearned].sort(), earnedKeys.sort());
});

// -- authority ---------------------------------------------------------------

check('a user cannot set an earned setting', () => {
  const p = base({ layers: { user: { 'permissions.tier': 'platinum' } } });
  assert.equal(p.settings['permissions.tier'].value, 'observer');
  assert.equal(p.rejections[0].reason, 'authority_forbids_layer');
});

check('a user cannot buy spend authority by setting it', () => {
  const p = base({ layers: { user: { 'permissions.spend_limit_daily_usdc': 50_000 } } });
  assert.equal(p.settings['permissions.spend_limit_daily_usdc'].value, 0);
  assert.equal(p.rejections.length, 1);
});

check('nobody can write a constitutional setting', () => {
  const p = base({
    layers: {
      vendor: { 'verification.checker_must_not_be_doer': false },
      org: { 'reliability.retry_denied_max': 3 },
      user: { 'memory.require_epistemic_tag': false },
      agent: { 'loops.stop_requires_typed_handoff': false },
    },
  });
  assert.equal(p.settings['verification.checker_must_not_be_doer'].value, true);
  assert.equal(p.settings['reliability.retry_denied_max'].value, 0);
  assert.equal(p.settings['memory.require_epistemic_tag'].value, true);
  assert.equal(p.settings['loops.stop_requires_typed_handoff'].value, true);
  assert.equal(p.rejections.length, 4);
  for (const r of p.rejections) assert.equal(r.reason, 'authority_forbids_layer');
});

check('a user cannot override an org-authority setting', () => {
  const p = base({ layers: { user: { 'permissions.grant_ttl_days': 365 } } });
  assert.equal(p.settings['permissions.grant_ttl_days'].value, 30);
  assert.equal(p.rejections[0].reason, 'authority_forbids_layer');
});

check('a user can personalise a user-authority setting', () => {
  const p = base({ layers: { user: { 'loops.max_iterations_per_task': 60 } } });
  assert.equal(p.settings['loops.max_iterations_per_task'].value, 60);
  assert.equal(p.settings['loops.max_iterations_per_task'].source, 'user');
  assert.deepEqual(p.rejections, []);
});

check('a later layer wins where authority allows it', () => {
  const p = base({
    layers: {
      vendor: { 'memory.max_fact_age_hours': 48 },
      user: { 'memory.max_fact_age_hours': 6 },
    },
  });
  assert.equal(p.settings['memory.max_fact_age_hours'].value, 6);
  assert.equal(p.settings['memory.max_fact_age_hours'].source, 'user');
});

// -- unknown keys and types --------------------------------------------------

check('an unknown key is rejected rather than passed through', () => {
  const p = base({ layers: { user: { 'loops.max_iterations': 10 } } });
  assert.equal(p.rejections[0].reason, 'unknown_key');
  assert.equal(getSettingSpec('loops.max_iterations'), undefined);
});

check('a wrong-typed value is rejected, not coerced', () => {
  const p = base({ layers: { user: { 'loops.max_iterations_per_task': '60' } } });
  assert.equal(p.settings['loops.max_iterations_per_task'].value, 25);
  assert.equal(p.rejections[0].reason, 'wrong_type');
});

// -- clamping ----------------------------------------------------------------

check('an out-of-range value is clamped and says so', () => {
  const p = base({ layers: { user: { 'loops.max_iterations_per_task': 5000 } } });
  assert.equal(p.settings['loops.max_iterations_per_task'].value, 500);
  assert.equal(p.settings['loops.max_iterations_per_task'].clamped, true);
});

check('an in-range value is not marked clamped', () => {
  const p = base({ layers: { user: { 'loops.max_iterations_per_task': 60 } } });
  assert.equal(p.settings['loops.max_iterations_per_task'].clamped, false);
});

// -- earned grants -----------------------------------------------------------

const grant = (over = {}) => ({
  key: 'loops.max_concurrent_tasks',
  value: 4,
  receiptIds: ['ts_9f3a2c8e1b7d4a06'],
  grantedAt: '2026-08-01T00:00:00.000Z',
  expiresAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

check('a receipt-backed grant raises the setting and carries its evidence', () => {
  const p = base({ earned: [grant()] });
  const s = p.settings['loops.max_concurrent_tasks'];
  assert.equal(s.value, 4);
  assert.equal(s.source, 'earned');
  assert.deepEqual(s.evidence, ['ts_9f3a2c8e1b7d4a06']);
  assert.ok(!p.unearned.includes('loops.max_concurrent_tasks'));
});

check('a grant with no receipts is refused', () => {
  const p = base({ earned: [grant({ receiptIds: [] })] });
  assert.equal(p.settings['loops.max_concurrent_tasks'].value, 1);
  assert.equal(p.rejections[0].reason, 'grant_without_evidence');
});

check('an expired grant falls to the floor, not to its last value', () => {
  const p = base({ earned: [grant({ expiresAt: '2026-08-12T23:59:59.000Z' })] });
  assert.equal(p.settings['loops.max_concurrent_tasks'].value, 1);
  assert.equal(p.rejections[0].reason, 'grant_expired');
  assert.ok(p.unearned.includes('loops.max_concurrent_tasks'));
});

check('a grant cannot reach a setting that is not earned', () => {
  const p = base({ earned: [grant({ key: 'loops.max_iterations_per_task', value: 400 })] });
  assert.equal(p.settings['loops.max_iterations_per_task'].value, 25);
  assert.equal(p.rejections[0].reason, 'authority_forbids_layer');
});

check('a grant is still clamped to the registry maximum', () => {
  const p = base({ earned: [grant({ value: 9999 })] });
  assert.equal(p.settings['loops.max_concurrent_tasks'].value, 32);
  assert.equal(p.settings['loops.max_concurrent_tasks'].clamped, true);
});

// -- the ratchet -------------------------------------------------------------

check('the agent_tunable authority has members', () => {
  // An authority with no settings is a dead branch that no test can reach.
  assert.ok(HARNESS_SETTINGS.some((s) => s.authority === 'agent_tunable'));
});

check('an agent may tighten its own harness', () => {
  const p = base({
    layers: { user: { 'verification.verifier_panel_size': 3 }, agent: { 'verification.verifier_panel_size': 5 } },
  });
  assert.equal(p.settings['verification.verifier_panel_size'].value, 5);
  assert.equal(p.settings['verification.verifier_panel_size'].source, 'agent');
  assert.deepEqual(p.rejections, []);
});

check('an agent may not loosen its own harness', () => {
  const p = base({
    layers: { user: { 'verification.verifier_panel_size': 5 }, agent: { 'verification.verifier_panel_size': 2 } },
  });
  assert.equal(p.settings['verification.verifier_panel_size'].value, 5);
  assert.equal(p.rejections[0].reason, 'loosens_without_evidence');
});

check('the ratchet respects safeDirection rather than assuming smaller is safer', () => {
  // self_challenge_threshold is safer *higher*; max_iterations is safer *lower*.
  const raise = base({ layers: { agent: { 'verification.self_challenge_threshold': 0.9 } } });
  assert.equal(raise.settings['verification.self_challenge_threshold'].value, 0.9);
  const lower = base({ layers: { agent: { 'verification.self_challenge_threshold': 0.72 } } });
  assert.equal(lower.rejections[0].reason, 'loosens_without_evidence');
});

check('an agent cannot touch a user-authority setting at all', () => {
  const p = base({ layers: { agent: { 'loops.max_iterations_per_task': 5 } } });
  assert.equal(p.settings['loops.max_iterations_per_task'].value, 25);
  assert.equal(p.rejections[0].reason, 'authority_forbids_layer');
});

check('a human tightening below an earned grant is not treated as an escalation', () => {
  const p = base({ layers: { user: { 'memory.max_fact_age_hours': 1 } } });
  assert.equal(p.settings['memory.max_fact_age_hours'].value, 1);
  assert.deepEqual(p.rejections, []);
});

// -- org ceiling -------------------------------------------------------------

check('an org ceiling outranks an earned spend limit', () => {
  const p = base({
    layers: { org: { 'permissions.org_ceiling_per_tx_usdc': 250 } },
    earned: [grant({ key: 'permissions.spend_limit_per_tx_usdc', value: 5000 })],
  });
  assert.equal(p.settings['permissions.spend_limit_per_tx_usdc'].value, 250);
  assert.equal(p.settings['permissions.spend_limit_per_tx_usdc'].clamped, true);
});

check('an unset org ceiling does not zero an earned spend limit', () => {
  const p = base({ earned: [grant({ key: 'permissions.spend_limit_per_tx_usdc', value: 5000 })] });
  assert.equal(p.settings['permissions.spend_limit_per_tx_usdc'].value, 5000);
});

check('an earned limit below the org ceiling is left alone', () => {
  const p = base({
    layers: { org: { 'permissions.org_ceiling_per_tx_usdc': 10_000 } },
    earned: [grant({ key: 'permissions.spend_limit_per_tx_usdc', value: 500 })],
  });
  assert.equal(p.settings['permissions.spend_limit_per_tx_usdc'].value, 500);
  assert.equal(p.settings['permissions.spend_limit_per_tx_usdc'].clamped, false);
});

// -- the dogfooding instrument ----------------------------------------------

check('the personalisation report counts where each setting was actually decided', () => {
  const p = base({
    layers: { user: { 'loops.max_iterations_per_task': 60, 'memory.max_fact_age_hours': 8 } },
    earned: [grant()],
  });
  const r = personalisationReport(p);
  assert.deepEqual(r.bySource.user.sort(), ['loops.max_iterations_per_task', 'memory.max_fact_age_hours']);
  assert.deepEqual(r.bySource.earned, ['loops.max_concurrent_tasks']);
  assert.ok(r.personalisedFraction > 0 && r.personalisedFraction < 1);
});

rmSync(outDir, { recursive: true, force: true });

for (const failure of failures) console.error(`FAIL  ${failure}`);
console.log(`${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
