// DISPUTE-001 — the dispute / handoff / peer-verification mechanism may not be presented
// as a live accountability signal while it writes nothing, and no reputation may move
// through a dispute/peer-verify path that leaves no auditable filing.
//
// THREAT. "Accountable peer verification" and "dispute resolution" are the kind of
// governance claim that reads as a live control and is trivially unearned. Two
// concrete hazards, both this repo's signature defect (a system reporting success
// it has not earned) wearing a governance costume:
//
//   1. THE DEAD-PATH WIRING TRAP. There are two disjoint pipelines for one concept.
//      The workflow cluster — agent_handoffs, peer_verification_votes, dispute_claims
//      — is dormant (0 rows in 30 days; last writes 6-9 weeks stale). A separate
//      table, dispute_validation_queue, takes recent rows. PRIOR-WORK-INDEX warns:
//      "determine which of the two is the live path before building anything on
//      either." A feature wired to the dormant cluster would look live and write to
//      a graveyard.
//   2. THE FABRICATED-ACCOUNTABILITY TRAP. reputation (repid_score_events) may be
//      moved by a "dispute" or "peer-verify" outcome only if that outcome leaves an
//      auditable filing. If reputation carries PEER_VERIFY*/DISPUTE* influence while
//      the mechanism's own tables show no corresponding recent filings, standing is
//      being changed on an empty pipeline — a trust signal with no trail.
//
// WHAT THIS JUDGES (from scripts/redteam/evidence/dispute-pipeline-truth.json,
// collected read-only from the five tables):
//
//   HELD       the mechanism's dormancy is honestly discriminable: the reputation
//              ledger carries 0 dispute/peer-verify events, and no dormant table is
//              flagged as the live path. So "peer verification / dispute resolution
//              is a live accountability signal" is refuted by evidence, and no
//              reputation is moving through an untraceable dispute/peer-verify path.
//   BREACHED   reputation shows dispute/peer-verify influence while every workflow
//              table is 0-in-30d (standing moved with no auditable filing); OR a
//              table is flagged claimed_live=true while it is dormant or its only
//              activity is the nightly-smoke signature (a dead/heartbeat table
//              dressed as the live path). The exact conflations this probe stops.
//   NOT_CHECKED  the evidence is missing, unparseable, or stale.
//
// READINESS IS SEPARATE FROM THIS INVARIANT, AND STATED, NOT ASSERTED. Making this
// mechanism actually live is fenced OUTSIDE a cloud session: the PEER_VERIFY* writer
// needs Sean-gated DDL (unapplied migration 20260815190000_work_seat_event_types.sql),
// a one-line repid-engine change, a DID->repid_agents.id mapping, and a live fleet.
// This probe does NOT hold that against the invariant — the mechanism can be honestly
// dormant while the wiring is blocked. It surfaces it so no reader mistakes "the
// invariant holds" for "the loop is running". See PRIOR-WORK-INDEX
// 'Formal dispute/peer-verify mechanism is unused' and 'Peer-verify seat writes nothing'.
//
// Read-only: judges recorded aggregate counts. No agent ids, no votes, no dispute bodies.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { held, breached, notChecked } from '../harness.mjs';

const EVIDENCE_DIR = 'scripts/redteam/evidence';
const EVIDENCE_FILE = 'dispute-pipeline-truth.json';
const MAX_AGE_DAYS = 30; // dormancy of a mechanism changes slowly; the counts drift but the rule does not

export default {
  id: 'DISPUTE-001',
  title:
    'A dormant dispute/peer-verify mechanism may not be dressed as live, and no reputation may move through it without an auditable filing',
  component: 'GA dispute / handoff / peer-verification',
  severity: 'Medium',
  threat:
    'If a feature is wired to the dormant handoff/peer-verify cluster (agent_handoffs / peer_verification_votes / dispute_claims) it writes to a graveyard while looking live; and if reputation carries dispute/peer-verify influence with no corresponding filing, standing is moved on an empty pipeline — a governance claim with no trail.',

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

    const workflow = ev.observations?.workflow_tables?.tables ?? [];
    const queue = ev.observations?.queue_table ?? null;
    const ledger = ev.observations?.reputation_ledger ?? null;
    if (workflow.length === 0 || !ledger) {
      return notChecked(`${EVIDENCE_FILE} has no workflow_tables/reputation_ledger to judge`, howToCollect());
    }

    const breaches = [];
    const allTables = queue ? [...workflow, queue] : [...workflow];

    // 1. FABRICATED ACCOUNTABILITY. Reputation may carry dispute/peer-verify influence
    //    only if a workflow table shows a corresponding recent filing. If standing
    //    moved while every workflow table is 0-in-30d, the trail is missing.
    const repInfluence = (Number(ledger.peer_verify_events) || 0) + (Number(ledger.dispute_events) || 0);
    const anyRecentFiling = workflow.some((t) => (Number(t.rows_30d) || 0) > 0);
    if (repInfluence > 0 && !anyRecentFiling) {
      breaches.push(
        `repid_score_events carries ${repInfluence} dispute/peer-verify reputation event(s) while every workflow ` +
          `table (${workflow.map((t) => t.table).join(', ')}) is 0-in-30d — standing moved with no auditable filing`
      );
    }

    // 2. DEAD-PATH DRESSED AS LIVE. A table flagged the live path must actually be
    //    live — not dormant, and not merely a nightly-smoke heartbeat.
    for (const t of allTables) {
      if (t.claimed_live !== true) continue;
      if ((Number(t.rows_30d) || 0) === 0) {
        breaches.push(`table '${t.table}' is claimed_live=true but has 0 rows in 30d — a dormant table dressed as the live path`);
      } else if (t.daily_signature === 'nightly-smoke' || (Number(t.max_per_day_30d) || 0) <= 1) {
        breaches.push(
          `table '${t.table}' is claimed_live=true but its only activity is the nightly-smoke signature ` +
            `(<=1 row/day) — a heartbeat dressed as real ${t.role ?? ''} traffic`
        );
      }
    }

    // Readiness / context — reported, not judged against the invariant (see header).
    const smoke = queue ? `${queue.table} last row ${queue.last_row} (<=${queue.max_per_day_30d}/day nightly-smoke)` : 'no queue table';
    const readiness =
      `readiness (NOT part of this verdict): the mechanism is dormant, not broken. Its one recent signal is ${smoke}. ` +
      `Making it live is fenced outside a cloud session — the PEER_VERIFY* writer needs Sean-gated DDL ` +
      `(migration 20260815190000), a repid-engine change, a DID->repid_agents.id mapping, and a live fleet. ` +
      `Wire any future feature to the LIVE path, never to the dormant handoff/peer-verify cluster.`;

    if (breaches.length > 0) {
      return breached(
        `the dispute/peer-verify accountability discriminator has collapsed: ${breaches.length} problem(s)`,
        [...breaches.map((b) => `  BREACH  ${b}`), '', readiness].join('\n')
      );
    }

    const dormant = workflow.filter((t) => (Number(t.rows_30d) || 0) === 0).map((t) => t.table);
    return held(
      `the mechanism's dormancy is honestly discriminable: reputation carries ${repInfluence} dispute/peer-verify event(s) ` +
        `(of ${ledger.total_events} across ${ledger.distinct_types} types), and no dormant table is dressed as live. ` +
        `Dormant workflow tables: ${dormant.join(', ') || 'none'}. So "peer verification / dispute resolution is a live ` +
        `accountability signal" is refuted by evidence.`,
      readiness
    );
  },
};

function howToCollect() {
  return (
    'From a host with Supabase access (the MCP tools reach the DB; curl is proxy-denied), refresh ' +
    `${EVIDENCE_DIR}/${EVIDENCE_FILE} in the shape already there: per-table \`select count(*), max(<ts>), ` +
    "count(*) filter (where <ts> > now()-interval '30 days')\` for agent_handoffs (created_at), " +
    'peer_verification_votes (created_at), dispute_claims (filed_at), dispute_validation_queue (created_at) ' +
    "plus its daily histogram; and from repid_score_events the counts of event_type ILIKE '%peer%verif%' / " +
    "'%dispute%' and the adjacent CHALLENGE_*/PEACEMAKER/VALIDATION_FAILED recency. Read-only aggregates; store no agent ids or bodies."
  );
}
