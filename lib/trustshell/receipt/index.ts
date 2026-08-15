// lib/trustshell/receipt/index.ts — TrustShell M2.
//
// A session receipt: what the agent did, what it cost, and — explicitly — what
// nobody checked. docs/TRUSTSHELL-V1.md §5, §6.
//
// The pure half (types, canonical, build, sign) has no Node dependency and runs
// in a browser. `store-sqlite` is imported separately, on purpose, so importing
// the receipt model never drags in a runtime requirement.

export * from './types';
export { canonicalJson, sha256Hex, base32, receiptIdFromAuditHash } from './canonical';
export {
  buildReceipt,
  auditHashFor,
  ruleHashFor,
  markerFor,
  recomputeReceipt,
  type BuildOptions,
} from './build';
export {
  signReceipt,
  verifyReceiptSignature,
  checkReceipt,
  formatMarker,
  type SignatureCheck,
  type ReceiptCheck,
} from './sign';
export { parsePorcelainZ, parseLogNameOnly } from './git';
export {
  checkClaims,
  checkT0,
  checkT1,
  extractToolMentions,
  stripCodeBlocks,
  sentences,
  linkEvidence,
  BUILTIN_TOOLS,
  CLAIM_RULES_VERSION,
  EXCERPT_MAX,
  type ClaimsResult,
  type ToolMention,
} from './claims';
