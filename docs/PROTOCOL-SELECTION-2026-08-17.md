# Which open protocols to ship — a recommendation, argued from the inventory

**2026-08-17.** Deliverable (c) of three, and the only one that is a *decision*
rather than a measurement. It depends on (a)
`docs/PROTOCOL-SURFACE-INVENTORY-2026-08-17.md` and (b)
`scripts/check-harness-extractable.mjs`, and should not be read without (a).

**Two kinds of claim appear below and they are labelled.** Anything marked
**[MEASURED]** came from this repo or the database today. Anything marked
**[BACKGROUND]** is my knowledge of the standard itself — licence, governance,
maturity — and is **UNVERIFIED against a primary source in this session**, because
the protocol homepages were not fetched. Verify the BACKGROUND lines before
committing budget to any of them.

---

## 0. The rule this recommendation applies

**Do not adopt a protocol until the thing it would carry exists and is measured.**

That is not conservatism, it is the inventory talking. **[MEASURED]** Four
protocols are already named in this system and not delivering:

| protocol | claimed as | actual |
|---|---|---|
| BFT | 0.40 of the RepID score | **0 observations**; both result tables empty |
| x402 | 0.15 of the RepID score | **no HTTP 402 handling anywhere** |
| zkRepID | the privacy story | sole `IBindingScheme` **throws on all three methods** |
| ERC-8004 | on-chain identity | a seam; its test pins `proveErc8004Binding` **undefined** |

**40% of every RepID score is structurally zero** because `bft` has no evidence
channel. A fifth protocol name does not improve that ratio; it worsens it.

So the recommendation is deliberately short. **One addition now. Two when their
carrier exists. Three explicitly deferred.**

---

## 1. Adopt now: OpenTelemetry

**[MEASURED] Zero files in this repo mention it.**

This is the one gap the evidence demands rather than suggests. The measured
history:

- The fleet stopped on 2026-07-17 and **nothing said anything for 29 days**.
- `throughput/ledger.ts` names three instruments that stayed green throughout:
  Railway, UptimeRobot, `agent_heartbeat.status`.
- **[MEASURED]** #78 found a **fourth** — `repid_agents.activity_30d`, wrong in
  both directions — and a **fifth** failure this class hides: `trinity-mel` had
  been dead for four weeks *before* the outage, with `loop_count` 19,155 against
  a peer band of 4,271–4,388 and `tasks_completed_session` **0**.
- **[MEASURED]** #80/#81: `catch_rate_30d` and `activity_30d` have **no writer**
  in any trigger or in this repo.

Five liveness instruments, all green, all wrong. The failure is not that a metric
was missing — it is that **every metric present was a self-report**. OTel's value
here is specifically that spans and metrics are emitted by the work itself and
carry a duration and a status code, so "the loop ran" and "the loop produced
something" stop being the same signal.

**[BACKGROUND]** CNCF, Apache-2.0, vendor-neutral wire format (OTLP), stable
across languages this stack uses. No lock-in: any backend can read OTLP.

**What it would have caught, concretely:** `trinity-mel` emitting 19,155 loop
spans with zero task-completion spans is a ratio anomaly visible in one query,
in June, four weeks before the outage.

**Cost, honestly:** an SDK per runtime, a collector, and a backend. That is real
work and it competes with closing Tier 0. Recommend it anyway, because the
alternative is a sixth green instrument.

---

## 2. Adopt when their carrier exists

### W3C Verifiable Credentials + DIDs — **when the receipt has an external consumer**

**[MEASURED]** DID modules are **RUNNING** — `app/api/trustshell/control-proof/verify`
reaches `identity/control-proof` and `delegation`. VCs are named in 3 files.
`ComplianceReceipt` and `kya_compliance_receipts` already exist.

**[BACKGROUND]** VC Data Model 2.0 is a W3C Recommendation, royalty-free.

So the carrier is half-built already: this system issues compliance receipts and
verifies control proofs. The reason **not** to adopt yet is that **[MEASURED]** no
external party consumes a receipt today — the six `.dev` domains have no routes,
and `trustrails` is the only deployed surface. A credential format is worth
adopting when someone else has to read it. **Trigger: the first cross-org
consumer of a receipt.**

### in-toto / SLSA attestation — **when the receipt chain has an auditor**

**[MEASURED]** Zero files. But `hal-chain.ts` already implements a chain with a
cutover constant, and #66 found `verifyHalChain` returns VERIFIED over an
unanchorable window — i.e. **the chain exists and its integrity claim is already
contested.**

**[BACKGROUND]** in-toto is CNCF, Apache-2.0; SLSA is OpenSSF. The attestation
envelope is the standard shape for "this artifact was produced by that process".

This is the right long-term home for `ComplianceReceipt`, and adopting it would
force the anchoring question #66 raised. **Trigger: fixing HAL-001.**

---

## 3. Do not adopt yet, and why

| candidate | status here | why not yet |
|---|---|---|
| **A2A** | **[MEASURED]** `services/mcp-a2a-gateway/` is a **stub** — a `package.json` and a `server.js`, no README | MCP is already **RUNNING** and covers tool access. A second interop protocol before the first has a second consumer is a name, not a capability |
| **AP2** | **[MEASURED]** zero files | It would occupy the same unbuilt slot as x402. Close x402 or drop it before adding another payment protocol |
| **C2PA** | **[MEASURED]** zero files | Genuinely interesting for HAL's provenance claims, but HAL's detector is not in this repo and has been down since 07-17. No carrier |
| **Sigstore** | **[MEASURED]** 1 file | Attractive (keyless signing, no key custody) but it is an implementation choice *inside* in-toto/VC, not a separate adoption. Decide it with §2 |

---

## 4. What this means for the six `.dev` domains

**[MEASURED]** `TrustShell.dev`, `TrustMarket.dev`, `TrustRepID.dev`,
`TrustRails.dev`, `TrustTrader.dev`, `TrustCRE.dev` appear in **three planning
files and no route**. One product surface is deployed and it is `trustrails`.

So "which protocols ship across the six" is premature in a specific, testable
way: **five of the six have nothing to ship them in.** The protocol layer is
ahead of the product layer, not behind it.

The sequencing that follows from the evidence:

1. **Close or drop Tier 0.** Either give `bft` an evidence channel and `x402` an
   implementation, or **reweight them out of the score.** A 0.40 weight on an
   empty channel is not a roadmap item, it is a live scoring defect.
2. **Adopt OTel**, because the next outage is otherwise invisible for another 29
   days.
3. **Ship the harness.** **[MEASURED]** (b) proved it compiles standalone, strict,
   with no DOM and no `@types/node` — 14 import lines from publishable. It is the
   most shippable artefact in the repository and it is not a protocol at all.
4. Then VC/in-toto, when a receipt has a reader.

## 5. The recommendation in one line

**Adopt OpenTelemetry; publish the harness; fix or delete the 0.40 BFT weight;
add no new protocol until x402 and zkRepID either work or are removed from the
score.**

## 6. What would change this

- If a **cross-org consumer** appears for receipts, §2 moves to now.
- If the **fleet redeploy** (see #78) restores HAL, C2PA becomes arguable.
- If a **BACKGROUND** line above proves wrong on checking — a licence, a
  governance change, a maturity claim — re-argue that row. None of them was
  verified against a primary source in this session.
