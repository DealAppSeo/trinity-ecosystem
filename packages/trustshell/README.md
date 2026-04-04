# @hyperdag/trustshell

ZKP reputation credentials, BYOK encryption, and trust primitives for the HyperDAG protocol.

## Installation

```bash
npm install @hyperdag/trustshell
```

## Usage

```typescript
import {
  encryptAPIKey,
  createRepIDCredential,
  createZKPProof,
  verifyZKPProof,
  meetsThreshold
} from '@hyperdag/trustshell';

// BYOK: Encrypt a user's API key
const encrypted = encryptAPIKey('sk-ant-abc123...', encryptionKey);
// => { ciphertext, iv, tag, preview: 'sk-a...c123' }

// RepID: Create a reputation credential
const credential = createRepIDCredential({
  did: 'did:hyperdag:human:sean',
  score: 85,
  wallet: '0xdf6b8215...'
});
// => { did, score: 85, tier: 'Act', chain: 'base-sepolia', ... }

// Gate access based on reputation
if (meetsThreshold(credential, 70)) {
  // Allowed — score >= 70
}

// ZKP: Prove reputation without revealing score
const proof = await createZKPProof({
  proofType: 'repid_threshold',
  privateInputs: { actualScore: 85 },
  publicInputs: { minScore: 70, did: credential.did }
});

// Verify the proof
const result = await verifyZKPProof(
  proof.proof!,
  proof.publicInputs,
  proof.verificationKeyHash
);
// => { valid: true }
```

## Architecture

```
HyperDAG Protocol (@hyperdag/core)
  └── TrustShell (@hyperdag/trustshell)  ← this package
        └── TrustRails (compliance UI)
        └── AI Trinity Symphony (agent swarm)
```

## Status

v0.1.0 — Interface scaffolding with stubs. ZKP proofs are simulated.
Actual Plonky3 circuit bindings will come via `@hyperdag/core`.
