// EVERGREEN-002 — a task marked done/verified may not carry a result that says it is NOT done.
//
// THREAT. trinity_tasks is the execution ledger the whole fleet story rests on:
// "the loop is producing work" is read off status='done'/'verified' counts. But a
// status column is a claim, not evidence. This probe was born from a live catch:
// executing the VERITAS "Agent Output Spot Check" evergreen task surfaced the
// nightly [E2E-SMOKE] task #435115 marked done with a fabricated body
// (`"deployed_commit":"abc123"` — a dummy commit a real /health never returns).
// Widening the scan showed it is systemic, not one row: of 16 evidence-required
// tasks marked done/verified in 21 days, 10 CONTRADICT their own status — 6 whose
// result self-declares FAILED/PENDING ("I cannot fabricate... setting to PENDING
// and stopping"), and 4 that present the `abc123` dummy. The executor mostly
// refuses to fabricate, yet the task is stamped done anyway; the status ledger
// records success its own content denies. That is this repo's defining defect —
// a system reporting success it has not earned — in the table that feeds every
// "the fleet is working" claim.
//
// COMPLEMENTS EVERGREEN-001. EVERGREEN-001 guards the `agent_evergreen` template
// table (a task may not report success_rate it cannot show). This guards the
// downstream `trinity_tasks` EXECUTION ledger: a task's status may not outrun its
// result. Different table, different step, same disease.
//
// WHAT THIS JUDGES (from scripts/redteam/evidence/task-status-integrity.json),
// two false-positive-resistant signals only:
//   (1) the result SELF-DECLARES not-done — "result: failed/pending", "❌ failed",
//       "cannot fabricate", "http impossible", "reporting failure";
//   (2) the result presents the dummy commit `"deployed_commit":"abc123"` as real.
// The loose "[...]"/"synthetic" markers were deliberately dropped after a sample
// showed they flag legitimately-truncated real excerpts and "no synthetic" notes.
//
//   HELD        every evidence-required done/verified task in the window carries a
//               result consistent with completion — no self-declared not-done, no
//               dummy fabrication. The ledger's "done" means done.
//   BREACHED    ≥1 task is marked done/verified while its own result says FAILED /
//               PENDING / cannot-complete, or fabricates the dummy commit — status
//               outran content.
//   NOT_CHECKED evidence missing or stale (the ledger changes as tasks run).
//
// This does NOT judge whether a task's positive result is TRUE (that is the deeper
// per-task verification, named in the recipe) — only that a task claiming done is
// not flatly contradicted by its own words. Read-only counts; no task bodies stored.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { held, breached, notChecked } from '../harness.mjs';

const EVIDENCE_DIR = 'scripts/redteam/evidence';
const EVIDENCE_FILE = 'task-status-integrity.json';
const MAX_AGE_DAYS = 14; // the execution ledger moves daily (a nightly cron writes into this class)

export default {
  id: 'EVERGREEN-002',
  title: 'A task marked done/verified may not carry a result that says it is not done',
  component: 'trinity_tasks / execution-ledger integrity',
  severity: 'Medium',
  threat:
    'If a task is stamped done/verified while its own result self-declares FAILED/PENDING or fabricates evidence, the ledger that "the fleet is producing work" is read from records success the work never earned.',

  async run() {
    const path = join(EVIDENCE_DIR, EVIDENCE_FILE);
    if (!existsSync(path)) return notChecked(`no evidence at ${path}`, howToCollect());

    let ev;
    try {
      ev = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      return notChecked(`${EVIDENCE_FILE} is not valid JSON: ${e.message}`, howToCollect());
    }

    const collectedAt = Date.parse(ev.collectedAt ?? '');
    if (!Number.isFinite(collectedAt)) return notChecked(`${EVIDENCE_FILE} has no parseable collectedAt`, howToCollect());
    const ageDays = (Date.now() - collectedAt) / 86_400_000;
    if (ageDays > MAX_AGE_DAYS) return notChecked(`evidence is ${Math.round(ageDays)}d old (> ${MAX_AGE_DAYS}d)`, howToCollect());

    const agg = ev.observations?.aggregate;
    if (!agg || typeof agg.scope_total !== 'number' || typeof agg.contradicted !== 'number') {
      return notChecked(`${EVIDENCE_FILE} has no observations.aggregate.{scope_total,contradicted} to judge`, howToCollect());
    }

    const { scope_total, contradicted, self_declared_not_done = 0, dummy_commit_fabrication = 0 } = agg;

    if (scope_total === 0) {
      return notChecked(
        'no evidence-required done/verified tasks in the window to judge (empty scope)',
        howToCollect()
      );
    }

    if (contradicted > 0) {
      return breached(
        `${contradicted} of ${scope_total} evidence-required task(s) are marked done/verified while their own result contradicts it`,
        [
          `  BREACH  ${self_declared_not_done} task(s) marked done/verified whose result self-declares FAILED or PENDING (the executor said "not done", the status says done)`,
          `  BREACH  ${dummy_commit_fabrication} task(s) marked done whose result fabricates the dummy commit "deployed_commit":"abc123" as a real /health body`,
          '',
          `${scope_total - contradicted}/${scope_total} in-scope tasks are consistent. The contradiction is the status ledger outrunning its own content — "done" recorded over "I could not do this".`,
          'Root cause (not this repo): the claude-loop completion step marks done regardless of the agent verdict and has no HTTP client for the value-loop smoke; the dispatcher dispatch_e2e_smoke() is sound.',
        ].join('\n')
      );
    }

    return held(
      `every one of ${scope_total} evidence-required done/verified task(s) carries a result consistent with completion — no self-declared not-done, no dummy fabrication`,
      'Deeper check (recipe): a positive result is still only claimed, not proven — the per-task verification_method (an independent re-GET of each endpoint / re-derivation of each claim) is what confirms a "done" is genuinely earned.'
    );
  },
};

function howToCollect() {
  return (
    'From a host with Supabase access (the MCP tools reach the DB; curl is proxy-denied), refresh ' +
    `${EVIDENCE_DIR}/${EVIDENCE_FILE}. Over trinity_tasks WHERE status IN ('done','verified') AND updated_at > now()-interval '21 days' ` +
    "AND (insert_source='claude-loop' OR requires_external_artifact=true), count: scope_total; and contradicted = rows whose result::text " +
    "matches (a) self-declared-not-done: /result:\\s*\\**\\s*(pending|failed)|❌\\s*failed|cannot fabricate|http impossible|set(ting)?\\s*(this\\s*)?to\\s*pending|verdict:\\s*pending\\b|reporting failure/i, " +
    'OR (b) dummy fabrication: /"deployed_commit":\\s*"abc123"/. Store the counts only (not task bodies). ' +
    'DEEPER CHECK: for a task claiming a positive result, run its verification_method (re-GET each endpoint / re-derive each claim) and confirm the excerpt appears in the live body.'
  );
}
