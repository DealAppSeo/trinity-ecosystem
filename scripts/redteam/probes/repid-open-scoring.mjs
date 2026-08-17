// REPID-ENG-001 — can anyone attribute a HAL-scored decision to an agent they don't own?
//
// THREAT. RepID's integrity claim is that an agent's history reflects decisions
// the agent actually made. repid-engine has two score-event paths:
//
//   /api/v1/agents/:id/score-event           bearer-authenticated, and it checks
//                                             OWNERSHIP (key.agent_id === :id → else 403)
//   /api/v1/agents-external/:id/score-event   PUBLIC — rate-limited only, no auth,
//                                             no ownership check (Sprint A7; the code
//                                             comment says "Sprint A8 will harden auth")
//
// The score itself is HAL-computed server-side on both paths — a caller cannot
// write a delta or an `outcome`, only submit (prompt, answer) — so this is NOT a
// "fabricate a high score" hole. It is an ATTRIBUTION hole: on the public path,
// anyone who knows an agent's UUID (they are public via /passport and the
// leaderboard) can inject HAL-scored decisions into that agent's history —
// polluting its hallucination stats, dragging it toward the floor with
// deliberately bad answers, or burning HAL/LLM cost (60/IP/min), all without a
// credential.
//
// WHAT THIS PROBE JUDGES. Not the score maths (that is HELD and lives in
// pipeline.ts) — the AUTH POSTURE of the public path, from live evidence. A
// request with no credentials must be REJECTED (401/403). If instead it reaches
// request-validation (400 "prompt is required") or succeeds (2xx), there is no
// authentication gate. The evidence is collected safely: an empty-body POST
// fails validation BEFORE the pipeline looks up the agent or writes anything, so
// no real agent is touched (see the evidence note).
//
// Collection is split from judgement (charter §5): the collector records the
// live status code; this probe applies the policy. Evidence past its expiry is
// NOT_CHECKED — an auth posture from weeks ago may have been hardened since.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { held, breached, notChecked } from '../harness.mjs';

const EVIDENCE_DIR = 'scripts/redteam/evidence';
const MAX_AGE_DAYS = 21;

export default {
  id: 'REPID-ENG-001',
  title: 'Public score-event path attributes HAL-scored decisions with no authentication',
  component: 'repid-engine / RepID scoring',
  severity: 'Medium',
  threat: 'Anyone who knows an agent UUID can inject HAL-scored decisions into that agent’s history and RepID without owning it.',

  async run() {
    if (!existsSync(EVIDENCE_DIR)) return notChecked(`no evidence directory at ${EVIDENCE_DIR}`, howToCollect());
    const files = readdirSync(EVIDENCE_DIR).filter((f) => f.startsWith('repid-engine-open-scoring') && f.endsWith('.json'));
    if (files.length === 0) return notChecked(`no repid-engine-open-scoring evidence in ${EVIDENCE_DIR}`, howToCollect());

    const transcript = [];
    const breaches = [];
    let judged = 0;

    for (const file of files) {
      let ev;
      try { ev = JSON.parse(readFileSync(join(EVIDENCE_DIR, file), 'utf8')); }
      catch (e) { return notChecked(`${file} is not valid JSON: ${e.message}`, howToCollect()); }

      for (const need of ['surface', 'collectedAt', 'collectedBy', 'collectedVia', 'observations']) {
        // `== null` catches both undefined AND an explicit null — an evidence file
        // with `observations: null` is as unprovenanced as one with no key, and
        // treating it as present would defer the failure to a later property read.
        if (ev[need] == null) return notChecked(`${file} missing \`${need}\` — provenance is not optional`, `see ${EVIDENCE_DIR}/README.md`);
      }
      const ageDays = (Date.now() - Date.parse(ev.collectedAt)) / 86_400_000;
      if (!Number.isFinite(ageDays)) return notChecked(`${file}: unparseable collectedAt`, 're-collect with an ISO-8601 timestamp');
      if (ageDays > MAX_AGE_DAYS) return notChecked(`${file}: collected ${ageDays.toFixed(0)}d ago (limit ${MAX_AGE_DAYS}) — the auth posture may have changed`, howToCollect());

      const probe = ev.observations?.noAuthProbe;
      const status = probe?.statusCode;
      if (typeof status !== 'number') { return notChecked(`${file}: observations.noAuthProbe.statusCode missing`, howToCollect()); }

      judged += 1;
      transcript.push(
        `${ev.surface} @ ${ev.observations.deployedCommitShort ?? '?'} — unauthenticated POST to ` +
        `${ev.observations.publicScoreEventPath ?? '?'} -> HTTP ${status} (${probe.responseBody ?? ''})`
      );

      if (status === 401 || status === 403) {
        // Rejected before the handler — the path is authenticated. HELD.
        continue;
      }
      if (status === 400 || (status >= 200 && status < 300)) {
        breaches.push(
          `${ev.surface}: an unauthenticated request reached the scoring handler (HTTP ${status}, not 401/403). ` +
          `The public score-event path has no authentication gate — anyone with an agent UUID can attribute ` +
          `HAL-scored decisions to it. The bearer path (/api/v1/agents/:id/score-event) already has the fix: a ` +
          `scoped API key plus an ownership check.`
        );
        continue;
      }
      // Any other status (429 rate-limited, 5xx) is inconclusive for auth.
      return notChecked(`${file}: HTTP ${status} is inconclusive for auth posture (want 401/403 = gated, 400/2xx = open)`, howToCollect());
    }

    if (judged === 0) return notChecked('no judgeable evidence', howToCollect());

    if (breaches.length > 0) {
      return breached(
        `${breaches.length} surface(s): the public score-event path accepts unauthenticated decision attribution`,
        [...breaches.map((b) => `  BREACH  ${b}`), '', 'transcript:', ...transcript.map((t) => `    ${t}`)].join('\n')
      );
    }
    return held('the public score-event path rejects unauthenticated requests (401/403)', transcript.join('\n'));
  },
};

function howToCollect() {
  return (
    'From a host that can reach repid-engine (pg_net works; curl is proxy-denied), POST an empty body with NO auth ' +
    'to https://repid-engine-production.up.railway.app/api/v1/agents-external/<random-uuid>/score-event and record the ' +
    'status. This is SAFE — an empty body fails `prompt is required` before the agent is looked up or anything is ' +
    `written. Write the result to ${EVIDENCE_DIR}/repid-engine-open-scoring.json (see that dir's README).`
  );
}
