/**
 * @hyperdag/trustshell v0.2.0
 *
 * ZKP reputation credentials, BYOK encryption, onboarding flywheel,
 * and trust primitives for the HyperDAG protocol.
 *
 * Architecture:
 *   HyperDAG Protocol (@hyperdag/core)
 *     └── TrustShell (@hyperdag/trustshell)  ← you are here
 *           └── TrustRails (compliance UI)
 *           └── AI Trinity Symphony (agent swarm)
 *           └── Other consumers
 */

// BYOK — Bring Your Own Key encryption
export {
  encryptAPIKey,
  decryptAPIKey,
  validateKeyFormat,
  type EncryptedKey,
  type BYOKCredential
} from './byok';

// RepID — Reputation Identity credentials
export {
  createRepIDCredential,
  meetsThreshold,
  type RepIDCredential,
  type RepIDProof
} from './repid';

// ZKP — Zero Knowledge Proof primitives
export {
  createZKPProof,
  verifyZKPProof,
  type ZKPProofRequest,
  type ZKPProofResult,
  type ZKPVerifyResult
} from './zkp';

// Onboarding — Progressive trust flywheel (Stage 1: email only → Stage 5: full ZKP RepID)
export {
  initOnboarding,
  advanceStage,
  recordAction,
  completeVerification,
  generateRepIDProof,
  getOnboardingStatus,
  STAGE_CONFIG,
  type OnboardingStage,
  type OnboardingState,
  type OnboardingAction,
  type StageRequirements
} from './onboarding';
