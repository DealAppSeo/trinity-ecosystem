// lib/dual-view/fixtures.ts — deterministic dual-view scenarios.
//
// Lane C (UI) builds the entire dual-view against these: no backend, no
// database, no network, no Supabase key. Every fixture is a valid snapshot under
// `validateEvent` + `validateSnapshotIntegrity`, asserted by
// `scripts/check-dual-view-contract.mjs` in `npm run check`.
//
// DETERMINISTIC ON PURPOSE. No `Date.now()`, no randomness. A fixture that
// changes between runs cannot be diffed, cannot be snapshot-tested, and cannot
// be used to reproduce a rendering bug.
//
// THE NUMBERS IN `swarm_12` AND `all_stale` ARE NOT INVENTED. They mirror the
// real shape reported by `v_fleet_truth` as of 2026-08-14: 12 agents, 3 live, 12
// reachable, 9 probe-only, 0 on a fresh heartbeat. The UI is being designed
// against the fleet's actual — uncomfortable — distribution rather than against
// a demo where everything is green, because that distribution is what it will
// have to render on day one. These are synthetic labels over a real shape; no
// production agent ids or rows appear here.

import type { AttentionItem, PaiEdge, PaiNode } from './contract';
import { CONTRACT_VERSION } from './contract';

export interface DualViewSnapshot {
  nodes: PaiNode[];
  edges: PaiEdge[];
  attention: AttentionItem[];
}

/** Fixed clock. Every timestamp below is an offset from this. */
const T0 = Date.parse('2026-08-15T12:00:00.000Z');
const at = (minutesAgo: number): string => new Date(T0 - minutesAgo * 60_000).toISOString();

const core = (status: PaiNode['status'], reason: string): PaiNode => ({
  id: 'pai',
  kind: 'pai_core',
  label: 'PAI',
  status,
  reason,
  evidence: 'VERIFIED',
});

// ---------------------------------------------------------------------------
// empty — the PAI pane must never be blank
// ---------------------------------------------------------------------------

/**
 * Zero tasks. Renders as "standing by", not as a void. An empty graph reads as
 * broken; a calm one reads as ready.
 */
export const empty: DualViewSnapshot = {
  nodes: [core('done', 'Standing by — no work assigned yet.')],
  edges: [],
  attention: [],
};

// ---------------------------------------------------------------------------
// calm — steady state, nothing needs the human
// ---------------------------------------------------------------------------

export const calm: DualViewSnapshot = {
  nodes: [
    core('running', 'Managing 3 agents. Nothing needs you.'),
    {
      id: 'a-research',
      kind: 'agent',
      label: 'Research',
      status: 'running',
      reason: 'Reading 4 sources, 2 returned.',
      evidence: 'VERIFIED',
      parentId: 'pai',
    },
    {
      id: 'a-draft',
      kind: 'agent',
      label: 'Draft',
      status: 'waiting_peer',
      reason: 'Waiting on Research to return sources.',
      evidence: 'VERIFIED',
      parentId: 'pai',
    },
    {
      id: 'a-ship',
      kind: 'agent',
      label: 'Ship',
      status: 'done',
      reason: 'Published 12 minutes ago. Receipt emitted.',
      evidence: 'VERIFIED',
      parentId: 'pai',
    },
  ],
  edges: [
    { id: 'e-1', from: 'pai', to: 'a-research', kind: 'manages' },
    { id: 'e-2', from: 'pai', to: 'a-draft', kind: 'manages' },
    { id: 'e-3', from: 'pai', to: 'a-ship', kind: 'manages' },
    { id: 'e-4', from: 'a-draft', to: 'a-research', kind: 'depends' },
  ],
  attention: [
    {
      id: 'i-1',
      kind: 'receipt',
      title: 'Session receipt emitted',
      body: '41 claims · 41 backed · 0 contradicted.',
      at: at(12),
      nodeId: 'a-ship',
    },
    {
      id: 'i-2',
      kind: 'repid_delta',
      title: 'Research moved +38',
      body: 'Three outcomes recorded, 30-day decay applied.',
      at: at(31),
      nodeId: 'a-research',
    },
  ],
};

// ---------------------------------------------------------------------------
// one_gate — the MVP's whole viral moment
// ---------------------------------------------------------------------------

/**
 * The single loud amber card. This is the fixture the share-still is designed
 * around, so it is deliberately small: one gate, one clear action, one visible
 * consequence.
 */
export const one_gate: DualViewSnapshot = {
  nodes: [
    core('running', 'One item needs you.'),
    {
      id: 'a-ops',
      kind: 'agent',
      label: 'Ops',
      status: 'waiting_human',
      reason: 'Needs your approval before it can remember this preference.',
      evidence: 'NOT_CHECKED',
      parentId: 'pai',
    },
    {
      id: 'a-research',
      kind: 'agent',
      label: 'Research',
      status: 'running',
      reason: 'Reading 4 sources, 2 returned.',
      evidence: 'VERIFIED',
      parentId: 'pai',
    },
  ],
  edges: [
    { id: 'e-1', from: 'pai', to: 'a-ops', kind: 'manages' },
    { id: 'e-2', from: 'pai', to: 'a-research', kind: 'manages' },
  ],
  attention: [
    {
      id: 'i-gate-1',
      kind: 'gated',
      title: 'Remember this preference?',
      body: 'You corrected the tone twice. Ops wants to keep that so it stops asking.',
      at: at(0),
      nodeId: 'a-ops',
      gate: {
        gateId: 'gate-remember-tone',
        action: 'Store one preference in your PAI’s memory. Nothing is shared.',
        risk: 'low',
        // No `proof` — unresolved. The verify chip renders as pending, not green.
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// swarm_12 — the real fleet shape
// ---------------------------------------------------------------------------

const FLEET: ReadonlyArray<{ slug: string; label: string; live: boolean }> = [
  { slug: 'orch', label: 'Orchestrator', live: true },
  { slug: 'shofet', label: 'Shofet', live: true },
  { slug: 'gcm', label: 'GCM', live: true },
  { slug: 'tom', label: 'Tom', live: false },
  { slug: 'nexus', label: 'Nexus', live: false },
  { slug: 'apm', label: 'APM', live: false },
  { slug: 'hdm', label: 'HDM', live: false },
  { slug: 'torch', label: 'Torch', live: false },
  { slug: 'w3c', label: 'W3C', live: false },
  { slug: 'mel', label: 'Mel', live: false },
  { slug: 'veritas', label: 'Veritas', live: false },
  { slug: 'sentry', label: 'Sentry', live: false },
];

/**
 * Twelve agents at the fleet's measured distribution: 3 live, 9 reachable but
 * with no fresh evidence of work.
 *
 * The nine render `stale`, NOT `running`. `v_fleet_truth` once scored a
 * responding port as a working agent and was corrected for it (changelog #134);
 * a UI that maps reachability to a green pulse reintroduces that bug in the most
 * visible place we have. `evidence: 'NOT_CHECKED'` on those nine is the point —
 * it says we looked and found nothing, which is different from finding nothing
 * because we did not look.
 */
export const swarm_12: DualViewSnapshot = {
  nodes: [
    core('running', '3 of 12 agents have fresh evidence of work.'),
    ...FLEET.map(
      ({ slug, label, live }): PaiNode => ({
        id: `a-${slug}`,
        kind: 'agent',
        label,
        status: live ? 'running' : 'stale',
        reason: live
          ? 'Logged work in the last 10 minutes.'
          : 'Port answers, but no heartbeat and no logged work.',
        evidence: live ? 'VERIFIED' : 'NOT_CHECKED',
        parentId: 'pai',
        meta: { liveness_signal: live ? 'work' : 'probe_only' },
      }),
    ),
  ],
  edges: FLEET.map(({ slug }, i) => ({
    id: `e-${i}`,
    from: 'pai',
    to: `a-${slug}`,
    kind: 'manages' as const,
  })),
  attention: [
    {
      id: 'i-swarm-1',
      kind: 'swarm',
      title: '9 of 12 agents are stale',
      body: 'Reachable, but no heartbeat and no logged work. Not the same as running.',
      at: at(3),
    },
  ],
};

// ---------------------------------------------------------------------------
// cascade_unblock — the dependency story, for motion work
// ---------------------------------------------------------------------------

/**
 * A four-deep dependency chain with the blocker at the root. Clearing the gate
 * should visibly cascade. This is the fixture Lane C animates against; if the
 * cascade is not legible here it will not be legible anywhere.
 */
export const cascade_unblock: DualViewSnapshot = {
  nodes: [
    core('running', 'A chain of 4 is blocked on one approval.'),
    {
      id: 'a-fetch',
      kind: 'agent',
      label: 'Fetch',
      status: 'waiting_human',
      reason: 'Needs permission to read the private repo.',
      evidence: 'NOT_CHECKED',
      parentId: 'pai',
    },
    {
      id: 'a-parse',
      kind: 'agent',
      label: 'Parse',
      status: 'waiting_peer',
      reason: 'Waiting on Fetch.',
      evidence: 'VERIFIED',
      parentId: 'pai',
    },
    {
      id: 'a-score',
      kind: 'agent',
      label: 'Score',
      status: 'waiting_peer',
      reason: 'Waiting on Parse.',
      evidence: 'VERIFIED',
      parentId: 'pai',
    },
    {
      id: 'a-report',
      kind: 'agent',
      label: 'Report',
      status: 'waiting_peer',
      reason: 'Waiting on Score.',
      evidence: 'VERIFIED',
      parentId: 'pai',
    },
    {
      id: 't-registry',
      kind: 'tool',
      label: 'npm registry',
      status: 'blocked',
      reason: 'Proxy denies this host from agent sessions.',
      evidence: 'FAILED',
      parentId: 'a-fetch',
    },
  ],
  edges: [
    { id: 'e-1', from: 'pai', to: 'a-fetch', kind: 'manages' },
    { id: 'e-2', from: 'pai', to: 'a-parse', kind: 'manages' },
    { id: 'e-3', from: 'pai', to: 'a-score', kind: 'manages' },
    { id: 'e-4', from: 'pai', to: 'a-report', kind: 'manages' },
    { id: 'e-5', from: 'a-parse', to: 'a-fetch', kind: 'depends' },
    { id: 'e-6', from: 'a-score', to: 'a-parse', kind: 'depends' },
    { id: 'e-7', from: 'a-report', to: 'a-score', kind: 'depends' },
    { id: 'e-8', from: 'a-fetch', to: 't-registry', kind: 'invokes' },
  ],
  attention: [
    {
      id: 'i-gate-2',
      kind: 'gated',
      title: 'Read the private repo?',
      body: 'Fetch needs read access. Three agents behind it are idle until you decide.',
      at: at(1),
      nodeId: 'a-fetch',
      gate: {
        gateId: 'gate-read-private-repo',
        action: 'Grant read-only access to one repository for 60 minutes.',
        risk: 'medium',
      },
    },
    {
      id: 'i-hal-1',
      kind: 'hal',
      title: 'HAL held a tool call',
      body: 'npm registry is denied from this session. Fail-closed, as configured.',
      at: at(2),
      nodeId: 't-registry',
    },
  ],
};

// ---------------------------------------------------------------------------
// all_stale — the honest worst case
// ---------------------------------------------------------------------------

/**
 * Everything reachable, nothing working. This is what the fleet looked like for
 * roughly 26 days before the liveness fix, and it must render as a legible,
 * non-alarming "nothing is running" rather than as twelve green nodes.
 */
export const all_stale: DualViewSnapshot = {
  nodes: [
    core('stale', 'No agent has logged work recently.'),
    ...FLEET.slice(0, 4).map(
      ({ slug, label }): PaiNode => ({
        id: `a-${slug}`,
        kind: 'agent',
        label,
        status: 'stale',
        reason: 'Port answers, but no heartbeat and no logged work.',
        evidence: 'NOT_CHECKED',
        parentId: 'pai',
        meta: { liveness_signal: 'probe_only' },
      }),
    ),
  ],
  edges: FLEET.slice(0, 4).map(({ slug }, i) => ({
    id: `e-${i}`,
    from: 'pai',
    to: `a-${slug}`,
    kind: 'manages' as const,
  })),
  attention: [
    {
      id: 'i-stale-1',
      kind: 'swarm',
      title: 'Nothing is running',
      body: 'All 4 agents answer a probe. None has logged work. Reachable is not alive.',
      at: at(5),
    },
  ],
};

// ---------------------------------------------------------------------------

export const FIXTURES = {
  empty,
  calm,
  one_gate,
  swarm_12,
  cascade_unblock,
  all_stale,
} as const;

export type FixtureName = keyof typeof FIXTURES;

export const FIXTURE_NAMES = Object.keys(FIXTURES) as FixtureName[];

/** Wrap a fixture as the opening `snapshot` event of a stream. */
export function snapshotEvent(name: FixtureName) {
  const s = FIXTURES[name];
  return {
    t: 'snapshot' as const,
    v: CONTRACT_VERSION,
    nodes: s.nodes,
    edges: s.edges,
    attention: s.attention,
  };
}
