#!/usr/bin/env node
// scripts/check-verdict-provenance.mjs — can a verdict that moved a score be
// traced to the evidence that earned it?
//
// Run: node scripts/check-verdict-provenance.mjs
// Exit: 0 VERIFIED · 2 NOT_CHECKED · anything else FAILED
//
// P2 of SPRINT-DECISIONS-2026-08-17 — "schema facts that block Gate 2".
//
// `issuer-stake.ts` can score the issuer and `refusesToIssue` names the exact
// failure. Both are correct, mutation-tested, and reachable by nobody: measured
// 2026-08-17, ZERO importers across lib/ and app/ beyond the barrel.
//
// This suite says why that cannot be fixed with a call site, and turns the
// blocker into something that goes green by itself when the schema moves.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

// ── what makes this gate self-closing, and why it is parsed from source ──────
//
// The first version of this suite ran `describeLinkage(SCORING_PATH_COLUMNS)` —
// a CHECKED-IN CONSTANT — and claimed "it goes VERIFIED on its own the moment a
// linking column lands". That was false. Nothing in the repo changes when the
// view changes, so the constant, and therefore the verdict, was frozen until a
// human edited it. A gate that reports a permanent yellow it cannot leave is the
// same unearned-verdict shape this gate was written to report.
//
// Two alternatives were rejected on evidence, not taste:
//
//   - Read the live schema over PostgREST, the `check:legacy-key` idiom.
//     Supabase is proxy-denied from an agent session, AND `.github/workflows/`
//     sets no SUPABASE_* variable — zero hits. The path would never execute
//     anywhere it runs: untested code producing a permanent NOT_CHECKED.
//   - Parse a migration defining the view. There is none in the repo.
//
// What DOES change in the repo when someone wires provenance through is the
// projection the scorer asks for, in EarnedMetricsRepo.ts. That is in-repo,
// authoritative, and parsed below.
//
// This matters more than a dashboard would: EarnedMetricsRepository is
// constructed in `app/api/trustrails/pay/route.ts`. The view feeds a
// PAYMENT-GATING path.
const REPO_SRC = 'lib/trustshell/EarnedMetricsRepo.ts';
const VIEW = 'v_agent_earned_observations';

/**
 * The columns the scorer actually asks the view for.
 *
 * Returns { ok, columns, detail }. `ok: false` means the call site moved and
 * this suite can no longer see it — reported as a FAILURE, not silently as an
 * empty column list, because "found nothing" and "could not look" are the two
 * outcomes this repository exists to keep apart.
 */
export function parseScorerColumns(src) {
  const at = src.indexOf(`from('${VIEW}')`);
  if (at === -1) {
    return { ok: false, columns: [], detail: `no \`.from('${VIEW}')\` in ${REPO_SRC}` };
  }
  const rest = src.slice(at);
  const sel = rest.match(/\.select\(\s*'([^']*)'/);
  if (!sel) {
    return { ok: false, columns: [], detail: `\`.from('${VIEW}')\` has no literal .select()` };
  }
  const projected = sel[1].split(',').map((s) => s.trim()).filter(Boolean);
  // `.eq('agent_id', …)` is a filter rather than a projection, but a column the
  // query filters on is unquestionably visible to the scorer, so it counts.
  const filters = [...rest.slice(0, sel.index + sel[0].length + 400).matchAll(/\.eq\(\s*'([^']+)'/g)]
    .map((m) => m[1]);
  return {
    ok: true,
    columns: [...new Set([...projected, ...filters])],
    detail: `parsed from ${REPO_SRC}`,
  };
}

const outDir = mkdtempSync(join(process.cwd(), '.verdict-provenance-check-'));
let m;
try {
  execFileSync(
    localTsc(),
    ['lib/trustshell/verdict-provenance.ts', '--outDir', outDir, '--rootDir', 'lib',
     '--module', 'commonjs', '--target', 'es2022', '--lib', 'es2022,dom',
     '--moduleResolution', 'node', '--esModuleInterop', '--strict'],
    { stdio: 'pipe' }
  );
  m = await import(pathToFileURL(join(outDir, 'trustshell', 'verdict-provenance.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('verdict-provenance compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const { provenanceOf, describeLinkage, SCORING_PATH_COLUMNS, PROVENANCE_COLUMN_CANDIDATES } = m;

// ── mechanism assertions run against THIS, not against the snapshot ─────────
//
// Verified by simulating the fix: adding `quorum_providers_used` to BOTH the
// scorer's .select() and SCORING_PATH_COLUMNS broke FOUR assertions at once —
// they had baked "today the view is unwired" into their fixtures, so the gate
// FAILED at the moment it should have gone VERIFIED. A gate that goes red when
// its blocker is fixed does not get fixed; it gets deleted.
//
// So: assertions about the MECHANISM use this fixed, unwired column list and are
// independent of what the view currently exposes. Assertions about TODAY'S
// STATE belong in the verdict at the bottom, which is allowed to change.
const UNWIRED_VIEW = ['agent_id', 'signal', 'observed_at', 'success', 'domain', 'value_ms'];

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed += 1; } catch (e) { failures.push(`${name}\n    ${e.message}`); }
};
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const truthy = (v, what) => { if (!v) throw new Error(`${what}: expected truthy, got ${JSON.stringify(v)}`); };

// ── the ordering that keeps this honest ─────────────────────────────────────

check('ABSENT PROVENANCE IS NOT_CHECKED — never a finding of "unearned"', () => {
  // The single most important assertion here. Every event on the live scoring
  // path has null provenance today, so reading null as `false` would manufacture
  // ~70,000 findings out of a missing column — a fabricated accusation at scale,
  // which is worse than the gap it purports to describe.
  const r = provenanceOf({ vetoed: true, providerAttempted: null });
  eq(r.outcome, 'NOT_CHECKED', 'a vetoing event with no provenance');
  eq(r.countsTowardScore, false, 'and it must not move a score');
  truthy(!/unearned/i.test(r.detail.split('NOT a finding')[0]),
    'the detail must not call it unearned before the caveat');
  truthy(/never carried|not weighed/i.test(r.detail), 'and must say the evidence was never carried');
});

check('UNTRACEABLE is checked BEFORE unearned — order is load-bearing', () => {
  // If the unearned branch ran first, `providerAttempted: null` would be falsy
  // in a loose test and every untraceable veto would read as FAILED.
  eq(provenanceOf({ vetoed: true, providerAttempted: null }).outcome, 'NOT_CHECKED',
     'null must not fall into the unearned branch');
  eq(provenanceOf({ vetoed: true, providerAttempted: false }).outcome, 'FAILED',
     'but an explicit false must');
  eq(provenanceOf({ vetoed: true, providerAttempted: undefined }).outcome, 'NOT_CHECKED',
     'undefined is untraceable too, not unearned');
});

check('an ACTIONABLE verdict with no provider is FAILED', () => {
  // This is `refusesToIssue` applied where it matters: at the point the verdict
  // would move a score, not only at the point it is issued.
  const r = provenanceOf({ vetoed: true, providerAttempted: false });
  eq(r.outcome, 'FAILED', 'unearned veto');
  eq(r.countsTowardScore, false, 'must not move a score');
});

check('a NON-actionable verdict with no provider stakes nothing', () => {
  // Abstaining without consulting anything is cheap but harmless — it acts
  // against nobody. Only actionable verdicts stake.
  const r = provenanceOf({ vetoed: false, providerAttempted: false });
  eq(r.outcome, 'VERIFIED', 'an abstention is not an offence');
  eq(r.countsTowardScore, true, 'and may count');
});

check('A NON-ACTIONABLE EVENT WITH *ABSENT* PROVENANCE STILL COUNTS', () => {
  // The assertion this suite was missing, and the defect it let through.
  //
  // The first version checked `providerAttempted == null` BEFORE `vetoed`, so a
  // clean observation carrying no provenance came back NOT_CHECKED and
  // non-counting. Measured against v_agent_earned_observations that is
  // 82,459 of 152,482 rows — 54.1% — silently dropped, including 100% of the
  // x402 and latency arms, neither of which has a provider concept to record.
  //
  // It would have deleted the positive evidence and kept only the accusations,
  // while every existing assertion stayed green. Nothing here covered the
  // (vetoed: false, providerAttempted: null) corner, so nothing went red.
  const r = provenanceOf({ vetoed: false, providerAttempted: null });
  eq(r.outcome, 'VERIFIED', 'a non-actionable event owes no provenance');
  eq(r.countsTowardScore, true, 'and must NOT be dropped from the score');
  eq(provenanceOf({ vetoed: false, providerAttempted: undefined }).countsTowardScore, true,
     'undefined is the same case');
});

check('the ALREADY-EXISTING provenance value is a candidate', () => {
  // metadata->>'quorum_providers_used' is present on 93,657 of 147,723
  // HAL_SCORE_EVENT rows and on 100% of them since the 2026-06-04 cutover.
  // Gate 2 is blocked by a PROJECTION, not by a missing foreign key, and the
  // candidate list has to name the value that already exists or the "smallest
  // change" this gate recommends is the expensive one.
  truthy(PROVENANCE_COLUMN_CANDIDATES.includes('quorum_providers_used'),
    'quorum_providers_used must be a candidate — it already exists in metadata');
  eq(PROVENANCE_COLUMN_CANDIDATES[0], 'quorum_providers_used',
    'and first, because it is the cheapest path');
  const d = describeLinkage(UNWIRED_VIEW).detail;
  truthy(/projection/i.test(d), 'the detail must name the blocker as a projection');
  // "missing foreign key" MAY appear — naming a retracted claim in order to
  // negate it is the point of PRIOR-WORK-INDEX. What must not survive is the
  // claim ASSERTED. So: if the phrase occurs, every occurrence must be negated.
  for (const m of d.matchAll(/missing foreign key/gi)) {
    const before = d.slice(Math.max(0, m.index - 24), m.index);
    truthy(/\bnot a\s*$/i.test(before),
      `"missing foreign key" must appear only as a retraction; found it after "${before.trim()}"`);
  }
  truthy(/quorum_providers_used/.test(d), 'and must name the value that already exists');
});

check('a backed actionable verdict counts', () => {
  const r = provenanceOf({ vetoed: true, providerAttempted: true });
  eq(r.outcome, 'VERIFIED', 'earned veto');
  eq(r.countsTowardScore, true, 'counts');
});

check('countsTowardScore is FALSE for both non-VERIFIED outcomes', () => {
  // Untraceable and unearned are different facts with the same consequence.
  // Asserted together so a future edit cannot let one of them through.
  for (const ev of [
    { vetoed: true, providerAttempted: null },
    { vetoed: true, providerAttempted: false },
  ]) {
    eq(provenanceOf(ev).countsTowardScore, false, `${JSON.stringify(ev)} must not move a score`);
  }
});

// ── the schema fact ─────────────────────────────────────────────────────────

check('A VIEW WITH NO PROVENANCE COLUMN IS NOT_CHECKED', () => {
  // The Gate 2 blocker stated as a MECHANISM, over UNWIRED_VIEW rather than the
  // live snapshot — so this assertion still means something after the fix lands.
  //
  // Note what it does and does not say. The VIEW carries no provenance — that is
  // what `EarnedMetricsRepo` can see, and it is true. The TABLE underneath does
  // carry it. Conflating the two is the error this module's header records.
  const r = describeLinkage(UNWIRED_VIEW);
  eq(r.outcome, 'NOT_CHECKED', 'no candidate column present');
  eq(r.found, [], 'nothing found');
  eq(UNWIRED_VIEW.length, 6, 'the view was measured at exactly six columns, 2026-08-17');
});

check('IT GOES VERIFIED BY ITSELF when a linking column lands', () => {
  // The property that stops this rotting into a permanent yellow: no edit to
  // the module or this suite is required when the schema is fixed.
  for (const candidate of PROVENANCE_COLUMN_CANDIDATES) {
    const r = describeLinkage([...UNWIRED_VIEW, candidate]);
    eq(r.outcome, 'VERIFIED', `adding ${candidate} unblocks it`);
    eq(r.found, [candidate], 'and it names which');
  }
});

// ── the self-closing half ───────────────────────────────────────────────────

check('THE PARSED CALL SITE AGREES WITH THE MEASURED SNAPSHOT', () => {
  // Two independent descriptions of the same surface: SCORING_PATH_COLUMNS is
  // what the VIEW was measured to expose (2026-08-17); the parse is what the
  // SCORER asks for. They agreed at the time of writing. If they diverge, one
  // of the two is stale and the gate must say so rather than pick a winner.
  //
  // PROVENANCE COLUMNS ARE EXCLUDED FROM THIS COMPARISON, and that exclusion is
  // load-bearing. Wiring provenance through makes the two lists diverge BY
  // DESIGN — it is the change this gate exists to ask for. Comparing raw lists
  // made the build FAIL the moment someone started the fix, which is a gate
  // punishing the behaviour it demands. Verified by doing it: adding
  // `quorum_providers_used` to the .select() failed this assertion at exit 1
  // instead of reaching the intended NOT_CHECKED "one half in place" verdict.
  // So this checks for UNRELATED drift; the provenance columns are the verdict's
  // business, below.
  const p = parseScorerColumns(readFileSync(REPO_SRC, 'utf8'));
  truthy(p.ok, `the call site must still be findable: ${p.detail}`);
  const withoutProvenance = (cols) =>
    [...cols].filter((c) => !PROVENANCE_COLUMN_CANDIDATES.includes(c)).sort();
  eq(withoutProvenance(p.columns), withoutProvenance(SCORING_PATH_COLUMNS),
     'parsed scorer columns vs the measured view snapshot, provenance aside');
});

check('THE PARSE SELF-CLOSES — a wired-through column is seen with no edit here', () => {
  // The property the first version claimed and did not have. Synthetic source,
  // not the real file: this asserts the MECHANISM, so it keeps working when the
  // real file is the one that changed.
  for (const candidate of PROVENANCE_COLUMN_CANDIDATES) {
    const future = `
      const q = client
        .from('${VIEW}')
        .select('signal, observed_at, success, domain, value_ms, ${candidate}')
        .eq('agent_id', resolved.id);
    `;
    const p = parseScorerColumns(future);
    truthy(p.ok, 'parses');
    truthy(p.columns.includes(candidate), `${candidate} must be seen`);
    eq(describeLinkage(p.columns).outcome, 'VERIFIED',
       `and ${candidate} must flip the linkage verdict`);
  }
});

check('A MOVED CALL SITE IS A FAILURE, NOT AN EMPTY COLUMN LIST', () => {
  // "found nothing" and "could not look" must not collapse. If they did, moving
  // or renaming the query would make this gate report the blocker it was
  // written to report — a correct-looking verdict reached by not looking.
  eq(parseScorerColumns('const x = 1;').ok, false, 'no .from() at all');
  eq(parseScorerColumns(`client.from('${VIEW}')`).ok, false, 'no literal .select()');
  eq(parseScorerColumns(`client.from('${VIEW}').select(COLUMNS)`).ok, false,
     'a non-literal select cannot be parsed and must not read as empty');
});

check('a near-miss column name does NOT satisfy it', () => {
  // Guards against the fix being declared done by a column that sounds right.
  for (const wrong of ['provider', 'attempted', 'providers', 'evidence', 'hal_score']) {
    eq(describeLinkage([...UNWIRED_VIEW, wrong]).outcome, 'NOT_CHECKED',
       `${wrong} must not count as provenance`);
  }
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\nverdict-provenance: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}

// ── the verdict, in two halves ──────────────────────────────────────────────
//
// REPO HALF (self-closing): does the scorer REQUEST a provenance column?
// MEASURED HALF (needs a re-measurement): does the VIEW expose one?
//
// Both are required for VERIFIED, and neither is sufficient. Adding the column
// to `.select()` alone does not prove the view supplies it — PostgREST would
// 400 and EarnedMetricsRepo would report `unmeasured`, which is a silent
// downgrade to "no track record" on a payment path. Updating the snapshot alone
// does not prove the scorer asks for it.
//
// This is not a gate that cannot pass. Both halves are things the person wiring
// provenance through does anyway; neither is a decision nobody owns.
const parsed = parseScorerColumns(readFileSync(REPO_SRC, 'utf8'));
if (!parsed.ok) {
  console.error(`check:verdict-provenance — FAILED. ${parsed.detail}`);
  console.error(
    `\n  The scorer's query moved. This gate reads it to decide whether provenance\n` +
      `  reaches the scoring path, and it will NOT report a blocker it can no longer\n` +
      `  see — that would be a verdict reached by not looking. Re-point ${REPO_SRC}\n` +
      `  or update the parser.`
  );
  process.exit(1);
}

const repoHalf = describeLinkage(parsed.columns);
const measuredHalf = describeLinkage(SCORING_PATH_COLUMNS);

if (repoHalf.outcome === 'VERIFIED' && measuredHalf.outcome === 'VERIFIED') {
  console.log('check:verdict-provenance — VERIFIED. Provenance reaches the scoring path.');
  console.log(`  scorer requests:   ${repoHalf.found.join(', ')}`);
  console.log(`  view exposes:      ${measuredHalf.found.join(', ')}`);
  process.exit(0);
}

if (repoHalf.outcome === 'VERIFIED' || measuredHalf.outcome === 'VERIFIED') {
  console.log(`check:verdict-provenance — NOT_CHECKED. One half of the wiring is in place.

  scorer requests provenance:  ${repoHalf.outcome === 'VERIFIED' ? `YES (${repoHalf.found.join(', ')})` : 'NO'}
  view is measured to expose:  ${measuredHalf.outcome === 'VERIFIED' ? `YES (${measuredHalf.found.join(', ')})` : 'NO'}

  ${
    repoHalf.outcome === 'VERIFIED'
      ? 'The scorer now asks for provenance but SCORING_PATH_COLUMNS — the measured\n' +
        '  snapshot of what the view exposes — does not list it. Re-measure the view\n' +
        '  and update the constant. If the view does NOT supply it, the query will 400\n' +
        '  and EarnedMetricsRepo will report `unmeasured`, silently downgrading agents\n' +
        '  to "no track record" on the payment path in app/api/trustrails/pay/route.ts.'
      : 'The view exposes provenance but the scorer does not select it, so nothing\n' +
        `  reaches the scoring path. Add it to the .select() in ${REPO_SRC}.`
  }
`);
  process.exit(2);
}

console.log(`check:verdict-provenance — NOT_CHECKED. Gate 2 is blocked by a PROJECTION.

  RETRACTED, by this gate, about its own first version: "the scoring path
  carries no provenance — Gate 2 is blocked by a missing foreign key." That was
  read off information_schema.columns, which cannot see inside a jsonb column.
  It was true of the COLUMNS and false of the TABLE.

  MEASURED 2026-08-17 against the live database:

    repid_score_events.metadata ->> 'quorum_providers_used'   a scalar count of
    the providers consulted, present on 93,657 of 147,723 HAL_SCORE_EVENT rows
    (63.4%), continuously from 2026-06-04 to today.

    Provenance is carried on the event type that renders a verdict and on no
    other. In August: HAL_SCORE_EVENT 35 of 35 carry it. The rows that do not
    are SERVICE_FULFILLED / SERVICE_SATISFIED / PREDICTION_RESOLVE /
    VALIDATION_FAILED, which render no HAL verdict and owe no provenance.

  WHERE PROVENANCE IS PRESENT AND ZERO — a verdict issued having consulted
  nothing, exactly \`refusesToIssue\` — there are 2,443 such events and among
  them ZERO actionable catches and ZERO score movement. The alarming reading,
  "unearned vetoes are moving spending limits", is measured FALSE everywhere it
  is measurable. This gate asserted the opposite two commits ago.

  THE RESIDUE IS BOUNDED AND DATED: 180 catches moved a score carrying no
  provenance key, summed applied delta -1,800, ALL on 2026-06-04 — the single
  day the key was introduced. Not 70,000. Not zero.

  WHAT IS STILL BLOCKED: v_agent_earned_observations projects six columns and
  none is provenance, so \`refusesToIssue\` still cannot be applied to the events
  that move reputation, and issuer-stake.ts still has zero importers beyond the
  barrel. The finding is now "the view drops it", not "the pipeline never had it".

  SMALLEST CHANGE THAT UNBLOCKS IT: one line in v_agent_earned_observations —
  project (metadata->>'quorum_providers_used')::int on the integrity arm. No
  DDL, no backfill, no join to hal_runner_results. This gate then turns VERIFIED
  on its own, with no edit to the module or the suite.

  SEPARATE DEFECT, same view, recorded not fixed: the integrity arm is
  success = hallucination_caught IS NOT TRUE over ALL of repid_score_events, so
  its 70,023 failures are 68,436 HAL catches + 1,587 PREDICTION_RESOLVE catches
  — two mechanisms pooled into one signal. The arithmetic is exact. The view's
  bft arm is dead: bft_payment_evaluations has 0 rows.
`);
process.exit(2);
