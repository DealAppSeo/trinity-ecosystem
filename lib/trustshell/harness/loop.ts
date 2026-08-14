// lib/trustshell/harness/loop.ts — the agent execution kernel.
//
// WHAT THIS IS FOR. `HarnessProfile` defines 47 settings across six dimensions,
// with authority tagging, bounds clamping and 31 assertions, and — measured
// 2026-08-14 — exactly ZERO production consumers. The same is true of the
// reliability modules beside this file, of MemoryRecall, of memory-authz, and
// of the identity layer. This is the missing consumer. The loop body is the
// small part; the enforcement points are the reason it exists.
//
// See docs/AGENT-LOOP-SCOPE.md for the measurement and the staging.
//
// ── THE ONE PROPERTY WORTH THE WHOLE FILE ────────────────────────────────────
//
// **An agent cannot self-certify above what the harness observed.**
//
// The recurring defect in this codebase is a system reporting success it has
// not earned: a skipped test scored as a pass, a build green over undefined
// references, a credential check green with no credential, a vault gate resting
// on a boolean nobody wrote evidence for. An agent loop is where that defect
// would find its widest surface, because the agent narrates its own outcome.
//
// So the model's claimed outcome is a CEILING REQUEST, not a verdict. The loop
// tracks what it actually observed and takes the weaker of the two. An agent
// that says VERIFIED after a blocked host, a denied call, or a harness error
// gets NOT_CHECKED, and no prompt can talk it out of that — the downgrade is
// arithmetic over recorded events, not a judgement the model participates in.
//
// ── PORTABILITY: WHY AUTHORIZATION ARRIVES THROUGH A PORT ────────────────────
//
// This directory may not import anything outside itself, and that is enforced
// (scripts/harness-portability-check.mjs). The capability algebra, ControlProof
// verification and caveat evaluation all live in lib/trustshell/identity/, so
// they cannot be imported here and must not be reimplemented here — a second
// copy of an authorization rule is a second thing to get wrong, and the two
// copies disagree silently.
//
// `Authorizer` is therefore a PORT. The identity-backed adapter lives outside
// this directory. The kernel stays shippable as a package, and the same kernel
// runs under a different trust system by supplying a different adapter.
//
// ── TWO GATES, DELIBERATELY REDUNDANT ────────────────────────────────────────
//
// Every tool call passes BOTH a policy gate (this file: allowlist, write
// budget, irreversible list) and the injected `Authorizer` (capability
// attenuation, caveats, the ControlProof). Neither is sufficient. Delegating
// everything to the port would mean a missing adapter is a fail-OPEN, and the
// port is the part a downstream integrator replaces. Duplicating the identity
// algebra here would be the silent-disagreement bug above.
//
// The redundancy has a known consequence, learned the expensive way in LESSONS
// A12: two checks that each make the other redundant are invisible to
// single-mutation testing, and "each one is individually redundant" is exactly
// the argument that deletes both. The suite mutates them as a PAIR.

import type { Clock } from './types';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * What a tool does to the world.
 *
 * Deliberately the same three values as `TranscriptParser.ToolEffect`, which
 * cannot be imported here. Two vocabularies for one concept would make the
 * loop's record and the transcript census disagree about what a write is, and
 * the census is what `tools.max_writes_per_session` reconciles against.
 *
 * `unknown` is a real answer, not a gap: `git status` and `rm -rf` arrive
 * through the same Bash tool, and the blast radius is not decidable from the
 * call alone.
 */
export type ToolEffect = 'write' | 'read' | 'unknown';

/** Three outcomes, never two. "We did not look" must not collapse into "it passed". */
export type Outcome = 'VERIFIED' | 'NOT_CHECKED' | 'FAILED';

/**
 * Ordering used to take the weaker of two outcomes.
 *
 * NOT a quality ranking — FAILED is not "worse" than NOT_CHECKED in any
 * business sense. It is a CLAIM-STRENGTH ranking: VERIFIED asserts the most and
 * therefore needs the most evidence, so it is the one a ceiling can revoke.
 */
const CLAIM_STRENGTH: Record<Outcome, number> = {
  FAILED: 0,
  NOT_CHECKED: 1,
  VERIFIED: 2,
};

/** The weaker claim of the two. */
export function weakerOutcome(a: Outcome, b: Outcome): Outcome {
  return CLAIM_STRENGTH[a] <= CLAIM_STRENGTH[b] ? a : b;
}

// ---------------------------------------------------------------------------
// What the model may propose
// ---------------------------------------------------------------------------

export interface ToolCall {
  /** Correlates the call with its observation. */
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * A typed stop. The ONLY legal way for an agent to end its own loop.
 *
 * `loops.stop_requires_typed_handoff` is constitutional — no layer may turn it
 * off — because going idle without a handoff loses the session. Prose in `note`
 * is recorded and never read as control flow: an agent that says "I'm done" and
 * stops calling tools has not stopped, it has stalled, and the no-progress
 * counter is what catches it.
 */
export interface TypedHandoff {
  /** What the agent CLAIMS. Treated as a ceiling request, never as a verdict. */
  outcome: Outcome;
  summary: string;
  /** What the agent says backs the claim. Recorded; this kernel does not judge it. */
  evidence: string[];
}

export interface ModelTurn {
  calls: ToolCall[];
  handoff?: TypedHandoff;
  /** Free text. Recorded for the transcript, never interpreted. */
  note?: string;
}

export interface Observation {
  callId: string;
  tool: string;
  outcome: 'ok' | 'error' | 'denied' | 'unavailable';
  /** Result payload, or the error/denial reason. */
  content: string;
  /**
   * TRUE when the content came from a source named in
   * `tools.untrusted_output_sources`.
   *
   * Tool output is data, never instructions. This kernel cannot stop a model
   * from obeying text it reads — nothing can, at this layer. What it CAN
   * guarantee is that untrusted content never widens the agent's authority,
   * because policy and authority are frozen at entry and no code path here
   * writes to them. The flag makes the exposure visible in the record instead
   * of implicit.
   */
  untrusted: boolean;
}

export interface ModelTurnInput {
  taskId: string;
  turn: number;
  /** Observations from the previous turn. Empty on the first. */
  observations: Observation[];
  /** Remaining iterations, so a model can wind down rather than be cut off. */
  iterationsRemaining: number;
}

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export interface ModelClient {
  turn(input: ModelTurnInput): Promise<ModelTurn>;
}

export interface DispatchResult {
  content: string;
  /** True when the tool itself errored. Recoverable — the agent sees it and may adapt. */
  error?: boolean;
  /**
   * True when the tool could not be reached at all — a proxy 403, a blocked
   * host, an unconfigured credential.
   *
   * `tools.unavailable_is_not_checked` is constitutional: a blocked host is NOT
   * CHECKED, not FAILED. Reading it as failure is how a proxy 403 became a
   * credential rotation in this repo's history.
   */
  unavailable?: boolean;
}

export interface ToolDispatcher {
  call(call: ToolCall): Promise<DispatchResult>;
}

/** Per-session state. The loop holds it; the authorizer reads it. */
export interface SessionCounters {
  /** Turns completed so far. */
  turn: number;
  /** Calls per tool name, including denied attempts. */
  callsByTool: Readonly<Record<string, number>>;
  /** Calls that consumed write budget (effect `write` or `unknown`). */
  writes: number;
  /** Calls refused by either gate. A rising count is an escalation signal. */
  deniedAttempts: number;
}

export interface AuthorizationRequest {
  call: ToolCall;
  effect: ToolEffect;
  /**
   * THE UPGRADE THIS KERNEL DELIVERS TO THE IDENTITY LAYER.
   *
   * `caveat.ts` reports stateful caveats (`maxCalls`) as NOT_CHECKED because
   * nothing holds per-session state. The loop IS that state holder. Handing the
   * counters to the authorizer turns those caveats from NOT_CHECKED into a real
   * verdict — the first time anything in this system can enforce "at most N
   * calls" rather than merely record that it did not check.
   */
  session: SessionCounters;
}

export type DenialKind =
  | 'not_in_allowlist'
  | 'irreversible_requires_human'
  | 'write_budget_exhausted'
  | 'authorizer_denied'
  | 'authorizer_error';

export type AuthorizationVerdict =
  | { allowed: true; reason: string }
  | { allowed: false; kind: DenialKind; reason: string };

export interface Authorizer {
  authorize(request: AuthorizationRequest): Promise<AuthorizationVerdict>;
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/**
 * The resolved settings this kernel enforces.
 *
 * Passed in already resolved rather than resolved here: `resolveHarnessProfile`
 * lives outside this directory and applies the authority ladder, bounds
 * clamping and earned-setting rules. Re-deriving any of that here would be a
 * second implementation of the authority model.
 *
 * Every field maps to a named setting, so a reader can trace an enforcement
 * point back to the spec that justifies it.
 */
export interface LoopPolicy {
  /** `loops.max_iterations_per_task` (default 25). */
  maxIterations: number;
  /** `loops.no_progress_abort_after` (default 3). */
  noProgressAbortAfter: number;
  /** `tools.allowed` (default []). Empty means NO tools — not "all tools". */
  toolsAllowed: readonly string[];
  /** `tools.irreversible_requires_human` (constitutional). No score buys these. */
  irreversibleRequiresHuman: readonly string[];
  /** `tools.untrusted_output_sources`. Output from these is flagged, not blocked. */
  untrustedOutputSources: readonly string[];
  /** `tools.max_writes_per_session` (earned, default 0). */
  maxWritesPerSession: number;
  /**
   * Tool name → effect. Looked up, NEVER accepted from the model.
   *
   * A model that could declare its own call a `read` would set its own blast
   * radius, which is self-report in the one place self-report costs the most.
   * Unlisted names are `unknown`.
   */
  toolEffects: Readonly<Record<string, ToolEffect>>;
}

/**
 * Whether a call spends write budget.
 *
 * `unknown` COUNTS. `rm -rf` and `git status` arrive through the same tool, so
 * treating unknown as a read would let the most dangerous calls through the
 * cheapest door. The consequence is deliberate and worth stating: with the
 * default `tools.max_writes_per_session` of 0, an agent may call only tools
 * explicitly classified `read`. Widening that is an operator act — classify the
 * tools, or earn the budget — not something the kernel assumes.
 */
function spendsWriteBudget(effect: ToolEffect): boolean {
  return effect !== 'read';
}

// ---------------------------------------------------------------------------
// Canonical fingerprinting, for progress detection
// ---------------------------------------------------------------------------

/**
 * Stable JSON. Key order is insertion order in a normal stringify, so two
 * identical argument objects built in different orders would fingerprint
 * differently and every repeated call would look like progress.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}

function callFingerprint(call: ToolCall): string {
  return `${call.name}${canonical(call.args)}`;
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export interface CallRecord {
  call: ToolCall;
  effect: ToolEffect;
  verdict: AuthorizationVerdict;
  /** Absent when the call was refused before dispatch. */
  observation?: Observation;
}

export interface TurnRecord {
  turn: number;
  /** From the injected clock. Attribution needs to know WHEN, not just what. */
  startedAt: number;
  note?: string;
  calls: CallRecord[];
  handoff?: TypedHandoff;
  /** False when this turn changed nothing observable. */
  madeProgress: boolean;
  progressReason: string;
}

export type StopReason =
  | 'typed_handoff'
  | 'iteration_budget_exhausted'
  | 'no_progress'
  | 'model_error';

export interface LoopResult {
  taskId: string;
  /** The final verdict: the weaker of what the agent claimed and what was observed. */
  outcome: Outcome;
  stopReason: StopReason;
  /** What the agent asked for. Present only when it produced a typed handoff. */
  claimed?: Outcome;
  /**
   * Set when the agent's claim was reduced.
   *
   * Named rather than silent, because a downgrade nobody can see is the same
   * failure as no downgrade at all.
   */
  downgradedBecause?: string;
  turns: TurnRecord[];
  session: SessionCounters;
  /** From the injected clock, like `RoutingDecision.decidedAt`. */
  endedAt: number;
  detail: string;
}

// ---------------------------------------------------------------------------
// The kernel
// ---------------------------------------------------------------------------

export interface RunAgentLoopInput {
  taskId: string;
  policy: LoopPolicy;
  model: ModelClient;
  tools: ToolDispatcher;
  /**
   * REQUIRED, with no default.
   *
   * An optional authorizer would make "forgot to pass one" indistinguishable
   * from "authorized everything", and the failure would be invisible in every
   * green test run.
   */
  authorizer: Authorizer;
  clock: Clock;
}

export async function runAgentLoop(input: RunAgentLoopInput): Promise<LoopResult> {
  const { taskId, model, tools, authorizer, clock } = input;

  // Copied and frozen at entry, and every collection snapshotted. This is what
  // makes "untrusted tool output cannot widen authority" a structural property
  // rather than a rule someone has to remember: there is no live path from a
  // caller's object into a decision this loop makes after it starts.
  //
  // WHICH PART DOES THE WORK — checked by mutation rather than assumed, because
  // the first version of this comment credited the wrong mechanism. The Sets
  // protect the two lists (built once, immune to a later push). The COPY is
  // what protects the scalars: `maxWritesPerSession` is read on every call, so
  // a live reference would let a caller raise the budget mid-run. Replacing the
  // copy with a reference survived the allowlist test for exactly that reason —
  // the snapshot was doing the work the freeze was being credited for.
  //
  // The freeze is shallow, so the honest scope of the guarantee is: the KERNEL
  // never widens its own policy, and no post-entry mutation of the caller's
  // object reaches these decisions.
  const policy: LoopPolicy = Object.freeze({ ...input.policy });
  const allowed = new Set(policy.toolsAllowed);
  const irreversible = new Set(policy.irreversibleRequiresHuman);
  const untrustedSources = new Set(policy.untrustedOutputSources);

  const turns: TurnRecord[] = [];
  const callsByTool: Record<string, number> = {};
  let writes = 0;
  let deniedAttempts = 0;

  // The ceiling. Starts at the strongest claim and only ever weakens.
  let ceiling: Outcome = 'VERIFIED';
  let ceilingReason = '';
  const lowerCeiling = (to: Outcome, why: string): void => {
    const next = weakerOutcome(ceiling, to);
    if (next !== ceiling) {
      ceiling = next;
      ceilingReason = why;
    }
  };

  /** Last result seen for each (tool, args). The basis of progress detection. */
  const lastResultFor = new Map<string, string>();

  let observations: Observation[] = [];
  let consecutiveNoProgress = 0;
  let stopReason: StopReason = 'iteration_budget_exhausted';
  let handoff: TypedHandoff | undefined;

  const counters = (): SessionCounters => ({
    turn: turns.length,
    callsByTool: { ...callsByTool },
    writes,
    deniedAttempts,
  });

  for (let turn = 1; turn <= policy.maxIterations; turn += 1) {
    const startedAt = clock.now();
    let proposed: ModelTurn;
    try {
      proposed = await model.turn({
        taskId,
        turn,
        observations,
        iterationsRemaining: policy.maxIterations - turn,
      });
    } catch (e) {
      // The MODEL failed, not the agent's task. `reliability.harness_error_marks_not_checked`:
      // a harness fault is not evidence about the work.
      lowerCeiling('NOT_CHECKED', `the model client threw on turn ${turn}: ${(e as Error).message}`);
      stopReason = 'model_error';
      turns.push({
        turn,
        startedAt,
        calls: [],
        madeProgress: false,
        progressReason: 'the model client threw',
      });
      break;
    }

    const records: CallRecord[] = [];
    observations = [];

    for (const call of proposed.calls) {
      const effect = policy.toolEffects[call.name] ?? 'unknown';
      callsByTool[call.name] = (callsByTool[call.name] ?? 0) + 1;

      const verdict = await decide({
        call,
        effect,
        allowed,
        irreversible,
        maxWrites: policy.maxWritesPerSession,
        writesSoFar: writes,
        authorizer,
        session: counters(),
      });

      if (!verdict.allowed) {
        deniedAttempts += 1;
        // A denial is NOT the end of the loop. The agent sees it and may adapt,
        // which is the behaviour worth having — an agent that tries a forbidden
        // tool and then routes around it is working correctly.
        //
        // It DOES lower the ceiling: a run in which something was refused has
        // not verified whatever that call was for.
        lowerCeiling(
          'NOT_CHECKED',
          verdict.kind === 'authorizer_error'
            ? `the authorizer could not answer and the call failed closed: ${verdict.reason}`
            : `a tool call was refused (${verdict.kind}): ${verdict.reason}`
        );
        const denial: Observation = {
          callId: call.id,
          tool: call.name,
          outcome: 'denied',
          content: verdict.reason,
          untrusted: false,
        };
        observations.push(denial);
        records.push({ call, effect, verdict, observation: denial });
        continue;
      }

      if (spendsWriteBudget(effect)) writes += 1;

      let result: DispatchResult;
      try {
        result = await tools.call(call);
      } catch (e) {
        result = { content: `tool threw: ${(e as Error).message}`, error: true };
      }

      const outcome: Observation['outcome'] = result.unavailable
        ? 'unavailable'
        : result.error
          ? 'error'
          : 'ok';

      if (outcome === 'unavailable') {
        lowerCeiling('NOT_CHECKED', `${call.name} was unreachable, so what it would have shown is unknown`);
      }

      const observation: Observation = {
        callId: call.id,
        tool: call.name,
        outcome,
        content: result.content,
        untrusted: untrustedSources.has(call.name),
      };
      observations.push(observation);
      records.push({ call, effect, verdict, observation });
    }

    const { madeProgress, progressReason } = assessProgress({
      proposed,
      records,
      lastResultFor,
    });

    turns.push({
      turn,
      startedAt,
      note: proposed.note,
      calls: records,
      handoff: proposed.handoff,
      madeProgress,
      progressReason,
    });

    if (proposed.handoff) {
      handoff = proposed.handoff;
      stopReason = 'typed_handoff';
      break;
    }

    consecutiveNoProgress = madeProgress ? 0 : consecutiveNoProgress + 1;
    if (consecutiveNoProgress >= policy.noProgressAbortAfter) {
      stopReason = 'no_progress';
      break;
    }
  }

  // ── The verdict ──────────────────────────────────────────────────────────
  //
  // Every path that is not a typed handoff is NOT_CHECKED, never FAILED.
  // Running out of iterations means the work was not finished; it does not mean
  // the work failed. Collapsing the two is exactly the two-outcome bug this
  // codebase keeps paying for.
  if (stopReason === 'iteration_budget_exhausted') {
    lowerCeiling(
      'NOT_CHECKED',
      `the iteration budget of ${policy.maxIterations} was exhausted without a typed handoff`
    );
  }
  if (stopReason === 'no_progress') {
    lowerCeiling(
      'NOT_CHECKED',
      `${policy.noProgressAbortAfter} consecutive turns changed nothing observable`
    );
  }

  const claimed = handoff?.outcome;
  const outcome = claimed === undefined ? ceiling : weakerOutcome(claimed, ceiling);
  const downgraded = claimed !== undefined && outcome !== claimed;

  return {
    taskId,
    outcome,
    stopReason,
    claimed,
    downgradedBecause: downgraded ? ceilingReason : undefined,
    turns,
    session: counters(),
    endedAt: clock.now(),
    detail: describe(stopReason, claimed, outcome, ceilingReason),
  };
}

// ---------------------------------------------------------------------------
// The two gates
// ---------------------------------------------------------------------------

async function decide(args: {
  call: ToolCall;
  effect: ToolEffect;
  allowed: ReadonlySet<string>;
  irreversible: ReadonlySet<string>;
  maxWrites: number;
  writesSoFar: number;
  authorizer: Authorizer;
  session: SessionCounters;
}): Promise<AuthorizationVerdict> {
  const { call, effect } = args;

  // GATE 1 — policy over the loop's own state.
  //
  // An empty allowlist means NO tools. Not "unset, so allow everything": a
  // default that widens on absence is how an unconfigured deployment becomes
  // the most permissive one.
  if (!args.allowed.has(call.name)) {
    return {
      allowed: false,
      kind: 'not_in_allowlist',
      reason: `${call.name} is not in tools.allowed`,
    };
  }

  // Constitutional, and checked before anything that could be earned. No
  // reputation, capability or caveat buys a release tag or a merged PR back.
  if (args.irreversible.has(call.name)) {
    return {
      allowed: false,
      kind: 'irreversible_requires_human',
      reason:
        `${call.name} is irreversible and requires a human. This is constitutional — ` +
        'no score, capability or grant unlocks it.',
    };
  }

  if (spendsWriteBudget(effect) && args.writesSoFar >= args.maxWrites) {
    return {
      allowed: false,
      kind: 'write_budget_exhausted',
      reason:
        `tools.max_writes_per_session is ${args.maxWrites} and ${args.writesSoFar} ` +
        `have been spent. ${call.name} has effect '${effect}', which counts` +
        (effect === 'unknown' ? " — unknown counts, because rm -rf and git status share a tool." : '.'),
    };
  }

  // GATE 2 — the identity layer, through the port. Capability attenuation,
  // caveats and the ControlProof live there and are not reimplemented here.
  try {
    return await args.authorizer.authorize({ call, effect, session: args.session });
  } catch (e) {
    // FAIL CLOSED. An authorizer that cannot answer has not said yes.
    return {
      allowed: false,
      kind: 'authorizer_error',
      reason: `the authorizer threw and the call was refused: ${(e as Error).message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/**
 * Did this turn change anything observable?
 *
 * THE DEFINITION, stated because it is the one enforcement point in this file
 * that the spec does not pin down (docs/AGENT-LOOP-SCOPE.md flags it as the open
 * decision):
 *
 *   A turn makes progress if it produced at least one tool result DIFFERING
 *   from the previous result for the same (tool, arguments).
 *
 * It needs no semantics, costs one hash per call, and catches the observed
 * failure mode — an agent retrying an identical call and getting an identical
 * answer. It MISFIRES on legitimately idempotent polling, where the honest
 * answer is genuinely the same twice; that is a known cost, stated rather than
 * discovered, and the reason `loops.no_progress_abort_after` defaults to 3
 * rather than 1.
 *
 * A turn that proposes no tool calls and no handoff makes no progress by
 * definition. That is the classic stall: an agent that says it is finished and
 * does not stop. `loops.stop_requires_typed_handoff` means prose is not an
 * exit, so this counter is what ends it.
 */
function assessProgress(args: {
  proposed: ModelTurn;
  records: CallRecord[];
  lastResultFor: Map<string, string>;
}): { madeProgress: boolean; progressReason: string } {
  const { proposed, records, lastResultFor } = args;

  if (proposed.handoff) {
    return { madeProgress: true, progressReason: 'the turn produced a typed handoff' };
  }
  if (records.length === 0) {
    return {
      madeProgress: false,
      progressReason:
        'no tool calls and no handoff — prose is not an exit, so this is a stall, not a stop',
    };
  }

  let progressed = false;
  const reasons: string[] = [];
  for (const record of records) {
    if (!record.observation) continue;
    const key = callFingerprint(record.call);
    const fingerprint = `${record.observation.outcome}${record.observation.content}`;
    const previous = lastResultFor.get(key);
    lastResultFor.set(key, fingerprint);
    if (previous === undefined) {
      progressed = true;
      reasons.push(`${record.call.name} had not been called with these arguments before`);
    } else if (previous !== fingerprint) {
      progressed = true;
      reasons.push(`${record.call.name} returned a different result than last time`);
    }
  }

  if (progressed) return { madeProgress: true, progressReason: reasons.join('; ') };
  return {
    madeProgress: false,
    progressReason: 'every call repeated an earlier call and returned the identical result',
  };
}

// ---------------------------------------------------------------------------

function describe(
  stopReason: StopReason,
  claimed: Outcome | undefined,
  outcome: Outcome,
  ceilingReason: string
): string {
  const head =
    stopReason === 'typed_handoff'
      ? `the agent stopped with a typed handoff claiming ${claimed}`
      : stopReason === 'no_progress'
        ? 'the agent was stopped after consecutive turns that changed nothing observable'
        : stopReason === 'model_error'
          ? 'the model client threw, so the run says nothing about the task'
          : 'the agent ran out of iterations without a typed handoff';

  if (claimed !== undefined && outcome !== claimed) {
    return `${head}, reduced to ${outcome} because ${ceilingReason}. An agent cannot certify above what the harness observed.`;
  }
  return `${head}; final outcome ${outcome}.`;
}
