#!/usr/bin/env node
// scripts/check-observation-identity.mjs — the earned evidence has ONE key, and
// the wrong one fails silently.
//
// Run: node scripts/check-observation-identity.mjs
// Exit: 0 VERIFIED · 2 NOT_CHECKED · anything else FAILED
//
// ── THE DEFECT THIS EXISTS FOR ──────────────────────────────────────────────
//
// `repid_agents` carries TWO identifiers and they are not interchangeable:
//
//   repid_agents.id         uuid   ← what v_agent_earned_observations joins
//   repid_agents.agent_id   text   ← a different identifier entirely
//
// Measured 2026-08-17: `agent_id` is uuid-shaped on **0 of 176** rows, and the
// view has 152,473 rows across 123 agents with **zero** orphans against `id`.
// The two spaces are DISJOINT. So a read keyed on `agent_id` does not raise,
// does not warn, and does not return a partial answer — it returns the empty
// set, and every agent reads as having no track record at all.
//
// `EarnedMetricsRepo` resolves `id` and filters on it, and always did. Nothing
// in production has ever read this view by the wrong key. This gate exists
// because the mistake is **cheap to make and impossible to see** — it is one
// column name apart from correct, and its symptom is a plausible answer.
//
// NOT claimed here: that this defect caused any published figure. A floor-census
// number was retracted the same day (see LESSONS A28) and the key mix-up is the
// obvious suspect, but it does not fit — reading by the text column returns zero
// observations for EVERY agent, which is not the shape of that error. The hazard
// is real and measured; its link to that retraction is not, and pairing them
// would be the tidy story rather than the true one.
//
// ── AND THE RECENCY COLUMN IS NOT A RECENCY SIGNAL ──────────────────────────
//
// The neighbouring trap, same shape. `repid_agents.last_active_at` is written
// on 32 of 176 rows, is NULL on 11 of the 12 ratcheted rows, and is written by
// exactly one database function (`apply_linked_bet_resolution`) and by zero
// lines of this repo. It reports 17 recently-active agents where the
// observation evidence shows 67.
//
// Any dormancy, decay or re-attestation rule keyed on it expires standing for
// agents that are demonstrably active — and it fails in the expensive
// direction, since the agent loses a tier it earned.
//
// ── WHAT THIS SUITE CAN AND CANNOT DO ───────────────────────────────────────
//
// It CANNOT re-run the census: the Supabase host is proxy-denied from an agent
// session (CLAUDE.md, "Network"). The numbers above live in a dated fixture
// with their reproduction SQL, and are labelled a measurement, not an
// assertion.
//
// What it CAN do is static, and it is the half that regresses: pin that every
// consumer of the view resolves the uuid key, and that no new consumer appears
// without one. A registry, so adding a reader is a deliberate act.
//
// THREE OUTCOMES. VERIFIED / NOT CHECKED / FAILED.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from './lib/import-specifiers.mjs';

const results = [];
const record = (state, control, detail) => results.push({ state, control, detail });
const read = (p) => {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
};

const VIEW = 'v_agent_earned_observations';

/**
 * Every file permitted to read the observation view, and the proof that it uses
 * the uuid key. A new reader FAILS this suite until it is added here with the
 * same proof — which is the point: the wrong key is silent, so the only place
 * it can be caught is at the moment someone writes it.
 */
const READERS = [
  {
    file: 'lib/trustshell/EarnedMetricsRepo.ts',
    // Resolves the agent by `id` from repid_agents ...
    resolves: /\.from\('repid_agents'\)[\s\S]{0,200}?\.select\('id, agent_name'\)/,
    // ... and filters observations by THAT value, never by a text agent_id.
    filters: /\.from\('v_agent_earned_observations'\)[\s\S]{0,400}?\.eq\('agent_id', resolved\.id\)/,
    why: 'the earned half of every RepID score comes through this read; the wrong key zeroes it',
  },
];

// ── 1. the declared readers use the uuid key ────────────────────────────────

for (const { file, resolves, filters, why } of READERS) {
  const src = read(file);
  if (src === null) {
    record('NOT CHECKED', `${file} · reads the view by uuid`, `could not read ${file}`);
    continue;
  }
  if (!resolves.test(src)) {
    record('FAILED', `${file} · resolves repid_agents.id`,
      `no \`select('id, agent_name')\` against repid_agents. ${why}`);
  } else if (!filters.test(src)) {
    record('FAILED', `${file} · filters observations by the resolved uuid`,
      `reads ${VIEW} without \`.eq('agent_id', resolved.id)\`. If it filters by a text ` +
      `agent_id the result is EMPTY, not wrong-looking — every agent reads as untracked. ${why}`);
  } else {
    record('VERIFIED', `${file} · reads the view by the uuid key`,
      "resolves repid_agents.id and filters observations on it");
  }
}

// ── 2. no undeclared reader has appeared ────────────────────────────────────

const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.claude', '.vercel', 'out', 'tool-results', 'docs']);
const CODE = /\.(ts|tsx|mjs|cjs|js|jsx)$/;
const declared = new Set(READERS.map((r) => r.file));

/**
 * What counts as READING the view — a query against it, not a mention of it.
 *
 * The first draft of this gate flagged any file containing the view's name, and
 * it immediately caught three manifests whose only offence was DESCRIBING the
 * hazard: this suite, the mutation manifest, and the retraction list. A gate
 * that fails on its own documentation is a gate people learn to skip, and the
 * allowlist would have grown with every doc that explained the rule.
 *
 * So the test is a query form. Comments are stripped first, so a header warning
 * against the wrong key is never mistaken for using it.
 *
 * KNOWN LIMIT, stated rather than papered over: a read built from a variable
 * (`const V = 'v_agent_…'; supabase.from(V)`) is not detected. Nothing in the
 * tree does that today, and the honest position is that this gate catches the
 * literal form — which is the form every reader here uses — not every possible
 * one.
 */
const READ_FORMS = [
  new RegExp(`\\.from\\(\\s*['"\`]${VIEW}['"\`]\\s*\\)`),   // supabase-js
  new RegExp(`\\bfrom\\s+(public\\.)?${VIEW}\\b`, 'i'),      // raw SQL
];

/**
 * Files that genuinely query the view but are not the production read path.
 *
 * EMPTY, and deliberately so. Once the test became a query form rather than a
 * name match, every candidate stopped matching — `scripts/e2e/seed.mjs` uses
 * the view's name as a key in a fixture map, which is not a read. An entry here
 * for a file the scan no longer flags would be a caveat describing the past,
 * which is how the next reader gets misled.
 */
const NOT_READERS = new Set([]);

const walk = (dir, out = []) => {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP.has(e) || e.startsWith('.')) continue;
    const p = join(dir, e);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (CODE.test(e)) out.push(p);
  }
  return out;
};

const files = walk('lib').concat(walk('app'), walk('scripts'));
if (files.length === 0) {
  record('NOT CHECKED', 'the tree is scannable for undeclared readers', 'walked lib/, app/, scripts/ and found no source files');
} else {
  const readers = files
    .map((f) => f.split(/[\\/]/).join('/'))
    .filter((f) => {
      const src = read(f);
      if (src === null) return false;
      const code = stripComments(src);
      return READ_FORMS.some((re) => re.test(code));
    });
  const undeclared = readers.filter((f) => !declared.has(f) && !NOT_READERS.has(f));
  if (undeclared.length === 0) {
    record('VERIFIED', 'every consumer of the view is declared',
      `${readers.length} file(s) query ${VIEW}; ${declared.size} declared reader, ` +
      `${NOT_READERS.size} allowlisted non-reader`);
  } else {
    record('FAILED', 'every consumer of the view is declared',
      `${undeclared.length} file(s) reference ${VIEW} without being declared: ${undeclared.join(', ')}. ` +
      `Add it to READERS with the proof it filters on the uuid resolved from repid_agents.id, ` +
      `or to NOT_READERS if it only names the view. A read on the text agent_id returns EMPTY silently.`);
  }
}

// ── 3. nothing keys recency off last_active_at ──────────────────────────────

const recencyUsers = files
  .map((f) => f.split(/[\\/]/).join('/'))
  .filter((f) => f !== 'scripts/check-observation-identity.mjs')
  .filter((f) => {
    const src = read(f);
    return src !== null && /last_active_at|lastActiveAt/.test(stripComments(src));
  });
if (recencyUsers.length === 0) {
  record('VERIFIED', 'no code keys recency off repid_agents.last_active_at',
    'the column is written on 32 of 176 rows by one betting-resolution function and reports ' +
    '17 recently-active agents where the evidence shows 67 — it is not an activity signal');
} else {
  record('FAILED', 'no code keys recency off repid_agents.last_active_at',
    `${recencyUsers.join(', ')} reference last_active_at. It is NULL on 11 of the 12 ratcheted ` +
    `rows and understates 30-day activity roughly four-fold fleet-wide; a rule keyed on it ` +
    `expires standing for agents that are demonstrably active. Use ${VIEW}.observed_at.`);
}

// ── 4. the fixture still says what this suite claims it says ────────────────

const raw = read('lib/trustshell/fixtures/observation-identity-2026-08-17.json');
if (raw === null) {
  record('NOT CHECKED', 'the measured fixture is present', 'could not read the fixture');
} else {
  let fx = null;
  try {
    fx = JSON.parse(raw);
  } catch (e) {
    record('NOT CHECKED', 'the measured fixture parses', String(e.message).slice(0, 200));
  }
  if (fx) {
    const id = fx.identity_spaces ?? {};
    // The disjointness is the whole premise. If a future measurement shows any
    // overlap, this suite's reasoning no longer holds and must be rewritten
    // rather than quietly kept.
    if (id.agents_matched_on_agent_id === 0 && id.agents_matched_on_id > 0) {
      record('VERIFIED', 'the fixture records disjoint identifier spaces',
        `${id.agents_matched_on_id} agents match on id, ${id.agents_matched_on_agent_id} on agent_id ` +
        `(measured ${fx.measured_at})`);
    } else {
      record('FAILED', 'the fixture records disjoint identifier spaces',
        `matched_on_id=${id.agents_matched_on_id}, matched_on_agent_id=${id.agents_matched_on_agent_id}. ` +
        'This suite is built on the two spaces being disjoint; if that changed, rewrite the reasoning.');
    }
  }
}

const width = Math.max(...results.map((r) => r.control.length));
console.log('\nObservation identity — the earned evidence has one key, and the wrong one is silent\n');
for (const r of results) {
  const mark = r.state === 'VERIFIED' ? '✓' : r.state === 'FAILED' ? '✗' : '·';
  console.log(`  ${mark} ${r.control.padEnd(width)}  ${r.state}`);
  console.log(`    ${r.detail}`);
}
const failed = results.filter((r) => r.state === 'FAILED').length;
const unchecked = results.filter((r) => r.state === 'NOT CHECKED').length;
const verified = results.filter((r) => r.state === 'VERIFIED').length;
console.log(`\ncheck:observation-identity — ${verified} VERIFIED, ${unchecked} NOT CHECKED, ${failed} FAILED.`);
process.exit(failed > 0 ? 1 : unchecked > 0 ? 2 : 0);
