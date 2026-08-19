#!/usr/bin/env node
// scripts/check-earned-metrics-repo.mjs — does the provenance gate actually
// change which rows count, and only the rows it should?
//
// Run: node scripts/check-earned-metrics-repo.mjs
//
// Covers `integrityObservations()` and `annotateProvenance()` in
// lib/trustshell/EarnedMetricsRepo.ts — the "consume" half of Gate 2, wired
// 2026-08-17 in response to the operator's review on PR #94. `measureRate`
// itself is covered by check:earned-metrics and untouched here; this suite is
// entirely about which rows REACH it.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

// EarnedMetricsRepo.ts imports '@/lib/supabase-admin' and './verdict-provenance',
// neither of which tsc resolves standalone. The class under test (I/O) is not
// what this suite covers — integrityObservations/annotateProvenance are pure —
// so stub the Supabase import (same precedent as check-zkp-attestation.mjs) and
// inline verdict-provenance's actual source so the real provenanceOf runs,
// rather than a second reimplementation drifting from it.
const outDir = mkdtempSync(join(tmpdir(), 'trustshell-earned-metrics-repo-'));
const issuerSrc = readFileSync('lib/trustshell/issuer-stake.ts', 'utf8');
const provenanceSrc = readFileSync('lib/trustshell/verdict-provenance.ts', 'utf8').replace(
  "import { refusesToIssue } from './issuer-stake';",
  ''
);
const metricsSrc = readFileSync('lib/trustshell/EarnedMetrics.ts', 'utf8');
const repoSrc = readFileSync('lib/trustshell/EarnedMetricsRepo.ts', 'utf8')
  .replace(
    "import { getSupabaseAdmin } from '@/lib/supabase-admin';",
    // A chainable stub, not a throw: a throw makes TS infer `never`, and the
    // class body's `.from(...).select(...)` chains then fail to TYPECHECK
    // (never has no properties) even though this suite never calls load() or
    // resolveAgent(). `any` keeps the class compiling without asserting
    // anything about behavior this suite does not exercise.
    'const getSupabaseAdmin = (): any => { const c: any = new Proxy(() => c, { get: () => c }); return c; };'
  )
  .replace(/^import \{[\s\S]*?\} from '\.\/EarnedMetrics';\n/m, '')
  .replace("import { provenanceOf } from './verdict-provenance';", '')
  .replace(
    "import { consultFloor } from './floor-decay-consult';",
    'const consultFloor = (..._args: unknown[]): any => ({ kind: "not_checked", floor: 0, reason: "isolated-suite stub" });'
  )
  .replace("import type { FloorDecision } from './repid-floor-decay';", 'type FloorDecision = any;');

writeFileSync(join(outDir, 'EarnedMetricsRepo.ts'), `${issuerSrc}\n${provenanceSrc}\n${metricsSrc}\n${repoSrc}`);

let m;
try {
  execFileSync(
    localTsc(),
    [join(outDir, 'EarnedMetricsRepo.ts'), '--outDir', outDir,
     '--module', 'commonjs', '--target', 'es2022', '--lib', 'es2022,dom'],
    { stdio: 'pipe' }
  );
  m = await import(pathToFileURL(join(outDir, 'EarnedMetricsRepo.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('EarnedMetricsRepo compilation failed\n');
  console.error(e.stdout?.toString() || e.stderr?.toString() || e.message);
  process.exit(1);
}
const { integrityObservations, annotateProvenance } = m;
rmSync(outDir, { recursive: true, force: true });

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed += 1; } catch (e) { failures.push(`${name}\n    ${e.message}`); }
};
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};

const row = (overrides) => ({
  signal: 'integrity',
  observed_at: '2026-08-01T00:00:00.000Z',
  success: true,
  domain: null,
  quorum_providers_used: null,
  ...overrides,
});

check('a non-integrity row is not touched', () => {
  const r = integrityObservations([row({ signal: 'x402' })]);
  eq(r.observations.length, 0, 'ignored entirely, not counted as excluded either');
  eq(r.excludedUntraceable, 0, 'not exclusion — just the wrong signal');
  eq(r.excludedUnearned, 0, 'same');
});

check('a CLEAN row with NO provenance still counts — the case the header measures at 55,616/149,258', () => {
  const r = integrityObservations([row({ success: true, quorum_providers_used: null })]);
  eq(r.observations.length, 1, 'must be kept');
  eq(r.excludedUntraceable, 0, 'clean rows are never "untraceable" — they owe no provenance');
});

check('a CLEAN row with ZERO providers still counts', () => {
  const r = integrityObservations([row({ success: true, quorum_providers_used: 0 })]);
  eq(r.observations.length, 1, 'non-actionable, so still kept');
  eq(r.excludedUnearned, 0, 'not an unearned veto — nothing was vetoed');
});

check('a CAUGHT row with NO provenance is excluded as untraceable', () => {
  const r = integrityObservations([row({ success: false, quorum_providers_used: null })]);
  eq(r.observations.length, 0, 'must not reach measureRate');
  eq(r.excludedUntraceable, 1, 'this is the 200-row population the header measures');
  eq(r.excludedUnearned, 0, 'not this bucket — provenance was never carried, not weighed and found absent');
});

check('a CAUGHT row with ZERO providers is excluded as unearned', () => {
  const r = integrityObservations([row({ success: false, quorum_providers_used: 0 })]);
  eq(r.observations.length, 0, 'must not reach measureRate');
  eq(r.excludedUnearned, 1, 'a verdict issued having consulted nothing');
  eq(r.excludedUntraceable, 0, 'the fact WAS carried — it says zero, not unknown');
});

check('a CAUGHT row WITH a provider counts, and its success is preserved as false', () => {
  const r = integrityObservations([row({ success: false, quorum_providers_used: 2 })]);
  eq(r.observations.length, 1, 'earned catch, must count');
  eq(r.observations[0].success, false, 'still a catch — provenance does not launder the outcome');
});

check('mixed batch: only the untraceable/unearned CATCHES are dropped', () => {
  const rows = [
    row({ success: true, quorum_providers_used: null }),   // keep (clean, no provenance owed)
    row({ success: true, quorum_providers_used: 0 }),      // keep (clean)
    row({ success: false, quorum_providers_used: 3 }),     // keep (earned catch)
    row({ success: false, quorum_providers_used: null }),  // exclude (untraceable)
    row({ success: false, quorum_providers_used: 0 }),     // exclude (unearned)
    row({ signal: 'bft', success: false, quorum_providers_used: null }), // ignored, wrong signal
  ];
  const r = integrityObservations(rows);
  eq(r.observations.length, 3, 'the three integrity rows that count');
  eq(r.excludedUntraceable, 1, 'exactly the untraceable catch');
  eq(r.excludedUnearned, 1, 'exactly the unearned catch');
});

check('domain and observedAt survive the transform unchanged', () => {
  const r = integrityObservations([row({ domain: 'finance', observed_at: '2026-07-01T00:00:00.000Z' })]);
  eq(r.observations[0].domain, 'finance', 'domain carried through');
  eq(r.observations[0].observedAt, '2026-07-01T00:00:00.000Z', 'timestamp carried through');
});

// ── annotateProvenance ───────────────────────────────────────────────────────

const measured = { state: 'measured', value: 0.5, rawValue: 0.5, effectiveN: 10, observations: 10, confidence: 0.5, freshnessDays: 1, reason: 'base reason' };

check('no exclusions leaves the metric untouched', () => {
  const r = annotateProvenance(measured, { excludedUntraceable: 0, excludedUnearned: 0 });
  eq(r, measured, 'identical — no reason to append a note nobody needs');
});

check('untraceable-only exclusions name the count and the reason, not the other bucket', () => {
  const r = annotateProvenance(measured, { excludedUntraceable: 3, excludedUnearned: 0 });
  if (!r.reason.includes('3 actionable catch(es) excluded')) throw new Error(`missing total: ${r.reason}`);
  if (!r.reason.includes('untraceable')) throw new Error(`missing untraceable detail: ${r.reason}`);
  if (r.reason.includes('unearned (')) throw new Error(`must not mention the empty bucket: ${r.reason}`);
});

check('unearned-only exclusions name that bucket, not untraceable', () => {
  const r = annotateProvenance(measured, { excludedUntraceable: 0, excludedUnearned: 2 });
  if (!r.reason.includes('unearned')) throw new Error(`missing unearned detail: ${r.reason}`);
  if (r.reason.includes('untraceable (')) throw new Error(`must not mention the empty bucket: ${r.reason}`);
});

check('both buckets present are both named, and the base reason survives', () => {
  const r = annotateProvenance(measured, { excludedUntraceable: 1, excludedUnearned: 1 });
  if (!r.reason.startsWith('base reason')) throw new Error(`base reason lost: ${r.reason}`);
  if (!r.reason.includes('untraceable')) throw new Error(`missing untraceable: ${r.reason}`);
  if (!r.reason.includes('unearned')) throw new Error(`missing unearned: ${r.reason}`);
  eq(r.value, measured.value, 'annotateProvenance touches only the reason, never the number');
});

console.log(`\nearned-metrics-repo: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('check:earned-metrics-repo — VERIFIED.');
process.exit(0);
