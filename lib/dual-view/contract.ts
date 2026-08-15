// lib/dual-view/contract.ts — the frozen dual-view event contract.
//
// See docs/DUAL-VIEW-LAUNCH-PLAN.md §5. This file is the coordination point for
// four parallel lanes. It has ZERO imports and ZERO runtime dependencies so that
// a UI lane can consume it without pulling in Supabase, the harness, or Node.
//
// AMENDING THIS FILE. Contract changes are the only cross-lane risk that
// matters. Bump CONTRACT_VERSION, and land the type change, the fixtures and the
// validator in ONE commit. Never add a field and a consumer of that field in the
// same PR — that is how a lane discovers a breaking change at merge time instead
// of at contract time.
//
// WHY `reason` AND `evidence` ARE REQUIRED. The recurring defect in this
// codebase is a system reporting success it has not earned: a skipped test
// scored as a pass, a build green over undefined references, a credential check
// green with no credential. A node that renders green without carrying what made
// it green reproduces that defect in a surface designed to be screenshotted. So
// they are required fields, and the validator rejects empty ones.

/**
 * Semver. MINOR for an added optional field or a new member of a closed set;
 * MAJOR for a removal or a semantic change to an existing field.
 */
export const CONTRACT_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

/**
 * Closed set. Deliberately six, and deliberately including `stale`.
 *
 * `stale` exists because `v_fleet_truth` reports 9 of 12 agents reachable on
 * probe alone with no fresh heartbeat, and an earlier revision of that view
 * scored a responding port as a working agent (fixed in trinity_changelog
 * #134). Mapping reachability onto `running` in the UI layer would undo that fix
 * in the one place people take screenshots of. There must be a status that means
 * "answers the door, no evidence of work".
 */
export type NodeStatus =
  | 'running' // working now, evidence of current work
  | 'waiting_human' // gated — the loud one; a human must act
  | 'waiting_peer' // blocked by another node present in this graph
  | 'blocked' // blocked by something outside this graph
  | 'stale' // reachable, but no fresh evidence of work
  | 'done'; // completed

export type NodeKind = 'pai_core' | 'agent' | 'tool' | 'task';

/**
 * Three outcomes, never two. Two outcomes collapse "we did not look" into
 * "it passed", which is this codebase's most persistent defect.
 */
export type Evidence = 'VERIFIED' | 'NOT_CHECKED' | 'FAILED';

export interface PaiNode {
  id: string;
  kind: NodeKind;
  label: string;
  status: NodeStatus;
  /** Why this status, in words a non-engineer can read. Required. */
  reason: string;
  /** Whether `status` was checked, and how it came out. Required. */
  evidence: Evidence;
  /** Hierarchy: which node manages this one. Absent on `pai_core`. */
  parentId?: string;
  meta?: Record<string, string | number | boolean>;
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

/**
 * `depends` animates toward the blocker, so "who is waiting on whom" is readable
 * without clicking. `manages` is hierarchy. `invokes` is a tool call.
 */
export type EdgeKind = 'depends' | 'manages' | 'invokes';

export interface PaiEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
}

// ---------------------------------------------------------------------------
// Attention items — the human pane
// ---------------------------------------------------------------------------

export type AttentionKind =
  | 'gated' // needs the human now
  | 'receipt' // a session receipt was emitted
  | 'repid_delta' // a reputation score moved
  | 'hal' // a HAL outcome
  | 'swarm'; // a swarm topology event

export type GateRisk = 'low' | 'medium' | 'high';

export interface GateProof {
  controlProofId: string;
  /**
   * Result of running the proof through the verify route. `false` must be
   * rendered as a failure, never swallowed — a gate that always shows a
   * checkmark teaches users that the checkmark means nothing.
   */
  verified: boolean;
}

export interface AttentionGate {
  gateId: string;
  /** What happens if approved, in plain words. Not a tool name. */
  action: string;
  risk: GateRisk;
  /** Set once resolved. Absent while pending. */
  proof?: GateProof;
}

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  title: string;
  body: string;
  /** ISO 8601. */
  at: string;
  /** Links this card to a graph node, so the two panes stay one story. */
  nodeId?: string;
  /** Present if and only if `kind === 'gated'`. Enforced by the validator. */
  gate?: AttentionGate;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * A stream opens with `snapshot`, then deltas. Reconnect and tab-restore replay
 * one snapshot rather than a week of deltas.
 *
 * `v` carries CONTRACT_VERSION on every event so a consumer can refuse a stream
 * it does not understand instead of silently mis-rendering it.
 */
export type PaiEvent =
  | {
      t: 'snapshot';
      v: string;
      nodes: PaiNode[];
      edges: PaiEdge[];
      attention: AttentionItem[];
    }
  | { t: 'node.upsert'; v: string; node: PaiNode }
  | { t: 'node.remove'; v: string; id: string }
  | { t: 'edge.upsert'; v: string; edge: PaiEdge }
  | { t: 'edge.remove'; v: string; id: string }
  | { t: 'attention.item'; v: string; item: AttentionItem }
  | {
      t: 'gate.resolved';
      v: string;
      gateId: string;
      approved: boolean;
      controlProofId: string;
    };

export type PaiEventKind = PaiEvent['t'];

// ---------------------------------------------------------------------------
// Closed-set values, exported for the validator and for exhaustive UI switches
// ---------------------------------------------------------------------------

export const NODE_STATUSES: readonly NodeStatus[] = [
  'running',
  'waiting_human',
  'waiting_peer',
  'blocked',
  'stale',
  'done',
];

export const NODE_KINDS: readonly NodeKind[] = ['pai_core', 'agent', 'tool', 'task'];

export const EDGE_KINDS: readonly EdgeKind[] = ['depends', 'manages', 'invokes'];

export const EVIDENCE_VALUES: readonly Evidence[] = ['VERIFIED', 'NOT_CHECKED', 'FAILED'];

export const ATTENTION_KINDS: readonly AttentionKind[] = [
  'gated',
  'receipt',
  'repid_delta',
  'hal',
  'swarm',
];

export const GATE_RISKS: readonly GateRisk[] = ['low', 'medium', 'high'];

export const EVENT_KINDS: readonly PaiEventKind[] = [
  'snapshot',
  'node.upsert',
  'node.remove',
  'edge.upsert',
  'edge.remove',
  'attention.item',
  'gate.resolved',
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * A validation problem. Collected rather than thrown, so one bad fixture reports
 * every fault it has instead of only its first.
 */
export interface ContractViolation {
  path: string;
  message: string;
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function requireNonEmptyString(
  value: unknown,
  path: string,
  out: ContractViolation[],
): value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    out.push({ path, message: 'must be a non-empty string' });
    return false;
  }
  return true;
}

function requireMember<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  out: ContractViolation[],
): value is T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    out.push({ path, message: `must be one of: ${allowed.join(', ')}` });
    return false;
  }
  return true;
}

export function validateNode(node: unknown, path = 'node'): ContractViolation[] {
  const out: ContractViolation[] = [];
  if (!isPlainObject(node)) {
    return [{ path, message: 'must be an object' }];
  }
  requireNonEmptyString(node.id, `${path}.id`, out);
  requireNonEmptyString(node.label, `${path}.label`, out);
  // Required, and required to be non-empty — see the header note.
  requireNonEmptyString(node.reason, `${path}.reason`, out);
  requireMember(node.kind, NODE_KINDS, `${path}.kind`, out);
  requireMember(node.status, NODE_STATUSES, `${path}.status`, out);
  requireMember(node.evidence, EVIDENCE_VALUES, `${path}.evidence`, out);

  if (node.kind === 'pai_core' && node.parentId !== undefined) {
    out.push({ path: `${path}.parentId`, message: 'pai_core must not have a parent' });
  }
  if (node.parentId !== undefined) {
    requireNonEmptyString(node.parentId, `${path}.parentId`, out);
    if (node.parentId === node.id) {
      out.push({ path: `${path}.parentId`, message: 'must not be self-referential' });
    }
  }
  // A node claiming VERIFIED while blocked is the "success it has not earned"
  // shape: the evidence field is about the status, so it cannot assert a clean
  // check over a failure state without saying which.
  if (node.evidence === 'VERIFIED' && node.status === 'blocked') {
    out.push({
      path: `${path}.evidence`,
      message: 'a blocked node cannot be VERIFIED; use NOT_CHECKED or FAILED',
    });
  }
  return out;
}

export function validateEdge(edge: unknown, path = 'edge'): ContractViolation[] {
  const out: ContractViolation[] = [];
  if (!isPlainObject(edge)) {
    return [{ path, message: 'must be an object' }];
  }
  requireNonEmptyString(edge.id, `${path}.id`, out);
  requireNonEmptyString(edge.from, `${path}.from`, out);
  requireNonEmptyString(edge.to, `${path}.to`, out);
  requireMember(edge.kind, EDGE_KINDS, `${path}.kind`, out);
  if (edge.from === edge.to) {
    out.push({ path, message: 'must not be a self-loop' });
  }
  return out;
}

export function validateAttentionItem(item: unknown, path = 'item'): ContractViolation[] {
  const out: ContractViolation[] = [];
  if (!isPlainObject(item)) {
    return [{ path, message: 'must be an object' }];
  }
  requireNonEmptyString(item.id, `${path}.id`, out);
  requireNonEmptyString(item.title, `${path}.title`, out);
  requireNonEmptyString(item.body, `${path}.body`, out);
  requireMember(item.kind, ATTENTION_KINDS, `${path}.kind`, out);

  if (typeof item.at !== 'string' || Number.isNaN(Date.parse(item.at))) {
    out.push({ path: `${path}.at`, message: 'must be an ISO 8601 timestamp' });
  }
  if (item.nodeId !== undefined) {
    requireNonEmptyString(item.nodeId, `${path}.nodeId`, out);
  }

  // gate is present iff kind === 'gated'. Both directions matter: a gated card
  // with no gate has nothing to approve, and a non-gated card carrying a gate
  // would render an approve button the feed does not mean.
  const hasGate = item.gate !== undefined;
  const isGated = item.kind === 'gated';
  if (isGated && !hasGate) {
    out.push({ path: `${path}.gate`, message: "required when kind === 'gated'" });
  }
  if (!isGated && hasGate) {
    out.push({ path: `${path}.gate`, message: "only allowed when kind === 'gated'" });
  }
  if (hasGate) {
    const g = item.gate;
    if (!isPlainObject(g)) {
      out.push({ path: `${path}.gate`, message: 'must be an object' });
    } else {
      requireNonEmptyString(g.gateId, `${path}.gate.gateId`, out);
      requireNonEmptyString(g.action, `${path}.gate.action`, out);
      requireMember(g.risk, GATE_RISKS, `${path}.gate.risk`, out);
      if (g.proof !== undefined) {
        if (!isPlainObject(g.proof)) {
          out.push({ path: `${path}.gate.proof`, message: 'must be an object' });
        } else {
          requireNonEmptyString(g.proof.controlProofId, `${path}.gate.proof.controlProofId`, out);
          if (typeof g.proof.verified !== 'boolean') {
            out.push({ path: `${path}.gate.proof.verified`, message: 'must be a boolean' });
          }
        }
      }
    }
  }
  return out;
}

/**
 * Validate one event. Does NOT check referential integrity across events — that
 * is `validateSnapshotIntegrity`, which needs the whole set.
 */
export function validateEvent(event: unknown, path = 'event'): ContractViolation[] {
  const out: ContractViolation[] = [];
  if (!isPlainObject(event)) {
    return [{ path, message: 'must be an object' }];
  }
  if (!requireMember(event.t, EVENT_KINDS, `${path}.t`, out)) {
    return out;
  }
  requireNonEmptyString(event.v, `${path}.v`, out);

  switch (event.t) {
    case 'snapshot': {
      if (!Array.isArray(event.nodes)) {
        out.push({ path: `${path}.nodes`, message: 'must be an array' });
      } else {
        event.nodes.forEach((n, i) => out.push(...validateNode(n, `${path}.nodes[${i}]`)));
      }
      if (!Array.isArray(event.edges)) {
        out.push({ path: `${path}.edges`, message: 'must be an array' });
      } else {
        event.edges.forEach((e, i) => out.push(...validateEdge(e, `${path}.edges[${i}]`)));
      }
      if (!Array.isArray(event.attention)) {
        out.push({ path: `${path}.attention`, message: 'must be an array' });
      } else {
        event.attention.forEach((a, i) =>
          out.push(...validateAttentionItem(a, `${path}.attention[${i}]`)),
        );
      }
      break;
    }
    case 'node.upsert':
      out.push(...validateNode(event.node, `${path}.node`));
      break;
    case 'node.remove':
    case 'edge.remove':
      requireNonEmptyString(event.id, `${path}.id`, out);
      break;
    case 'edge.upsert':
      out.push(...validateEdge(event.edge, `${path}.edge`));
      break;
    case 'attention.item':
      out.push(...validateAttentionItem(event.item, `${path}.item`));
      break;
    case 'gate.resolved':
      requireNonEmptyString(event.gateId, `${path}.gateId`, out);
      requireNonEmptyString(event.controlProofId, `${path}.controlProofId`, out);
      if (typeof event.approved !== 'boolean') {
        out.push({ path: `${path}.approved`, message: 'must be a boolean' });
      }
      break;
  }
  return out;
}

/**
 * Cross-referential checks a single-event validator structurally cannot do:
 * unique ids, edges pointing at nodes that exist, parents that exist, exactly
 * one `pai_core`, and attention items linked to real nodes.
 *
 * A dangling edge is the specific failure that makes a graph library either
 * throw or silently drop a node, so it is checked here rather than discovered in
 * the renderer.
 */
export function validateSnapshotIntegrity(snapshot: {
  nodes: PaiNode[];
  edges: PaiEdge[];
  attention: AttentionItem[];
}): ContractViolation[] {
  const out: ContractViolation[] = [];
  const nodeIds = new Set<string>();

  for (const [i, n] of snapshot.nodes.entries()) {
    if (nodeIds.has(n.id)) {
      out.push({ path: `nodes[${i}].id`, message: `duplicate node id "${n.id}"` });
    }
    nodeIds.add(n.id);
  }

  const cores = snapshot.nodes.filter((n) => n.kind === 'pai_core');
  if (cores.length !== 1) {
    out.push({ path: 'nodes', message: `expected exactly one pai_core, found ${cores.length}` });
  }

  for (const [i, n] of snapshot.nodes.entries()) {
    if (n.parentId !== undefined && !nodeIds.has(n.parentId)) {
      out.push({ path: `nodes[${i}].parentId`, message: `unknown node "${n.parentId}"` });
    }
  }

  const edgeIds = new Set<string>();
  for (const [i, e] of snapshot.edges.entries()) {
    if (edgeIds.has(e.id)) {
      out.push({ path: `edges[${i}].id`, message: `duplicate edge id "${e.id}"` });
    }
    edgeIds.add(e.id);
    if (!nodeIds.has(e.from)) {
      out.push({ path: `edges[${i}].from`, message: `unknown node "${e.from}"` });
    }
    if (!nodeIds.has(e.to)) {
      out.push({ path: `edges[${i}].to`, message: `unknown node "${e.to}"` });
    }
  }

  const itemIds = new Set<string>();
  for (const [i, a] of snapshot.attention.entries()) {
    if (itemIds.has(a.id)) {
      out.push({ path: `attention[${i}].id`, message: `duplicate item id "${a.id}"` });
    }
    itemIds.add(a.id);
    // A dangling `nodeId` is a violation only on a GATED item, and the asymmetry
    // is deliberate.
    //
    // Historical cards — a receipt, a RepID delta — are a record of something
    // that happened. The node they describe may since have finished and been
    // removed from the graph, and the card must survive that: a feed that
    // silently drops its own history is worse than one with an unclickable link.
    //
    // A gated card is the opposite. It is an offer to act on a node, so a gate
    // pointing at a node that is not in the graph is an approve button wired to
    // nothing. That has to fail loudly.
    if (a.nodeId !== undefined && !nodeIds.has(a.nodeId) && a.kind === 'gated') {
      out.push({
        path: `attention[${i}].nodeId`,
        message: `gated item points at unknown node "${a.nodeId}"`,
      });
    }
  }

  // A node in waiting_human with nothing in the feed to clear it is a dead end
  // for the user: the graph says "needs you" and offers no way to act.
  const gatedNodeIds = new Set(
    snapshot.attention.filter((a) => a.kind === 'gated' && a.nodeId).map((a) => a.nodeId as string),
  );
  for (const [i, n] of snapshot.nodes.entries()) {
    if (n.status === 'waiting_human' && !gatedNodeIds.has(n.id)) {
      out.push({
        path: `nodes[${i}]`,
        message: 'waiting_human with no gated attention item — the user cannot clear it',
      });
    }
  }

  return out;
}

/**
 * Apply one event to a snapshot, returning a new snapshot. Pure — no mutation of
 * the input, so a UI store can use it directly and a test can replay a stream.
 *
 * An unknown or malformed event returns the previous snapshot unchanged rather
 * than throwing: a live stream must not be able to blank the user's screen.
 * Callers that need to know should validate first.
 */
export function applyEvent(
  prev: { nodes: PaiNode[]; edges: PaiEdge[]; attention: AttentionItem[] },
  event: PaiEvent,
): { nodes: PaiNode[]; edges: PaiEdge[]; attention: AttentionItem[] } {
  // Not `Array.prototype.with`: it is ES2023, and this file compiles against an
  // es2022 target and must run on Node 18, which does not have it. `lib` is
  // `esnext` here, so tsc would have accepted it and it would have failed at
  // runtime — the type checker cannot see this one.
  const replaceAt = <T>(arr: readonly T[], i: number, v: T): T[] => {
    const next = arr.slice();
    next[i] = v;
    return next;
  };

  switch (event.t) {
    case 'snapshot':
      return { nodes: [...event.nodes], edges: [...event.edges], attention: [...event.attention] };

    case 'node.upsert': {
      const i = prev.nodes.findIndex((n) => n.id === event.node.id);
      const nodes = i === -1 ? [...prev.nodes, event.node] : replaceAt(prev.nodes, i, event.node);
      return { ...prev, nodes };
    }

    case 'node.remove': {
      const nodes = prev.nodes.filter((n) => n.id !== event.id);
      // Removing a node must remove its edges too, or the next render has
      // dangling references — the exact fault validateSnapshotIntegrity catches.
      const edges = prev.edges.filter((e) => e.from !== event.id && e.to !== event.id);
      return { ...prev, nodes, edges };
    }

    case 'edge.upsert': {
      const i = prev.edges.findIndex((e) => e.id === event.edge.id);
      const edges = i === -1 ? [...prev.edges, event.edge] : replaceAt(prev.edges, i, event.edge);
      return { ...prev, edges };
    }

    case 'edge.remove':
      return { ...prev, edges: prev.edges.filter((e) => e.id !== event.id) };

    case 'attention.item': {
      const i = prev.attention.findIndex((a) => a.id === event.item.id);
      const attention =
        i === -1 ? [event.item, ...prev.attention] : replaceAt(prev.attention, i, event.item);
      return { ...prev, attention };
    }

    case 'gate.resolved': {
      const attention = prev.attention.map((a) =>
        a.gate?.gateId === event.gateId
          ? {
              ...a,
              gate: {
                ...a.gate,
                // `verified` stays false until the verify route has actually
                // answered. Approval is not verification, and conflating the two
                // is how the checkmark stops meaning anything.
                proof: { controlProofId: event.controlProofId, verified: false },
              },
            }
          : a,
      );
      return { ...prev, attention };
    }

    default:
      return prev;
  }
}
