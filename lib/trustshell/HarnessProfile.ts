// lib/trustshell/HarnessProfile.ts
//
// The harness profile: Loops + Tools + Memory + Reliability + Permissions +
// Verification, expressed as settings that resolve through a layered ladder.
//
// Read docs/HARNESS-SPEC.md for the reasoning. The short version:
//
//   A harness is personal. Almost every knob below should hold *this operator's*
//   value, not ours. But if every knob were personal, a RepID score would mean
//   nothing to a third party — an agent could simply declare itself trusted.
//
//   So each setting carries an `authority` naming who may write it, and one
//   authority — `earned` — is writable by nobody. Earned settings are outputs of
//   the verification pillar: they move only when a signed receipt says they may.
//   That asymmetry is what a reputation is.
//
// This module is pure. It reads no environment, opens no client, and performs no
// I/O, so it is safe to import anywhere (see lib/CLAUDE.md on module scope).

// ---------------------------------------------------------------------------
// Authority — who may write a setting
// ---------------------------------------------------------------------------

/**
 * Mirrors the classification `repid_config` already carries as four booleans
 * (`conductor_tunable`, `requires_vote`, `auto_tunable`, and the implicit
 * "none of the above" = constitutional). Naming it as one enum makes the
 * unwritable case — `earned` — expressible, which the boolean encoding cannot do.
 */
export type Authority =
  /** Fixed in code and migration. No runtime path writes it, including ours. */
  | 'constitutional'
  /** We ship a default. Any lower layer may override, within bounds. */
  | 'vendor_default'
  /** An institution admin sets it for everyone under that institution. */
  | 'org'
  /** The individual operator sets it. The bulk of a personalised harness. */
  | 'user'
  /** The agent may tune it within [min,max], and every write is logged. */
  | 'agent_tunable'
  /** Derived from verified receipts. No layer may set it — not even the user. */
  | 'earned';

/** Layers, ordered least to most specific. Later layers win where permitted. */
export const LAYER_ORDER = ['vendor', 'org', 'user', 'agent'] as const;
export type Layer = (typeof LAYER_ORDER)[number];

/** Which layer an authority admits writes from. */
const WRITABLE_BY: Record<Authority, ReadonlySet<Layer>> = {
  constitutional: new Set<Layer>(),
  vendor_default: new Set<Layer>(['vendor', 'org', 'user']),
  org: new Set<Layer>(['vendor', 'org']),
  user: new Set<Layer>(['vendor', 'org', 'user']),
  agent_tunable: new Set<Layer>(['vendor', 'org', 'user', 'agent']),
  earned: new Set<Layer>(),
};

export type Dimension =
  | 'loops'
  | 'tools'
  | 'memory'
  | 'reliability'
  | 'permissions'
  | 'verification';

/**
 * Which direction of a numeric setting is the cautious one.
 *
 * This is not cosmetic. It is what lets a human always tighten without proof
 * while an agent may only loosen with proof. Without it the resolver cannot
 * tell a safety override from a privilege escalation.
 */
export type SafeDirection = 'lower' | 'higher' | 'n/a';

/** What a setting turns into downstream, once resolved. */
export type CompilesTo =
  /** Prose injected into the agent's instructions (CLAUDE.md, skill body). */
  | 'rule'
  /** Gates whether a skill/tool is offered at all. */
  | 'capability'
  /** A harness-level runtime setting (timeouts, retries, budgets). */
  | 'setting'
  /** A row the platform enforces server-side, out of the agent's reach. */
  | 'db';

export interface SettingSpec {
  key: string;
  dimension: Dimension;
  authority: Authority;
  type: 'number' | 'boolean' | 'string' | 'string[]';
  /**
   * The value used when no layer sets it. For `earned` settings this is
   * deliberately the *most restrictive* value, not a typical one: an agent with
   * no receipts must land on the floor, never on a comfortable middle. See
   * "never round silence up to success" in docs/TRUSTSHELL-V1.md §6.
   */
  default: unknown;
  min?: number;
  max?: number;
  safeDirection: SafeDirection;
  compilesTo: CompilesTo;
  /** For `earned` settings: the receipt evidence that unlocks a higher value. */
  unlockedBy?: string;
  /** The failure this setting exists to prevent. Empty is not acceptable. */
  why: string;
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

/**
 * Every setting the harness knows about. A key absent from here cannot be set
 * by any layer — unknown keys are rejected rather than passed through, because
 * a typo that silently does nothing is the same class of bug as a check that
 * silently does not run.
 */
export const HARNESS_SETTINGS: readonly SettingSpec[] = [
  // -- Loops ---------------------------------------------------------------
  {
    key: 'loops.max_iterations_per_task',
    dimension: 'loops',
    authority: 'user',
    type: 'number',
    default: 25,
    min: 1,
    max: 500,
    safeDirection: 'lower',
    compilesTo: 'setting',
    why: 'An agent with no iteration ceiling burns budget on a task it has already failed.',
  },
  {
    key: 'loops.no_progress_abort_after',
    dimension: 'loops',
    authority: 'vendor_default',
    type: 'number',
    default: 3,
    min: 1,
    max: 20,
    safeDirection: 'lower',
    compilesTo: 'setting',
    why: 'Iterations that change no verified state are the signature of a stuck loop; count them, not wall clock.',
  },
  {
    key: 'loops.claim_lease_minutes',
    dimension: 'loops',
    authority: 'org',
    type: 'number',
    default: 30,
    min: 5,
    max: 240,
    safeDirection: 'lower',
    compilesTo: 'db',
    why: 'A claim without an expiry orphans the task when the agent dies. 23,113 orphaned claims say so.',
  },
  {
    key: 'loops.max_concurrent_tasks',
    dimension: 'loops',
    authority: 'earned',
    type: 'number',
    default: 1,
    min: 1,
    max: 32,
    safeDirection: 'lower',
    compilesTo: 'db',
    unlockedBy: 'receipts.verified_sessions',
    why: 'Concurrency multiplies the blast radius of a bad agent, so it is earned rather than chosen.',
  },
  {
    key: 'loops.max_subtask_depth',
    dimension: 'loops',
    authority: 'earned',
    type: 'number',
    default: 0,
    min: 0,
    max: 5,
    safeDirection: 'lower',
    compilesTo: 'db',
    unlockedBy: 'receipts.verified_sessions',
    why: 'Recursive spawning is how a small mistake becomes a fleet-wide one.',
  },
  {
    key: 'loops.can_spawn_subtasks',
    dimension: 'loops',
    authority: 'earned',
    type: 'boolean',
    default: false,
    safeDirection: 'n/a',
    compilesTo: 'db',
    unlockedBy: 'receipts.verified_sessions',
    why: 'Spawning delegates the agent’s own authority; it must be held before it can be lent.',
  },
  {
    key: 'loops.stop_requires_typed_handoff',
    dimension: 'loops',
    authority: 'constitutional',
    type: 'boolean',
    default: true,
    safeDirection: 'n/a',
    compilesTo: 'rule',
    why: 'Going idle without a handoff loses the session. A typed stop is the only legal stop.',
  },

  // -- Tools ---------------------------------------------------------------
  {
    key: 'tools.allowed',
    dimension: 'tools',
    authority: 'user',
    type: 'string[]',
    default: [],
    safeDirection: 'n/a',
    compilesTo: 'capability',
    why: 'The tool surface is the most personal part of a harness and the least transferable between operators.',
  },
  {
    key: 'tools.irreversible_requires_human',
    dimension: 'tools',
    authority: 'constitutional',
    type: 'string[]',
    default: [
      'git.tag_release',
      'npm.publish',
      'pr.merge',
      'db.ddl_destructive',
      'db.global_pause_write',
      'secrets.rotate',
      'secrets.inject',
      'chain.mainnet_write',
    ],
    safeDirection: 'n/a',
    compilesTo: 'rule',
    why: 'A published version can never be reused and a merged PR cannot be unmerged. No score buys these.',
  },
  {
    key: 'tools.untrusted_output_sources',
    dimension: 'tools',
    authority: 'vendor_default',
    type: 'string[]',
    default: ['mcp.supabase', 'mcp.github.comments', 'web.fetch', 'ci.logs'],
    safeDirection: 'n/a',
    compilesTo: 'rule',
    why: 'Tool output is data, never instructions. Naming the sources is what makes that checkable.',
  },
  {
    key: 'tools.unavailable_is_not_checked',
    dimension: 'tools',
    authority: 'constitutional',
    type: 'boolean',
    default: true,
    safeDirection: 'n/a',
    compilesTo: 'rule',
    why: 'A blocked host is NOT CHECKED, not FAILED. Reading it as failure is how a proxy 403 became a credential rotation.',
  },
  {
    key: 'tools.max_writes_per_session',
    dimension: 'tools',
    authority: 'earned',
    type: 'number',
    default: 0,
    min: 0,
    max: 10000,
    safeDirection: 'lower',
    compilesTo: 'setting',
    unlockedBy: 'receipts.write_ops_reconciled',
    why: 'Write volume is the cheapest proxy for blast radius, and it reconciles against git diff.',
  },

  // -- Memory --------------------------------------------------------------
  {
    key: 'memory.truth_precedence',
    dimension: 'memory',
    authority: 'org',
    type: 'string[]',
    default: ['live_db', 'repo_claude_md', 'handoff_doc', 'session_summary', 'model_prior'],
    safeDirection: 'n/a',
    compilesTo: 'rule',
    why: 'Nine "what do I do next" surfaces existed here at once. Precedence must be total and written down.',
  },
  {
    key: 'memory.max_fact_age_hours',
    dimension: 'memory',
    authority: 'user',
    type: 'number',
    default: 24,
    min: 1,
    max: 720,
    safeDirection: 'lower',
    compilesTo: 'setting',
    why: 'A cached fact past its age is NOT CHECKED, not false. Both wrong answers come from skipping the distinction.',
  },
  {
    key: 'memory.require_epistemic_tag',
    dimension: 'memory',
    authority: 'constitutional',
    type: 'boolean',
    default: true,
    safeDirection: 'n/a',
    compilesTo: 'rule',
    why: 'A stored conclusion without VERIFIED/INFERRED/ASSUMED lets the next reader inherit certainty nobody earned.',
  },
  {
    key: 'memory.settled_facts_reopen_requires_human',
    dimension: 'memory',
    authority: 'constitutional',
    type: 'boolean',
    default: true,
    safeDirection: 'n/a',
    compilesTo: 'rule',
    why: 'Re-litigating a settled question costs a session each time. Closing it must actually close it.',
  },
  {
    key: 'memory.writable_targets',
    dimension: 'memory',
    authority: 'user',
    type: 'string[]',
    default: ['session_summary', 'changelog', 'lessons'],
    safeDirection: 'n/a',
    compilesTo: 'capability',
    why: 'What an agent may remember into is a per-operator choice; what it may never write is not.',
  },
  {
    key: 'memory.forbid_prod_rows_as_fixtures',
    dimension: 'memory',
    authority: 'constitutional',
    type: 'boolean',
    default: true,
    safeDirection: 'n/a',
    compilesTo: 'rule',
    why: 'Real proofs and agent ids in git are unrecallable once pushed.',
  },

  // -- Reliability ---------------------------------------------------------
  {
    key: 'reliability.retry_network_max',
    dimension: 'reliability',
    authority: 'user',
    type: 'number',
    default: 4,
    min: 0,
    max: 10,
    safeDirection: 'lower',
    compilesTo: 'setting',
    why: 'Network is the only error class where a blind retry is correct.',
  },
  {
    key: 'reliability.retry_auth_max',
    dimension: 'reliability',
    authority: 'constitutional',
    type: 'number',
    default: 0,
    min: 0,
    max: 0,
    safeDirection: 'lower',
    compilesTo: 'setting',
    why: 'Retrying an auth failure locks accounts and teaches the agent the credential is broken when it is not.',
  },
  {
    key: 'reliability.retry_denied_max',
    dimension: 'reliability',
    authority: 'constitutional',
    type: 'number',
    default: 0,
    min: 0,
    max: 0,
    safeDirection: 'lower',
    compilesTo: 'setting',
    why: 'A denied call is a human decision. Re-issuing it verbatim overrides a person.',
  },
  {
    key: 'reliability.declare_surface_and_access',
    dimension: 'reliability',
    authority: 'constitutional',
    type: 'boolean',
    default: true,
    safeDirection: 'n/a',
    compilesTo: 'rule',
    why: 'Claiming a push from a session with no write access wastes the whole session before anyone notices.',
  },
  {
    key: 'reliability.harness_error_marks_not_checked',
    dimension: 'reliability',
    authority: 'constitutional',
    type: 'boolean',
    default: true,
    safeDirection: 'n/a',
    compilesTo: 'rule',
    why: 'A verifier that crashes and reports a clean session reproduces the exact defect it exists to catch.',
  },
  {
    key: 'reliability.circuit_breakers_default_closed',
    dimension: 'reliability',
    authority: 'org',
    type: 'string[]',
    default: ['chain.mainnet_write', 'trade.execution', 'onchain.reputation_write'],
    safeDirection: 'n/a',
    compilesTo: 'db',
    why: 'The dangerous paths should be off until switched on, not on until something notices.',
  },

  // -- Permissions ---------------------------------------------------------
  {
    key: 'permissions.tier',
    dimension: 'permissions',
    authority: 'earned',
    type: 'string',
    default: 'observer',
    safeDirection: 'n/a',
    compilesTo: 'db',
    unlockedBy: 'receipts.verified_sessions',
    why: 'The whole product is that this cannot be self-declared.',
  },
  {
    key: 'permissions.spend_limit_per_tx_usdc',
    dimension: 'permissions',
    authority: 'earned',
    type: 'number',
    default: 0,
    min: 0,
    max: 1000000,
    safeDirection: 'lower',
    compilesTo: 'db',
    unlockedBy: 'receipts.spend_within_declared_limit',
    why: 'Spend authority earned by observed behaviour is the difference between a limit and a wish.',
  },
  {
    key: 'permissions.spend_limit_daily_usdc',
    dimension: 'permissions',
    authority: 'earned',
    type: 'number',
    default: 0,
    min: 0,
    max: 10000000,
    safeDirection: 'lower',
    compilesTo: 'db',
    unlockedBy: 'receipts.spend_within_declared_limit',
    why: 'A per-transaction cap with no daily cap is not a cap.',
  },
  {
    key: 'permissions.org_ceiling_per_tx_usdc',
    dimension: 'permissions',
    authority: 'org',
    type: 'number',
    default: 0,
    min: 0,
    max: 1000000,
    safeDirection: 'lower',
    compilesTo: 'db',
    why: 'An institution must be able to cap its agents below whatever they have earned elsewhere.',
  },
  {
    key: 'permissions.grant_ttl_days',
    dimension: 'permissions',
    authority: 'org',
    type: 'number',
    default: 30,
    min: 1,
    max: 365,
    safeDirection: 'lower',
    compilesTo: 'db',
    why: 'A tier is a lease, not a property. Grants that never expire survive the evidence that justified them.',
  },
  {
    key: 'permissions.demotion_is_immediate',
    dimension: 'permissions',
    authority: 'constitutional',
    type: 'boolean',
    default: true,
    safeDirection: 'n/a',
    compilesTo: 'rule',
    why: 'The ratchet is asymmetric: promotion needs evidence and time, demotion needs neither.',
  },
  {
    key: 'permissions.promotion_lockup_days',
    dimension: 'permissions',
    authority: 'org',
    type: 'number',
    default: 14,
    min: 0,
    max: 365,
    safeDirection: 'higher',
    compilesTo: 'db',
    why: 'A burst of good sessions is not a track record. Time is part of the evidence.',
  },

  // -- Verification --------------------------------------------------------
  {
    key: 'verification.outcomes',
    dimension: 'verification',
    authority: 'constitutional',
    type: 'string[]',
    default: ['VERIFIED', 'NOT_CHECKED', 'FAILED'],
    safeDirection: 'n/a',
    compilesTo: 'rule',
    why: 'Two outcomes collapse "we did not look" into "it passed". Every false pass in LESSONS.md is this bug.',
  },
  {
    key: 'verification.claim_tiers_enabled',
    dimension: 'verification',
    authority: 'user',
    type: 'string[]',
    default: ['T0', 'T1'],
    safeDirection: 'n/a',
    compilesTo: 'capability',
    why: 'T2 costs an inference per claim and has an unmeasured false-positive rate; opting in is the operator’s call.',
  },
  {
    key: 'verification.checker_must_not_be_doer',
    dimension: 'verification',
    authority: 'constitutional',
    type: 'boolean',
    default: true,
    safeDirection: 'n/a',
    compilesTo: 'rule',
    why: 'A component grading its own output is the mechanism behind every self-reported green in this repo.',
  },
  {
    key: 'verification.repid_writes_require_receipt',
    dimension: 'verification',
    authority: 'constitutional',
    type: 'boolean',
    default: true,
    safeDirection: 'n/a',
    compilesTo: 'db',
    why: 'If a score can move without a receipt behind it, the score is a self-report with extra steps.',
  },
  {
    key: 'verification.liveness_signals_accepted',
    dimension: 'verification',
    authority: 'org',
    type: 'string[]',
    default: ['work'],
    safeDirection: 'n/a',
    compilesTo: 'db',
    why: 'An HTTP probe proves a port answers, not that an agent works. Twelve agents currently read as live on probe alone.',
  },
  {
    key: 'verification.self_challenge_threshold',
    dimension: 'verification',
    authority: 'agent_tunable',
    type: 'number',
    default: 0.8,
    min: 0.7,
    max: 0.95,
    safeDirection: 'higher',
    compilesTo: 'setting',
    why: 'Confidence below this forces the agent to challenge itself before asserting; it may raise the bar on itself, never lower it.',
  },
  {
    key: 'verification.verifier_panel_size',
    dimension: 'verification',
    authority: 'agent_tunable',
    type: 'number',
    default: 3,
    min: 2,
    max: 7,
    safeDirection: 'higher',
    compilesTo: 'setting',
    why: 'A panel of distinct lenses catches what redundancy cannot; shrinking it is the cheap way to make a claim pass.',
  },
  {
    key: 'verification.min_verified_sessions_for_promotion',
    dimension: 'verification',
    authority: 'org',
    type: 'number',
    default: 10,
    min: 1,
    max: 1000,
    safeDirection: 'higher',
    compilesTo: 'db',
    why: 'Promotion thresholds belong to whoever carries the risk, which is the institution, not the agent.',
  },
] as const;

const REGISTRY: ReadonlyMap<string, SettingSpec> = new Map(
  HARNESS_SETTINGS.map((s) => [s.key, s]),
);

export function getSettingSpec(key: string): SettingSpec | undefined {
  return REGISTRY.get(key);
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export type LayerValues = Partial<Record<string, unknown>>;

/**
 * One earned grant, as produced by the verification pillar.
 *
 * `receiptIds` is not decoration. A grant with an empty receipt list is refused,
 * because the only thing separating an earned setting from a declared one is
 * that somebody can go and re-check the receipts.
 */
export interface EarnedGrant {
  key: string;
  value: unknown;
  receiptIds: string[];
  grantedAt: string;
  expiresAt: string | null;
}

export interface ResolveInput {
  layers: Partial<Record<Layer, LayerValues>>;
  earned?: EarnedGrant[];
  /** ISO timestamp used for grant expiry. Injected so resolution is pure. */
  now: string;
}

export type ResolvedSource = Layer | 'default' | 'earned';

export interface ResolvedSetting {
  key: string;
  value: unknown;
  source: ResolvedSource;
  authority: Authority;
  dimension: Dimension;
  compilesTo: CompilesTo;
  /** True when a numeric value was pulled back inside [min,max]. */
  clamped: boolean;
  /** Receipt ids backing an earned value; empty for every other source. */
  evidence: string[];
}

export interface Rejection {
  key: string;
  layer: Layer | 'earned';
  value: unknown;
  reason:
    | 'unknown_key'
    | 'authority_forbids_layer'
    | 'wrong_type'
    | 'grant_without_evidence'
    | 'grant_expired'
    | 'loosens_without_evidence';
  detail: string;
}

export interface ResolvedProfile {
  settings: Record<string, ResolvedSetting>;
  rejections: Rejection[];
  /** Keys whose authority is `earned` that resolved to their floor. */
  unearned: string[];
}

function typeOk(spec: SettingSpec, value: unknown): boolean {
  switch (spec.type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string';
    case 'string[]':
      return Array.isArray(value) && value.every((v) => typeof v === 'string');
  }
}

function clamp(spec: SettingSpec, value: number): { value: number; clamped: boolean } {
  let out = value;
  if (spec.min !== undefined && out < spec.min) out = spec.min;
  if (spec.max !== undefined && out > spec.max) out = spec.max;
  return { value: out, clamped: out !== value };
}

/**
 * True when `candidate` is less cautious than `current` for this setting.
 *
 * Used only to police `agent_tunable`: an agent may tighten its own harness
 * freely, but may not loosen it. Humans are exempt — an operator turning their
 * own limits up is the product working, not an escalation.
 */
function loosens(spec: SettingSpec, current: unknown, candidate: unknown): boolean {
  if (spec.safeDirection === 'n/a') return false;
  if (typeof current !== 'number' || typeof candidate !== 'number') return false;
  return spec.safeDirection === 'lower' ? candidate > current : candidate < current;
}

/**
 * Resolve one profile from its layers.
 *
 * Two properties matter more than the mechanics:
 *
 *  1. Nothing is dropped silently. A value that cannot be applied appears in
 *     `rejections` with a reason, and a value that was clamped says so. A
 *     setting that quietly does nothing is indistinguishable from a check that
 *     quietly does not run, which is the defect this codebase keeps re-learning.
 *
 *  2. An `earned` setting with no valid grant lands on its floor and is listed
 *     in `unearned`. Absence of evidence resolves to least privilege, never to
 *     a comfortable default.
 */
export function resolveHarnessProfile(input: ResolveInput): ResolvedProfile {
  const settings: Record<string, ResolvedSetting> = {};
  const rejections: Rejection[] = [];
  const unearned: string[] = [];

  for (const spec of HARNESS_SETTINGS) {
    settings[spec.key] = {
      key: spec.key,
      value: spec.default,
      source: 'default',
      authority: spec.authority,
      dimension: spec.dimension,
      compilesTo: spec.compilesTo,
      clamped: false,
      evidence: [],
    };
  }

  for (const layer of LAYER_ORDER) {
    const values = input.layers[layer];
    if (!values) continue;

    for (const [key, raw] of Object.entries(values)) {
      const spec = REGISTRY.get(key);
      if (!spec) {
        rejections.push({
          key,
          layer,
          value: raw,
          reason: 'unknown_key',
          detail: `${key} is not in the harness registry; add a SettingSpec before setting it.`,
        });
        continue;
      }

      if (!WRITABLE_BY[spec.authority].has(layer)) {
        rejections.push({
          key,
          layer,
          value: raw,
          reason: 'authority_forbids_layer',
          detail:
            spec.authority === 'earned'
              ? `${key} is earned; it moves only on a receipt-backed grant, never from the ${layer} layer.`
              : `${key} has authority '${spec.authority}', which the ${layer} layer may not write.`,
        });
        continue;
      }

      if (!typeOk(spec, raw)) {
        rejections.push({
          key,
          layer,
          value: raw,
          reason: 'wrong_type',
          detail: `${key} expects ${spec.type}.`,
        });
        continue;
      }

      if (layer === 'agent' && loosens(spec, settings[key].value, raw)) {
        rejections.push({
          key,
          layer,
          value: raw,
          reason: 'loosens_without_evidence',
          detail: `An agent may tighten ${key} but not loosen it; ${String(raw)} is less cautious than ${String(settings[key].value)}.`,
        });
        continue;
      }

      let value = raw;
      let clamped = false;
      if (spec.type === 'number') {
        const c = clamp(spec, raw as number);
        value = c.value;
        clamped = c.clamped;
      }

      settings[key] = { ...settings[key], value, source: layer, clamped, evidence: [] };
    }
  }

  const nowMs = Date.parse(input.now);
  for (const grant of input.earned ?? []) {
    const spec = REGISTRY.get(grant.key);
    if (!spec) {
      rejections.push({
        key: grant.key,
        layer: 'earned',
        value: grant.value,
        reason: 'unknown_key',
        detail: `${grant.key} is not in the harness registry.`,
      });
      continue;
    }

    if (spec.authority !== 'earned') {
      rejections.push({
        key: grant.key,
        layer: 'earned',
        value: grant.value,
        reason: 'authority_forbids_layer',
        detail: `${grant.key} has authority '${spec.authority}'; a receipt-backed grant cannot set it.`,
      });
      continue;
    }

    if (grant.receiptIds.length === 0) {
      rejections.push({
        key: grant.key,
        layer: 'earned',
        value: grant.value,
        reason: 'grant_without_evidence',
        detail: `${grant.key} was granted with no receipt ids; an unbacked grant is a self-report.`,
      });
      continue;
    }

    if (grant.expiresAt !== null && Date.parse(grant.expiresAt) <= nowMs) {
      rejections.push({
        key: grant.key,
        layer: 'earned',
        value: grant.value,
        reason: 'grant_expired',
        detail: `${grant.key} expired at ${grant.expiresAt}; a lapsed grant falls back to the floor, not to its last value.`,
      });
      continue;
    }

    if (!typeOk(spec, grant.value)) {
      rejections.push({
        key: grant.key,
        layer: 'earned',
        value: grant.value,
        reason: 'wrong_type',
        detail: `${grant.key} expects ${spec.type}.`,
      });
      continue;
    }

    let value = grant.value;
    let clamped = false;
    if (spec.type === 'number') {
      const c = clamp(spec, grant.value as number);
      value = c.value;
      clamped = c.clamped;
    }

    settings[grant.key] = {
      ...settings[grant.key],
      value,
      source: 'earned',
      clamped,
      evidence: [...grant.receiptIds],
    };
  }

  // An org ceiling outranks anything an agent earned elsewhere. Reputation is
  // portable; it is not a claim on someone else's balance sheet.
  applyCeiling(settings, 'permissions.org_ceiling_per_tx_usdc', 'permissions.spend_limit_per_tx_usdc');

  for (const spec of HARNESS_SETTINGS) {
    if (spec.authority === 'earned' && settings[spec.key].source !== 'earned') {
      unearned.push(spec.key);
    }
  }

  return { settings, rejections, unearned };
}

function applyCeiling(
  settings: Record<string, ResolvedSetting>,
  ceilingKey: string,
  targetKey: string,
): void {
  const ceiling = settings[ceilingKey];
  const target = settings[targetKey];
  if (!ceiling || !target) return;
  if (ceiling.source === 'default') return;
  if (typeof ceiling.value !== 'number' || typeof target.value !== 'number') return;
  if (target.value <= ceiling.value) return;
  settings[targetKey] = { ...target, value: ceiling.value, clamped: true };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/**
 * Group a resolved profile by which layer actually decided each setting.
 *
 * This is the dogfooding instrument. The open question is not "should a harness
 * be personal" — it should — but *how much* of one can be personal before the
 * reputation it produces stops meaning anything. Counting where real profiles
 * land, across real onboarded operators, is how that line gets drawn from
 * evidence instead of taste.
 */
export function personalisationReport(profile: ResolvedProfile): {
  bySource: Record<ResolvedSource, string[]>;
  personalisedFraction: number;
  earnedFraction: number;
} {
  const bySource: Record<ResolvedSource, string[]> = {
    default: [],
    vendor: [],
    org: [],
    user: [],
    agent: [],
    earned: [],
  };

  for (const s of Object.values(profile.settings)) bySource[s.source].push(s.key);

  const total = Object.keys(profile.settings).length;
  const personalised = bySource.user.length + bySource.agent.length;
  return {
    bySource,
    personalisedFraction: total === 0 ? 0 : personalised / total,
    earnedFraction: total === 0 ? 0 : bySource.earned.length / total,
  };
}
