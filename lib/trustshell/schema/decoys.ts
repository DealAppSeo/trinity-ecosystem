// lib/trustshell/schema/decoys.ts
//
// Empty tables that have a LIVE table with an almost identical name.
//
// ZERO IMPORTS so `check:schema-names` can compile and assert it standalone.
//
// =============================================================================
// A NAME IS NOT EVIDENCE
// =============================================================================
//
// This repo keeps making one mistake in different costumes: something is
// identified by NAME, the name looks right, and the conclusion is wrong.
// CLAUDE.md already records two instances at the deployment layer —
// `hyperdag-org` and `trustrails-dev` are both named after domains they do not
// serve, and both produced published findings that had to be retracted.
//
// The same disease runs through the database, and it is worse there because the
// surface is bigger. Measured 2026-08-16 on project qnnpjhlxljtqyigedwkb:
//
//   623 tables in `public`
//   501 estimated EMPTY          (80%)
//    56 with 1-99 rows
//    66 with >= 100 rows         (11%)  <- the actual system
//
// So four out of five tables are debris, and some of that debris is named
// almost exactly like the thing that matters. `trinity_task_archive` holds
// 47,141 rows; `trinity_tasks_archive` holds nothing and differs by one letter.
//
// WHY NOT JUST RENAME OR DROP THEM. Renaming is what created this — every
// rename left the old name behind. Dropping is destructive DDL against a live
// database and is Sean-gated. Neither is needed: the fix is to make the name
// stop being load-bearing. Each decoy now carries a COMMENT in Postgres naming
// its live counterpart (visible in \d, the Supabase table editor, and generated
// database.types.ts), and this list makes it mechanical in code review.
//
// HOW THIS LIST WAS DERIVED, so it can be regenerated rather than trusted:
// group every table by its name tokens, singularised, with
// log/event/history/archive/etc. stripped; keep groups where at least one
// member has >= 100 rows and at least one has 0. That rule found exactly the
// seven below. It is in the commit message and reproducible against pg_class.
//
// KNOWN LIMIT: row counts are planner estimates (pg_class.reltuples), not exact
// counts — an exact count of 623 tables times out. An estimate of 0 on a table
// that has genuinely never been analysed could be wrong. Every entry below was
// therefore cross-checked against the fact that NOTHING in either repo writes to
// it. If a decoy ever starts receiving rows, `check:throughput` classifies that
// as UNDECLARED_ACTIVITY, which is loud.

export interface Decoy {
  /** The empty table whose name invites a wrong match. */
  decoy: string;
  /** What the reader almost certainly wanted. */
  live: string;
  /** Rows in the live table when measured. */
  liveRows: number;
  /** Why the two are confusable, in words. */
  note: string;
}

export const MEASURED_ON = '2026-08-16';

export const DECOYS: readonly Decoy[] = [
  {
    decoy: 'trinity_tasks_archive',
    live: 'trinity_task_archive',
    liveRows: 47141,
    note:
      'Differs from the real archive by ONE letter (task vs tasks). The live pair is ' +
      'trinity_tasks (363,777 current) and trinity_task_archive (47,141 archived). ' +
      'This third name holds nothing.',
  },
  {
    decoy: 'repid_scores',
    live: 'repid_score_events',
    liveRows: 152130,
    note: 'RepID scores are event-sourced; there is no current-value table by this name.',
  },
  {
    decoy: 'trinity_agents',
    live: 'trinity_agent_logs',
    liveRows: 148096,
    note:
      'Already recorded in LESSONS.md and AGENT-MEMORY-SPEC.md: a recall path checked ' +
      '`agents`, `trinity_agents` and `agent_kya_registry`, all empty, and concluded there ' +
      'was no agent registry. There is one — under other names.',
  },
  {
    decoy: 'trinity_deployments',
    live: 'trinity_deployment_events',
    liveRows: 114395,
    note: 'Deployments are event-sourced, same shape as repid_scores.',
  },
  {
    decoy: 'trinity_repid',
    live: 'trinity_repid_events',
    liveRows: 2083,
    note: 'Listed among 30+ empty RepID tables in docs/ROADMAP-HYBRID-REPID.md.',
  },
  {
    decoy: 'execution_logs',
    live: 'execution_log',
    liveRows: 1441,
    note: 'Plural/singular only. The singular is live.',
  },
  {
    decoy: 'agent_learnings',
    live: 'agent_learning_events',
    liveRows: 348,
    note: 'Event-sourced again; the noun form is empty.',
  },
];

/** Decoy names, for a fast membership test. */
export const DECOY_NAMES: readonly string[] = DECOYS.map((d) => d.decoy);

export function decoyFor(table: string): Decoy | undefined {
  return DECOYS.find((d) => d.decoy === table);
}

/**
 * Patterns that mean "this string is being used as a TABLE", not merely
 * mentioned in prose.
 *
 * The distinction is load-bearing. Every current mention of a decoy in this repo
 * is documentation ABOUT the problem — LESSONS.md, AGENT-MEMORY-SPEC.md,
 * ROADMAP-HYBRID-REPID.md. Flagging those would force someone to delete the
 * record of the correction in order to make the build pass, which is exactly
 * backwards, and is the same reasoning check-prior-work.mjs uses for its
 * allowlist.
 */
export function tableUsagePatterns(table: string): RegExp[] {
  const t = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    new RegExp(`\\.from\\(\\s*['"\`]${t}['"\`]`, 'i'), // supabase-js
    new RegExp(`\\bfrom\\s+(?:public\\.)?${t}\\b`, 'i'), // SQL FROM
    new RegExp(`\\b(?:insert|update|delete)\\s+(?:into\\s+)?(?:public\\.)?${t}\\b`, 'i'),
    new RegExp(`\\bjoin\\s+(?:public\\.)?${t}\\b`, 'i'),
  ];
}

/** True when `line` uses `table` as a table rather than naming it in prose. */
export function usesAsTable(line: string, table: string): boolean {
  return tableUsagePatterns(table).some((re) => re.test(line));
}
