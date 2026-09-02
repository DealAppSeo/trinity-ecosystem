// FLEET-001 — an agent holding no task is idle, never "working"; liveness is read from the canonical instrument, not laundered from a probe.
//
// THREAT. "How many T12 agents are live?" has been answered differently by
// different sources for months, and the disagreement itself is the hazard. A
// dashboard, a status column, or a report that reads a REACHABILITY signal (the
// process answers a health check — what Railway / UptimeRobot see) or a bare
// row-count and prints it as LIVE / WORKING is claiming activity the fleet has
// not earned. That is this repo's signature defect — a system reporting success
// it has not earned — wearing an ops-dashboard costume.
//
// PRIOR WORK ALREADY ROOT-CAUSED THE IDLENESS. PRIOR-WORK-INDEX
// 'hal-volume-stopped-2026-07-17' (owner T12) established: the processes are up
// and looping; the task pipeline stopped 2026-07-18; agent-side heartbeat writes
// were removed 2026-07-17, so `v_fleet_truth.is_live` (which never consults the
// probe) is a FALSE NEGATIVE and MUST NOT be read for liveness. It named the
// canonical instrument: `v_agent_state` (migration 20260827100500) — one row per
// agent, state in {working,idle,wedged,down,unknown}, each with an `evidence`
// string and the task discriminator `current_task_id`, fed from the probe every
// ~5 min. This probe does NOT re-derive that diagnosis; it makes the RULE that
// falls out of it fail loudly if anyone forgets it.
//
// WHAT THIS JUDGES (from scripts/redteam/evidence/fleet-liveness-reconciliation.json,
// collected from v_agent_state):
//
//   HELD       every agent that holds no task (current_task_id null) is reported
//              idle, NOT working; every row carries a non-empty `evidence` string
//              (a mechanism reason, not an assertion); and the canonical source
//              in the divergence table is v_agent_state, not v_fleet_truth. So
//              "idle" cannot be reported as "working/live", and the reading comes
//              from the probe-fed instrument.
//   BREACHED   an agent with no task held is labelled 'working' (work claimed
//              with no task) or otherwise marked live; OR a state row has no
//              evidence (asserted, not measured); OR the evidence's own canonical
//              source is the known-bad v_fleet_truth. The exact conflation this
//              probe exists to stop.
//   NOT_CHECKED  the canonical evidence is missing, stale, or has no agent rows.
//
// This does NOT judge whether the fleet SHOULD be busy — idle is a fact, not a
// breach (all 12 are idle today, correctly labelled). It judges whether anyone is
// allowed to call idle "working". Feeding the fleet verifiable work is tracked in
// docs/FLEET-TRUTH.md, not here.
//
// Read-only: judges a recorded aggregate + per-agent canonical state. No secrets.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { held, breached, notChecked } from '../harness.mjs';

const EVIDENCE_DIR = 'scripts/redteam/evidence';
const EVIDENCE_FILE = 'fleet-liveness-reconciliation.json';
const MAX_AGE_DAYS = 30; // the rule's soundness changes slowly; the counts themselves are expected to drift

export default {
  id: 'FLEET-001',
  title: 'An agent holding no task is idle, never "working" — liveness comes from v_agent_state, not a laundered probe',
  component: 'T12 fleet / liveness reporting',
  severity: 'Medium',
  threat:
    'If a reachability signal (health-probe 200) or a removed-heartbeat false-negative is reported as LIVE/WORKING, the fleet is misread as busy or dead while the truth (up, looping, holding no task) is ignored — activity claimed but not earned, and the months-old "which row do I read" conflict never closes.',

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

    const agents = ev.observations?.per_agent?.agents ?? [];
    if (agents.length === 0) return notChecked(`${EVIDENCE_FILE} has no per_agent.agents to judge`, howToCollect());

    const breaches = [];

    // 1. The canonical source must be v_agent_state, never the known-bad v_fleet_truth.is_live.
    const canonicalRow = (ev.observations?.source_divergence?.sources ?? []).find((s) => /canonical/i.test(s.source ?? ''));
    if (canonicalRow && !/v_agent_state/i.test(canonicalRow.source)) {
      breaches.push(`the canonical liveness source is '${canonicalRow.source}', not v_agent_state — the prior work says do NOT read anything else for liveness`);
    }

    // 2. THE INVARIANT: an agent holding no task must not be labelled 'working'; every row needs evidence.
    for (const a of agents) {
      const noTask = a.current_task_id === null || a.current_task_id === undefined;
      if (noTask && a.state === 'working') {
        breaches.push(`${a.agent_name}: state='working' but current_task_id is null — work claimed with no task held`);
      }
      if (a.is_live === true && noTask) {
        breaches.push(`${a.agent_name}: marked is_live=true while holding no task — reachability/false-signal laundered into liveness`);
      }
      if (!a.evidence || String(a.evidence).trim() === '') {
        breaches.push(`${a.agent_name}: state='${a.state}' carries no evidence string — asserted, not measured`);
      }
    }

    if (breaches.length > 0) {
      return breached(
        `liveness reporting has been corrupted: ${breaches.length} problem(s)`,
        breaches.map((b) => `  BREACH  ${b}`).join('\n')
      );
    }

    const byState = agents.reduce((m, a) => ((m[a.state] = (m[a.state] ?? 0) + 1), m), {});
    const working = agents.filter((a) => a.state === 'working').length;
    const idleNoTask = agents.filter((a) => a.state === 'idle' && (a.current_task_id === null || a.current_task_id === undefined)).length;
    const divergence = (ev.observations?.source_divergence?.sources ?? [])
      .map((s) => `  ${s.source} → ${s.count}`)
      .join('\n');

    return held(
      `idle cannot be reported as working: ${JSON.stringify(byState)} by v_agent_state; ${idleNoTask} agent(s) idle-with-no-task, ${working} working, every row evidence-backed`,
      `canonical instrument v_agent_state (not v_fleet_truth). Same question, six sources, four counts — only one canonical:\n${divergence}\n` +
        `readiness (NOT part of this verdict): the fleet is idle, not broken — feeding verifiable tasks is the unblock, tracked in docs/FLEET-TRUTH.md and open item hal-volume-stopped-2026-07-17.`
    );
  },
};

function howToCollect() {
  return (
    'From a host with Supabase access (the MCP tools reach the DB; curl is proxy-denied), refresh ' +
    `${EVIDENCE_DIR}/${EVIDENCE_FILE} from the CANONICAL view: ` +
    '`select agent_name, state, evidence, loop_count, current_task_id from v_agent_state` (per_agent + canonical counts), ' +
    'and the source-divergence context (agent_health_probes ok, v_fleet_truth.is_reachable/is_live, agent_heartbeat, trinity_agent_logs). ' +
    'Do NOT read v_fleet_truth.is_live as liveness — it is a known false negative (heartbeat removed 2026-07-17). Read-only aggregates; store no secrets.'
  );
}
