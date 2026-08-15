#!/usr/bin/env node
// scripts/check-prior-work.mjs — make the prior-work index enforceable.
//
// Run: npm run check:prior-work
//
// An index that is only advice decays into a file nobody opens. This makes the
// two mechanically checkable parts of `docs/PRIOR-WORK-INDEX.md` fail the build:
//
//   1. RETRACTED NUMBERS CANNOT REAPPEAR. Four figures were published and later
//      retracted over 2026-08-13/14. They are still present in git history and
//      in the historical record, so a future agent can easily grep one up and
//      quote it in good faith. Any NEW file citing one fails here.
//
//   2. NO DOC MAY BE INVISIBLE. Every `docs/*.md` must be named in the index.
//      Work nobody can find gets rediscovered at full price — which is the
//      whole reason the index exists.
//
// WHY AN ALLOWLIST RATHER THAN DELETION. The historical files legitimately
// contain the retracted numbers: SPRINT-LOG records what was believed at the
// time and the correction that followed, TRUST-HARNESS carries the do-not-cite
// table, and repid-replay.mjs deliberately records lift 1.283 so nobody
// recomputes it and believes it. Deleting the record would hide the correction,
// which is worse than the original error. So those files are allowlisted BY
// PATH, and everything else is enforced.
//
// THIS CHECK IS DELIBERATELY NARROW. It cannot verify that an agent read the
// index, and it does not try — a check that pretends to measure something it
// cannot is the exact defect this repo keeps catching. It verifies two
// mechanical invariants. The rest of the protocol is honour-system, stated in
// CLAUDE.md where every agent loads it.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const INDEX = 'docs/PRIOR-WORK-INDEX.md';

/**
 * Retracted claims. `pattern` must be specific enough that an unrelated
 * occurrence of the same digits does not trip it — a false positive here
 * teaches people to skip the gate, which is how a gate dies.
 */
const RETRACTED = [
  {
    id: 'p99-446',
    pattern: /\+?\s*446\s*%/,
    claim: 'p99 cost of correctness is +446%',
    truth: 'mostly a confidenceK tuning artefact; actual ~+27%',
  },
  {
    id: 'lift-1283',
    pattern: /lift\s*(of\s*)?1\.283|1\.283\s*(co-?failure|lift)/i,
    claim: 'co-failure lift 1.283 on real data',
    truth: 'artefact of grouping by prompt_text; co-failure is NOT computable from that table',
  },
  {
    id: 'drift-2419',
    pattern: /\+?\s*2419\s*bps|\+2,?419\b/i,
    claim: 'fleet improved by +2419 bps mean drift',
    truth: '57 anomalous non-cron events dominated a 17-event EWMA window',
  },
  {
    id: 'margins-100',
    pattern: /100\s*%\s*of\s*(the\s*)?(real\s*)?(pairwise\s*)?margins/i,
    claim: '100% of margins under marginFloor 2000',
    truth: 'outcome order destroyed by interleaving; ~91% cron-only, itself indicative',
  },
  {
    id: 'margins-56',
    pattern: /56\s*%\s*of\s*(the\s*)?(pairwise\s*)?margins/i,
    claim: '56% of margins under the floor',
    truth: 'same contamination as the drift figure',
  },
  {
    id: 'adoption-482',
    pattern: /4\.82\s*pp|94\.77\s*%\s*of\s*the\s*omniscient/i,
    claim: 'the newcomer adoption lag is 4.82pp, the largest unclaimed prize',
    truth:
      'measured on the point-estimate ranking, not the upperConfidenceBound the simulator ships. ' +
      'Real post-join gap after Sprint X is 0.45pp, of which 0.18pp is irreducible regret; ' +
      'the attackable residual is 0.27pp. See scripts/harness-adoption.mjs',
  },
  {
    id: 'cron-667',
    pattern: /best\s+(on\s+)?cron[^.]{0,40}66\.7|66\.7\s*%[^.]{0,40}\bcron\b/i,
    claim: '32e0e809 is the best cron performer at 66.7%',
    truth: 'tail windows spanned different time periods; it ranks LAST on both cron domains',
  },
  {
    id: 'hyperdag-no-commit',
    pattern:
      /28,?908\s*bytes|hyperdag\.org[^.]{0,60}(no commit|unreproducible)|(no commit|unreproducible)[^.]{0,60}hyperdag\.org/i,
    claim: 'hyperdag.org serves 28,908 bytes that exist in no commit',
    truth:
      'compared a character count to a byte count on the same file (md5 identical, ff2ef682…), ' +
      'and read the ERROR deploy off `hyperdag-org`, a project that serves no custom domain',
  },
  {
    id: 'anon-137-4',
    pattern: /\b137\s*(tables\s*)?anon-?read|\b137\s*readable\b|\b4\s*anon-?writable\b/i,
    claim: '137 anon-readable / 4 anon-writable tables',
    truth:
      'the query counted only policies naming anon and dropped PUBLIC-role policies; ' +
      'effective access is 193 readable / 60 writable of 621 tables',
  },
];

/**
 * Files that legitimately record the retracted numbers. Allowlisted by exact
 * path so a new file cannot quietly inherit the exemption.
 */
const ALLOWED = new Set([
  'docs/SPRINT-LOG.md',
  'docs/TRUST-HARNESS.md',
  'docs/PRIOR-WORK-INDEX.md',
  'scripts/repid-replay.mjs',
  'scripts/check-prior-work.mjs',
  // Records the 4.82pp retraction and reproduces the measurement that caused
  // it, so it necessarily names the number.
  'scripts/harness-adoption.mjs',
  // Records the 137/4 figures in order to retract them, in the same document
  // that first published them.
  'docs/FULL-STACK-E2E-ASSESSMENT-2026-08-14.md',
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage',
  '.claude', '.vercel', 'out', 'tool-results',
]);
const TEXT = /\.(md|ts|tsx|js|jsx|mjs|cjs|sql|json|ya?ml|txt)$/i;

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue; // broken symlink, race — not this check's business
    }
    if (st.isDirectory()) walk(full, acc);
    else if (TEXT.test(name)) acc.push(full);
  }
  return acc;
}

const failures = [];
let scanned = 0;

// ── 1. retracted numbers ─────────────────────────────────────────────────────
const indexText = readFileSync(join(ROOT, INDEX), 'utf8');

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (ALLOWED.has(rel)) continue;
  scanned += 1;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = text.split('\n');
  for (const r of RETRACTED) {
    lines.forEach((line, i) => {
      if (r.pattern.test(line)) {
        failures.push(
          `${rel}:${i + 1} cites the RETRACTED claim "${r.claim}"\n` +
            `    line:  ${line.trim().slice(0, 110)}\n` +
            `    truth: ${r.truth}\n` +
            `    If you are recording the retraction itself, add the file to ALLOWED in this script.`
        );
      }
    });
  }
}

// ── 2. every doc must be reachable from the index ────────────────────────────
const docs = readdirSync(join(ROOT, 'docs'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => `docs/${f}`)
  .filter((f) => f !== INDEX);

for (const doc of docs) {
  const bare = doc.replace(/^docs\//, '');
  if (!indexText.includes(doc) && !indexText.includes(bare)) {
    failures.push(
      `${doc} exists but is not named in ${INDEX}\n` +
        `    Work nobody can find gets rediscovered at full price. Add a row to the` +
        ` "Where the authoritative answer lives" table.`
    );
  }
}

// ── 3. the index must still carry its own load-bearing sections ──────────────
for (const heading of ['## CLOSED', '## OPEN', '## RETRACTED', '## The protocol']) {
  if (!indexText.includes(heading)) {
    failures.push(
      `${INDEX} is missing its "${heading}" section — the index has been gutted.`
    );
  }
}

// ── report ───────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error(`\ncheck-prior-work: 0 passed, ${failures.length} failed`);
  console.error(`\ncheck:prior-work — ${failures.length} FAILED\n`);
  failures.forEach((f) => console.error(`  ✗ ${f}\n`));
  console.error(
    `Scanned ${scanned} files, ${docs.length} docs.\n` +
      `See ${INDEX} for why each of these is enforced.\n`
  );
  process.exit(1);
}

console.log(`check-prior-work: ${scanned + docs.length} passed, 0 failed`);
console.log(
  `check:prior-work — VERIFIED. ${scanned} files scanned for ${RETRACTED.length} retracted claims; ` +
    `all ${docs.length} docs reachable from the index.`
);
