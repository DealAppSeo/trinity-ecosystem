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
// `Evaluator` is the second port, for the same reason and one more: it must be
// switchable, because whether a three-provider BFT panel beats a single tuned
// evaluator at judging agent work is an open measurement, and a design that
// cannot be switched off cannot be A/B'd.
//
// ── WHAT THE CEILING CANNOT SEE ──────────────────────────────────────────────
//
// The ceiling is arithmetic and therefore incorruptible, which is also its
// limit: every call can succeed, every budget hold, and the work still be a
// stub that returns the expected shape. No count catches that. The `Evaluator`
// port supplies the judgement the arithmetic cannot, and the kernel constrains
// the judge in the two ways a judge can be wrong in our favour — it compares
// DIDs rather than trusting a claim of independence
// (`verification.checker_must_not_be_doer`), and it enforces per-criterion
// floors itself, so a lenient evaluator cannot pass work under its own floor.
//
// ── SPEND IS INSTRUMENTED, AND NEVER JUDGES ──────────────────────────────────
//
// `SpendSummary` measures the run and imposes nothing on it. An unreported cost
// is UNKNOWN, never zero — a run that looks free because nothing measured it is
// this file's own defect with a different unit — but how well we measured cost
// is not evidence about the task, so no part of the spend accounting touches
// the ceiling.
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
// A13: two checks that each make the other redundant are invisible to
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

/**
 * What one call cost, as reported by whoever made it.
 *
 * ALWAYS OPTIONAL, AND ITS ABSENCE IS NOT ZERO. A port that does not report
 * usage has not told us the call was free — it has told us nothing. Summing
 * absent usage as 0 would produce a run that looks costless because nothing
 * measured it, which is this codebase's defining defect wearing an accountant's
 * hat. `Figure` carries the distinction; see `SpendSummary`.
 */
export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  /** Cost in USD, when the caller can price it. Absent is not free. */
  costUsd?: number;
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
  /** What this turn cost the model client. Absent is UNKNOWN, not free. */
  usage?: Usage;
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
  /** What this call cost the dispatcher. Absent is UNKNOWN, not free. */
  usage?: Usage;
}

export interface ToolDispatcher {
  call(call: ToolCall): Promise<DispatchResult>;
}

/**
 * Per-session state. The loop holds it; the authorizer reads it.
 *
 * EVERY COUNT EXCLUDES THE CALL BEING AUTHORIZED. "Calls so far" means before
 * this one, which is what a limit of N has to mean if N calls are to be
 * permitted — `caveat.ts` evaluates `maxCalls` as `callsSoFar < limit` for
 * exactly this reason. Stated on the type rather than left to each adapter,
 * because an off-by-one here silently grants or refuses one extra call and the
 * boundary is the only place it shows.
 */
export interface SessionCounters {
  /** Turns completed so far. */
  turn: number;
  /** Calls across all tools, denied attempts included. */
  totalCalls: number;
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
// Evaluation — the second port, and the one the ceiling cannot replace
// ---------------------------------------------------------------------------
//
// WHY A SEPARATE PORT RATHER THAN MORE CEILING LOGIC. The claim ceiling is
// arithmetic over recorded events: it catches denials, unreachable tools and
// exhausted budgets without a model in the loop, and it is not fooled by
// anything the agent says. What it structurally CANNOT see is a stubbed
// feature, a test that asserts nothing, or code that runs and is wrong — every
// call succeeded, every budget held, and the run is worthless. That needs
// judgement, and judgement needs an independent judge.
//
// `verification.checker_must_not_be_doer` has been constitutional since it was
// written and has never had a consumer. It gets one here, and it is enforced by
// comparing DIDs rather than by trusting a flag: an adapter that reported its
// own independence would be self-certifying the one property the whole design
// rests on.
//
// The port is OPTIONAL so it can be A/B'd and switched off — a single tuned
// evaluator against the BFT panel is an open measurement
// (docs/TRUST-HARNESS-DESIGN-2026-08-15.md §4.3), and a design that cannot be
// switched off cannot be compared. Switching it off is not free: with
// `requireIndependentEvaluation` the run's ceiling drops to NOT_CHECKED, so an
// unevaluated run is visibly unevaluated rather than quietly certified.

/**
 * One thing that must be true for the work to count.
 *
 * Agreed BEFORE the work (the pre-execution contract, build order step 3), not
 * asserted after it. This kernel does not yet negotiate the contract; it
 * enforces the half that exists — the criteria are an input to the run, so they
 * cannot be chosen once the outcome is known.
 */
export interface Criterion {
  id: string;
  /** What must hold. Prose: the evaluator reads it, this kernel never interprets it. */
  statement: string;
  /**
   * A hard floor in [0, 1], when this criterion is scored.
   *
   * HARD, AND ENFORCED HERE RATHER THAN BY THE EVALUATOR. A lenient evaluator
   * that returns VERIFIED with a score under the floor is overruled — otherwise
   * the floor is only as strong as the judge it was meant to constrain. There
   * is no averaging across criteria: one criterion below its floor fails the
   * unit of work, because a mean lets a strong result pay for a broken one.
   */
  minScore?: number;
}

export interface EvaluationRequest {
  taskId: string;
  criteria: readonly Criterion[];
  /** The full record of what happened. The evaluator judges evidence, not narration. */
  turns: readonly TurnRecord[];
  /** What the agent claimed, as context. Supplied for calibration, never as the answer. */
  claimed?: Outcome;
  /**
   * The doer's identity, when the caller knows it.
   *
   * Passed so the evaluator can refuse to judge itself, and — more importantly —
   * so the kernel can check independence without asking either party.
   */
  doerDid?: string;
}

export interface CriterionVerdict {
  criterionId: string;
  outcome: Outcome;
  /**
   * The evaluator's score in [0, 1], when it scored this criterion.
   *
   * ABSENT IS NOT A PASS. A criterion carrying a `minScore` with no score is
   * NOT_CHECKED: the floor was never tested. That is the whole three-outcome
   * rule applied one level down.
   */
  score?: number;
  detail: string;
}

export interface Evaluation {
  verdicts: readonly CriterionVerdict[];
  /**
   * The evaluator's own DID.
   *
   * Absent means independence CANNOT BE ESTABLISHED, which is not the same as
   * independence being absent — and is treated as NOT_CHECKED, not as a pass.
   */
  evaluatorDid?: string;
  /** What the evaluation cost. Absent is UNKNOWN, not free. */
  usage?: Usage;
  detail: string;
}

export interface Evaluator {
  evaluate(request: EvaluationRequest): Promise<Evaluation>;
}

/** What the evaluation contributed, and whether it was entitled to contribute it. */
export interface EvaluationRecord {
  /** False when no evaluator was configured, or there was nothing to evaluate. */
  ran: boolean;
  evaluation?: Evaluation;
  /**
   * Whether checker ≠ doer was ESTABLISHED.
   *
   * `null` is a third state and it matters: it means one of the two DIDs was
   * missing, so the question was never answered. Collapsing it to `false` would
   * report a violation that may not have happened; collapsing it to `true`
   * would certify the constitutional invariant on no evidence.
   */
  independent: boolean | null;
  /** The ceiling this evaluation imposes on the run. */
  outcome: Outcome;
  detail: string;
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
  /**
   * `verification.requires_independent_evaluation`. **Absent means TRUE.**
   *
   * The polarity is deliberate and is the opposite of the convenient one.
   * Forgetting this setting must give the strict behaviour, because the failure
   * mode of the lenient default is a run that self-certifies VERIFIED with no
   * judge and no sign that anything is missing — which is indistinguishable, in
   * the record, from a run that was properly evaluated.
   *
   * Turning it off is legitimate (A/B against a single tuned evaluator, or a
   * kernel embedded somewhere the evaluator lives upstream). It is an explicit
   * `false`, in the record, attributable to whoever wrote it.
   */
  requireIndependentEvaluation?: boolean;
}

// ---------------------------------------------------------------------------
// Spend
// ---------------------------------------------------------------------------
//
// Instrumentation, not enforcement. Nothing in this section may lower the run's
// ceiling: how well we measured cost is not evidence about the task. A run
// whose model client reports no token counts is a run we cannot cost — it is
// not a run that failed, and conflating the two would make the instrumentation
// a source of false verdicts, which is a strictly worse trade than not
// measuring at all.
//
// Baseline first, per build order step 1. Cost-per-verified-outcome is the
// number docs/TRUST-HARNESS-DESIGN-2026-08-15.md §4.4 says we do not have, and
// Anthropic's 8.3%-on-$124.70 figure is theirs, not ours. `SpendSummary` beside
// `LoopResult.outcome` is one run's worth of ours.

/**
 * One measured quantity, with the coverage that makes it readable.
 *
 * `total` ALONE IS A LIE and the other fields are what stop it being one. A
 * `costUsd.total` of 12.50 over `reported: 3, missing: 40` is not "the run cost
 * $12.50" — it is "3 of 43 events cost $12.50 between them and the rest are
 * unknown." Reporting the sum without the coverage is the accountant's version
 * of a skipped test scored as a pass.
 */
export interface Figure {
  /** Sum across events that reported a usable value. */
  total: number;
  /** Events that reported a usable value. */
  reported: number;
  /** Events that reported nothing for this field. Their true value is UNKNOWN. */
  missing: number;
  /**
   * Events whose reported value was unusable — NaN, Infinity, negative, or not
   * a number.
   *
   * Counted separately from `missing` because it is worse. An absent figure
   * says nothing; a malformed one asserts something false, and summing a single
   * NaN turns the whole total into NaN with no indication of which event did
   * it. Malformed values are REJECTED, never summed.
   */
  malformed: number;
}

/** What one phase of the run cost. */
export interface PhaseSpend {
  /** Events attributed to this phase: model turns, tool calls, evaluations. */
  events: number;
  inputTokens: Figure;
  outputTokens: Figure;
  costUsd: Figure;
}

export interface SpendSummary {
  /** Model turns — the agent thinking. */
  model: PhaseSpend;
  /** Tool dispatch — the agent acting. */
  tools: PhaseSpend;
  /** Evaluation — the overhead the accountable verifier costs. */
  evaluation: PhaseSpend;
  /** The three above, added. Same coverage caveats. */
  total: PhaseSpend;
  /**
   * The quality of the MEASUREMENT, not of the work.
   *
   * VERIFIED — every event reported every figure.
   * NOT_CHECKED — something did not report, so the total understates by an
   *   unknown amount.
   * FAILED — a figure arrived malformed. The measurement is not merely
   *   incomplete, it is wrong, and that is a defect in a port rather than a
   *   gap in coverage.
   */
  outcome: Outcome;
  detail: string;
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
  /**
   * As reported by the dispatcher. Absent on a refused call because nothing
   * ran — that is the one absence here that genuinely IS zero, and it is the
   * reason denied calls are excluded from the tool phase's event count rather
   * than counted as unreported.
   */
  usage?: Usage;
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
  /** As reported by the model client. Absent is UNKNOWN, not free. */
  usage?: Usage;
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
  /**
   * What the run cost, per phase.
   *
   * Always present, even when nothing reported anything — a run with no spend
   * data has a `SpendSummary` saying so, which is the readable form of "we did
   * not measure". Omitting the field on an unmeasured run would make
   * unmeasured and free look the same to every consumer.
   */
  spend: SpendSummary;
  /** Present whenever an evaluator was configured — including when it refused or threw. */
  evaluation?: EvaluationRecord;
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
  /**
   * OPTIONAL, unlike the authorizer, and the asymmetry is the point.
   *
   * A missing authorizer would fail OPEN — every call permitted, invisibly. A
   * missing evaluator fails CLOSED: `requireIndependentEvaluation` defaults on,
   * so the run's ceiling drops to NOT_CHECKED and the absence is named in the
   * result. An absence that costs something is an absence somebody notices.
   */
  evaluator?: Evaluator;
  /**
   * What the work must satisfy, fixed before the run.
   *
   * An empty or absent list is NOT a pass. Evaluating against nothing
   * establishes nothing, and treating it as success would make "forget the
   * criteria" the cheapest way past the judge.
   */
  criteria?: readonly Criterion[];
  /**
   * The doer's DID, for the checker-must-not-be-doer comparison.
   *
   * Absent means the comparison cannot be made, and the run is capped at
   * NOT_CHECKED for that reason alone when independent evaluation is required.
   */
  doerDid?: string;
  clock: Clock;
}

export async function runAgentLoop(input: RunAgentLoopInput): Promise<LoopResult> {
  const { taskId, model, tools, authorizer, evaluator, clock } = input;
  const criteria = input.criteria ?? [];

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

  let totalCalls = 0;
  const counters = (): SessionCounters => ({
    turn: turns.length,
    totalCalls,
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
      // No `usage` on this turn, and that is honest rather than tidy: a client
      // that threw may still have burned tokens, and we do not know how many.
      // Recording a zero here would be the one place a real cost is provably
      // understated.
      break;
    }

    const records: CallRecord[] = [];
    observations = [];

    for (const call of proposed.calls) {
      const effect = policy.toolEffects[call.name] ?? 'unknown';

      // Snapshot BEFORE incrementing. `SessionCounters` means "before this
      // call" — see the type. Incrementing first would hand the authorizer a
      // count that includes the call it is being asked to rule on, and a
      // `maxCalls: 2` caveat would then permit only one.
      const session = counters();
      callsByTool[call.name] = (callsByTool[call.name] ?? 0) + 1;
      totalCalls += 1;

      const verdict = await decide({
        call,
        effect,
        allowed,
        irreversible,
        maxWrites: policy.maxWritesPerSession,
        writesSoFar: writes,
        authorizer,
        session,
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
        // No `usage`: the dispatcher was never reached, so this call really did
        // cost nothing. `accruePhase` is given only dispatched calls, so a
        // denial does not inflate the unreported count and make coverage look
        // worse than it is.
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
      records.push({ call, effect, verdict, observation, usage: result.usage });
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
      usage: proposed.usage,
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

  // ── Evaluation ───────────────────────────────────────────────────────────
  //
  // Runs on EVERY path that reaches here, including no-progress and
  // model_error, and that is deliberate. Evaluating only the runs that ended in
  // a confident handoff would mean the evidence base consists exclusively of
  // work the agent felt good about — a selection bias built into the record,
  // and precisely backwards for a system whose purpose is catching claims that
  // outrun their evidence. Failed runs are where the useful verdicts are.
  const evaluation = evaluator
    ? await runEvaluation({ evaluator, taskId, criteria, turns, claimed: handoff?.outcome, doerDid: input.doerDid })
    : undefined;

  if (evaluation) {
    lowerCeiling(evaluation.outcome, evaluation.detail);
  } else if (policy.requireIndependentEvaluation !== false) {
    lowerCeiling(
      'NOT_CHECKED',
      'no evaluator was configured and verification.requires_independent_evaluation is on, ' +
        'so nothing independent examined the work'
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
    // ATTEMPTED, not succeeded. An evaluator that threw may still have burned
    // tokens, so the event is counted with unknown cost rather than dropped —
    // dropping it would price a failed evaluation at exactly zero, which is the
    // one thing we know it might not be.
    spend: summariseSpend(turns, evaluation?.evaluation?.usage, evaluator !== undefined && criteria.length > 0),
    evaluation,
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
// Evaluation
// ---------------------------------------------------------------------------

async function runEvaluation(args: {
  evaluator: Evaluator;
  taskId: string;
  criteria: readonly Criterion[];
  turns: readonly TurnRecord[];
  claimed?: Outcome;
  doerDid?: string;
}): Promise<EvaluationRecord> {
  const { evaluator, taskId, criteria, turns, claimed, doerDid } = args;

  // Judging against nothing establishes nothing. If an empty criteria list read
  // as a pass, "forget to write the contract" would be the cheapest route past
  // the judge, and it would look identical in the record to a clean run.
  if (criteria.length === 0) {
    return {
      ran: false,
      independent: null,
      outcome: 'NOT_CHECKED',
      detail:
        'an evaluator was configured but no criteria were agreed, so there was nothing to judge against',
    };
  }

  let evaluation: Evaluation;
  try {
    evaluation = await evaluator.evaluate({ taskId, criteria, turns, claimed, doerDid });
  } catch (e) {
    // `reliability.harness_error_marks_not_checked`. A judge that crashed has
    // said nothing about the work, and reading its crash as a verdict would
    // make an outage look like a defect in the code under test.
    return {
      ran: false,
      independent: null,
      outcome: 'NOT_CHECKED',
      detail: `the evaluator threw, so the work was never judged: ${(e as Error).message}`,
    };
  }

  const independence = assessIndependence(doerDid, evaluation.evaluatorDid);
  const judged = scoreCriteria(criteria, evaluation.verdicts);

  // SELF-EVALUATION CAN CONDEMN BUT CANNOT CERTIFY, and this one line is where
  // that holds. Capping at NOT_CHECKED leaves a FAILED verdict intact —
  // `weakerOutcome(FAILED, NOT_CHECKED)` is FAILED — while a VERIFIED from a
  // judge that is the doer becomes NOT_CHECKED. The asymmetry is right:
  // an agent marking its own work bad is credible in a way that an agent
  // marking its own work good is not.
  const outcome =
    independence.independent === true ? judged.outcome : weakerOutcome(judged.outcome, 'NOT_CHECKED');

  return {
    ran: true,
    evaluation,
    independent: independence.independent,
    outcome,
    detail: `${judged.detail} ${independence.reason}.`,
  };
}

/**
 * `verification.checker_must_not_be_doer`, checked cryptographically rather
 * than by policy — the thing a third party can verify without trusting us.
 *
 * DIDs are trimmed before comparison. A trailing space would make an identity
 * differ from itself, which is a one-character bypass of the single invariant
 * every other guarantee in this design rests on.
 */
function assessIndependence(
  doerDid: string | undefined,
  evaluatorDid: string | undefined
): { independent: boolean | null; reason: string } {
  const doer = doerDid?.trim();
  const judge = evaluatorDid?.trim();

  if (!doer || !judge) {
    const missing = !doer && !judge ? 'neither party' : !doer ? 'the doer' : 'the evaluator';
    return {
      independent: null,
      reason:
        `checker-must-not-be-doer could not be established because ${missing} supplied a DID, ` +
        'so independence is unproven rather than absent',
    };
  }
  if (doer === judge) {
    return {
      independent: false,
      reason:
        `the evaluator and the doer are the same identity (${doer}), which ` +
        'verification.checker_must_not_be_doer forbids — this evaluation may condemn but may not certify',
    };
  }
  return {
    independent: true,
    reason: `the evaluator (${judge}) is a different identity from the doer (${doer})`,
  };
}

/** A usable score: a real number inside [0, 1]. Anything else is untested, not passed. */
function usableScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Fold per-criterion verdicts into one outcome.
 *
 * NO AVERAGING. One criterion below its floor fails the unit of work, because a
 * mean lets a strong result pay for a broken one — which is the arithmetic form
 * of shipping a feature with its security check stubbed out and calling it 90%
 * done.
 */
function scoreCriteria(
  criteria: readonly Criterion[],
  verdicts: readonly CriterionVerdict[]
): { outcome: Outcome; detail: string } {
  // On duplicate ids, KEEP THE WEAKER. An evaluator that emits both FAILED and
  // VERIFIED for one criterion has contradicted itself, and last-write-wins
  // would make the outcome depend on array order.
  const byId = new Map<string, CriterionVerdict>();
  for (const verdict of verdicts) {
    const existing = byId.get(verdict.criterionId);
    if (!existing || weakerOutcome(verdict.outcome, existing.outcome) === verdict.outcome) {
      byId.set(verdict.criterionId, verdict);
    }
  }

  let worst: Outcome = 'VERIFIED';
  const notes: string[] = [];

  for (const criterion of criteria) {
    const verdict = byId.get(criterion.id);
    if (!verdict) {
      worst = weakerOutcome(worst, 'NOT_CHECKED');
      notes.push(`'${criterion.id}' was not judged at all`);
      continue;
    }

    // The floor is enforced HERE, not by the evaluator. A lenient judge that
    // returns VERIFIED with a score under the floor is overruled — otherwise
    // the floor is only ever as strong as the judge it exists to constrain.
    let floorOutcome: Outcome = 'VERIFIED';
    if (criterion.minScore !== undefined) {
      if (!usableScore(verdict.score)) {
        floorOutcome = 'NOT_CHECKED';
        notes.push(
          `'${criterion.id}' carries a floor of ${criterion.minScore} but no usable score, ` +
            'so the floor was never tested'
        );
      } else if (verdict.score < criterion.minScore) {
        floorOutcome = 'FAILED';
        notes.push(
          `'${criterion.id}' scored ${verdict.score}, below its hard floor of ${criterion.minScore}`
        );
      }
    }

    const combined = weakerOutcome(verdict.outcome, floorOutcome);
    if (verdict.outcome !== 'VERIFIED') {
      notes.push(`'${criterion.id}' was judged ${verdict.outcome}: ${verdict.detail}`);
    }
    worst = weakerOutcome(worst, combined);
  }

  if (worst === 'VERIFIED') {
    return {
      outcome: 'VERIFIED',
      detail: `all ${criteria.length} agreed criteria were judged VERIFIED and met their floors;`,
    };
  }
  return { outcome: worst, detail: `evaluation returned ${worst} — ${notes.join('; ')};` };
}

// ---------------------------------------------------------------------------
// Spend
// ---------------------------------------------------------------------------

function emptyFigure(): Figure {
  return { total: 0, reported: 0, missing: 0, malformed: 0 };
}

function emptyPhase(): PhaseSpend {
  return {
    events: 0,
    inputTokens: emptyFigure(),
    outputTokens: emptyFigure(),
    costUsd: emptyFigure(),
  };
}

/**
 * Typed `unknown` on purpose. These values cross a port boundary, and the
 * compiler's `number` is a claim about a JavaScript caller that may not be
 * compiled at all. A single NaN summed here poisons the total with no record of
 * which event produced it.
 */
function accrueFigure(figure: Figure, value: unknown): void {
  if (value === undefined || value === null) {
    figure.missing += 1;
    return;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    figure.malformed += 1;
    return;
  }
  figure.total += value;
  figure.reported += 1;
}

function accruePhase(phase: PhaseSpend, usage: Usage | undefined): void {
  phase.events += 1;
  accrueFigure(phase.inputTokens, usage?.inputTokens);
  accrueFigure(phase.outputTokens, usage?.outputTokens);
  accrueFigure(phase.costUsd, usage?.costUsd);
}

function summariseSpend(
  turns: readonly TurnRecord[],
  evaluationUsage: Usage | undefined,
  evaluationAttempted: boolean
): SpendSummary {
  const model = emptyPhase();
  const tools = emptyPhase();
  const evaluation = emptyPhase();
  const total = emptyPhase();

  for (const turn of turns) {
    accruePhase(model, turn.usage);
    accruePhase(total, turn.usage);
    for (const record of turn.calls) {
      // Refused calls never reached the dispatcher, so they are not events with
      // an unknown cost — they are events with no cost. Counting them would
      // report worse coverage than the run actually has.
      if (!record.verdict.allowed) continue;
      accruePhase(tools, record.usage);
      accruePhase(total, record.usage);
    }
  }

  if (evaluationAttempted) {
    accruePhase(evaluation, evaluationUsage);
    accruePhase(total, evaluationUsage);
  }

  const figures = [total.inputTokens, total.outputTokens, total.costUsd];
  const malformed = figures.reduce((n, f) => n + f.malformed, 0);
  const missing = figures.reduce((n, f) => n + f.missing, 0);

  let outcome: Outcome;
  let detail: string;
  if (malformed > 0) {
    outcome = 'FAILED';
    detail =
      `${malformed} reported figure(s) were not usable numbers and were rejected rather than ` +
      'summed. A malformed figure is worse than an absent one: it asserts something false.';
  } else if (total.events === 0) {
    outcome = 'NOT_CHECKED';
    detail = 'no priced events occurred, so there was nothing to measure.';
  } else if (missing > 0) {
    outcome = 'NOT_CHECKED';
    detail =
      `${missing} of ${total.events * 3} figures were never reported, so every total here ` +
      'understates the run by an unknown amount. It is not evidence that the run was cheap.';
  } else {
    outcome = 'VERIFIED';
    detail = `all ${total.events} priced events reported complete usage.`;
  }

  return { model, tools, evaluation, total, outcome, detail };
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
