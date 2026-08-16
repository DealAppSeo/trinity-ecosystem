#!/usr/bin/env node
// scripts/check-redteam.mjs — run the constructive red team probe suite.
//
// Run:  npm run check:redteam
//       npm run check:redteam -- --probe PAY-002        (one probe)
//       npm run check:redteam -- --json                 (machine-readable)
//
// Discovered automatically by `scripts/check-all.mjs` because `package.json`
// carries a `check:redteam` script — see CLAUDE.md § Repo gotchas.
//
// WHAT THIS SUITE IS FOR, AND WHAT IT REFUSES TO DO.
//
// It attacks our own trust layer and reports what got through. It is the
// executable half of `.claude/skills/trust-red-team/SKILL.md`; the skill is how
// a human or another agent DIRECTS a campaign, this is how a campaign PROVES
// something. Findings that come out of here carry a transcript. Findings that
// come out of reading code carry an opinion, and this repo has already had to
// retract four numbers that came from opinions.
//
// It refuses to report a probe that did not run as a probe that passed. See
// `scripts/redteam/harness.mjs` for the three outcomes and for the ledger
// rules, which are the two things that make this suite survivable in CI.
//
// EXIT CODES — the repo-wide convention, so `check-all.mjs` reads it correctly:
//
//   0  every probe HELD, or breached-but-ledgered-and-in-date
//   2  NOT_CHECKED: nothing conclusive ran (no toolchain, no evidence)
//   1  a NEW breach, an EXPIRED accepted finding, or a stale ledger entry

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateProbe, verdictFor } from './redteam/harness.mjs';

const PROBE_DIR = 'scripts/redteam/probes';
const LEDGER = 'scripts/redteam/ledger.json';

/**
 * Floor on probe discovery — the same tripwire `check-all.mjs` uses, for the
 * same reason. A red team suite that discovers zero probes and exits 0 is the
 * most dangerous possible version of this file: it reports "no findings" over
 * no attacks, in the one place where that reads as an all-clear.
 */
const MINIMUM_PROBES = 5;

const args = process.argv.slice(2);
const only = args.includes('--probe') ? args[args.indexOf('--probe') + 1] : null;
const asJson = args.includes('--json');

// ── load the ledger ─────────────────────────────────────────────────────────
let ledger = { findings: [] };
if (existsSync(LEDGER)) {
  try {
    ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
  } catch (e) {
    console.error(`${LEDGER} is not valid JSON: ${e.message}`);
    process.exit(1);
  }
}
const ledgerBy = new Map((ledger.findings ?? []).map((f) => [f.id, f]));
for (const f of ledger.findings ?? []) {
  for (const need of ['id', 'owner', 'reason', 'reviewBy']) {
    if (!f[need]) {
      console.error(`${LEDGER}: entry ${f.id ?? '(no id)'} is missing \`${need}\`.`);
      console.error('  An accepted finding needs an owner, a reason and a review date, or it is just a silenced test.');
      process.exit(1);
    }
  }
}

// ── discover probes ─────────────────────────────────────────────────────────
if (!existsSync(PROBE_DIR)) {
  console.error(`no probe directory at ${PROBE_DIR}`);
  process.exit(1);
}
const files = readdirSync(PROBE_DIR).filter((f) => f.endsWith('.mjs')).sort();
const probes = [];
for (const file of files) {
  const mod = await import(pathToFileURL(join(process.cwd(), PROBE_DIR, file)).href);
  probes.push(validateProbe(mod.default, `${PROBE_DIR}/${file}`));
}

if (probes.length < MINIMUM_PROBES && !only) {
  console.error(`discovery found ${probes.length} probes, below the floor of ${MINIMUM_PROBES}.`);
  console.error('  A red team suite that runs nothing must be loud, not green.');
  process.exit(1);
}

const ids = new Set();
for (const p of probes) {
  if (ids.has(p.id)) { console.error(`duplicate probe id ${p.id}`); process.exit(1); }
  ids.add(p.id);
}

const selected = only ? probes.filter((p) => p.id === only) : probes;
if (only && selected.length === 0) {
  console.error(`no probe with id ${only}. Known: ${[...ids].join(', ')}`);
  process.exit(1);
}

// ── run ─────────────────────────────────────────────────────────────────────
if (!asJson) {
  console.log('\n  TRUST LAYER RED TEAM');
  console.log(`  ${selected.length} probe(s): ${selected.map((p) => p.id).join(', ')}\n`);
}

const now = new Date();
const results = [];

for (const probe of selected) {
  let result;
  try {
    result = await probe.run();
  } catch (e) {
    // A probe that throws is NOT_CHECKED, never a pass and never a breach. A
    // crashed attacker has learned nothing about the target.
    result = {
      outcome: 'NOT_CHECKED',
      detail: `the probe itself threw: ${e.message}`,
      evidence: null,
      howToRun: 'fix the probe; a crashed probe proves nothing about the target',
    };
  }

  const entry = ledgerBy.get(probe.id);
  const { verdict, fails, note } = verdictFor(result.outcome, entry, now);
  results.push({ probe, result, verdict, fails, note });
}

// ── report ──────────────────────────────────────────────────────────────────
if (asJson) {
  console.log(JSON.stringify({
    ranAt: now.toISOString(),
    results: results.map(({ probe, result, verdict, note }) => ({
      id: probe.id, title: probe.title, component: probe.component,
      severity: probe.severity, threat: probe.threat,
      outcome: result.outcome, verdict, note,
      detail: result.detail, evidence: result.evidence,
      howToRun: result.howToRun ?? null,
      liveConfirmation: probe.liveConfirmation ?? null,
    })),
  }, null, 2));
} else {
  const MARK = {
    HELD: '  HELD        ', NEW_FINDING: '  BREACH  NEW ', KNOWN_OPEN: '  BREACH  known',
    EXPIRED: '  BREACH  DUE ', LEDGER_STALE: '  STALE LEDGER ', LEDGER_INVALID: '  BAD LEDGER  ',
    NOT_CHECKED: '  NOT CHECKED ',
  };
  for (const { probe, result, verdict, note } of results) {
    console.log(`${MARK[verdict] ?? '  ?           '} ${probe.id}  ${probe.title}`);
    console.log(`                 ${probe.component} · ${probe.severity}`);
    console.log(`                 ${result.detail}`);
    if (verdict !== 'HELD') console.log(`                 -> ${note}`);
    if (result.howToRun) console.log(`                 to run: ${result.howToRun}`);
    if (result.evidence && verdict !== 'HELD') {
      console.log('                 evidence:');
      for (const line of String(result.evidence).split('\n')) console.log(`                 ${line}`);
    }
    console.log('');
  }
}

const counts = results.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] ?? 0) + 1), a), {});
const failing = results.filter((r) => r.fails);
const conclusive = results.filter((r) => r.result.outcome !== 'NOT_CHECKED');

if (!asJson) {
  console.log(`  ${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join('   ')}`);
  console.log('');
}

// NOT_CHECKED everywhere is not an all-clear. Say so and exit 2, the repo's
// signal for "this check could not run" — collapsing it into 0 is the exact
// unearned-success defect, arriving in the security suite.
if (conclusive.length === 0) {
  if (!asJson) console.log('  NOT CHECKED — no probe reached a conclusion. This is not an all-clear.\n');
  process.exit(2);
}

if (failing.length > 0) {
  if (!asJson) {
    console.log('  FAILED — action required:');
    for (const f of failing) console.log(`    ${f.probe.id}  ${f.verdict}: ${f.note}`);
    console.log('');
    console.log(`  Triage a new finding by adding it to ${LEDGER} with an owner, a reason and a`);
    console.log('  reviewBy date, or by fixing it. There is no third option, by design.\n');
  }
  process.exit(1);
}

if (!asJson) {
  console.log(`  ${conclusive.length} probe(s) reached a conclusion; no new or overdue findings.\n`);
}
process.exit(0);
