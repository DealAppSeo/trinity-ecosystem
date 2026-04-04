/**
 * @hyperdag/trustshell v0.1.0
 *
 * ZKP reputation credentials, BYOK encryption, and trust primitives
 * for the HyperDAG protocol.
 *
 * Architecture:
 *   HyperDAG Protocol (@hyperdag/core)
 *     └── TrustShell (@hyperdag/trustshell)  ← you are here
 *           └── TrustRails (trustrails-dev)
 *           └── AI Trinity Symphony (trinity-ecosystem)
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
