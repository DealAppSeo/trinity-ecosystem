# TrustHarness strategy — the thin, portable, just-in-time trust layer

**Status: strategy + research synthesis, 2026-09-02. Not an inventory of shipped
work.** Where it names a TrustShell capability as EXISTING it is grounded in
measured code/DB state (this session); where it names an external mechanism it is
labelled `[FETCHED]` (recovered via WebSearch of the named source — direct
WebFetch was blanket egress-blocked this session) or `[FROM-KNOWLEDGE]`. The two
X.com links in the brief were unreachable and are **not** summarized here.

Read `docs/SYSTEM-MAP.md` and `docs/TRUST-HARNESS-STATUS-2026-08-17.md` first —
this builds on them, it does not restate them.

---

## 0. The thesis in five sentences

TrustShell is **not greenfield**, and it is already **thin**: `@hyperdag/trustshell`
is v1.3.0 with **four runtime deps** (`@hyperdag/proof-verifier`, MCP SDK, `ethers`,
`zod`), shipping `trustshell` / `hal` / `trustshell-mcp` CLIs, and the harness
already carries the load-bearing spine — contract → work → **independent** Evaluator
→ signed contract-bound verdict → accept/reject, with `checker_must_not_be_doer`
constitutional, a mutation-tested E2E fixture, and a live fail-closed `/pay` gate.
The most advanced incumbents (AWS Bedrock AgentCore, Microsoft Agent Framework +
Agent Governance Toolkit, LangChain Deep Agents, NVIDIA NeMo) have three things
TrustShell lacks — an **out-of-agent policy decision point**, **multi-point
guardrail placement**, and a **portable capability-packaging + just-in-time
install** model — but every one of those is a *library or a pattern*, not a cloud
service, so it can be folded into the thin layer without taking on AWS/Azure
gravity. The one layer the whole field calls "still unusually underdeveloped" —
**earned, attested, portable reputation** — is exactly the layer TrustShell already
owns (RepID/zkRepID, EAS-attested on Base Sepolia), which is the moat. So the plan
is: **adopt commodity governance as thin libs, repackage everything as
just-in-time `.skill` units, and spend the real effort on the reputation moat and
the antifragile loops** — and because there are **no users yet**, the loops can be
driven by *simulation* now, which is the cheapest time this project will ever have
to make the harness fail-closed under attack.

---

## 1. Where TrustShell already stands (measured grounding, 2026-09-02)

| layer | what exists today | state |
|---|---|---|
| **Reputation / earned autonomy** | RepID/zkRepID: 22,360 real plonky3 proofs, EAS-attested on Base Sepolia; earned-floor + tier ladder | LIVE (caveat: `ANCHOR-001` — 100 June-cutover proofs carry a hollow attestation, ledgered) |
| **Verification / truth** | HAL multi-LLM fact-check quorum; hash-chained classification log | LIVE but low-volume (trickle); `QUORUM-001` guards panelist identity |
| **Harness spine** | contract → work → independent Evaluator → signed verdict → accept/reject; `checker_must_not_be_doer` constitutional; `check:trust-harness-fixture` (mutation-tested) | "spine in place; activation incomplete" |
| **Reliability primitives** | `lib/trustshell/harness/`: circuit-breaker, retry, timeout, queue, quorum, replay, reputation, router, loop, leaky-bucket, capacity, escalate, aggregate, agreement, transform | present |
| **Payment gate** | x402 challenge + RepID-threshold gate on `/pay` (fail-closed: null threshold → 503) | LIVE, gate OBSERVE-only for BFT |
| **Identity** | ERC-8004 on-chain agent registry (Base Sepolia); `repid_agents` canonical | LIVE |
| **Audit / history** | HyperDAG append-only hash-chained event ledger | LIVE |
| **Adversarial** | redteam suite (19 probes incl. `MCP-001` tool rug-pull, `EVERGREEN-001/002`, `ANCHOR-001`), `mutate` gate | LIVE in CI |
| **Distribution** | `@hyperdag/trustshell` npm: 4 deps, CLI + MCP server + lib | thin already |

**Implication:** the reliability + verification + reputation + audit layers are
substantially built. The gaps are governance (a real PDP), guardrail *placement*,
and packaging/JIT-install. Do not rebuild what exists.

---

## 2. The landscape, mapped — ADOPT / INTEGRATE / OUTPERFORM / DIFFERENTIATE / SKIP

Synthesized from the two research passes. `[F]` = fetched via WebSearch of the
named source; `[K]` = from-knowledge. TrustShell mappings are judgement, not fetch.

### Governance / authorization — the biggest gap
- **Out-of-agent Policy Decision Point (Cedar/OPA, default-deny, at the gateway)** `[F]` — AWS AgentCore Policy and MS AGT both put a deterministic policy engine *outside the LLM*, evaluating `principal × tool × arguments × conditions` before any tool runs, so prompt injection cannot reach around it. Cedar is an embeddable Rust/WASM lib, not a service. → **ADOPT** (largest gap; embed as a small default-deny lib).
- **Temporal / session-aware policy** `[F]` — authorize each request in the context of prior actions (sequence rules, "this arg must equal a prior output", human-approval-before-privileged-action). → **OUTPERFORM** — HyperDAG *is* the append-only session ledger AWS/MS had to build session-state for; ride a thin evaluator on it.
- **`require_approval` verdict + approver routing** `[F]` (MS AGT) → **ADOPT** (we have receipts, no approval-gate verdict).

### Identity
- **Zero-trust agent identity (Ed25519/DID/SPIFFE, delegation chains)** `[F]` → **INTEGRATE/parity** — ERC-8004 already anchors portable identity; add DID/SPIFFE interop only when bridging to other meshes.
- **Trust scoring (0–1000, in-process, ephemeral)** `[F]` (MS AGT) → **OUTPERFORM** — this is the headline: RepID/zkRepID is *earned, EAS-attested, zk-provable, portable across venues*, not an ephemeral in-process float.

### Guardrails — placement, not a new engine
- **NeMo five ordered intercept points: input → retrieval → dialog → execution → output** `[F]` → **ADOPT the taxonomy as HAL's placement map**; HAL verifies today but should wrap all five seams (esp. execution = pre-tool-call, output = pre-return). **DIFFERENTIATE:** our rails carry earned reputation + payment + on-chain identity as inputs, which NeMo has no concept of.
- **NeMo tool-call rails FAIL CLOSED, no LLM in the guard path** `[F]` — validates tool traffic deterministically, blocks malformed/inconsistent payloads. → **ADOPT as a hard invariant** — TrustShell's tool-gate must be deterministic and fail closed on malformed **or** unpaid (x402) **or** below-RepID; this is exactly what the redteam suite exists to prove.

### Harness assembly / skills / JIT — the core of "thin + adaptive"
- **Deep Agents middleware pipeline** `[F]` (`TodoList/Memory/Skills/Filesystem/SubAgent/Summarization/PromptCaching` middleware, each attachable/removable) → **ADOPT the middleware-pipeline as TrustShell's assembly model** — HAL, RepID-gate, x402-pay, ERC-8004-identity, PDP each a middleware installed only when its intercept fires.
- **Agent Skills `.skill`/`SKILL.md` open standard + three-level progressive disclosure** `[F]` — L1 name+description always resident (~100 tok/skill); L2 full body loaded only when the agent judges it relevant; L3 scripts/refs/assets pulled on demand. AgentCore adds remote sourcing (git/S3/glob) and **"never silently skip — an empty glob fails the invocation."** → **ADOPT verbatim** — this *is* TrustShell's stated "install just before needed"; ship every capability as a `.skill` unit resolved from a RepID-signed remote registry, **fail-closed if a trust component can't resolve.**
- **AgentCore microVM / Omnigent control plane** `[F]` → **SKIP the heavy shells**; position TrustShell as the *portable trust meta-layer* those harnesses structurally lack. Borrow only Omnigent's "one YAML manifest, swap harness/model with a one-line edit" idea as the portable capability manifest.

### Durable execution
- **MAF checkpoints / Deep Agents append-before-evict filesystem** `[F]` → **INTEGRATE** — persist a signed *trust ledger* (which HAL checks ran, which RepID gates passed, which x402 payments cleared) as checkpoint state, so a resumed agent never re-verifies/re-pays or — worse — skips a gate on resume.

### Self-healing — the antifragile core
- **Recovery *ledger* (not a retry loop) + graph-cost-out routing** `[F]` — classify failure → backoff → circuit-break → fallback → checkpoint/resume → **learn**; on a failed component, mark its graph edge infinite-cost and route to the next-cheapest provider mid-run. → **ADOPT** — a signed ledger of which trust components failed/succeeded that *reshapes future install decisions* is what makes "self-healing install" real instead of retry-looped.

### Payments / audit
- **x402 session spending-caps (max-spend + expiry, checked before signing)** `[F]` → **ADOPT** (we gate access, not budget).
- **Decision-BOM (policy-version + request + verdict, tamper-evident)** `[F]` → **ADOPT + OUTPERFORM** — a "decision receipt" (policy version + request + verdict + RepID + zk proof) written to HyperDAG and EAS-anchored beats MS's local Merkle log because ours is on-chain-attestable and reputation-weighted.

### Skip (not our surface)
Token vault / KMS, shadow-AI discovery, compliance dashboards, marketplace vetting,
the microVM sandbox, chaos-testing infra (fold into redteam).

---

## 3. The thin, portable, JIT-install architecture

```
  DOWNLOAD (thin, ~seconds)            JUST-IN-TIME (lazy, per-intercept)
  ┌───────────────────────────┐        ┌──────────────────────────────────┐
  │ @hyperdag/trustshell core │        │  L2 component logic  (on relevance)│
  │  • capability DESCRIPTORS  │  ───▶  │  L3 heavy assets     (at point of  │
  │    (L1, ~100 tok each)     │        │     use: zk circuits, redteam      │
  │  • middleware pipeline     │        │     corpora, contract ABIs)        │
  │  • PDP (Cedar/OPA) shell   │        │  resolved from RepID-signed remote │
  │  • fail-closed tool-gate   │        │  registry (git/S3/glob); FAIL      │
  └───────────────────────────┘        │  CLOSED if it can't resolve        │
                                        └──────────────────────────────────┘
```

**Four adopted primitives, in one sentence each:**
1. **Packaging = Agent Skills `.skill` + 3-level disclosure.** Every capability
   (HAL, RepID-gate, x402-pay, ERC-8004-identity, PDP, each redteam probe family)
   ships as a `SKILL.md`-fronted unit; L1 descriptor always resident, L2/L3 pulled
   on demand — the literal "installs the component just before it's needed."
2. **Resolution = RepID-signed remote registry, fail-closed.** Components resolve
   by reference (git/S3/glob), verified by a RepID signature; an unresolvable trust
   component **blocks** the action rather than running it un-guarded.
3. **Assembly = middleware pipeline.** Each trust component is an independently
   attachable middleware; the harness composes only the ones an agent's declared
   surface needs.
4. **Guardrail placement = NeMo's five seams**, each a deterministic (no-LLM)
   check that fails closed on malformed / unpaid / below-RepID.

**The governance addition (the real new code):** a small **out-of-agent PDP**
(Cedar or OPA embedded) that intercepts every tool/MCP call → allow / deny /
require-approval, with a **temporal evaluator riding HyperDAG** for session-aware
rules, emitting a **Decision-BOM receipt** to HyperDAG + EAS. This is the piece the
incumbents have and we don't; it's a library, and it slots in as one middleware.

---

## 4. Ship now vs. ship before scale

### Ship NOW (thin, verifiable, no users required)
1. **`.skill` packaging + 3-level loader** — repackage HAL / RepID / x402 /
   ERC-8004 / redteam as lazily-resolved `.skill` units. (CC/GA lanes.)
2. **Out-of-agent PDP lib** (Cedar/OPA, default-deny) + **deterministic
   fail-closed tool-gate** wired to x402 (unpaid → block) and RepID (below
   threshold → block). Mutation-test that it fails closed. (CC lane.)
3. **Decision-BOM receipt schema** → HyperDAG (+ EAS when a decision is
   consequential). (CC lane.)
4. **Kill switch** + circuit-breaker SLOs (we have `circuit-breaker.ts`; add the
   revocation flag + error-budget). (CC lane.)
5. **MCP tool-poisoning scanner** — extend `MCP-001` from advertised-vs-executable
   to manifest drift / typosquat / hidden-instruction, using AIG's `data/mcp/`
   corpus already analysed. (CC lane.)
6. **Self-healing recovery-ledger + graph-cost-out capability resolution.** (CC lane.)
7. **The simulation harness** (§5) — the engine that measures all of the above.

### Ship BEFORE scale (needs users / traffic / infra — do the design now, activate later)
- **Temporal/session policy activation** (needs real session traffic to tune).
- **DID/SPIFFE identity interop** (needs cross-venue agents to bridge to).
- **BFT quorum activation** (code-complete, blocked on traffic — `TRUST-HARNESS-STATUS`).
- **x402 session spending-caps enforcement** (design now; enforce when real spend flows).
- **A hardened sandbox** — only if/when we execute untrusted agent-authored code at scale.
- **Token-vault-equivalent** — only if TrustShell ever holds third-party credentials.

---

## 5. Antifragile loops to run NOW (the "no users is the best time" point)

The self-learning/self-healing claim needs *adaptation from evidence*, not retries.
Four loops that run entirely on **simulation + adversarial pressure**, no users:

1. **Red-team → probe → ledger → fix → probe-HELD** *(already the house pattern;
   19 probes).* Every survived attack becomes a permanent antibody. Extend it so
   the **recovery-ledger** consumes probe outcomes: a component that fails a probe
   is cost-out and an alternate is JIT-installed — the attack makes the harness
   *reconfigure*, not just alarm.
2. **`trustshell sim` — synthetic agent traffic** *(build this).* Spin N synthetic
   agents (a tunable % adversarial) through the **full** harness — contract → work
   → independent verify → x402 pay → RepID update → EAS attest — and measure the
   one number that matters: **gate-hold rate under attack** (does every gate fail
   closed?). This is the loop that turns "no users" into an advantage: we can run
   thousands of adversarial sessions today that we could never risk on real ones.
   Run it in CI as `check:sim-gate-hold`.
3. **Mutation of every guard** *(already `mutate`).* A guard is unproven until it is
   *seen* to breach without the property. Every new gate above ships with its mutant.
4. **HAL self-eval (trivial-agent / ABC discipline)** — does the eval catch a
   do-nothing agent? Feed HAL's verdict + the RepID delta back as the agent's own
   self-correction signal; the redteam supplies the adversarial half. Antifragile =
   the loop that gets stronger from the attacks it survives.

**The measurable target for the next sprint:** stand up `trustshell sim`, drive the
full loop with ≥1 adversarial agent, and show — mutation-tested — that **every gate
fails closed**, with a Decision-BOM receipt per session written to HyperDAG. That is
a demoable "we red-team our own trust harness end-to-end, evidence-backed, no users
required" story for the hackathon.

---

## 6. The moat — do not rebuild commodity governance

Cedar, OPA, circuit-breakers, guardrail rails, recovery ledgers are **commodity** —
adopt them as thin libs and move on. The genuinely novel, defensible layer is the
one the incumbents' own stack diagrams label "still unusually underdeveloped":
**earned, attested, portable reputation + earned autonomy.** RepID answers a
question none of AgentCore / MAF / AGT / NeMo asks — *"based on everything this
agent has verifiably done before, how much autonomy has it earned now?"* — and
zkRepID + EAS make that answer portable and privacy-preserving across venues. Every
hour spent reimplementing a policy engine is an hour not spent on the moat. The
correct division: **borrow the boundary, build the reputation.**

---

## 7. Sequenced first PRs (all in-lane, verifiable, no merge-to-main without Sean)

1. `docs/` (this doc) — the strategy of record. *(this PR)*
2. **`trustshell sim` harness** + `check:sim-gate-hold` — the measurement engine (§5.2). Highest leverage: it makes every later item verifiable.
3. **PDP lib skeleton** (embed Cedar/OPA, default-deny) + fail-closed tool-gate + its mutant.
4. **Decision-BOM receipt schema** → HyperDAG writer.
5. **`.skill` packaging spec** for one capability end-to-end (HAL) as the template.
6. **Recovery-ledger + graph-cost-out resolver.**
7. Extend **`MCP-001` → MCP tool-poisoning scanner.**

**Sean-gated:** activating any gate on live traffic, real x402 spend, DID interop,
the fleet executor. Everything in 1–7 is buildable and provable against simulation
without users.

---

## Verification note

External mechanisms were recovered via **WebSearch of the named source pages** —
direct WebFetch was blanket egress-blocked this session (proxy `selective:false`).
Items are tagged `[F]` (fetched via search) or `[K]` (from-knowledge); TrustShell
capability claims are grounded in code/DB measured this session and in
`docs/SYSTEM-MAP.md` / `docs/TRUST-HARNESS-STATUS-2026-08-17.md`. The two X.com
links in the brief were unreachable and are deliberately not summarized. Nothing
here is claimed as shipped that is not in §1; the additions in §3–§7 are proposals.
