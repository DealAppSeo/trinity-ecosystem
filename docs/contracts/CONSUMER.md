# Integrating Third-Party Adapters with Trust Harness

This consumer documentation defines how external third-party compute, LLM, storage, or routing providers can integrate their custom adapters with the Trust Harness.

To integrate, an adapter must satisfy and publish its configuration matching the strict, versioned JSON schema at `docs/contracts/capability-declaration.schema.json`.

---

## 1. Required Fields

Every third-party adapter configuration must specify the following properties:

### `adapter_version`
A strict semantic version string (`X.Y.Z`) matching the pattern `^[0-9]+\\.[0-9]+\\.[0-9]+$`.

### `vendor`
The unique identifier of the third-party adapter provider (e.g., `"openai"`, `"anthropic"`, `"custom-local-node"`).

### `cost_model`
A structured cost breakdown supporting precise ANFIS routing cost optimization:
*   `usd_per_1k_input` (number): Price in USD per 1,000 input tokens.
*   `usd_per_1k_output` (number): Price in USD per 1,000 output tokens.
*   `fixed_overhead_usd` (number): Flat overhead fee per invocation (e.g. connection initiation fee).
*   `max_budget_limit_usd` (optional, number): Safety ceiling per call to prevent runaway billing loop defects.

### `latency_class`
A quantitative and qualitative latency profile mapping expected timings:
*   `classification` (string): Qualitative speed rating. Must be one of `["instant", "fast", "balanced", "deep"]`.
*   `expected_latency_ms` (number): Nominal mean response latency in milliseconds.
*   `p95_latency_ms` (number): 95th percentile timeout threshold in milliseconds. Exceeding this boundary will trigger routing timeout fallback handlers.

### `degradation_class`
Defines operational behavior under degraded network or rate-limiting conditions:
*   `rate_limit_behavior` (string): One of `["429_backoff", "fail_closed"]`.
*   `routing_fail_behavior` (string): Must be one of `["fail_closed", "degrade_with_penalty", "bypass"]`.
    *   **Mandatory Production Standard:** `fail_closed` is the secure default. Bypassing or silently swallowing failures is prohibited to prevent unmonitored security leaks.
*   `fallback_supported` (boolean): Set `true` if the adapter can transparently redirect traffic to secondary/sibling edges on failure without throwing.

### `region_edge`
An array of regional string slugs where the edge node of this adapter is deployed (e.g. `["us-east-1", "eu-central-1"]`).

### `failure_modes`
An array specifying the exact subset of supported standard error signatures:
*   Supported values: `["context_length_exceeded", "content_filter_block", "timeout", "rate_limit", "auth_failure", "upstream_error", "signature_invalid"]`.

---

## 2. Required Test Vectors

To verify compliant implementation, the adapter config must validate against the following sample test vectors:

### Vector A: Valid Standard LLM Adapter
```json
{
  "adapter_version": "1.4.2",
  "vendor": "anthropic-claude-3-5-sonnet",
  "cost_model": {
    "usd_per_1k_input": 0.003,
    "usd_per_1k_output": 0.015,
    "fixed_overhead_usd": 0.0,
    "currency": "USD",
    "max_budget_limit_usd": 1.50
  },
  "latency_class": {
    "classification": "fast",
    "expected_latency_ms": 650,
    "p95_latency_ms": 1500
  },
  "degradation_class": {
    "rate_limit_behavior": "429_backoff",
    "routing_fail_behavior": "fail_closed",
    "fallback_supported": true
  },
  "region_edge": ["us-east-1", "us-west-2"],
  "failure_modes": [
    "context_length_exceeded",
    "timeout",
    "rate_limit",
    "upstream_error"
  ]
}
```

### Vector B: Invalid Adapter (Schema Violations)
The following configurations **must fail validation**:
*   **Missing Fields:** Omitting any required property (e.g., omitting `failure_modes`).
*   **Negative Costs/Latencies:** Setting `usd_per_1k_input` or `expected_latency_ms` to `< 0`.
*   **Loose Failure Modes:** Including custom error strings (e.g. `"my_weird_database_error"`) that are outside the permitted schema enum.

---

## 3. Required Degradation & Failure Behavior

1.  **Strict Fail-Closed Enforcement:** Production-lane adapters must execute `fail_closed` whenever `routing_fail_behavior` is requested or a fatal condition is unresolvable.
2.  **Signature Propagations:** When the adapter encounters an exception, it must map its local exception to one of the standardized `failure_modes` strings. This enables the ANFIS engine to execute deterministic recovery and penalization rules.
3.  **Idempotency & Retries:** Retried calls under network degradation must pass identical, collision-immune idempotency keys (using deterministic hashes or deterministic UUIDv5 payloads) to avoid duplicate state-changing ledger events under clock skew or clock drift conditions.

---

## 4. Bringing a Validator / Attestor Adapter

A Validator or Attestor adapter is a specialized, pluggable verification service designed to produce cryptographic or programmatic assertions complying with `validation-attestation.v0.json`.

Like standard compute/LLM adapters, a third-party validator MUST publish its configuration aligned with the `capability-declaration.schema.json` standard:

*   **`vendor`:** Must uniquely identify the attestation provider (e.g., `"zk-snark-verifier-v1"`, `"hardware-tee-attestor"`, `"optimistic-slashing-arbiter"`).
*   **`cost_model`:** Details the computational cost associated with proof generation. This metric is used by the ANFIS router to dynamically choose verification tiers based on budget constraints.
*   **`latency_class`:** Must accurately reflect the proof computation latency (e.g., higher millisecond values for ZK-SNARK generation requiring `deep` latency classification, vs. instant millisecond values for optimistic signatures).
*   **`degradation_class`:** In compliance with high-stakes financial and administrative security, the `routing_fail_behavior` for validator adapters MUST always default to `fail_closed` to block downstream transitions on signature verification timeouts.
*   **`failure_modes`:** Must explicitly map validation failures to standard error signatures (specifically `signature_invalid`, `timeout`, or `upstream_error`), allowing the router to trigger rapid failover.

---

## 5. NIST-Facing Security Controls: Structural Controls Against Abuse of Authority

When deployed in governmental, enterprise, or high-stakes industrial environments, the Trust Harness implements foundational **structural controls** to mitigate risks not merely of algorithmic or "model failure," but of deliberate **abuse of administrative authority** (coercion, administrative backdoors, biased routing overrides, or score falsification).

These controls align with NIST guidelines on sovereign AI security and administrative accountability:

### Portable Identity
All agents and validating nodes operate using decentralized, self-sovereign identities (**DIDs**). Because identities and reputations are cryptographically tied to key pairs rather than database-assigned host identifiers, an agent can seamlessly port its credentials across sibling nodes. This eliminates centralized host coercion or platform vendor lock-in.

### Revocable Delegation
Authorization to act or spend on-chain is governed by cryptographically bounded delegation tokens. These delegations restrict authority to specific domains, spend limits, and time epochs. Should an agent exceed these bounds or exhibit anomalous behavior, delegations are dynamically **revoked on-chain instantly**, cutting off compromised nodes before damage propagates.

### Auditability and Non-Repudiation
Every score transition, decay tick, referral reward, and gate decision is logged on an immutable ledger with unique `idempotency_key` bindings. This creates a tamper-proof audit trail. Any administrative attempt to falsify a reputation score or bypass a spending gate is instantly exposed as a signature mismatch or ledger conflict, preventing untrusted executive actions from altering network state.

---

## 6. MVP Trust Kernel Endpoints

To maintain strict security isolation and prevent cross-domain contamination between the application and reputation lanes, the Trust Kernel's MVP services operate entirely on the `repid-engine` namespace under `/api/v1/*`. There are exactly three live remote API endpoints exposing the MVP Trust Kernel surface:

1.  **Passport Endpoint (`GET /api/v1/passport/:agentId`):** Resolves an agent's current reputation standings, five-axis Pi scores, and active selective-disclosure commitments.
2.  **Authority Endpoint (`GET /api/v1/authority/:agentId`):** Computes and returns spending limit and routing authorization decisions gated by effective repid and staked collateral ($A_{eff}$).
3.  **Grants Endpoint (`POST /api/v1/grants` & `GET /api/v1/grants`):** Registers, tracks, and evaluates active principal-to-principal capability delegations.

### Activity Sync Note (V1 Gap)
There is **no live remote Activity Endpoint** in the Trust Kernel today. In compliance with the MVP specification documented in `docs/mvp-grants-api.md` (on `repid-engine`), agent activity log entry scoring remains device-local in an IndexedDB store. This is a recognized V1 integration gap; there is no live remote API route writing activity records directly to the ledger.

---

## 7. Grants-Aware Capability Constraints

To integrate with the Trust Kernel's principal-to-principal delegation gateway, capability executions must map directly to the canonical **`principal_grants.caveats`** vocabulary defined on the `repid-engine` ledger:

*   **`maxCalls` (integer):** The absolute invocation limit permitted under the delegated grant.
*   **`maxValue` (number):** The aggregate spending or transaction valuation ceiling authorized by this grant.
*   **`toolAllowlist` (array of strings):** Explicit list of permitted tools or endpoint slugs the delegate is authorized to execute.

When evaluating a delegated execution request, the Trust Kernel's Grants gate checks incoming capability requests against these active ledger constraints. If the grant has been revoked, has expired, or if any caveat thresholds are exceeded, the gateway executes `fail_closed` immediately.

---

## 8. ERC-7579 Modular Account Integration (Design-Only)

For long-term policy alignment, security planning, and NIST compliance, modular smart accounts represent the preferred target execution host for autonomous agent delegations. 

Developers should consult the official, merged section in **`docs/policy/grants-authority.v0.md` (PR #117)** for the comprehensive security guidelines on ERC-7579 modular account permission boundaries.

### Operational Status (Observe-Only)
In compliance with the project's engineering discipline, note that the ERC-7579 Modular Smart Account integration is currently a **design and observe-only framework**. No active MSA Solidity modules, smart contract state switches, or execution contracts exist within the live codebase today. It remains a conceptual policy and structural control guide, with no active smart contract runtime enforcing permissions.




