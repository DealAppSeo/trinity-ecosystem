# Validation Attestation Contract, v0.1

This specification defines the strict contract requirements for **Validation-Registry-Compatible Attestations** required to authorize high-stakes payout or reward operations. 

Under the ERC-8004 posture, security is proportional to the value at risk (**Security ∝ Value-at-Risk**). Therefore, high-stakes on-chain transitions require verified cryptographic or economic proofs of correctness before routing lanes can exit their default fail-closed state.

---

## 1. Schema Specification (`validation-attestation.v0.1.json`)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://repid.dev/schemas/validation-attestation.v0.1.json",
  "title": "Validation Registry Attestation Contract, v0.1",
  "description": "Validation-Registry-compatible attestation required for high-stakes pay/reward lanes, enforcing security ∝ value at risk.",
  "type": "object",
  "required": [
    "attestation_id",
    "issuer",
    "target_agent",
    "value_at_risk_usd",
    "proof_type",
    "proof_payload",
    "metadata"
  ],
  "properties": {
    "attestation_id": {
      "type": "string",
      "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
    },
    "issuer": {
      "type": "string",
      "pattern": "^did:[a-zA-Z0-9_.:%-]+$",
      "description": "Decentralized Identifier (DID) of the validating/attesting authority."
    },
    "target_agent": {
      "type": "object",
      "required": ["agent_id", "did"],
      "properties": {
        "agent_id": {
          "type": "string",
          "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
        },
        "did": {
          "type": "string",
          "pattern": "^did:[a-zA-Z0-9_.:%-]+$"
        }
      },
      "additionalProperties": false
    },
    "value_at_risk_usd": {
      "type": "number",
      "minimum": 0,
      "description": "The exact USD value at risk in this payout or delegation lane. Guides the required cryptographic posture."
    },
    "proof_type": {
      "type": "string",
      "enum": ["STAKE_REEXECUTION", "ZK_PROOF", "TEE_ATTESTATION"],
      "description": "Pluggable verification method based on risk exposure."
    },
    "proof_payload": {
      "type": "object",
      "description": "Proof payload matching the selected proof_type.",
      "oneOf": [
        {
          "properties": {
            "disputed_epoch": { "type": "integer" },
            "slashing_escrow_address": { "type": "string" },
            "dispute_window_blocks": { "type": "integer", "minimum": 1 }
          },
          "required": ["disputed_epoch", "slashing_escrow_address", "dispute_window_blocks"]
        },
        {
          "properties": {
            "circuit_identifier": { "type": "string" },
            "proof_bytes_hex": { "type": "string", "pattern": "^0x[0-9a-fA-F]+$" },
            "public_inputs": { "type": "array", "items": { "type": "string" } }
          },
          "required": ["circuit_identifier", "proof_bytes_hex", "public_inputs"]
        },
        {
          "properties": {
            "enclave_measurement_hex": { "type": "string", "pattern": "^[0-9a-fA-F]+$" },
            "quote_bytes_hex": { "type": "string", "pattern": "^0x[0-9a-fA-F]+$" },
            "tee_provider": { "type": "string", "enum": ["intel_sgx", "amd_sev", "aws_nitro"] }
          },
          "required": ["enclave_measurement_hex", "quote_bytes_hex", "tee_provider"]
        }
      ]
    },
    "zkvm_pipeline": {
      "type": "object",
      "description": "Optional zkVM execution pipeline parameters required for high-stakes ZK_PROOF verification.",
      "properties": {
        "guest_program_hash": {
          "type": "string",
          "pattern": "^0x[0-9a-fA-F]{64}$",
          "description": "The cryptographic hash of the compiled guest program executed inside the zkVM (e.g., RISC0, SP1)."
        },
        "snark_verifier_id": {
          "type": "string",
          "pattern": "^did:[a-zA-Z0-9_.:%-]+$",
          "description": "The decentralized identifier or contract address of the on-chain SNARK verifier."
        },
        "public_input_order": {
          "type": "array",
          "items": { "type": "string" },
          "description": "The deterministic sequence of public inputs exposed by the zkVM guest program."
        }
      },
      "required": ["guest_program_hash", "snark_verifier_id", "public_input_order"],
      "additionalProperties": false
    },
    "metadata": {
      "type": "object",
      "required": [
        "real_collateral_bit",
        "contracted_eval_bit",
        "soft_landing_active"
      ],
      "properties": {
        "real_collateral_bit": {
          "type": "boolean",
          "description": "True if actual, live-staked collateral (rather than virtual or sandbox collateral) is actively backing this verification and subject to on-chain slashing."
        },
        "contracted_eval_bit": {
          "type": "boolean",
          "description": "True if the validator/attestor is an explicitly contracted, legally and cryptographically bound independent evaluator, satisfying `/pay` fail-close gate requirements."
        },
        "soft_landing_active": {
          "type": "boolean",
          "description": "True if the target agent is currently under a soft-landing amortized recovery period. Limits immediate slash severity and scales back authority decay progressively."
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

---

## 2. Pluggable Cryptographic Postures (Security ∝ Value-at-Risk)

Under ERC-8004, the required verification mechanisms are dynamically selected based on the monetary value at risk (`value_at_risk_usd`):

| Risk Tier | USD Exposure | Required Proof Type | Description |
|---|---|---|---|
| **Low-Stakes** | `< $500` | `STAKE_REEXECUTION` | Optimistic resolution backed by slashable collateral. Anyone can dispute and trigger a full re-execution within the dispute window. |
| **Medium-Stakes** | `$500 - $10,000` | `TEE_ATTESTATION` | Hardware-gated execution. Requires a valid cryptographic hardware quote (AWS Nitro Enclave, SGX, or AMD SEV) verifying the unmutated router logic was run. |
| **High-Stakes** | `> $10,000` | `ZK_PROOF` | Zero-Knowledge succinct proof (e.g., Groth16 over poseidon hash system). Verifies that a mathematically sound and private correctness proof was generated and posted to the ledger, guaranteeing zero-leakage. |
