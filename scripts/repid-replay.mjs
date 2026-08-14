#!/usr/bin/env node
// scripts/repid-replay.mjs — replay REAL labelled outcomes through the harness.
//
// Run: node scripts/repid-replay.mjs [--limit N] [--dry-run]
//
// WHY THIS EXISTS. Six sprints of harness work (L through P) ended on the same
// line: every magnitude comes from the modelled world in harness-simulate.mjs.
// The mechanisms are verified; the numbers are only as good as that model. This
// is the script that would change that, and it is the ONLY remaining item on
// the critical path — everything reachable inside the simulator has been
// reached.
//
// READ-ONLY. It issues SELECTs and writes nothing. It cannot apply a migration,
// it does not touch `repid_permissions` or the ground-truth gate, and it is safe
// to run against production. `--dry-run` goes further and only introspects.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT IT CAN AND CANNOT ANSWER — read this before running it
//
// The replay answers TWO different questions, and on current evidence only one
// of them is certainly answerable.
//
//   Q1  Does the ledger's earned score, replayed over real outcomes, rank
//       agents sensibly? Needs `agent_id` and an outcome column. Both are
//       recorded as existing (ROADMAP-HYBRID-REPID.md §1.2, §1.3). ANSWERABLE.
//
//   Q2  Where does the real fleet sit on the correlation axis — how often do
//       two agents get the SAME task wrong? This decides whether panels are
//       worth running at all: Sprint M measured the panel's value swinging from
//       +4.70pp to -0.85pp across that axis, and Sprint O built a gate that
//       turns panels off at the bad end. **Q2 needs a column that groups events
//       by TASK, and no such column is recorded anywhere in this repo.**
//
// Only `agent_id` and `decision_outcome` are documented. If there is no shared
// task/decision key, co-failure correlation is NOT COMPUTABLE from this table,
// and the answer to the question blocking six sprints is not in this data. That
// would be worth knowing quickly, and it is why this script introspects the
// schema FIRST and reports what is missing rather than assuming a column name
// and failing obscurely — or worse, joining on the wrong thing and reporting a
// correlation that is an artefact of the join.
//
// A previous backlog item asked for a migration proposing tables whose writer
// could not be found in this repo; it was declined rather than invented. Same
// standard here: this script DISCOVERS the schema, it does not assert one.
// ─────────────────────────────────────────────────────────────────────────────
//
// KNOWN HAZARDS, all recorded from a prior audit that had live DB access:
//
//   * 43% JOIN LEAK. 104 agents have event history; only 59 reach `agent_repid`.
//     Replaying only the joinable ones silently studies the better-connected
//     half. This script replays from `repid_score_events` directly and reports
//     the leak rather than inheriting it.
//   * `decision_outcome` IS AN UNCONSTRAINED ENUM: 13 values over 152,001 rows,
//     including case-duplicate pairs (`approved` 46 / `APPROVED` 30) and values
//     that are not outcomes at all (`test`, `profit`, `RESTORE`). A consumer
//     filtering `= 'approved'` silently drops rows. The mapping below is
//     explicit, case-folded, and REFUSES to guess: anything unrecognised is
//     counted as unmapped and excluded, never defaulted to a success or a
//     failure. A default either way would manufacture the result.

import { createClient } from '@supabase/supabase-js';
import { compileHarness } from './lib/harness-compile.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
};
const LIMIT = arg('limit', 200_000);
const DRY_RUN = argv.includes('--dry-run');

const { load } = compileHarness();
const { ReputationLedger } = await load('reputation');
const { AgreementTracker } = await load('agreement');

// ── outcome mapping, explicit and refusing to guess ──────────────────────────
//
// Case-folded because the enum contains case-duplicate pairs. Values that are
// not outcomes are listed as IGNORED rather than silently falling through, so
// the set is auditable and a new value shows up as unmapped instead of being
// absorbed into whichever bucket the code happened to default to.
const GOOD = new Set(['approved', 'clean', 'correct', 'success']);
const BAD = new Set(['vetoed', 'flagged', 'rejected']);
const IGNORED = new Set(['pending', 'submitted', 'restore', 'test', 'profit']);

/** Candidate columns, in preference order. Discovered, never assumed. */
const OUTCOME_CANDIDATES = ['decision_outcome', 'outcome', 'result', 'status'];
const TASK_CANDIDATES = [
  'task_id',
  'decision_id',
  'evaluation_id',
  'request_id',
  'session_id',
  'correlation_id',
  'batch_id',
  'context_id',
];

function classify(raw) {
  if (raw === null || raw === undefined) return 'unmapped';
  const v = String(raw).trim().toLowerCase();
  if (GOOD.has(v)) return 'good';
  if (BAD.has(v)) return 'bad';
  if (IGNORED.has(v)) return 'ignored';
  return 'unmapped';
}

async function main() {
  // Same shape as scripts/north-star.mjs: a script cannot import the TS helper,
  // so it resolves the documented key names itself, builds the client lazily
  // inside main(), and REFUSES rather than falling back to a dummy. A dummy
  // would return empty result sets that read as "no data" instead of
  // "misconfigured" — the exact bug lib/CLAUDE.md forbids.
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const KEY =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY;
  if (!URL || !KEY) {
    console.error(
      'NOT MEASURED - set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.\n' +
        'Nothing was queried, so nothing below would have been true.'
    );
    process.exit(2);
  }
  const db = createClient(URL, KEY, { auth: { persistSession: false } });

  console.log('RepID replay — real labelled outcomes through the trust harness');
  console.log('='.repeat(78));

  // ── 1. introspect, before assuming anything ────────────────────────────────
  const { data: cols, error: colErr } = await db
    .from('information_schema.columns')
    .select('column_name, data_type')
    .eq('table_name', 'repid_score_events');

  let columnNames = [];
  if (colErr || !cols) {
    // information_schema is often not exposed through PostgREST. Fall back to
    // reading one row and taking its keys — same information, worse manners.
    const { data: sample, error } = await db.from('repid_score_events').select('*').limit(1);
    if (error) {
      console.error(`\nFAILED to read repid_score_events: ${error.message}`);
      console.error('Nothing below can be trusted. Stopping rather than guessing.');
      process.exit(1);
    }
    columnNames = sample && sample.length > 0 ? Object.keys(sample[0]) : [];
  } else {
    columnNames = cols.map((c) => c.column_name);
  }

  console.log(`\nColumns on repid_score_events (${columnNames.length}):`);
  console.log(`  ${columnNames.join(', ') || '(none — table is empty)'}`);

  const outcomeCol = OUTCOME_CANDIDATES.find((c) => columnNames.includes(c)) ?? null;
  const taskCol = TASK_CANDIDATES.find((c) => columnNames.includes(c)) ?? null;
  const agentCol = columnNames.includes('agent_id') ? 'agent_id' : null;

  console.log(`\n  agent column   ${agentCol ?? 'MISSING'}`);
  console.log(`  outcome column ${outcomeCol ?? 'MISSING'}`);
  console.log(
    `  task column    ${taskCol ?? 'NOT FOUND among ' + TASK_CANDIDATES.join('/')}`
  );

  // ── the finding that decides what this replay is worth ─────────────────────
  console.log(`\nWHAT THIS DATA CAN ANSWER`);
  console.log('-'.repeat(78));
  console.log(
    `  Q1 ledger replay / earned-score ranking .......... ${agentCol && outcomeCol ? 'YES' : 'NO'}`
  );
  console.log(
    `  Q2 co-failure correlation (the W axis) ........... ${taskCol ? 'YES' : 'NO'}`
  );
  if (!taskCol) {
    console.log(
      `\n  Q2 is the question blocking Sprints L-P. Without a column that groups`
    );
    console.log(
      `  events by task, "did two agents get the SAME task wrong" is not a`
    );
    console.log(
      `  question this table can answer, and the panel/no-panel decision cannot`
    );
    console.log(`  be settled from it. Do NOT substitute a timestamp bucket or a`);
    console.log(
      `  same-agent grouping for a task key — that would report a correlation`
    );
    console.log(`  which is an artefact of the join. What is needed is either a real`);
    console.log(`  task key on this table, or a second table linking events to tasks.`);
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: introspection only, stopping here.');
    return;
  }
  if (!agentCol || !outcomeCol) {
    console.error('\nCannot replay without an agent column and an outcome column.');
    process.exit(1);
  }

  // ── 2. replay ──────────────────────────────────────────────────────────────
  const select = [agentCol, outcomeCol, taskCol].filter(Boolean).join(', ');
  const PAGE = 1000;
  const ledger = new ReputationLedger({
    prior: 5000,
    alpha: 0.06,
    confidenceK: 20,
    coldStartConfidence: 0.5,
  });
  const agreement = new AgreementTracker({ minCoObservations: 50 });

  const outcomeCounts = new Map();
  const byTask = new Map();
  let rows = 0;
  let good = 0;
  let bad = 0;
  let ignored = 0;
  let unmapped = 0;

  for (let from = 0; from < LIMIT; from += PAGE) {
    const { data, error } = await db
      .from('repid_score_events')
      .select(select)
      .range(from, Math.min(from + PAGE, LIMIT) - 1);
    if (error) {
      console.error(`\nread failed at offset ${from}: ${error.message}`);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    for (const r of data) {
      rows += 1;
      const raw = r[outcomeCol];
      const k = String(raw).trim().toLowerCase();
      outcomeCounts.set(k, (outcomeCounts.get(k) ?? 0) + 1);
      const cls = classify(raw);
      if (cls === 'ignored') { ignored += 1; continue; }
      if (cls === 'unmapped') { unmapped += 1; continue; }
      const correct = cls === 'good';
      if (correct) good += 1; else bad += 1;

      // Chronological order is not guaranteed by `range()` without an ORDER BY,
      // and the ledger's EWMA is order-dependent. This is flagged rather than
      // silently accepted — see the caveat printed at the end.
      ledger.record(String(r[agentCol]), correct);

      if (taskCol && r[taskCol] != null) {
        const key = String(r[taskCol]);
        let bucket = byTask.get(key);
        if (!bucket) { bucket = []; byTask.set(key, bucket); }
        bucket.push({ expert: String(r[agentCol]), correct });
      }
    }
    if (data.length < PAGE) break;
  }

  console.log(`\nREPLAYED ${rows} events`);
  console.log('-'.repeat(78));
  console.log(`  mapped good ${good}, mapped bad ${bad}, ignored ${ignored}, UNMAPPED ${unmapped}`);
  if (unmapped > 0) {
    console.log(
      `  ${unmapped} rows carried an outcome value this script does not recognise and`
    );
    console.log(
      `  were EXCLUDED, not defaulted. Values seen, most common first:`
    );
    const known = new Set([...GOOD, ...BAD, ...IGNORED]);
    [...outcomeCounts.entries()]
      .filter(([k]) => !known.has(k))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([k, n]) => console.log(`    ${String(k).padEnd(24)} ${n}`));
  }

  const ranked = [...new Set([...outcomeCounts.keys()])].length;
  console.log(`  distinct outcome values: ${ranked}`);

  // ── 3. what the ledger learned ─────────────────────────────────────────────
  // snapshot() returns the raw records; earned score and confidence are derived
  // through the ledger's own accessors so the shrinkage rule is applied here
  // exactly as it is in the harness, rather than re-implemented and drifting.
  const agents = ledger
    .snapshot()
    .map((r) => ({
      id: r.id,
      earned: ledger.earnedScore(r.id),
      confidence: ledger.confidence(r.id),
      n: r.observations,
    }))
    .sort((a, b) => b.earned - a.earned);
  console.log(`\n  Top agents by earned score (real outcomes), of ${agents.length}:`);
  agents.slice(0, 15).forEach((a) => {
    console.log(
      `    ${String(a.id).padEnd(40)} earned ${String(Math.round(a.earned)).padStart(5)}` +
        `  conf ${a.confidence.toFixed(2)}  n ${a.n}`
    );
  });

  // ── 4. the correlation question, if the data supports it ───────────────────
  if (taskCol) {
    for (const outcomes of byTask.values()) agreement.recordTask(outcomes);
    const st = agreement.stats();
    const multi = [...byTask.values()].filter((o) => o.length >= 2).length;
    console.log(`\n  CO-FAILURE (the W axis)`);
    console.log(`    tasks ${byTask.size}, of which ${multi} had 2+ agents`);
    console.log(
      `    fleet lift ${st.fleetLift === null ? 'n/a' : st.fleetLift.toFixed(2)}` +
        `  evidence ${st.evidence}  confident ${st.confident}`
    );
    if (multi === 0) {
      console.log(
        `    No task was evaluated by more than one agent, so correlation is not`
      );
      console.log(`    measurable even though a task column exists.`);
    }
  }

  console.log(`\nCAVEATS — these bound everything above`);
  console.log('-'.repeat(78));
  console.log(`  * No ORDER BY was applied, so replay order is not guaranteed`);
  console.log(`    chronological. The ledger's EWMA is order-dependent, so earned`);
  console.log(`    scores are indicative until this is re-run ordered by the real`);
  console.log(`    event timestamp. Add it once the timestamp column is confirmed.`);
  console.log(`  * Outcome mapping is a judgement: 'vetoed' and 'flagged' are read as`);
  console.log(`    failures, 'clean' and 'approved' as successes. If 'flagged' means`);
  console.log(`    "held for review" rather than "wrong", 115,885 + 21,976 rows change`);
  console.log(`    meaning and so does every score. CONFIRM THIS BEFORE PUBLISHING.`);
  console.log(`  * This reads repid_score_events directly and does NOT join to`);
  console.log(`    agent_repid, so it does not inherit the 43% join leak — but it also`);
  console.log(`    reports agent UUIDs rather than names.`);
}

main().catch((e) => {
  console.error(`\nreplay failed: ${e && e.message ? e.message : e}`);
  process.exit(1);
});
