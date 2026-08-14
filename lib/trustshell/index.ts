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
