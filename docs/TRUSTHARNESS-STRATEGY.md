# TrustHarness strategy — TrustShell as a portable microkernel for trustworthy agency

**Status: strategy + research synthesis, 2026-09-02 (v2, microkernel reframe). Not
an inventory of shipped work.** This version supersedes the v1 "thin JIT trust
layer" framing: the thin/JIT layer is still here, but it is now correctly placed
as the *distribution mechanism* for a **microkernel**, not the whole architecture.
Where this doc names a TrustShell capability as **EXISTS / PARTIAL / NEW** it is
graded against code/DB state measured this session; where it names an external
mechanism it is labelled `[F]` (recovered via WebSearch of the named source —
direct WebFetch was blanket egress-blocked this session, proxy `selective:false`)
or `[K]` (from-knowledge). Every external-standards claim in §4 was independently
re-verified this session (WebSearch) — see the Verification note; the softenings it
found are already folded in.

Read `docs/SYSTEM-MAP.md` and `docs/TRUST-HARNESS-STATUS-2026-08-17.md` first —
this builds on them, it does not restate them.

---

## 0. The thesis in six sentences

The organizing idea is not "a thin trust layer" but a **microkernel for trustworthy
agency**: TrustShell owns a small set of **stable interfaces** (policy, reputation,
verification, identity, capability-minting, payment, audit, memory, model,
runtime…) and treats every concrete engine behind them — the LLM, the agent
framework, the policy library, the sandbox — as a **replaceable driver**, exactly
as an OS kernel owns the syscall boundary and swaps device drivers beneath it. The
single dictum that makes this a *trust* kernel and not just a plugin bus is **"models
propose, TrustShell disposes"**: the optimization plane (models, routers, learners)
may *propose* any action, but only the trust plane (deterministic, fail-closed,
mutation-tested) may *dispose* of it — and the two planes must be **structurally
unable to write each other**. TrustShell is **not greenfield**: `@hyperdag/trustshell`
is v1.3.0 with four runtime deps, and the load-bearing driver behind the most
valuable interfaces — reputation (RepID/zkRepID, EAS-attested), verification (HAL),
audit (HyperDAG), and the contract→independent-Evaluator→signed-verdict spine —
already exists and is mutation-gated. The field's most advanced incumbents (AWS
Bedrock AgentCore, Microsoft Agent Framework + Agent Governance Toolkit, LangChain
Deep Agents, NVIDIA NeMo) have three drivers TrustShell lacks — an **out-of-agent
policy decision point**, **multi-point guardrail placement**, and **portable
capability packaging + just-in-time install** — but each is a *library or a
pattern*, so it becomes a driver behind an interface, not a cloud dependency. The
one interface the whole field labels "still unusually underdeveloped" — **earned,
attested, portable reputation** — is the one TrustShell already owns, and it is the
moat. Because there are **no users yet**, every interface can be proven fail-closed
by *simulation and adversarial pressure now*, which is the cheapest this project
will ever be to make antifragile — so the real risk is not "too thin" but **a
beautiful 14-interface kernel with nothing proven fail-closed**, and the whole plan
is disciplined against that failure.

---

## 1. Where TrustShell already stands (measured grounding, 2026-09-02)

| interface it fills | what exists today | grade |
|---|---|---|
| **ReputationProvider** | RepID/zkRepID: ~22,360 real plonky3 proofs, EAS-attested on Base Sepolia; earned-floor + tier ladder; `repid_agents` carries `current_repid`, `tier`, `domain_accuracy`, and the competence/integrity/character/wisdom/adversarial sub-scores | **EXISTS** (caveats: `ANCHOR-001` hollow-attestation batch, ledgered; and the **composition-hash gap**, §3.2) |
| **VerificationProvider** | HAL multi-LLM fact-check quorum; hash-chained classification log; `QUORUM-001` guards panelist identity | **EXISTS**, low-volume (trickle) |
| **AgentRuntime + spine** | contract → work → independent Evaluator → signed verdict → accept/reject; `checker_must_not_be_doer` constitutional; `check:trust-harness-fixture` (mutation-tested) | **EXISTS** ("spine in place; activation incomplete") |
| **ReliabilityKernel** | `lib/trustshell/harness/`: circuit-breaker, retry, timeout, queue, quorum, replay, reputation, router, loop, leaky-bucket, capacity, escalate, aggregate, agreement, transform | **EXISTS** |
| **PaymentRail** | x402 challenge + RepID-threshold gate on `/pay` (fail-closed: null threshold → 503) | **PARTIAL** (access-gate live; budget/BFT observe-only) |
| **IdentityProvider** | ERC-8004 on-chain agent registry (Base Sepolia); `repid_agents` canonical id | **EXISTS** on-chain; DID/SPIFFE interop **NEW** |
| **AuditLedger** | HyperDAG append-only hash-chained event ledger | **EXISTS** |
| **Adversarial substrate** | redteam suite (incl. `MCP-001` tool rug-pull, `EVERGREEN-001/002`, `ANCHOR-001`), `mutate` gate | **EXISTS** in CI |
| **Distribution** | `@hyperdag/trustshell` npm: 4 deps, CLI + MCP server + lib | **EXISTS**, thin already |
| **PolicyEngine (PDP)** | — | **NEW** — the biggest gap |
| **CapabilityMinter** | — | **NEW** |
| **CapsuleResolver** (packaging + Composition Hash + JIT) | — | **NEW** |
| **MemoryStore** (compartmentalized + context firewall) | — | **NEW** |
| **AttestationSink** (universal Trust Receipt) | EAS anchoring exists; receipt *schema* does not | **PARTIAL** |

**Implication:** the reputation + verification + reliability + audit drivers are
substantially built and mutation-gated. The genuine gaps are **the trust-plane
boundary itself** (a real out-of-agent PDP), **capability-minting**, **capsule
packaging with a composition hash**, and **compartmentalized memory**. Do not
rebuild what exists; build the boundary and the packaging.

---

## 2. The microkernel model

### 2.1 The interface/driver contract — "models propose, TrustShell disposes"

TrustShell owns a small, stable set of **universal interfaces**. Every concrete
engine is a **driver** bound to one interface and swappable without touching the
kernel — the way a Deep Agents runtime, an MAF runtime, or our own spine are three
drivers for one `AgentRuntime` interface. The kernel's job is not to *do* the work;
it is to **dispose** of every proposed action against the trust plane before the
work runs.

**The plane split is the whole design.** Two planes, and the invariant is that
they cannot write each other:

- **Optimization plane** — models, the MoE/trust-aware router, learners, the
  recovery-ledger's cost-out routing. Non-deterministic, allowed to be clever,
  allowed to *propose*.
- **Trust plane** — the PDP, the fail-closed tool-gate, reputation reads, the
  Trust/Action Envelope verdict, the receipt writer. Deterministic, no LLM in the
  path, mutation-tested, allowed to *dispose*.

If the optimization plane can write the trust plane, a clever router can talk its
way past the gate and the kernel is theatre. Enforcing that separation is a
buildable antibody, `ROUTER-001` (§7).

### 2.2 The 14 interfaces, mapped to the codebase

| # | Interface | What it decides / provides | Reference driver(s) | Grade |
|---|---|---|---|---|
| 1 | **PolicyEngine (PDP)** | `principal × tool × args × conditions → ALLOW/DENY/ASK/VERIFY`, out-of-agent, default-deny | Cedar / OPA (embeddable) `[F]` | **NEW** — top priority |
| 2 | **ReputationProvider** | earned autonomy from verified history; tri-layer disclosure | RepID/zkRepID + EAS | **EXISTS** (moat) |
| 3 | **VerificationProvider** | is this claim/output true? (a *marketplace* of verifiers, §3.3) | HAL quorum | **EXISTS** |
| 4 | **IdentityProvider** | who is this agent; delegation chains | ERC-8004 on-chain; DID/SPIFFE bridge | **EXISTS** / bridge **NEW** |
| 5 | **CapabilityMinter** | mint *scoped, short-lived* capability tokens, not master creds | SPIFFE/SPIRE + OpenBao `[F]` | **NEW** |
| 6 | **PaymentRail** | value transfer *behind a capability* (Proof of Economic Work) | x402 | **PARTIAL** |
| 7 | **AuditLedger** | append-only, hash-chained, attestable event history | HyperDAG (+ EAS) | **EXISTS** |
| 8 | **AttestationSink** | emit the universal **Trust Receipt** on/off-chain | EAS + zkRepID | **PARTIAL** |
| 9 | **CapsuleResolver** | package + resolve capabilities as **Agent Capsules** (OASF vocabulary), JIT | `.skill`/SKILL.md + OASF `[F]` | **NEW** |
| 10 | **AgentRuntime** | run the agent loop | our spine / Deep Agents / MAF `[F]` | **EXISTS** |
| 11 | **ModelProvider** | swap LLM backends behind one interface | LiteLLM `[F]` | **PARTIAL** (`router.ts`) |
| 12 | **MemoryStore** | compartmentalized memory + **context firewall** | pgvector + compartment policy `[F]` | **NEW** |
| 13 | **DurableCheckpoint** | resumable *trust* state — never re-verify, re-pay, or skip-a-gate on resume | MAF checkpoints / Restate `[F]` | **PARTIAL** |
| 14 | **ReliabilityKernel** | circuit-break / retry / timeout / quorum / recovery-ledger | `lib/trustshell/harness/` | **EXISTS** |

Nine of fourteen have a driver today (six EXISTS, three PARTIAL). The five NEW ones
are the sprint surface — and §5's smallest-kernel discipline says exactly how *not*
to build all five at once.

### 2.3 The biological analogy (why "microkernel" is the right metaphor, not "framework")

A framework is a scaffold you build *inside*. A cell is a boundary that decides what
crosses it. TrustShell is the second kind, and the immune-system mapping is not
decoration — it tells you which mechanisms are *deterministic and always-on* versus
*learned from surviving attacks*.

| Biology | TrustShell mechanism | Plane | Grade |
|---|---|---|---|
| Cell membrane / selective permeability | **Trust/Action Envelope + PDP** — nothing crosses without a verdict | trust | **NEW** |
| Self / non-self (MHC) | IdentityProvider + CapabilityMinter — scoped tokens, not master keys | trust | EXISTS / **NEW** |
| DNA — *what the organism is* | **Composition Hash** — model+tools+policy+prompt identity | trust | **NEW** (§3.2) |
| Innate immunity (always-on, fast) | deterministic fail-closed guardrails, **no LLM in the path** | trust | **PARTIAL** |
| Adaptive immunity (learned) | redteam antibodies — a survived attack becomes a permanent probe | trust | EXISTS |
| Antibody | a mutation-tested probe | trust | EXISTS |
| Immune memory | recovery-ledger + reputation reshaping future installs | both | **NEW** / EXISTS |
| Compartmentalization (organelles) | compartmentalized memory + context firewall | trust | **NEW** |
| Apoptosis (programmed cell death) | kill switch + circuit-breaker + capability revocation | trust | EXISTS / **PARTIAL** |
| Homeostasis | SLOs + error budgets | both | **PARTIAL** |
| Metabolism / ATP | Proof of Economic Work (x402 behind capabilities) | both | **PARTIAL** |

The lesson the table encodes: **innate immunity (deterministic gates) must never
depend on the adaptive layer (learned models).** That is the plane split again, in
biology's words.

---

## 3. The three priority primitives

The vision named three primitives to build first. They are the correct three, and
they are ordered: the Envelope is the boundary, the Capsule is the thing that
crosses it, and the Receipt is the record that turns crossings into reputation.

### 3.1 Trust/Action Envelope — the disposition boundary

> **Naming correction to the vision:** the brief called this the *Trust Execution
> Envelope*. Rename it **Trust/Action Envelope** (or just **Action Envelope**). "TEE"
> already means **Trusted Execution Environment** across this exact stack — ERC-8004's
> own validation section lists *TEE oracles* — and shipping a second "TEE" guarantees
> a confused threat model. The renamed thing is unambiguous.

A normalized, pre-execution struct for *every* proposed action — `{principal,
capability, tool, args, context-refs, prior-action-refs, requested-scope}` — handed
to the PolicyEngine, which returns exactly one of **ALLOW / DENY / ASK / VERIFY**.
`ASK` routes to an approver; `VERIFY` routes to a VerificationProvider (HAL) before
the action is allowed to proceed. This is the single chokepoint that makes "models
propose, TrustShell disposes" concrete: the model never calls a tool directly, it
*proposes an Envelope*. Codebase: **NEW** — but it slots directly onto the existing
fail-closed `/pay` pattern (null threshold → 503) generalized from payments to all
actions.

### 3.2 Agent Capsule + Composition Hash — and the live over-crediting gap

An **Agent Capsule** packages *what an agent is* — its model, tools, policies,
skills, and memory-scope — as a resolvable unit (OASF as the vocabulary, `.skill`
as the on-disk form). Its **Composition Hash** is the content hash of that bundle:
change the model, and the hash changes.

**Correction — this is not a nice-to-have; it closes a gap that is live today.**
[MEASURED 2026-09-02 against `repid_agents`/`repid_scores`/`repid_zkp_proofs`]:
reputation attaches to `agent_id` / `canonical_agent_id` / `agent_name` +
`domain_accuracy`. **There is no model, tool-set, policy, or composition column in
any reputation table** — the only hashes present are `mint_tx_hash`,
`last_reputation_tx_hash` (transaction hashes) and `work_statement_hash` (which binds
a *work statement*, not the composition that produced it). Consequence: **an agent
that keeps its `agent_id` but swaps its underlying model or tools carries its full
earned RepID into a materially different system.** A RepID-920 agent is trusted for
what a *previous composition* earned.

This is **structurally the same defect as `ANCHOR-001`** — an attestation that
binds to an identity instead of to the actual artifact. So the fix is one primitive,
not two: make the Composition Hash a first-class input to reputation, so a score is
a claim about *this composition in this domain*, and a model-swap forces
re-earning (or at minimum a disclosed, decayed carry-over). This turns the vision's
Composition Hash from "a good idea others are exploring" into "the remediation for a
gap we can measure in our own database right now." Codebase: **NEW**; ANCHOR-001 is
the ledgered wedge.

### 3.3 Trust Receipt → HAL → zkRepID flywheel

Every disposition emits a **universal Trust Receipt**: `{policy-version, Envelope,
verdict, verifier-evidence, RepID-at-time, composition-hash}`, hash-chained into
HyperDAG and EAS-anchored when consequential. Receipts are the input to HAL (which
verifies the claims), and HAL's verified verdicts move zkRepID (which updates earned
autonomy), which changes the next disposition. That is the flywheel: **use →
receipt → verification → reputation → more (or less) autonomy → use.** It is also
why HAL is a *marketplace* interface, not a single verifier: any staked verifier
that can produce receipt-checkable evidence can compete to verify, and the
reputation of *verifiers* is itself earned. Codebase: EAS anchoring **EXISTS**, HAL
**EXISTS**, RepID **EXISTS**; the **receipt schema binding them is NEW** and is the
highest-leverage small piece — it is the `AttestationSink` the whole loop turns on.

---

## 4. The landscape as drivers — ADOPT / INTEGRATE / OUTPERFORM / DIFFERENTIATE / SKIP

Every external mechanism is now graded as *which interface it becomes a driver
behind*. External-standards claims re-verified this session (WebSearch); softenings
folded in.

### PolicyEngine (interface 1) — the biggest gap
- **Out-of-agent PDP (Cedar/OPA, default-deny, at the boundary)** `[F]` — AgentCore
  Policy and MS AGT both evaluate `principal × tool × args × conditions` *outside the
  LLM* so injection cannot reach around it; Cedar is an embeddable Rust/WASM lib. →
  **ADOPT** as the reference PolicyEngine driver.
- **Temporal / session-aware policy** `[F]` — authorize each request against prior
  actions. → **OUTPERFORM** — HyperDAG *is* the append-only session ledger the
  incumbents had to build; ride a thin evaluator on it.
- **`require_approval` verdict + approver routing** `[F]` (MS AGT) → **ADOPT** as the
  Envelope's `ASK` path.

### ReputationProvider (interface 2) — the moat
- **Trust scoring (0–1000, in-process, ephemeral)** `[F]` (MS AGT) → **OUTPERFORM** —
  RepID/zkRepID is *earned, EAS-attested, zk-provable, portable*, not an ephemeral
  float. Tri-layer disclosure (public score / private detail / ZK-selective-reveal)
  is the differentiator: prove "tier ≥ X in domain D" without revealing the history.
- **Earned-autonomy tiers** — keep them **domain-specific** (the vision's 0–6, per
  domain), not a single global ladder; `domain_accuracy` already exists to support it.

### VerificationProvider (interface 3)
- **NeMo five ordered intercept points (input→retrieval→dialog→execution→output)**
  `[F]` → **ADOPT the taxonomy as HAL's placement map**; **DIFFERENTIATE** — our
  rails carry earned reputation + payment + on-chain identity as inputs, which NeMo
  has no concept of. **HAL-as-marketplace** (§3.3) is the differentiator over a
  single guard model.
- **NeMo tool-call rails FAIL CLOSED, no LLM in the guard path** `[F]` → **ADOPT as a
  hard invariant** — this is the trust-plane rule in someone else's words.

### CapsuleResolver + packaging (interface 9) — "thin + adaptive"
- **Agent Skills `.skill`/`SKILL.md` + three-level progressive disclosure** `[F]` —
  L1 name+description always resident; L2 body on relevance; L3 assets on demand;
  AgentCore adds remote sourcing and **"never silently skip — an empty glob fails the
  invocation."** → **ADOPT verbatim** as the on-disk Capsule form, **fail-closed if a
  trust component can't resolve.**
- **OASF (AGNTCY, Cisco Outshift → Linux Foundation)** `[F]` — a versioned,
  OCSF-inspired taxonomy for agent capabilities. **OASF v1.1 added an Agent Skills
  module that represents SKILL.md packages as OASF records.** → **ADOPT as the Capsule
  *vocabulary*.** *(Softened per verification: the "SDK translates SKILL.md → OASF
  record" direction and a specific v1.1 release month are not confirmable — do not
  state them.)*
- **Deep Agents middleware pipeline** `[F]` → **ADOPT as the assembly model** — each
  interface's driver is an attachable middleware, composed only when its intercept
  fires.
- **AgentCore microVM / Omnigent control plane** `[F]` → **SKIP the heavy shells**;
  borrow only Omnigent's "one manifest, swap harness/model in one edit" as the
  portable Capsule manifest.

### IdentityProvider + CapabilityMinter (interfaces 4, 5)
- **ERC-8004 Trustless Agents** `[F]` — **Draft ERC (with live reference deployments
  on mainnet + ~20 chains — not vaporware)**; three registries (Identity ERC-721 /
  Reputation / Validation); registration file carries A2A/MCP/OASF/DID/x402 endpoints;
  reputation aggregation expected **off-chain**; validation accommodates
  re-execution / zkML / TEE / trusted judges. → **INTEGRATE as an external adapter**
  behind IdentityProvider (its "off-chain reputation" and "validation" slots are
  literally RepID and HAL) — but treat it as a *Draft* target, adapter-isolated so a
  spec change is one driver swap. Do not put a Draft ERC on the kernel's critical path.
- **Zero-trust identity (Ed25519/DID/SPIFFE, delegation)** `[F]` → **INTEGRATE** when
  bridging to other meshes. **SPIFFE/SPIRE (short-lived auto-rotated SVIDs) + OpenBao
  (dynamic auto-revoked secrets)** `[F]` → the reference **CapabilityMinter** driver:
  mint scoped short-lived tokens, never hand out a master credential.

### PaymentRail (interface 6)
- **x402** `[F]` — open, HTTP-native (402), chain-agnostic (CAIP-2), now under the
  x402 Foundation (Coinbase + Cloudflare); **crypto/stablecoin-settlement-oriented**
  (payment-rail neutral, not card-network-inclusive). → **ADOPT** as PaymentRail;
  **x402 behind a capability** = the vision's "Proof of Economic Work."
- **x402 session spending-caps (max-spend + expiry, checked before signing)** `[F]` →
  **ADOPT** (design now; enforce when real spend flows).

### AuditLedger + AttestationSink (interfaces 7, 8)
- **Decision-BOM (policy-version + request + verdict, tamper-evident)** `[F]` →
  **ADOPT + OUTPERFORM** — this *is* the universal Trust Receipt (§3.3); ours is
  on-chain-attestable and reputation-weighted, beating a local Merkle log.
- **AIBOM / agent bill-of-materials** `[F]` — **an *emerging* practice (CycloneDX
  AI/ML-BOM type, active research), not a ratified standard.** → **INTEGRATE later** —
  the Composition Hash (§3.2) is the seed of an AIBOM; frame it as emerging, don't
  cite a standard that isn't one.

### ModelProvider + DurableCheckpoint + ReliabilityKernel (interfaces 11, 13, 14)
- **LiteLLM** `[F]` → **ADOPT** as the reference ModelProvider (one endpoint, 100+
  backends, load-balance + failover) — but the *router* lives in the optimization
  plane and must not write the trust plane (§7 ROUTER-001).
- **Restate / MAF checkpoints** `[F]` → **INTEGRATE** as DurableCheckpoint — persist a
  *signed trust ledger* so a resumed agent never re-verifies, re-pays, or skips a gate.
- **Recovery *ledger* (not a retry loop) + graph-cost-out routing** `[F]` → **ADOPT**
  into ReliabilityKernel — a failed component's edge goes infinite-cost and the next
  driver is JIT-installed; the attack makes the harness *reconfigure*, not just alarm.

### MemoryStore (interface 12)
- **Compartmentalized memory + context firewall** `[K]` — untrusted retrieved content
  is quarantined from the trust plane; a poisoned document cannot forge a verdict. →
  **NEW**, on **pgvector** `[F]` (vectors + ACID inside Postgres). This is the
  MemoryStore driver and it is a direct antibody to retrieval-stage injection.

### MCP hardening (cross-cutting, interface 1 + 3)
- **MCP security: token passthrough prohibited; audience binding required
  (RFC 9068); progressive least-privilege scope elevation is *draft guidance*
  (SEP-835 is a proposal)** `[F]` → **ADOPT the prohibitions as invariants**; extend
  `MCP-001` from advertised-vs-executable to manifest-drift / typosquat /
  hidden-instruction / token-passthrough detection.
- **Schema-gated orchestration ("talk freely, execute strictly")** `[F]` (arXiv) →
  **ADOPT as the Envelope's shape** — planning stays open reasoning; *nothing
  executes without schema validation.* This is the academic statement of §3.1.

### Skip (not our surface)
Token vault / KMS as a product, shadow-AI discovery, compliance dashboards,
marketplace vetting, the microVM sandbox as a shell, chaos infra (fold into redteam).

---

## 5. The thin, portable, JIT distribution — and the smallest-kernel discipline

The microkernel is *distributed* thin and *installed* just-in-time. That part of v1
stands:

```
  DOWNLOAD (thin, ~seconds)             JUST-IN-TIME (lazy, per-interface)
  ┌───────────────────────────┐        ┌──────────────────────────────────┐
  │ @hyperdag/trustshell KERNEL│        │  driver logic  (on first intercept)│
  │  • the 14 interfaces        │  ───▶  │  L3 heavy assets (at point of use: │
  │  • Trust/Action Envelope    │        │     zk circuits, redteam corpora,  │
  │  • PDP + fail-closed gate   │        │     contract ABIs, OASF records)   │
  │  • Capsule L1 descriptors   │        │  resolved from RepID-signed remote │
  │    (~100 tok each)          │        │  registry (git/S3/glob); FAIL      │
  └───────────────────────────┘        │  CLOSED if it can't resolve        │
                                        └──────────────────────────────────┘
```

**Correction — the real risk is over-building the kernel, so the discipline is
explicit.** A 14-interface microkernel diagram is easy to admire and easy to ship
with nothing proven fail-closed. Guard against it with three rules:

1. **Smallest viable kernel first.** The kernel is *only*: the Trust/Action Envelope
   + the PolicyEngine + the fail-closed tool-gate + the AttestationSink (receipt).
   Everything else is a driver behind an interface, added when a real intercept needs
   it — not because the diagram has a box for it.
2. **One reference driver per interface, then stop.** Ship *one* PolicyEngine (Cedar),
   *one* CapabilityMinter (SPIFFE+OpenBao), etc. A second driver is only worth it once
   a real second venue demands it. Breadth of interfaces, depth of one driver each.
3. **No interface ships without its adversarial sim + mutant.** An interface is not
   "done" when it has a driver; it is done when `trustshell sim` drives an adversarial
   agent through it and a mutation test *sees* it breach without its guard (§7). An
   interface with no mutant is an untested claim.

Rule 3 is the antidote to this repo's defining defect — *a system reporting success
it has not earned.* A kernel interface with a green unit test and no adversarial
mutant is exactly that defect wearing an architecture diagram.

---

## 6. Ship now vs. ship before scale

### Ship NOW (thin, verifiable by simulation, no users required)
1. **Trust/Action Envelope + out-of-agent PDP (Cedar, default-deny)** + deterministic
   fail-closed tool-gate wired to x402 (unpaid → block) and RepID (below threshold →
   block). Mutation-test that it fails closed. *(kernel core — do this first)*
2. **Universal Trust Receipt schema** → HyperDAG writer (+ EAS when consequential).
   *(the AttestationSink; unlocks the §3.3 flywheel)*
3. **`trustshell sim` harness + `check:sim-gate-hold`** (§7) — the engine that makes
   every later interface provable. *(highest leverage)*
4. **Composition Hash as a reputation input** — close the §3.2 over-crediting gap;
   ANCHOR-001 is the wedge.
5. **`.skill` / Agent Capsule packaging + 3-level loader** for one capability (HAL)
   end-to-end, OASF vocabulary, fail-closed resolution.
6. **`ROUTER-001`** — prove the optimization-plane router cannot write the trust plane.
7. **Recovery-ledger + graph-cost-out driver** in ReliabilityKernel.
8. **MCP tool-poisoning scanner** — extend `MCP-001` (manifest drift / typosquat /
   hidden-instruction / token-passthrough).
9. **Kill switch + circuit-breaker SLOs** (revocation flag + error budget) — the
   apoptosis mechanism.

### Ship BEFORE scale (design now, activate on users/traffic/infra)
- **Temporal/session policy activation** (needs real session traffic to tune).
- **CapabilityMinter on live secrets** (SPIFFE/OpenBao — needs real credential flows).
- **Compartmentalized MemoryStore hardening** (needs real retrieval traffic to attack).
- **DID/SPIFFE identity interop** and the **ERC-8004 external adapter** (needs
  cross-venue agents; keep the Draft ERC adapter-isolated).
- **BFT quorum activation** (code-complete, blocked on traffic — `TRUST-HARNESS-STATUS`).
- **x402 session spending-cap enforcement** (enforce when real spend flows).
- **A hardened sandbox** — only if/when untrusted agent-authored code runs at scale.

---

## 7. Antifragile loops to run NOW ("no users is the best time")

Self-learning/self-healing means *adaptation from evidence*, not retries. Four loops
that run entirely on simulation + adversarial pressure:

1. **Red-team → probe → ledger → fix → probe-HELD** *(house pattern).* Every survived
   attack becomes a permanent antibody. Extend it so the **recovery-ledger** consumes
   probe outcomes: a component that fails a probe is cost-out and an alternate driver
   is JIT-installed — the attack makes the harness *reconfigure*.
2. **`trustshell sim` — synthetic agent traffic** *(build this).* Spin N synthetic
   agents (tunable % adversarial) through the **full** kernel — Envelope → PDP verdict
   → capability-mint → work → HAL verify → x402 pay → RepID update → Trust Receipt →
   EAS — and measure the one number that matters: **gate-hold rate under attack** (does
   every interface fail closed?). Run in CI as `check:sim-gate-hold`. This is the loop
   that turns "no users" into the advantage: thousands of adversarial sessions today,
   zero risk.
3. **`ROUTER-001` — the plane-separation antibody** *(new).* Drive the trust-aware /
   MoE router with an adversarial reward that *pays* for reaching a denied tool. The
   probe HOLDS only if the router provably cannot write the trust plane — no matter
   how the optimization signal is shaped, "models propose, TrustShell disposes" must
   hold. This is the mutation-tested statement of §2.1.
4. **Mutation of every guard** *(already `mutate`).* Every new interface ships with its
   mutant (rule 3, §5). A guard is unproven until *seen* to breach without its property.
5. **HAL self-eval (trivial-agent / ABC discipline).** Does the eval catch a
   do-nothing agent? Feed HAL's verdict + the RepID delta back as the agent's own
   self-correction signal; the redteam supplies the adversarial half. Antifragile =
   the loop that gets stronger from the attacks it survives.

**Measurable target for the next sprint:** stand up `trustshell sim`, drive the full
kernel loop with ≥1 adversarial agent, and show — mutation-tested — that **every
interface fails closed**, `ROUTER-001` HOLDS, and a Trust Receipt per session is
written to HyperDAG. That is a demoable "we red-team our own trust microkernel
end-to-end, evidence-backed, no users required" story.

---

## 8. The moat — borrow the boundary, build the reputation

Cedar, OPA, LiteLLM, SPIFFE, OpenBao, circuit-breakers, guardrail rails, recovery
ledgers are **commodity drivers** — adopt them behind their interfaces and move on.
The genuinely novel, defensible layer is the interface the incumbents' own diagrams
label "still unusually underdeveloped": **earned, attested, portable reputation +
earned autonomy, keyed to a composition hash.** RepID answers a question none of
AgentCore / MAF / AGT / NeMo asks — *"based on everything this composition has
verifiably done in this domain, how much autonomy has it earned now?"* — and zkRepID
+ EAS make that answer portable and privacy-preserving across venues. Two things
turn the moat from "a score" into "a primitive others must build on":

- **The composition hash (§3.2)** — reputation about *what the agent is*, not just
  who it claims to be. Fix the measured over-crediting gap and RepID becomes the only
  reputation in the field that survives a model-swap honestly.
- **The Trust Receipt flywheel (§3.3)** — reputation that *compounds from verified
  receipts*, with the verifiers themselves reputation-ranked (HAL-as-marketplace).

Every hour reimplementing a policy engine is an hour not spent here. **Borrow the
boundary, build the reputation.**

---

## 9. The corrections to the vision (summary)

The vision is a genuine step-change over v1's framing; these four are where building
"the best version" means *improving* it, not just adopting it:

1. **Rename Trust Execution Envelope → Trust/Action Envelope.** "TEE" collides with
   *Trusted Execution Environment*, which appears in ERC-8004's own validation section
   — a guaranteed confused threat model. (§3.1)
2. **The Composition Hash closes a gap we can measure today.** [MEASURED 2026-09-02]
   no reputation table keys on model/tools/composition — a model-swap is over-credited
   *now*. It is the same defect as `ANCHOR-001` (bind to the artifact, not the
   identity), so it is one primitive, not two. (§3.2)
3. **"Optimization plane ≠ trust plane" is a buildable antibody, `ROUTER-001`, not a
   principle.** The learning router must be *structurally unable* to write the trust
   plane, and that must be mutation-tested, or "models propose, TrustShell disposes"
   is a slogan. (§2.1, §7.3)
4. **The real risk is a 14-interface kernel with nothing proven fail-closed.** Smallest
   viable kernel first; one reference driver per interface; no interface ships without
   its adversarial sim + mutant. (§5)

---

## 10. Sequenced first PRs (all in-lane, verifiable, no merge-to-main without Sean)

1. `docs/` (this doc) — the strategy of record. *(this PR)*
2. **Trust/Action Envelope + PDP (Cedar) + fail-closed tool-gate** + its mutant — the
   kernel core.
3. **Universal Trust Receipt schema** → HyperDAG writer (+ EAS). *(unlocks the flywheel)*
4. **`trustshell sim` harness + `check:sim-gate-hold`** — the measurement engine.
5. **Composition Hash as a reputation input** (close §3.2; ANCHOR-001 is the wedge).
6. **`ROUTER-001`** plane-separation antibody.
7. **Agent Capsule `.skill` packaging** for HAL end-to-end (OASF vocabulary).
8. **Recovery-ledger + graph-cost-out resolver**; extend **`MCP-001`** → tool-poisoning.

**Sean-gated:** activating any gate on live traffic, real x402 spend, CapabilityMinter
on live secrets, DID/ERC-8004 interop, the fleet executor. Everything in 1–8 is
buildable and provable against simulation without users.

---

## Verification note

External mechanisms were recovered via **WebSearch of the named source pages** —
direct WebFetch was blanket egress-blocked this session (proxy `selective:false`).
Every external-standards claim in §4 was **independently re-verified this session**
by a second pass (WebSearch); the softenings it returned are folded in verbatim:
OASF v1.1 "added an Agent Skills module that represents SKILL.md packages as OASF
records" (no unconfirmable release month, no reverse-direction SDK claim); ERC-8004
"Draft (with live reference deployments)"; AIBOM "emerging practice, not a ratified
standard"; x402 "crypto/stablecoin-settlement-oriented"; MCP scope-elevation "draft
guidance (SEP-835 is a proposal)". Items are tagged `[F]` (fetched via search) or
`[K]` (from-knowledge). TrustShell capability grades (EXISTS/PARTIAL/NEW) are
grounded in code/DB measured this session — the composition-hash gap in §3.2 is
[MEASURED 2026-09-02] against `repid_agents`/`repid_scores`/`repid_zkp_proofs`. The
two X.com links in the brief were unreachable and are deliberately not summarized.
Nothing here is claimed as shipped that is not graded EXISTS in §1/§2.2; §3–§10 are
proposals. This doc supersedes the v1 "thin JIT layer" framing of 2026-09-02 (same
date) — the thin layer is retained as §5, correctly placed as distribution.
