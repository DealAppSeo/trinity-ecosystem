// REPID-ENG-003 — does the score-event ledger overstate the applied penalty?
//
// THREAT. `repid_delta_applied` on a `repid_score_events` row is documented as
// "what actually MOVED the score." If it does not, the event stream lies: you
// cannot sum it to reconstruct `current_repid`, and a penalty logged against an
// agent overstates a drop that never happened to its live score.
//
// MECHANISM (verified 2026-08-17). Two floors, only one of which binds:
//
//   - The JS pipeline writes the event's `repid_after` / `repid_delta_applied`
//     from `applyToScore() + clampRepidLoud()`, which clamps to a GLOBAL
//     `REPID_MIN`. It then UPDATEs `repid_agents.current_repid`.
//   - The DB trigger `trg_repid_earned_floor` re-clamps that write UP to the
//     PEAK-based `tier_lower_bound(peak_repid)`.
//
//   When `tier_lower_bound(peak) > REPID_MIN` — any agent that earned above the
//   bottom tier — the two disagree and only the DB one binds. A penalty that
//   would push below the earned floor is absorbed (live moves 0), but the event
//   still records the full negative delta.
//
// This is the good-control / bad-ledger split: the earned floor is exactly what
// makes griefing's live-score magnitude ZERO (REPID-ENG-001), and it is the same
// mechanism that makes the event overstate. Severity Low — audit accuracy, not
// exploitable — but it is this codebase's named recurring class: a system
// reporting an outcome (a penalty) it did not actually apply.
//
// This probe judges recorded reconciliation evidence: for each sample, did the
// event's `repid_after` match the live `current_repid` after the trigger? A
// mismatch is the finding. The behavioural floor-proof in the same evidence is
// the anchor — if the clamp did NOT fire there, the evidence is stale/wrong and
// the probe refuses rather than judging.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { held, breached, notChecked } from '../harness.mjs';

const EVIDENCE_DIR = 'scripts/redteam/evidence';
const MAX_AGE_DAYS = 60; // a DB trigger changes rarely

export default {
  id: 'REPID-ENG-003',
  title: 'Score-event ledger overstates the applied penalty vs the earned-floor-clamped live score',
  component: 'repid-engine / RepID scoring ledger',
  severity: 'Low',
  threat: 'repid_delta_applied / repid_after on an event overstate the real movement, so the event stream cannot reconstruct the live score.',

  async run() {
    if (!existsSync(EVIDENCE_DIR)) return notChecked(`no evidence directory at ${EVIDENCE_DIR}`, howToCollect());
    const files = readdirSync(EVIDENCE_DIR).filter((f) => f.startsWith('repid-engine-ledger-divergence') && f.endsWith('.json'));
    if (files.length === 0) return notChecked(`no ledger-divergence evidence in ${EVIDENCE_DIR}`, howToCollect());

    const transcript = [];
    const breaches = [];
    let judged = 0;

    for (const file of files) {
      let ev;
      try { ev = JSON.parse(readFileSync(join(EVIDENCE_DIR, file), 'utf8')); }
      catch (e) { return notChecked(`${file} is not valid JSON: ${e.message}`, howToCollect()); }

      for (const need of ['collectedAt', 'collectedBy', 'collectedVia', 'behavioural_proof_pure_sql', 'event_vs_live_sample_from_grief_test']) {
        if (ev[need] === undefined) return notChecked(`${file} missing \`${need}\``, howToCollect());
      }
      const ageDays = (Date.now() - Date.parse(ev.collectedAt)) / 86_400_000;
      if (!Number.isFinite(ageDays)) return notChecked(`${file}: unparseable collectedAt`, howToCollect());
      if (ageDays > MAX_AGE_DAYS) return notChecked(`${file}: collected ${ageDays.toFixed(0)}d ago (limit ${MAX_AGE_DAYS})`, howToCollect());

      // ANCHOR: the behavioural proof must actually show the clamp firing, or the
      // evidence does not describe the mechanism this probe judges.
      const proof = ev.behavioural_proof_pure_sql;
      const clampFired = Array.isArray(proof) && proof.some(
        (s) => typeof s.wrote === 'number' && typeof s.live_current === 'number' && s.wrote < s.live_current
      );
      if (!clampFired) {
        return notChecked(`${file}: the behavioural floor-proof shows no clamp (no step where wrote < live_current) — anchor broken`, howToCollect());
      }
      transcript.push('anchor: earned-floor clamp fired in the behavioural proof (a below-floor write was raised) — OK');

      judged += 1;
      const s = ev.event_vs_live_sample_from_grief_test;
      const after = Number(s.event_repid_after);
      const live = Number(s.live_current_repid_after);
      const applied = Number(s.event_repid_delta_applied);
      const actual = Number(s.actual_movement);
      transcript.push(
        `sample: event repid_after=${after}, live current_repid=${live}; event delta_applied=${applied}, actual movement=${actual}`
      );

      if (after !== live) {
        breaches.push(
          `the event's repid_after (${after}) does not equal the live current_repid (${live}) — the earned-floor trigger absorbed the penalty but the event kept the pre-clamp value, so repid_delta_applied (${applied}) overstates the real movement (${actual}). repid_score_events cannot be summed to reconstruct the live score.`
        );
      } else if (applied !== actual) {
        breaches.push(`event delta_applied (${applied}) != actual movement (${actual}) even though repid_after matched — still an overstatement`);
      }
    }

    if (judged === 0) return notChecked('no judgeable ledger-divergence evidence', howToCollect());
    if (breaches.length > 0) {
      return breached(
        `${breaches.length} ledger overstatement(s): the event stream diverges from the live score`,
        [...breaches.map((b) => `  BREACH  ${b}`), '', 'transcript:', ...transcript.map((t) => `    ${t}`)].join('\n')
      );
    }
    return held('the event ledger reconciles with the earned-floor-clamped live score', transcript.join('\n'));
  },
};

function howToCollect() {
  return (
    'With service-role SQL on the repid-engine Supabase project: introspect trg_repid_earned_floor + tier_lower_bound, ' +
    'run a throwaway behavioural clamp test (write below the earned floor, confirm current_repid is raised), and record a ' +
    'sample where a score event stored repid_after/repid_delta_applied that the earned-floor trigger did not actually apply. ' +
    `Write it to ${EVIDENCE_DIR}/repid-engine-ledger-divergence.json.`
  );
}
