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
