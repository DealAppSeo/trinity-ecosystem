// EVERGREEN-001 — an evergreen task may not report success it cannot show.
//
// THREAT. The plan is to feed the idle T12 fleet (see FLEET-001) "productive
// evergreen tasks they do in loops" — but only if the work is VERIFIABLY being
// done, not theater. The theater failure mode is precise and this repo's
// signature defect: a task table shows `status='active'`, a `success_rate`, an
// `output_quality_score` — numbers that read as "work happening" — while nothing
// was produced. `agent_evergreen` is built for the honest version (it has
// `output_location`, `last_output_preview`, `last_run`), so the hazard is a
// consumer or a writer that fills the success columns without a shown output.
//
// THE CONTRACT (docs/FLEET-TRUTH.md, Part 2). A task is DONE only when it writes
// a fresh, independently-judgeable artifact to its `output_location`. A status
// column, a success_rate, or a quality score is NOT evidence of work. The minimal
// in-table form of that contract, checkable here: a success claim requires an
// actual run AND a shown output.
//
// WHAT THIS JUDGES (from scripts/redteam/evidence/evergreen-verifiability.json):
//
//   HELD        every task that claims success (success_rate>0) has actually run
//               (last_run set) AND shows an output (last_output_preview present).
//               Reported work is backed by shown work.
//   BREACHED    a task reports success_rate>0 while it has NEVER run (a score with
//               no run — pure theater), OR reports success while showing no output
//               (a success with nothing to point at). Either is claimed-not-earned.
//   NOT_CHECKED the loop has never executed (no task has run), so there is no output
//               whose reality can be judged. Honest: nothing has run, so nothing is
//               yet either verified or theatrical.
//
// This does NOT judge whether the fleet SHOULD be running these tasks (that is a
// dispatch decision, Sean-gated). It judges that once a task claims to have done
// work, the work is shown. Confirming the artifact AT output_location is real (a
// row/file written after last_run) is the deeper check named in the recipe below.
//
// Read-only: judges a recorded aggregate + per-task self-consistency flags. No secrets.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { held, breached, notChecked } from '../harness.mjs';

const EVIDENCE_DIR = 'scripts/redteam/evidence';
const EVIDENCE_FILE = 'evergreen-verifiability.json';
const MAX_AGE_DAYS = 30; // the contract is invariant; the row states are expected to change once the loop runs

export default {
  id: 'EVERGREEN-001',
  title: 'An evergreen task may not report success it cannot show',
  component: 'agent_evergreen / verifiable fleet work',
  severity: 'Medium',
  threat:
    'If an evergreen task fills its success columns (success_rate, quality score, status) without a shown output at output_location, the fleet appears productive while doing nothing — the exact "theater, not verifiably done" failure the loop is meant to avoid.',

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

    const tasks = ev.observations?.per_task?.tasks ?? [];
    if (tasks.length === 0) return notChecked(`${EVIDENCE_FILE} has no per_task.tasks to judge`, howToCollect());

    const claimsSuccess = (t) => Number(t.success_rate) > 0;

    // BREACH 1: a success score with no run — pure theater.
    const scoredButNeverRan = tasks.filter((t) => claimsSuccess(t) && t.ever_ran === false);
    // BREACH 2: ran and scored a success, but shows no output — a success with nothing to point at.
    const scoredButUnshown = tasks.filter((t) => claimsSuccess(t) && t.ever_ran === true && t.has_preview === false);

    const breaches = [
      ...scoredButNeverRan.map((t) => `${t.agent}.${t.task}: success_rate=${t.success_rate} but never ran — a score with no run`),
      ...scoredButUnshown.map((t) => `${t.agent}.${t.task}: success_rate=${t.success_rate}, ran, but shows no output at '${t.output_location}' — success with nothing to point at`),
    ];
    if (breaches.length > 0) {
      return breached(
        `evergreen theater: ${breaches.length} task(s) report success they cannot show`,
        breaches.map((b) => `  BREACH  ${b}`).join('\n')
      );
    }

    const everRan = tasks.filter((t) => t.ever_ran === true);
    if (everRan.length === 0) {
      const agg = ev.observations?.aggregate ?? {};
      return notChecked(
        `the evergreen loop has never executed: ${agg.status_active ?? tasks.length}/${tasks.length} tasks marked 'active' but 0 have ever run ` +
          `(no success_rate, no output). 'active' means enabled, not executing — there is no output whose reality can be judged yet, ` +
          `and honestly no row currently claims success it cannot show.`,
        howToCollect()
      );
    }

    const scored = tasks.filter(claimsSuccess);
    return held(
      `reported work is shown work: ${scored.length} task(s) claim success, every one has run and shows an output; ` +
        `${everRan.length}/${tasks.length} tasks have executed`,
      `A success claim requires an actual run and a shown output — satisfied. Deeper check (recipe) still confirms the artifact at output_location is a real, fresh row/file.`
    );
  },
};

function howToCollect() {
  return (
    'From a host with Supabase access (the MCP tools reach the DB; curl is proxy-denied), refresh ' +
    `${EVIDENCE_DIR}/${EVIDENCE_FILE} from agent_evergreen: ` +
    '`select agent_name, task_name, task_category, status, success_rate, output_quality_score, output_location, ' +
    '(last_run is not null) as ever_ran, (last_output_preview is not null and last_output_preview <> \'\') as has_preview from agent_evergreen`. ' +
    'DEEPER CHECK once tasks run: for each task claiming success, confirm a fresh row/file exists at its output_location written AFTER last_run ' +
    '(that is the artifact the success claim must point to). Read-only; store no secrets.'
  );
}
