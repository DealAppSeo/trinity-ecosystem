// lib/mcp/fleet.ts — fleet discovery over agent_node_registry, as MCP tools.
//
// WHAT THIS IS. A port of the discovery half of kyegomez/swarms' AOP
// (`swarms/structs/aop.py`, Apache-2.0): expose a fleet of agents over MCP so
// agents can find each other at runtime instead of being wired to each other
// statically. Their version registers `discover_agents` / `get_agent_details`
// against an in-process dict of Agent objects. Ours reads the durable registry,
// which means discovery survives a restart and is shared across surfaces.
//
// WHAT WE CHANGED, AND WHY IT IS THE WHOLE POINT.
//
// AOP reports a fleet as a list of agents that exist. It has no notion of
// whether any of them is reachable, and — verified by reading the source on
// 2026-08-13 — no notion of whether any of them has ever been *right*: a
// repo-wide search for track_record/performance_history/calibration returns one
// file, and it is a prompt. Its `Task.correct_answer` field is threaded through
// twenty call sites, is advertised in the MCP tool schema to external callers,
// and is compared to nothing; the only `if correct_answer:` in the codebase is
// a debug log reading "Using correct answer for validation:".
//
// That is the failure this repo keeps logging (CLAUDE.md, "How to be right
// here"): a system reporting something it has not earned. So this port keeps
// the shape and refuses the epistemics:
//
//   * Liveness is TRI-STATE. `is_live` is `true` or `null`, never `false`.
//     Silence is not death. This mirrors v_fleet_truth, which was deliberately
//     written to return NULL rather than false when no signal exists (migration
//     20260811170821, "v_fleet_truth_never_asserts_dead_from_silence").
//     Note that v_node_truth does NOT do this — its `is_live` is a plain
//     `heartbeat_at > now() - 10min`, which reports false for a node nobody has
//     asked about. We compute liveness here rather than trusting that column.
//
//   * BELIEF and DECISION are separate fields. `is_live` is what we think is
//     true. `dispatchable` is whether it is safe to route work to the node.
//     Collapsing them is how "we did not look" becomes "it passed".
//
//   * EVERY node carries the evidence its status rests on — which signal, how
//     old. A caller that disagrees with our threshold can recompute.
//
//   * AN EMPTY REGISTRY IS NOT AN EMPTY FLEET. As of 2026-08-13
//     agent_node_registry has zero rows and nothing in this repo writes to it,
//     so the honest answer to "what is in the fleet" is "the registry is
//     unpopulated", not "nothing". Reporting `[]` bare would be a confident
//     wrong answer of exactly the kind /api/version exists to prevent.

import type { SupabaseClient } from '@supabase/supabase-js';
import { ToolInputError, optionalBoolean, optionalString, requireString } from '@/lib/mcp/jsonrpc';

/** Heartbeat age past which we stop believing a node is live, in minutes. */
export const LIVE_WINDOW_MINUTES = 10;

/**
 * Columns read from agent_node_registry. Explicit, never `select('*')` — this
 * route holds the service key and therefore bypasses RLS (app/api/CLAUDE.md).
 */
const NODE_COLUMNS = [
  'node_id',
  'surface',
  'lane',
  'owns',
  'branch',
  'purpose',
  'models',
  'region',
  'cpu_cores',
  'ram_mb',
  'can_prove',
  'can_hal_vote',
  'heartbeat_at',
  'expires_at',
  'acquired_at',
].join(', ');

export interface RegistryRow {
  node_id: string;
  surface: string;
  lane: string;
  owns: string[] | null;
  branch: string | null;
  purpose: string | null;
  models: string[] | null;
  region: string | null;
  cpu_cores: number | null;
  ram_mb: number | null;
  can_prove: boolean;
  can_hal_vote: boolean;
  heartbeat_at: string;
  expires_at: string;
  acquired_at: string;
}

/**
 * Where rows come from. An interface rather than a direct Supabase call so the
 * liveness rules can be exercised against fixed clocks and known rows — see
 * scripts/mcp-fleet-smoke.mjs. Rules nobody can run are rules nobody has
 * checked.
 */
export interface FleetSource {
  listNodes(): Promise<RegistryRow[]>;
  upsertNode(row: NodeRegistration): Promise<void>;
  touchHeartbeat(nodeId: string, leaseSeconds: number): Promise<boolean>;
}

export interface NodeRegistration {
  node_id: string;
  surface: string;
  lane: string;
  owns: string[];
  models: string[];
  branch?: string;
  purpose?: string;
  region?: string;
  can_prove: boolean;
  can_hal_vote: boolean;
  lease_seconds: number;
}

export type LivenessStatus = 'live' | 'lease_active_no_recent_heartbeat' | 'lease_expired';

export interface NodeView {
  node_id: string;
  surface: string;
  lane: string;
  owns: string[];
  models: string[];
  branch: string | null;
  purpose: string | null;
  region: string | null;
  capabilities: { can_prove: boolean; can_hal_vote: boolean };
  resources: { cpu_cores: number | null; ram_mb: number | null };

  /**
   * Belief. `true` when a heartbeat lands inside the window; `null` when it
   * does not. Never `false` — we have no death signal, only absence of a life
   * signal, and those are different facts.
   */
  is_live: true | null;

  /** Decision. Safe to route work to right now. Distinct from `is_live`. */
  dispatchable: boolean;

  status: LivenessStatus;

  evidence: {
    signal: 'heartbeat' | 'none';
    heartbeat_age_minutes: number;
    lease_remaining_minutes: number;
    live_window_minutes: number;
    /** Plain-language statement of what the status does and does not prove. */
    basis: string;
  };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Derive a node's status from its timestamps.
 *
 * Exported so the smoke test can drive it with a fixed `now` — the boundary
 * cases (exactly at the window, expired lease with a fresh heartbeat) are
 * where this is worth getting right, and they are unreachable through the
 * HTTP surface without waiting ten real minutes.
 */
export function deriveNodeView(row: RegistryRow, now: Date): NodeView {
  const heartbeatAgeMs = now.getTime() - new Date(row.heartbeat_at).getTime();
  const leaseRemainingMs = new Date(row.expires_at).getTime() - now.getTime();

  const heartbeatAgeMinutes = round1(heartbeatAgeMs / 60_000);
  const leaseRemainingMinutes = round1(leaseRemainingMs / 60_000);

  const heartbeatFresh = heartbeatAgeMs <= LIVE_WINDOW_MINUTES * 60_000;
  const leaseActive = leaseRemainingMs > 0;

  let status: LivenessStatus;
  let basis: string;

  if (!leaseActive) {
    status = 'lease_expired';
    basis =
      'Lease expired. Not dispatchable. This is not proof the node is down — an ' +
      'expired lease means it stopped renewing, which a crash and a clean shutdown ' +
      'produce identically.';
  } else if (heartbeatFresh) {
    status = 'live';
    basis = `Heartbeat ${heartbeatAgeMinutes} min old, inside the ${LIVE_WINDOW_MINUTES} min window, and the lease is active.`;
  } else {
    status = 'lease_active_no_recent_heartbeat';
    basis =
      `Lease is still active but the last heartbeat is ${heartbeatAgeMinutes} min old, ` +
      `outside the ${LIVE_WINDOW_MINUTES} min window. Liveness is UNKNOWN, not false. ` +
      'Withheld from dispatch because we cannot confirm it, not because we know it is down.';
  }

  return {
    node_id: row.node_id,
    surface: row.surface,
    lane: row.lane,
    owns: row.owns ?? [],
    models: row.models ?? [],
    branch: row.branch,
    purpose: row.purpose,
    region: row.region,
    capabilities: { can_prove: row.can_prove, can_hal_vote: row.can_hal_vote },
    resources: { cpu_cores: row.cpu_cores, ram_mb: row.ram_mb },
    is_live: status === 'live' ? true : null,
    dispatchable: status === 'live',
    status,
    evidence: {
      signal: heartbeatFresh ? 'heartbeat' : 'none',
      heartbeat_age_minutes: heartbeatAgeMinutes,
      lease_remaining_minutes: leaseRemainingMinutes,
      live_window_minutes: LIVE_WINDOW_MINUTES,
      basis,
    },
  };
}

/** Supabase-backed source. Client is built per call — never at module scope. */
export function supabaseFleetSource(getClient: () => SupabaseClient): FleetSource {
  return {
    async listNodes(): Promise<RegistryRow[]> {
      const { data, error } = await getClient()
        .from('agent_node_registry')
        .select(NODE_COLUMNS)
        .order('heartbeat_at', { ascending: false });
      if (error) throw new Error(`agent_node_registry read failed: ${error.message}`);
      return (data ?? []) as unknown as RegistryRow[];
    },

    async upsertNode(row: NodeRegistration): Promise<void> {
      const now = new Date();
      const expires = new Date(now.getTime() + row.lease_seconds * 1000);
      const { error } = await getClient()
        .from('agent_node_registry')
        .upsert(
          {
            node_id: row.node_id,
            surface: row.surface,
            lane: row.lane,
            owns: row.owns,
            models: row.models,
            branch: row.branch ?? null,
            purpose: row.purpose ?? null,
            region: row.region ?? null,
            can_prove: row.can_prove,
            can_hal_vote: row.can_hal_vote,
            heartbeat_at: now.toISOString(),
            expires_at: expires.toISOString(),
            updated_at: now.toISOString(),
          },
          { onConflict: 'node_id' }
        );
      if (error) throw new Error(`agent_node_registry upsert failed: ${error.message}`);
    },

    async touchHeartbeat(nodeId: string, leaseSeconds: number): Promise<boolean> {
      const now = new Date();
      const expires = new Date(now.getTime() + leaseSeconds * 1000);
      const { data, error } = await getClient()
        .from('agent_node_registry')
        .update({
          heartbeat_at: now.toISOString(),
          expires_at: expires.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('node_id', nodeId)
        .select('node_id');
      if (error) throw new Error(`agent_node_registry heartbeat failed: ${error.message}`);
      // An UPDATE matching zero rows is not an error at the driver level. It
      // means the node was never registered, and the caller needs to know that
      // rather than receive a cheerful success.
      return (data ?? []).length > 0;
    },
  };
}

// ── Tool definitions ─────────────────────────────────────────────────────────

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const EMPTY_OBJECT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

export const READ_TOOLS: ToolDef[] = [
  {
    name: 'discover_agents',
    title: 'Discover fleet nodes',
    description:
      'List agent nodes in the Trinity fleet with their capabilities and liveness. ' +
      'Liveness is tri-state: `is_live` is true or null, never false — silence is not ' +
      'evidence of death. Use `dispatchable` to decide where to send work; use `is_live` ' +
      'only to describe what is known. An empty result with registry_populated=false ' +
      'means the registry is unpopulated, NOT that the fleet is empty.',
    inputSchema: {
      type: 'object',
      properties: {
        lane: { type: 'string', description: 'Filter by lane, exact match.' },
        surface: { type: 'string', description: 'Filter by surface, exact match.' },
        capability: {
          type: 'string',
          enum: ['can_prove', 'can_hal_vote'],
          description: 'Only nodes holding this capability.',
        },
        include_undispatchable: {
          type: 'boolean',
          description:
            'Include nodes that are not dispatchable (stale heartbeat or expired lease). ' +
            'Defaults to false. Set true when auditing the fleet rather than routing work.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_agent_details',
    title: 'Get one node',
    description:
      'Full record for a single node by node_id, including the evidence behind its ' +
      'liveness status. Returns isError when no such node is registered — absence from ' +
      'the registry is not the same as the node not existing.',
    inputSchema: {
      type: 'object',
      properties: { node_id: { type: 'string', description: 'Exact node_id.' } },
      required: ['node_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'fleet_health',
    title: 'Fleet health summary',
    description:
      'Counts of nodes by liveness status, plus capability totals across dispatchable ' +
      'nodes. Reports counts of what is known, and states plainly when nothing is known.',
    inputSchema: EMPTY_OBJECT_SCHEMA,
  },
];

export const WRITE_TOOLS: ToolDef[] = [
  {
    name: 'register_node',
    title: 'Register or update a node',
    description:
      'Upsert a node into the fleet registry and start its lease. Service principal ' +
      'only. Registering does not assert the node is healthy — it asserts it exists and ' +
      'has claimed a lease.',
    inputSchema: {
      type: 'object',
      properties: {
        node_id: { type: 'string', description: 'Stable unique id for this node.' },
        surface: { type: 'string', description: 'Surface it runs on, e.g. railway, vercel, local.' },
        lane: { type: 'string', description: 'Work lane the node serves.' },
        owns: { type: 'array', items: { type: 'string' }, description: 'Components it owns.' },
        models: { type: 'array', items: { type: 'string' }, description: 'Models it can run.' },
        branch: { type: 'string' },
        purpose: { type: 'string' },
        region: { type: 'string' },
        can_prove: { type: 'boolean', description: 'Can produce ZK proofs. Defaults false.' },
        can_hal_vote: { type: 'boolean', description: 'Eligible as a HAL quorum voter. Defaults false.' },
        lease_seconds: {
          type: 'number',
          description: 'Lease length in seconds, 60–86400. Defaults 900.',
        },
      },
      required: ['node_id', 'surface', 'lane'],
      additionalProperties: false,
    },
  },
  {
    name: 'heartbeat_node',
    title: 'Renew a node lease',
    description:
      'Refresh heartbeat_at and extend the lease for an already-registered node. ' +
      'Service principal only. Returns isError if the node is not registered, rather ' +
      'than silently succeeding against zero rows.',
    inputSchema: {
      type: 'object',
      properties: {
        node_id: { type: 'string' },
        lease_seconds: { type: 'number', description: 'Lease length in seconds, 60–86400. Defaults 900.' },
      },
      required: ['node_id'],
      additionalProperties: false,
    },
  },
];

/** Tools visible to this principal. Writes are service-only. */
export function toolsFor(principal: 'user' | 'service'): ToolDef[] {
  return principal === 'service' ? [...READ_TOOLS, ...WRITE_TOOLS] : READ_TOOLS;
}

// ── Tool execution ───────────────────────────────────────────────────────────

export interface ToolContext {
  source: FleetSource;
  principal: 'user' | 'service';
  now: Date;
}

/** A structured tool result. `structuredContent` is mirrored as text per spec. */
export interface ToolOutcome {
  payload: Record<string, unknown>;
  isError?: boolean;
}

function readLeaseSeconds(args: Record<string, unknown>): number {
  const raw = args.lease_seconds;
  if (raw === undefined || raw === null) return 900;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new ToolInputError('Argument `lease_seconds` must be a finite number when provided.');
  }
  if (raw < 60 || raw > 86_400) {
    throw new ToolInputError(`Argument \`lease_seconds\` must be between 60 and 86400; got ${raw}.`);
  }
  return Math.floor(raw);
}

function readStringArray(args: Record<string, unknown>, key: string): string[] {
  const raw = args[key];
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string')) {
    throw new ToolInputError(`Argument \`${key}\` must be an array of strings when provided.`);
  }
  return raw as string[];
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolOutcome> {
  const writeNames = new Set(WRITE_TOOLS.map((t) => t.name));
  if (writeNames.has(name) && ctx.principal !== 'service') {
    return {
      isError: true,
      payload: {
        error: `Tool '${name}' requires the service principal. Send x-internal-secret.`,
      },
    };
  }

  switch (name) {
    case 'discover_agents':
      return discoverAgents(args, ctx);
    case 'get_agent_details':
      return getAgentDetails(args, ctx);
    case 'fleet_health':
      return fleetHealth(ctx);
    case 'register_node':
      return registerNode(args, ctx);
    case 'heartbeat_node':
      return heartbeatNode(args, ctx);
    default:
      return { isError: true, payload: { error: `Unknown tool '${name}'.` } };
  }
}

/**
 * The note attached to every read when the registry has no rows at all.
 *
 * Kept as one constant because the distinction it draws is the single most
 * important thing this server says, and it must read identically everywhere.
 */
const EMPTY_REGISTRY_NOTE =
  'agent_node_registry contains zero rows. This means the registry is UNPOPULATED — ' +
  'no process is currently registering nodes — and must NOT be read as "the fleet is " ' +
  'empty" or "all nodes are down". Nothing has been observed either way.';

async function discoverAgents(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolOutcome> {
  const lane = optionalString(args, 'lane');
  const surface = optionalString(args, 'surface');
  const capability = optionalString(args, 'capability');
  const includeUndispatchable = optionalBoolean(args, 'include_undispatchable') ?? false;

  if (capability !== undefined && capability !== 'can_prove' && capability !== 'can_hal_vote') {
    throw new ToolInputError(
      `Argument \`capability\` must be 'can_prove' or 'can_hal_vote'; got '${capability}'.`
    );
  }

  const rows = await ctx.source.listNodes();
  const registryPopulated = rows.length > 0;

  let views = rows.map((r) => deriveNodeView(r, ctx.now));
  if (lane) views = views.filter((v) => v.lane === lane);
  if (surface) views = views.filter((v) => v.surface === surface);
  if (capability === 'can_prove') views = views.filter((v) => v.capabilities.can_prove);
  if (capability === 'can_hal_vote') views = views.filter((v) => v.capabilities.can_hal_vote);

  const matchedBeforeDispatchFilter = views.length;
  if (!includeUndispatchable) views = views.filter((v) => v.dispatchable);

  return {
    payload: {
      nodes: views,
      count: views.length,
      registry_populated: registryPopulated,
      filters_applied: { lane, surface, capability, include_undispatchable: includeUndispatchable },
      withheld_as_undispatchable: includeUndispatchable
        ? 0
        : matchedBeforeDispatchFilter - views.length,
      verification: registryPopulated
        ? {
            status: 'VERIFIED',
            note:
              'Rows read from agent_node_registry at query time. Liveness derived from ' +
              'heartbeat age and lease, not from a stored boolean.',
          }
        : { status: 'NOT_CHECKED', note: EMPTY_REGISTRY_NOTE },
      observed_at: ctx.now.toISOString(),
    },
  };
}

async function getAgentDetails(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolOutcome> {
  const nodeId = requireString(args, 'node_id');
  const rows = await ctx.source.listNodes();
  const row = rows.find((r) => r.node_id === nodeId);

  if (!row) {
    return {
      isError: true,
      payload: {
        error: `No node registered with node_id '${nodeId}'.`,
        registry_populated: rows.length > 0,
        note:
          rows.length > 0
            ? 'The registry has other rows, so this is a genuine miss for this id.'
            : EMPTY_REGISTRY_NOTE,
      },
    };
  }

  return {
    payload: {
      node: deriveNodeView(row, ctx.now),
      verification: { status: 'VERIFIED', note: 'Row read from agent_node_registry at query time.' },
      observed_at: ctx.now.toISOString(),
    },
  };
}

async function fleetHealth(ctx: ToolContext): Promise<ToolOutcome> {
  const rows = await ctx.source.listNodes();
  const views = rows.map((r) => deriveNodeView(r, ctx.now));

  const byStatus: Record<LivenessStatus, number> = {
    live: 0,
    lease_active_no_recent_heartbeat: 0,
    lease_expired: 0,
  };
  for (const v of views) byStatus[v.status] += 1;

  const dispatchable = views.filter((v) => v.dispatchable);

  return {
    payload: {
      total_registered: views.length,
      by_status: byStatus,
      dispatchable_count: dispatchable.length,
      // Deliberately scoped to dispatchable nodes: a capability on a node we
      // cannot reach is not a capability the fleet currently has.
      dispatchable_capabilities: {
        can_prove: dispatchable.filter((v) => v.capabilities.can_prove).length,
        can_hal_vote: dispatchable.filter((v) => v.capabilities.can_hal_vote).length,
      },
      liveness_unknown_count: byStatus.lease_active_no_recent_heartbeat,
      verification:
        views.length > 0
          ? {
              status: 'VERIFIED',
              note: `Derived from ${views.length} registry row(s) at query time.`,
            }
          : { status: 'NOT_CHECKED', note: EMPTY_REGISTRY_NOTE },
      observed_at: ctx.now.toISOString(),
    },
  };
}

async function registerNode(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolOutcome> {
  const registration: NodeRegistration = {
    node_id: requireString(args, 'node_id'),
    surface: requireString(args, 'surface'),
    lane: requireString(args, 'lane'),
    owns: readStringArray(args, 'owns'),
    models: readStringArray(args, 'models'),
    branch: optionalString(args, 'branch'),
    purpose: optionalString(args, 'purpose'),
    region: optionalString(args, 'region'),
    can_prove: optionalBoolean(args, 'can_prove') ?? false,
    can_hal_vote: optionalBoolean(args, 'can_hal_vote') ?? false,
    lease_seconds: readLeaseSeconds(args),
  };

  await ctx.source.upsertNode(registration);

  return {
    payload: {
      registered: registration.node_id,
      lease_seconds: registration.lease_seconds,
      note:
        'Registration records existence and a lease claim. It is not a health check — ' +
        'the node becomes dispatchable on its heartbeat, which this call also sets.',
      observed_at: ctx.now.toISOString(),
    },
  };
}

async function heartbeatNode(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolOutcome> {
  const nodeId = requireString(args, 'node_id');
  const leaseSeconds = readLeaseSeconds(args);

  const existed = await ctx.source.touchHeartbeat(nodeId, leaseSeconds);
  if (!existed) {
    return {
      isError: true,
      payload: {
        error: `No node registered with node_id '${nodeId}'; nothing was updated.`,
        note: 'Call register_node first. An UPDATE that matched zero rows is not a success.',
      },
    };
  }

  return {
    payload: { node_id: nodeId, lease_seconds: leaseSeconds, observed_at: ctx.now.toISOString() },
  };
}
