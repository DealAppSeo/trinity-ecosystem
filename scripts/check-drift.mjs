#!/usr/bin/env node
// scripts/check-drift.mjs — fail when a dated claim has outlived its evidence.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// This repo's docs carry `[VERIFIED 2026-08-15]` / `MEASURED 2026-08-28` tags,
// and CLAUDE.md already states the rule they imply:
//
//   "A `[VERIFIED <date>]` tag records when something was true ... a *negative*
//    finding — 'this does not exist' — decays faster than a positive one,
//    because anyone may add the missing thing without touching this file.
//    Re-probe a negative before repeating it; NOTHING FAILS LOUDLY WHEN IT
//    GOES STALE."
//
// That last clause was the whole gap. The convention was enforced by whoever
// happened to re-read the file. On 2026-08-28 five of seven rows in one network
// table had gone stale in the same direction, and the warning above them did not
// prevent it — a reader who takes "denied" at face value never runs the probe
// that would correct it.
//
// This is the thing that fails loudly. It is LESSONS #6 applied to prose:
// "encode checks so TIME breaks them, not someone re-reading them."
//
// ── WHAT IT DOES NOT SCAN, AND WHY THAT IS THE KEY DECISION ─────────────────
//
// `reports/<date>/` and any other dated archive directory are EXCLUDED.
//
// A claim inside `reports/2026-08-09/TOOLING_EVAL.md` is a historical record of
// what was true on 2026-08-09. It is *supposed* to age. Re-probing it would be
// a category error, and worse, it would bury the live claims under hundreds of
// archived ones until nobody read the output.
//
// Live surfaces — CLAUDE.md, LESSONS.md, NORTH-STAR.md, STATUS.md, docs/ — are
// the ones that must not decay, because agents read them AS CURRENT TRUTH.
//
// ── THREE OUTCOMES ──────────────────────────────────────────────────────────
//
//   0  VERIFIED     every dated claim on a live surface is inside its window
//   2  NOT_CHECKED  no dated claims found at all — the convention is not in use
//                   here. An absence, not a pass.
//   1  FAILED       at least one claim has outlived its window
//
// Fix a failure by RE-PROBING and RE-DATING the claim. Bumping the date without
// running the probe is the "reporting success it has not earned" failure this
// whole repo is organised against, and no script can catch it — that one is on you.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.argv.find((a) => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]) || '.';

// A positive claim ("X is true") stays credible longer than a negative one
// ("X does not exist"), because adding the missing thing requires touching
// nothing here. Both are overridable for a one-off audit.
const MAX_AGE_POSITIVE = Number(process.env.DRIFT_MAX_AGE_DAYS || 90);
const MAX_AGE_NEGATIVE = Number(process.env.DRIFT_MAX_AGE_NEGATIVE_DAYS || 45);

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage',
  '.codegraph', 'graphify-out', '.claude', 'artifacts', 'screenshots',
]);

// Dated archives: `reports/2026-08-09/`, `sprints/2026-07-31/`, etc. The date
// in the path IS the provenance — these are records, not live claims.
const DATED_ARCHIVE = /(^|[\\/])(reports?|archive|sprint-log|sprints)[\\/]\d{4}-\d{2}-\d{2}([\\/]|$)/;

// Matches the tag shapes actually in use in these repos, measured 2026-08-29:
//   [VERIFIED 2026-08-15]   [V 2026-08-09]   [V sql:2026-07-27]
//   [MEASURED 2026-08-21]   VERIFIED 2026-08-15   Last reviewed: 2026-08-20
const CLAIM = /(?:\[(V|VERIFIED|MEASURED)\b[^\]]{0,40}?(\d{4}-\d{2}-\d{2})\]|\b(VERIFIED|MEASURED|Verified|verified|Last reviewed)\b:?\s+(\d{4}-\d{2}-\d{2}))/g;

// A claim is "negative" when the sentence carrying it asserts an absence.
const NEGATIVE = /\b(no|not|never|cannot|can't|denied|blocked|absent|missing|unavailable|unreachable|does not|doesn't|is none|zero|refus\w*|fails? to)\b/i;

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      walk(full, out);
    } else if (name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

const today = new Date();
const claims = [];

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file) || file;
  if (DATED_ARCHIVE.test(sep === '\\' ? rel.replace(/\\/g, '/') : rel)) continue;

  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  const lines = text.split('\n');

  lines.forEach((line, i) => {
    CLAIM.lastIndex = 0;
    let m;
    while ((m = CLAIM.exec(line)) !== null) {
      const iso = m[2] || m[4];
      const when = new Date(`${iso}T00:00:00Z`);
      if (Number.isNaN(when.getTime())) continue;
      const ageDays = Math.floor((today - when) / 86_400_000);
      // Look at the whole line plus the one before it: the tag is often on a
      // heading line while the assertion sits beside or above it.
      const context = `${lines[i - 1] || ''} ${line}`;
      const negative = NEGATIVE.test(context);
      claims.push({
        file: rel, line: i + 1, iso, ageDays, negative,
        limit: negative ? MAX_AGE_NEGATIVE : MAX_AGE_POSITIVE,
        text: line.trim().slice(0, 110),
      });
    }
  });
}

if (claims.length === 0) {
  console.log('check:drift — NOT_CHECKED');
  console.log('  No dated claims found on any live surface.');
  console.log('  This is an absence, not a pass: the [VERIFIED <date>] convention is not in use here.');
  process.exit(2);
}

const expired = claims.filter((c) => c.ageDays > c.limit).sort((a, b) => b.ageDays - a.ageDays);
const fresh = claims.length - expired.length;

console.log(`check:drift — scanned ${claims.length} dated claim(s) on live surfaces`);
console.log(`  windows: positive ${MAX_AGE_POSITIVE}d · negative ${MAX_AGE_NEGATIVE}d (negatives decay faster — CLAUDE.md)`);
console.log(`  within window: ${fresh}    expired: ${expired.length}`);

if (expired.length === 0) {
  console.log('\ncheck:drift — VERIFIED');
  process.exit(0);
}

console.log('\nEXPIRED — re-probe, then re-date. Do not bump the date without running the probe.\n');
for (const c of expired) {
  const kind = c.negative ? 'negative' : 'positive';
  console.log(`  ${c.file}:${c.line}  ${c.iso}  ${c.ageDays}d old (${kind}, limit ${c.limit}d)`);
  console.log(`      ${c.text}`);
}
console.log(`\ncheck:drift — FAILED (${expired.length} expired)`);
process.exit(1);
