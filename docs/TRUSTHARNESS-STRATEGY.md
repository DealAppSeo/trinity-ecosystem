# TrustHarness strategy — TrustShell as a portable microkernel for trustworthy agency

**Status: strategy + research synthesis, 2026-09-02 (v3). Not an inventory of
shipped work.** v2 reframed this as a microkernel; **v3 folds in four refinements
from a second Grok + Chat pass and grounds the build order against live operational
reality measured this session** (§1.5). The four v3 refinements — each of which
changes a schema the kernel-core PR would otherwise bake in wrong: (a) **HAL sits
outside the trusted computing base** — evidence, never authority (§2.1, §3.1); (b)
**evidence is separated from the reputation algorithm** — canonical evidence store +
versioned "Trust Lenses" (§3.3); (c) **four-level identity** (Principal / Capsule /
Composition / Execution) + inheritance discount replaces a single composition hash
(§3.2); (d) a **Personal Constitution** (hard/soft, signed, hashed) is primitive #0
— the fences the kernel protects (§3.0). The thin/JIT layer remains, correctly
placed as the *distribution mechanism* (§5), not the whole architecture.

Where this doc names a TrustShell capability as **EXISTS / PARTIAL / NEW** it is
graded against code/DB state measured this session; where it names an external
mechanism it is labelled `[F]` (recovered via WebSearch of the named source —
direct WebFetch was blanket egress-blocked this session, proxy `selective:false`)
or `[K]` (from-knowledge). Every external-standards claim in §4 was independently
re-verified this session (WebSearch) — see the Verification note; the softenings it
found are already folded in. The vision inputs synthesized here are two external
architecture passes (referred to as **Grok** and **Chat**) plus one operational
read from an advise-only Claude surface; where those documents and the live database
disagreed, **the database wins** (per `trinity-preflight`) — §1.5 records where that
happened.

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

## 1.5 Operational reality — measured, not assumed [VERIFIED 2026-09-02, this session]

An advise-only review of the Grok/Chat plans argued *"fix the fires first, treat the
architecture as a vision-target, not a build order."* The posture is right, but that
review ran **no live queries**; measuring its three named fires this session (Supabase
MCP) corrects two of them and changes the build decision — build order must be
grounded, not read from a prior doc (`CLAUDE.md`: *run it, don't read it*).

| named fire | live measurement | verdict |
|---|---|---|
| "19,459-task peer_verify backlog" | `trinity_tasks` peer_verify by status: **no `pending` bucket** — done 98,873 / cancelled 33,257 / archived 27,612 / failed 23,061 / shadow_reject 307 / completed 46 | **NOT LIVE** — drained |
| "dark telemetry: ANFIS/ZKP/BFT all 0/24h" | ANFIS `anfis_routing_logs` last row 2026-08-22 (0/24h); `bft_payment_evaluations` **0 total**; **`repid_zkp_proofs` 5/24h, 121/7d** | **PARTLY LIVE** — ANFIS + BFT dark; **ZKP is not** (trickle) |
| "fleet-liveness signal conflict" | `v_fleet_truth`: `is_live` **0/12** — but `probe_ok`/`is_reachable` **12/12**, probed 3.5 min ago; `minutes_since_ping` ≈ 47 days | **NOT DARK — up and idle** (see below) |

Preflight verdict this session: **GO**, `global_pause=false`; `orphaned_claims: 23113`
(the #59 release — the preflight view itself notes it "does not gate the fleet").

**Correction, caught by `check:open-work` (PRIOR-WORK: `hal-volume-stopped-2026-07-17`).**
My first read of this row said "fleet dark, 0/12 live" — wrong, and wrong in the exact
way the OPEN index and `trinity-preflight` warn about. `is_live=0/12` is a **known
false negative**: agent-side heartbeat writes were deliberately removed 2026-07-17, so
`minutes_since_ping` sits at ≈ 47 days on every agent, while the *reachability* probe
shows all 12 `probe_ok=true` / `is_reachable=true`, last probed 3.5 min ago. The fleet
is **up and idle, not down** — *absence of a signal you turned off is not evidence of
absence.* The honest fleet signal is `probe_ok`/`is_reachable`, never `is_live` or any
static `status` column; this is owned open work (owner T12), cited here, not re-derived.

**What this means for the build order.** The genuinely-dark surfaces are the
*telemetry* ones — BFT (0 rows) and ANFIS routing (11 days stale) — and both are
**traffic-gated**, not fixable from a cloud/GitHub session. The fleet processes are up
but idle (a separate, Sean-gated supply matter). **None of this gates building the
kernel *contract*** (the Envelope + a deterministic gate + a receipt), which is
precisely the thing provable by *simulation with zero traffic and zero users* (§7). So
the two postures reconcile: **build the smallest kernel core, pre-incorporating the
v3 refinements so nothing is rebuilt, scoped hard against the "someday" list, and
slotted *into* the ratified sequence (Trust-Keys-first) rather than ahead of it.** The
liveness-signal confusion is itself a live illustration of "trustworthiness ≠
availability" (§3.3): consumers must read reachability, not a turned-off heartbeat —
but that is documented open work, not a fire this doc reopens.

> **One claim I could not verify and therefore will not repeat:** Grok's line that
> ERC-8004 deployments show *"lots of dead endpoints and Sybil-shaped feedback."* No
> source was provided, and the standards-verification pass (§4) found only that
> ERC-8004 is *Draft with live reference deployments.* Per the claim gate it stays
> out of every doc until cited. The **architectural** lesson it motivates — keep
> ERC-8004 as a public adapter, keep the internal truth private — stands on its own.

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

**Refinement (a) — HAL is evidence, never authority.** There is a third region the
plane split must name: the **evidence plane** (HAL / VERITAS and every validator).
HAL is *probabilistic*, so it cannot sit inside the trusted computing base. The
correct topology is not `… → HAL → execute` with HAL in the authority path; it is:

```
   TRUSTED COMPUTING BASE (deterministic)          EVIDENCE PLANE (probabilistic)
   ┌───────────────────────────────────┐           ┌──────────────────────────────┐
   │ schema · identity · capability     │  asks for │ deterministic tests          │
   │ deterministic policy · budget      │  evidence │ citation / grounding / sec   │
   │ nonce/replay · approval enforce     │ ────────▶ │ LLM juries · heterogeneous   │
   │ execution enforce · receipt sign    │ ◀──────── │ jury · zkML / TEE · human    │
   └───────────────┬───────────────────┘  evidence  └──────────────────────────────┘
                   │  (confidence, agreement, evidence-quality — NOT a verdict)
                   ▼
          DETERMINISTIC POLICY decides:
          if financial_exposure > $1k: require HAL_confidence > .99
                                        AND ≥2 independent validators AND human ASK
```

HAL reports `confidence=.984`, `validator_agreement=4/5`, `fraud_signal=false`.
**Policy** — deterministic, mutation-tested — decides ALLOW/DENY/ASK/VERIFY from
those numbers against the Envelope's risk class. Otherwise we have quietly placed
probabilistic authority back inside the kernel, which is the same failure as letting
the router write the trust plane. This is why the `VERIFY` verdict (§3.1) *requests
evidence* and returns to policy; it never lets HAL execute.

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
| DNA — *what the organism is* | **four-level identity** — Principal / Capsule / Composition / Execution (§3.2) | trust | **NEW** |
| Constitution / genome constraints | **Personal Constitution** — hard rules the cortex cannot rewrite | trust | **NEW** (§3.0) |
| Cerebellum / immune sensing | **HAL / validators** — detect error, verify outcome; **report, never decide** | evidence | EXISTS |
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

## 3. The priority primitives

The first Grok/Chat pass named three primitives; v3 prepends a fourth as **#0**,
because the Envelope has to enforce *something*. Ordered: the **Constitution** is
what the kernel protects, the **Envelope** is the boundary, **identity** is what
crosses it, and the **Receipt/evidence** is the record that turns crossings into
reputation.

### 3.0 Personal Constitution — the fences the kernel protects (primitive #0)

Grok's plan carries a "sovereign dial + standards hash"; Chat promotes it, and v3
makes it primitive #0 because *the Envelope's whole job is to enforce a set of
invariants, and those invariants need a home.* Two layers:

- **Hard / constitutional** — the PAI/agents *cannot* modify these, and no volume of
  successful outcomes can "optimize" them away: never reveal credentials; never
  spend over the user's cap without approval; medical/`SECRET` data stays local;
  never permanently delete without approval; never impersonate the user; never
  change the RepID algorithm silently; never edit the Constitution itself.
- **Soft / preference** — the PAI *may* learn these: prefer open-source/local models,
  concise emails, stronger models for architecture, privacy over a 10% latency win.

The hard layer is signed and content-hashed (`constitution-v17 → 0x81D…`); a change
requires explicit user authorization and mints a new signed version. **Every Trust
Receipt (§3.3) records which constitution hash governed the action** — that is the
accountability property that makes "the agent could not have done X" checkable after
the fact. Codebase: **NEW**. It maps onto the existing fail-closed posture: the
Constitution is just the deterministic policy's top-priority, user-owned rule set.

### 3.1 Trust/Action Envelope — the disposition boundary

> **Naming correction to the vision:** the brief called this the *Trust Execution
> Envelope*. Rename it **Trust/Action Envelope** (or just **Action Envelope**). "TEE"
> already means **Trusted Execution Environment** across this exact stack — ERC-8004's
> own validation section lists *TEE oracles* — and shipping a second "TEE" guarantees
> a confused threat model. The renamed thing is unambiguous.

A normalized, pre-execution struct for *every* proposed action — `{request_id,
principal, capsule_id, composition_id, constitution_hash, capability, tool,
args_hash, context-refs, prior-action-refs, requested-scope, data_classification,
risk_class, reversibility, financial_exposure, max_cost, required_rep,
required_evidence, policy_version, expiry, nonce}` — handed to the PolicyEngine,
which returns exactly one of **ALLOW / DENY / ASK / VERIFY**. `ASK` routes to an
approver; `VERIFY` *requests evidence* from a VerificationProvider (HAL) and returns
to policy for the decision (§2.1 refinement (a) — HAL never executes). This is the
single chokepoint that makes "models propose, TrustShell disposes" concrete: the
model never calls a tool directly, it *proposes an Envelope*, and the LLM's output
is thereby **untrusted input to a deterministic gate**.

The Envelope and its resulting Receipt (§3.3) share the same field set, so the pair
forms a **proof-carrying request → proof-carrying receipt** that can travel across
MCP / A2A / REST / x402 / local processes unchanged — a naming/schema discipline, no
new build. Codebase: **NEW** — but it slots directly onto the existing fail-closed
`/pay` pattern (null threshold → 503) generalized from payments to all actions. It
is the academic *schema-gated orchestration* pattern (§4): planning free, execution
validated against a machine-checkable schema.

### 3.2 Four-level identity + Agent Capsule — and the live over-crediting gap

**Refinement (c) — one composition hash is too coarse; use four levels.** v2 bound
reputation to a single Composition Hash. Chat's correction is strictly better and
solves the brittleness (a model swap should neither be ignored nor zero out a hard-
earned score). Four identities:

| level | answers | lifetime | example |
|---|---|---|---|
| **Principal ID** | who is this? | persistent | `agent://sean/builder` |
| **Capsule ID** | what role/contract? | persistent across compatible builds | `Builder Capsule v4` |
| **Composition ID** | what exactly is running? | immutable per build | Merkle hash of {model, system prompt, skills, tools, MCPs, policy, HAL config, memory modules, sandbox, deps, versions} |
| **Execution ID** | which run did this? | ephemeral | `task-exec #93AE…` |

Reputation becomes **hierarchical** — `Principal → Capsule → {Composition A, B, C} ×
domain` — which lets a change **inherit reputation with a confidence discount**
instead of transferring blindly or resetting. Swap Claude→Qwen only: maybe
`942 × 0.85`. Swap model **and** disable HAL **and** add an unknown MCP **and** grant
unrestricted shell: `942 × 0.15`. Over time the system *learns empirically* which
component changes move reliability (changing the summarizer barely matters; changing
the financial-calc tool matters a lot) — reputation *lineage*, analogous to software
provenance (AIBOM, §4). An **Agent Capsule** is the on-disk manifest carrying all
four IDs (OASF as the vocabulary, `.skill` as the on-disk form); its Composition ID
is the content hash of the bundle.

**Correction — this is not a nice-to-have; it closes a gap that is live today.**
[MEASURED 2026-09-02 against `repid_agents`/`repid_scores`/`repid_zkp_proofs`]:
reputation keys on `agent_id` / `canonical_agent_id` / `agent_name` +
`domain_accuracy`. **No reputation column binds the agent's *composition*** — the
model+tools+policy+prompt that produced the work. Being precise about what *is*
there, because the gap is a claim of absence and this project retracts those first:
every hash/commitment-shaped column present — `mint_tx_hash`,
`last_reputation_tx_hash` (transaction hashes), and on `repid_zkp_proofs`
`merkle_root`, `poseidon2_leaf`, `zk_commitment`, `work_statement_hash`,
`eas_attestation_uid` — binds a transaction, a proof leaf, a work statement, or the
on-chain anchoring; **none is a content hash of the composition.** `repid_agents`
*does* carry `capabilities` (jsonb) and `byok_provider` (text), but these are
free-form descriptors, not a content hash, and the score does not key on them — they
can change under a fixed `agent_id` while the earned RepID rides along unchanged.
Consequence: **an agent that keeps its `agent_id` but swaps its underlying model or
tools carries its full earned RepID into a materially different system.** A
RepID-920 agent is trusted for what a *previous composition* earned.

This is **structurally the same defect as `ANCHOR-001`** — an attestation that
binds to an identity instead of to the actual artifact. So the fix is one primitive,
not two: make the **Composition ID** a first-class input to reputation, so a score
is a claim about *this composition in this domain*, and a model-swap inherits with a
confidence discount (above) rather than riding along at full value. This turns the
vision's composition identity from "a good idea others are exploring" into "the
remediation for a gap we can measure in our own database right now." Codebase:
**NEW**; ANCHOR-001 is the ledgered wedge.

### 3.3 Trust Receipt = canonical evidence → Trust Lenses → HAL → zkRepID flywheel

Every disposition emits a **universal Trust Receipt**: `{who, for-whom, what,
with-what (model+tools+MCPs), under-what-authority (capability grants +
constitution_hash), cost, evidence (input/output hashes), verification (HAL
results), outcome, rep-effect, composition_id, timestamps, parent-task}`, hash-
chained into HyperDAG and EAS-anchored when consequential. It is the equivalent of a
browser's HTTPS lock icon: the private payload stays private; only proofs or selected
receipts are exposed.

**Refinement (b) — separate canonical evidence from the scoring algorithm.** This is
the single strongest idea in the second pass, and it is cheap in principle. Do **not**
make zkRepID one hardcoded scoring function over the receipts. Make the receipts a
**canonical evidence store** (outcomes, failures, abstentions, HAL results, disputes,
payments, validators, compositions, timestamps), and make scoring a set of
**versioned, pluggable Trust Lenses**:

```
   EVIDENCE (canonical, append-only)
        │
        ├── Lens: repid-standard-2.3   → score
        ├── Lens: corporate-security    → score   (weights security higher)
        └── Lens: user-defined          → score   (church weights stewardship;
                                                    dev weights SWE-bench competence)
```

Evidence is the truth; scores are *interpretations*. This buys three things at once:
you can change weights / decay / Bayesian model / EigenTrust / collusion penalties
**without rewriting history**; different parties can apply their own trust model to
**shared, compatible evidence** (directly aligned with the portability thesis); and
zkRepID then proves a precise, algorithm-versioned claim — *"under lens
`repid-standard-2.3`, evidence through 2026-09-02, domain `software.security`, capsule
`Builder`: `reputation ≥ 900 ∧ verified_jobs ≥ 100 ∧ severe_failures = 0`"* — without
exposing the underlying graph. Reputation becomes **portable + inspectable +
algorithm-versioned + privacy-preserving**, which is far more defensible than one
opaque proprietary number.

That is the flywheel: **use → receipt (evidence) → verification → lens → reputation →
more (or less) autonomy → use.** HAL stays a *marketplace* interface (any staked
validator that produces receipt-checkable evidence can compete; validator reputation
is itself earned), and — per §2.1(a) — HAL feeds the evidence store, it does not
score. Codebase: EAS anchoring **EXISTS**, HAL **EXISTS**, RepID **EXISTS** (as one
lens, keyed to identity+domain — the §3.2 gap); the **canonical-evidence receipt
schema + the evidence/lens split is NEW** and is the highest-leverage small piece,
because *the one thing you cannot retroactively manufacture is real historical
evidence* — every day the kernel runs without structured receipts is reputation data
permanently lost. Start collecting receipts before building the lenses.

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
- **Attenuable capability tokens: Eclipse Biscuit / UCAN** `[K]` → **PROTOTYPE one (not
  both), don't invent the crypto.** Both give publicly-verifiable, offline-attenuable
  authority chains — an agent can *narrow* a token but never widen it (`Human →
  PAI → Builder → research-subagent`, rights only shrink down the tree). That
  monotonic-attenuation property is exactly the swarm-delegation guarantee the
  CapabilityMinter needs; fold the prototype into Trust-Keys work (§6), pick one when
  we get there.

### PaymentRail (interface 6)
- **x402** `[F]` — open, HTTP-native (402), chain-agnostic (CAIP-2), now under the
  x402 Foundation (Coinbase + Cloudflare); **crypto/stablecoin-settlement-oriented**
  (payment-rail neutral, not card-network-inclusive). → **ADOPT** as PaymentRail;
  **x402 behind a capability** = the vision's "Proof of Economic Work."
- **x402 session spending-caps (max-spend + expiry, checked before signing)** `[F]` →
  **ADOPT** (design now; enforce when real spend flows).
- **Higher-value job escrow: ERC-8183** `[K]` — a Feb-2026 *Draft* proposal for agentic
  job escrow (funded job → provider submits → evaluator completes/rejects →
  release/refund), explicitly compatible with ERC-8004 reputation. → **INTEGRATE later
  as a separate escrow adapter**, not foundation: x402 = fast payment *transport* for
  cent-scale calls; escrow + HAL-evaluator + dispute path for `$500`+ jobs. Draft, so
  adapter-isolated like ERC-8004.

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

### Component / MCP supply-chain manifest (cross-cutting) — the incident-tied near-term ADD
If everything is a swappable driver, then **the adapters are the attack surface.**
Every MCP / plugin / skill / model / tool / container / capsule should carry a
**Component Manifest**: publisher, version, source, hash/signature, permissions
requested, network/filesystem/secrets access, dependencies, SBOM, last security scan,
RepID, prior incidents. The Composition ID (§3.2) then becomes a **Merkle tree over
trusted components**, and component reputation becomes its own eventual RepID market
(reputation for MCPs/skills/tools, not just agents). → **ADOPT now, cheaply**, using
**in-toto** (verifiable supply-chain attestations) and **SLSA** provenance `[K]` as
adapters rather than inventing the format. This is the one item both the second-pass
and the operational read independently flag as *build-now*, because it maps directly
to the **#57 leaked-JWT incident** — a manifest with "secrets requested / last scan"
would have scoped that faster — and it belongs **inside Trust-Keys work** (§6), which
the ratified sequence already puts first.

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
0. **Personal Constitution + trust invariants** (§3.0) — the hard fences the kernel
   protects. Tiny, and it defines *what* everything below enforces, so it comes first.
1. **Trust/Action Envelope + out-of-agent PDP (Cedar, default-deny)** + deterministic
   fail-closed tool-gate wired to x402 (unpaid → block) and RepID (below threshold →
   block), with **HAL as evidence-provider only** (§2.1(a)). Mutation-test that it
   fails closed. *(kernel core — do this first)*
2. **Canonical-evidence Trust Receipt schema** (§3.3) → HyperDAG writer (+ EAS when
   consequential). Store *evidence*, not a score — the lenses come later, but the
   evidence must start accruing on day one. *(the AttestationSink; unlocks the flywheel)*
3. **Component / MCP manifest** (§4) — publisher/version/hash/permissions/last-scan per
   adapter; ties to Trust-Keys, maps to the #57 incident. *(cheap, incident-tied)*
4. **`trustshell sim` harness + `check:sim-gate-hold`** (§7) — the engine that makes
   every later interface provable. *(highest leverage)*
5. **Four-level identity + Composition ID as a reputation input** — close the §3.2
   over-crediting gap with inheritance discount; ANCHOR-001 is the wedge.
6. **`.skill` / Agent Capsule packaging + 3-level loader** for one capability (HAL)
   end-to-end, OASF vocabulary, fail-closed resolution.
7. **`ROUTER-001`** — prove the optimization-plane router cannot write the trust plane.
8. **Recovery-ledger + graph-cost-out driver** in ReliabilityKernel.
9. **MCP tool-poisoning scanner** — extend `MCP-001` (manifest drift / typosquat /
   hidden-instruction / token-passthrough).
10. **Kill switch + circuit-breaker SLOs** (revocation flag + error budget) — apoptosis.

### Ship BEFORE scale (design now, activate on users/traffic/infra)
- **Trust Lens marketplace** (§3.3) — the second+ scoring lenses; the evidence store
  ships now, the pluggable algorithms wait until there's evidence to interpret.
- **Temporal/session policy activation** (needs real session traffic to tune).
- **CapabilityMinter on live secrets** (SPIFFE/OpenBao + a Biscuit/UCAN prototype —
  needs real credential flows).
- **Compartmentalized MemoryStore hardening** (needs real retrieval traffic to attack).
- **DID/SPIFFE identity interop**, the **ERC-8004 external adapter**, and the
  **ERC-8183 escrow adapter** (needs cross-venue agents / high-value jobs; keep both
  Draft ERCs adapter-isolated).
- **2-D RepID with uncertainty intervals** (§9) — `950 ± 12` on 3 jobs ≠ `930 ± 3` on
  8,000; make evidence-coverage first-class once there is enough evidence to have an
  interval.
- **Governance counterfactual-replay** — never vote a scoring-lens change without
  replaying historical receipts through it first.
- **Local Safe Mode** — identity/constitution/policy/secrets/receipts survive when
  AWS/OpenAI/Supabase are unreachable; external actions fail-closed or queue.
- **BFT quorum activation** (code-complete, blocked on traffic — `TRUST-HARNESS-STATUS`;
  live 0 rows, §1.5).
- **x402 session spending-cap enforcement** (enforce when real spend flows).
- **A hardened sandbox** — only if/when untrusted agent-authored code runs at scale.

### Explicitly NOT now (logged, not built)
- **Restructuring the live 12-agent Trinity topology into "3+1 + JIT specialists."**
  3+1 (PAI + Builder + Seller + Operator, as *capsules* not personalities) is the
  right *product* model for the eventual PAI, but rewiring the running fleet (up and
  idle per §1.5, a Sean-gated supply matter) is sequencing risk with no upside now.
  The capsule model is a design target; the fleet stays as-is until Sean says otherwise.
- **The full 20-primitive roadmap** (Trust-Lens marketplace, ZK selective disclosure,
  escrow, governance replay, reflex/verify/human paths — the last already exists as
  `TOOL_ROUTING_MATRIX_V0`). Good thinking; not a next sprint against three
  Sean/traffic-gated fires.

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

The visions are genuine step-changes; these are where building "the best version"
means *improving* on them, not just adopting them. The first four are v2's; 5–8 are
the v3 refinements from the second Grok/Chat pass; 9–10 are where v3 pushes back.

1. **Rename Trust Execution Envelope → Trust/Action Envelope.** "TEE" collides with
   *Trusted Execution Environment*, which appears in ERC-8004's own validation section
   — a guaranteed confused threat model. (§3.1)
2. **Composition identity closes a gap we can measure today.** [MEASURED 2026-09-02]
   no reputation column binds the agent's *composition* — its hash-shaped columns bind
   transactions, proof leaves, work statements, and anchoring, and its `capabilities`/
   `byok_provider` descriptors are neither content hashes nor score keys — so a
   model-swap is over-credited *now*. Same defect as `ANCHOR-001`. (§3.2)
3. **"Optimization plane ≠ trust plane" is a buildable antibody, `ROUTER-001`, not a
   principle.** The learning router must be *structurally unable* to write the trust
   plane, mutation-tested. (§2.1, §7.3)
4. **The real risk is a 14-interface kernel with nothing proven fail-closed.** Smallest
   viable kernel first; one reference driver per interface; no interface ships without
   its adversarial sim + mutant. (§5)
5. **HAL sits outside the trusted computing base.** HAL is probabilistic → it reports
   evidence (confidence, agreement); deterministic policy decides. Putting HAL in the
   authority path is the same failure as letting the router write the trust plane. (§2.1(a))
6. **Separate canonical evidence from the scoring algorithm** (Trust Lenses). Store
   evidence once; make scoring versioned + pluggable; prove algorithm-versioned claims.
   Change weights without rewriting history; different parties, same evidence. (§3.3)
7. **Four-level identity + inheritance discount** beats a single composition hash —
   reputation transfers with a confidence discount instead of blindly or resetting. (§3.2)
8. **Personal Constitution as primitive #0.** Hard rules the cortex cannot rewrite;
   recorded in every receipt. The Envelope needs something to enforce. (§3.0)
9. **Do not restructure the live 12-agent topology now.** 3+1 + JIT is the right
   *capsule* model, not a reason to rewire a running (up-and-idle, §1.5) fleet.
10. **Claim-gate the ERC-8004 "dead endpoints / Sybil-shaped" line.** Unsourced; the
    standards pass found only "Draft with live deployments." Out of every doc until
    cited (§1.5). The architectural lesson (8004 as public adapter) stands regardless.

---

## 10. Sequenced first PRs (all in-lane, verifiable, no merge-to-main without Sean)

The ordering change from v2 is **collect evidence as early as possible** — the one
thing that cannot be manufactured retroactively (§3.3).

1. `docs/` (this doc) — the strategy of record. *(this PR)*
2. **Personal Constitution + trust invariants** (§3.0) — the fences, defined first.
3. **Trust/Action Envelope + PDP (Cedar) + fail-closed tool-gate, HAL-as-evidence**
   + its mutant — the kernel core, one real gated action path.
4. **Canonical-evidence Trust Receipt schema** → HyperDAG writer (+ EAS). Evidence,
   not scores — start it accruing now.
5. **Component / MCP manifest** (in-toto/SLSA) — folds into Trust-Keys; #57-tied.
6. **`trustshell sim` harness + `check:sim-gate-hold`** — the measurement engine.
7. **Four-level identity + Composition ID as a reputation input** (close §3.2).
8. **`ROUTER-001`** plane-separation antibody.
9. **Agent Capsule `.skill` packaging** for HAL end-to-end (OASF vocabulary).
10. **Recovery-ledger + graph-cost-out resolver**; extend **`MCP-001`** → tool-poisoning.

**Sequencing note — this slots INTO the ratified plan, it does not replace it.** The
advise-only read cites a ratified order (`CONSOLIDATED_BUILD_PLAN_2026-07-28`:
Trust-Keys custody → Meta-Agent MVP → unfreeze #59 → mobile). I have **not
re-verified that plan this session** [not checked] — so before building, Sean should
confirm whether Trust-Keys is still #1. If it is, items 2/3/5 (Constitution,
capability-minting, component manifest) *are* Trust-Keys work and lead; the rest
follow. The kernel core does not jump the custody queue.

**Sean-gated:** activating any gate on live traffic, real x402 spend, CapabilityMinter
on live secrets, DID/ERC-8004/ERC-8183 interop, the fleet executor, and any change to
the 12-agent topology. Everything in 1–10 is buildable and provable against simulation
without users.

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
[MEASURED 2026-09-02] against `repid_agents`/`repid_scores`/`repid_zkp_proofs`. Those
grades and that measurement were **independently re-verified by a separate agent**
(checker ≠ doer): it confirmed every EXISTS grade is present and no NEW capability
already exists in code (the adjacent `lib/trustshell/authority-policy.ts` is a
reputation-authority calculator, not the tool-gating PDP graded NEW), and it caught
one imprecision in the first draft's §3.2 — an incomplete hash enumeration — which
is corrected above to "no *composition*-binding hash" rather than "only three hashes
exist." The two X.com links in the brief were unreachable and are deliberately not
summarized.
Nothing here is claimed as shipped that is not graded EXISTS in §1/§2.2; §3–§10 are
proposals. This doc supersedes the v1 "thin JIT layer" framing of 2026-09-02 (same
date) — the thin layer is retained as §5, correctly placed as distribution.

**v3 provenance (2026-09-02).** v3 folds in a second Grok + Chat architecture pass
plus one operational read from an advise-only Claude surface. The four schema-shaping
refinements (§0 header: HAL-outside-TCB, evidence/lens split, four-level identity,
Personal Constitution) and the component/MCP manifest are adopted; ten "someday"
primitives are logged not built (§6); two vision points are pushed back on (§9.9–9.10).
The **operational reality in §1.5 is [VERIFIED 2026-09-02, this session]** against live
`qnnpjhlxljtqyigedwkb` via Supabase MCP — surface = cloud/scheduled, access = GitHub
yes / Railway no / Supabase yes, preflight verdict GO. It corrects the advise-only
read's fire list: the peer_verify backlog is drained (0 pending) and the ZKP emitter
is a trickle (5/24h), not dark; ANFIS + BFT telemetry are dark; and the fleet is **up
and idle, not dark** (`is_live=0/12` is a known false negative per OPEN
`hal-volume-stopped-2026-07-17` — `probe_ok`/`is_reachable` 12/12; `check:open-work`
caught the first draft's "0/12 live = dark" misread). All are Sean/traffic-gated and
none blocks the kernel contract. Where the vision docs and the database disagreed, the
database won (per `trinity-preflight`). The one
figure I could not source — ERC-8004 "dead endpoints / Sybil-shaped feedback" — is
excluded per the claim gate. The ratified build sequence (`CONSOLIDATED_BUILD_PLAN`)
is referenced but **not re-verified this session** and is flagged as such in §10.
