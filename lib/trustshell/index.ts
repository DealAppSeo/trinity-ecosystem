// lib/trustshell/index.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

export { KYAValidator }         from './KYAValidator';
export { BFTAuthorizer }        from './BFTAuthorizer';
export { ComplianceReceiptGenerator } from './ComplianceReceipt';
export { VaultPermissionGate }  from './VaultPermission';
export { SolanaExecutor }       from './SolanaExecutor';
export { FireblocksPreAuth }    from './FireblocksPreAuth';
export { RepIDCalculator }      from './RepIDConfig';
export { ZKPAttestationService } from './ZKPAttestation';
export {
  HARNESS_SETTINGS,
  LAYER_ORDER,
  getSettingSpec,
  resolveHarnessProfile,
  personalisationReport,
} from './HarnessProfile';
export {
  KNOWN_RECORD_TYPES,
  KNOWN_BLOCK_TYPES,
  OBSERVED_CORPUS,
  PARSER_VERSION,
  parseTranscript,
  formatCensusTable,
  formatSummary,
} from './TranscriptParser';
export type {
  ToolEffect,
  ToolOutcome,
  ToolInvocation,
  ModelSpend,
  SpendSummary,
  BlockCensus,
  MalformedLine,
  TranscriptCensus,
  ParsedTranscript,
  ParseOptions,
} from './TranscriptParser';
export {
  RECENCY_HALF_LIFE_DAYS as EARNED_RECENCY_HALF_LIFE_DAYS,
  PRIOR_STRENGTH,
  PRIOR_VALUE,
  MIN_EFFECTIVE_N,
  measureRate,
  measureLatencyMs,
  unmeasured,
  toScoringInputs,
  describeEvidence,
} from './EarnedMetrics';
export type {
  Observation,
  MetricState,
  MeasuredMetric,
  MeasureOptions,
  EarnedMetricSet,
  ScoringInputs,
  EvidenceReport,
} from './EarnedMetrics';
export { EarnedMetricsRepository, OBSERVATION_WINDOW_DAYS, MAX_OBSERVATIONS } from './EarnedMetricsRepo';
export type { EarnedMetricsLoad } from './EarnedMetricsRepo';

// MemoryRecall was written, tested (44 assertions) and then never exported, so
// the only thing in the repo that could import it was its own check script. A
// module absent from the barrel is unreachable to every consumer that imports
// from '@/lib/trustshell' — which is all of them.
export {
  RRF_K,
  RECENCY_HALF_LIFE_DAYS,
  SCOPE_ORDER,
  chooseRecallTier,
  rrfFuse,
  applyRecallBudget,
  utilityScore,
  canDedup,
  compileRecallPlan,
} from './MemoryRecall';
export type {
  RecallTier,
  IndexCapabilities,
  TierChoice,
  FusedItem,
  RecallBudget,
  BudgetedRecall,
  MemoryUtilityInput,
  UtilityScore,
  DedupAction,
  DedupDecision,
  RecallSettings,
  MemoryScope,
} from './MemoryRecall';
export type {
  Authority,
  Layer,
  Dimension,
  SafeDirection,
  CompilesTo,
  SettingSpec,
  EarnedGrant,
  ResolveInput,
  ResolvedSetting,
  ResolvedProfile,
  Rejection,
} from './HarnessProfile';
export type * from './types';

// The agent execution kernel. Exported on creation rather than later, because
// the note above MemoryRecall is what happens otherwise: a module absent from
// the barrel is unreachable to every consumer that imports from
// '@/lib/trustshell', which is all of them.
export { runAgentLoop, weakerOutcome } from './harness/loop';
export type {
  ToolEffect as LoopToolEffect,
  Outcome as LoopOutcome,
  ToolCall,
  TypedHandoff,
  ModelTurn,
  // Aliased: `Observation` is already taken by EarnedMetrics, where it means a
  // reputation datum rather than a tool result. Two unrelated things with one
  // name in one barrel is how a consumer imports the wrong one and finds out at
  // runtime.
  Observation as LoopObservation,
  ModelTurnInput,
  ModelClient,
  DispatchResult,
  ToolDispatcher,
  SessionCounters,
  AuthorizationRequest,
  DenialKind,
  AuthorizationVerdict,
  Authorizer,
  LoopPolicy,
  CallRecord,
  TurnRecord,
  StopReason,
  LoopResult,
  RunAgentLoopInput,
} from './harness/loop';

// ---------------------------------------------------------------------------
// The verification spine.
//
// Exported 2026-08-16 because it was NOT, and the comment above `runAgentLoop`
// had already written down why that matters: "a module absent from the barrel
// is unreachable to every consumer that imports from '@/lib/trustshell', which
// is all of them." The rule was stated and then not applied here — the kernel
// was exported with its Evaluator port open, and every module that could fill
// that port was left out of the barrel. A consumer could start a loop and had
// no reachable way to have the work judged.
//
// Measured before this change, on 3a0890b: 0 of 10 spine modules exported;
// `assigned-contract`, `staged-judge`, `verdict-envelope`,
// `outcome-to-reputation`, `auditor-grant` and `handoff` had zero importers in
// lib/ + app/. `npm run check:spine-reachable` fails the build if that
// regresses.
//
// Several names are aliased. `Outcome`, `ToolEffect` and `Evaluation` each
// already mean something else in this barrel, and two unrelated things under
// one name is how a consumer imports the wrong one and finds out at runtime —
// the same reasoning that aliased `Observation` above.
// ---------------------------------------------------------------------------

/** The whole chain as one call. See `identity/spine.ts`. */
export { runContractedWork } from './identity/spine';
export type {
  ContractedWorkInput,
  ContractedWorkResult,
  AssignmentInput,
} from './identity/spine';

/**
 * The chain run REPEATEDLY against one drawn auditor, until it signs off.
 *
 * Exported beside `runContractedWork` rather than instead of it: a single
 * judged round is a legitimate thing to want, and hiding it would push callers
 * back to hand-assembly — the failure this barrel exists to prevent.
 *
 * `isDelivered` is exported deliberately. `AcceptanceState` has three terminal
 * statuses and only one of them is a delivery; without a predicate, callers
 * write `status !== 'REVISE'` and ship on a spent budget.
 */
export { runAcceptedWork } from './identity/spine';
export type {
  AcceptedWorkInput,
  AcceptedWorkResult,
  AttemptContext,
  AttemptSubmission,
} from './identity/spine';
export {
  evaluateAcceptance,
  auditorIsStable,
  roundVerdictFor,
  isDelivered,
  isTerminal,
  DEFAULT_MAX_REJECTIONS,
  DEFAULT_MAX_ROUNDS,
} from './identity/acceptance-loop';
export type {
  Round as AcceptanceRound,
  RoundVerdict,
  AcceptancePolicy,
  AcceptanceState,
} from './identity/acceptance-loop';

export {
  CONTRACT_DOMAIN,
  VERDICT_DOMAIN,
  contractPayload,
  proposeContract,
  countersignContract,
  verifyContract,
  verdictPayload,
  issueVerdict,
  verifyVerdict,
  veritasSignal,
} from './identity/work-contract';
export type {
  Outcome as ContractOutcome,
  ContractCriterion,
  UnsignedContract,
  WorkContract,
  ContractVerification,
  CriterionScore,
  UnsignedVerdict,
  Verdict,
  VerdictVerification,
  GroundTruthSource,
  GroundTruthObservation,
} from './identity/work-contract';

export {
  ASSIGNMENT_DOMAIN,
  eligiblePool,
  assignChecker,
  verifyAssignment,
  commitAssignmentRequest,
  commitPool,
} from './identity/checker-assignment';
export type {
  Qualification,
  CheckerCandidate,
  QualificationRequirement,
  EligiblePool,
  AssignmentProof,
  AssignmentVerification,
} from './identity/checker-assignment';

export {
  CRITERIA_DRAW_DOMAIN,
  commitBank,
  drawCriteria,
  verifyDraw,
} from './identity/criteria-draw';
export type {
  BankCriterion,
  CriteriaDrawProof,
  CriteriaDrawVerification,
} from './identity/criteria-draw';

export {
  assembleAssignedContract,
  verifyAssignedContract,
} from './identity/assigned-contract';
export type {
  AssignedContract,
  AssignedContractVerification,
} from './identity/assigned-contract';

export {
  createContractedEvaluator,
  renderEvidence,
  evidenceDigest,
  attestCheckerAuthority,
} from './identity/contracted-evaluator';
export type {
  JudgeRequest,
  JudgeOpinion,
  Judge,
  CriterionVerdict,
  EvaluationRequest,
  Evaluation as EvaluatorEvaluation,
  ContractedEvaluatorInput,
  ContractedEvaluation,
} from './identity/contracted-evaluator';

export { createStagedJudge } from './identity/staged-judge';
export type { JudgeTier, TierDecision, StagedJudge } from './identity/staged-judge';

export {
  ENVELOPE_DOMAIN,
  packEnvelope,
  verifyEnvelope,
} from './identity/verdict-envelope';
export type { TrustEnvelope, EnvelopeVerification } from './identity/verdict-envelope';

export {
  SIGNAL_KIND,
  isProgress,
  reputationForVerdict,
  partitionByProgress,
  assertPartitionTotal,
} from './identity/outcome-to-reputation';
export type {
  ProgressKind,
  WithheldSignal,
  ReputationOutcome,
  VerdictReputationInput,
} from './identity/outcome-to-reputation';

export { analyseReadOnly, delegateAuditorGrant } from './identity/auditor-grant';
export type {
  ToolCapabilityMap,
  ToolEffect as GrantToolEffect,
  ToolEffectMap,
  WriteReach,
  ReadOnlyAnalysis,
  AuditorGrantInput,
  AuditorGrant,
} from './identity/auditor-grant';

export {
  HANDOFF_DOMAIN,
  handoffPayload,
  signHandoff,
  verifyHandoff,
} from './identity/handoff';
export type {
  Checkpoint,
  FailureRecord,
  UnsignedHandoff,
  Handoff,
  CheckpointCapReason,
  CheckpointVerification,
  HandoffVerification,
  VerifyHandoffInput,
} from './identity/handoff';
