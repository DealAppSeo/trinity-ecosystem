# Hybrid RepID — audit, external lessons, and an implementation plan

**Date:** 2026-08-13. **Status:** plan only. Nothing here is applied.

Three inputs: an audit of what we actually have (measured, not recalled), four
external identity sources, and a research brief on MoA-family systems. Every
external claim in the brief that this document builds on was **verified to
exist** before being planned around; the two that could not be verified are
named as such rather than quietly dropped.

---

## Part 1 — Audit: what is actually here

Measured against the live database and the repo on 2026-08-13, not from memory.

### 1.1 The disjointed family is real, and it is mostly empty

~190 tables match `%repid%|%agent%|%hal%|%anfis%|%bft%|%a2a%`. Of the RepID and
reputation tables specifically:

| status | count | examples |
|---|---|---|
| **live, high volume** | 3 | `repid_score_events` (152,001), `repid_proof_queue` (122,177), `repid_zkp_proofs` (79,062) |
| **live, low volume** | ~20 | `repid_agents` (176), `agent_repid` (87), `erc8004_reputation_writes` (88), `repid_credentials` (6) |
| **EMPTY** | **30+** | `agent_reputation`, `agent_repid_scores`, `ai_repid_history`, `ai_reputation_scores`, `trinity_repid`, `trinity_repid_events`, `perceived_repid_assessments`, `repid_outcomes`, `repid_permissions`, `human_agent_bindings`, `anfis_trust_weights`, `agent_node_registry`, `agent_registry`, `repid_challenges`, `repid_claims`, `repid_endorsements`, `repid_stakes`, `repid_votes` … |

**The problem is not that reputation is missing. It is that reputation exists in
three places at three volumes with no declared canonical source.** An agent's
standing can be read from `agent_repid.earned_score`, `repid_agents.current_repid`,
or derived from `repid_score_events` — and nothing says which wins.

### 1.2 The load-bearing gap: a 43% join leak

`repid_score_events` keys on `agent_id uuid`. `agent_repid` keys on
`agent_name text`. The join path is
`repid_score_events.agent_id → repid_agents.id → repid_agents.agent_name → agent_repid.agent_name`.

Measured:

- 104 distinct agents have event history
- 104/104 resolve to `repid_agents`
- **59/104 reach `agent_repid`**

**45 agents — 43% — have earned outcome history that the earned-score table
cannot see.** `SupabaseReputationStore` (shipped 2026-08-13) writes to
`agent_repid`. It is therefore wired to the smaller, lossier half of the system.

### 1.3 `decision_outcome` is an unconstrained enum

13 distinct values across 152,001 rows, including case-duplicate pairs:

| value | rows | | value | rows |
|---|---|---|---|---|
| `vetoed` | 115,885 | | `approved` | 46 |
| `flagged` | 21,976 | | `APPROVED` | 30 |
| `clean` | 11,253 | | `PENDING` | 111 |
| `submitted` | 2,665 | | `RESTORE`, `success`, `test`, `profit`, `rejected`, `correct` | ≤12 each |

Any consumer filtering `decision_outcome = 'approved'` silently drops the 30
uppercase rows. This is the same defect class the harness exists to prevent — a
query that looks correct and quietly under-reports.

### 1.4 Dead wiring in the harness itself

- **`QuorumEvaluator` is imported at `scripts/harness-simulate.mjs:42` and never
  used.** We built PBFT supermajority aggregation with 46 assertions behind it,
  and the simulation loads it and does nothing. **This is the MoA gap in one
  line: we have the aggregator and never aggregate.**
- `replay.ts` and `queue.ts` are referenced only by their own test suites. They
  are correct, tested, and unused by any live path.
- `anfis_trust_weights` (0 rows) and `agent_node_registry` (0 rows) are consumed
  by code that will therefore always serve `NOT_CHECKED`.

### 1.5 What is already further along than expected

Worth stating because the plan should extend it rather than rebuild it:

- **A2A already exists in the schema**: `agent_a2a_cards` (5), `a2a_rfqs` (6),
  `a2a_bids` (10), `a2a_bid_rounds` (10), `a2a_awards` (3). There is already an
  RFQ→bid→award auction loop.
- **ERC-8004 is already wired**: `erc8004_reputation_writes` (88 rows),
  `repid_agents.erc8004_token_id`, `mint_chain_id`.
- **ZK is at real scale**: 79,062 proofs, `repid_zkp_proofs` plus
  `ZKPAttestation.ts`.
- **HAL produces a usable ground-truth label**: 151,989 events carry `hal_score`,
  plus `hallucination_caught`, `veto_class`, `certainty_at_claim`.

---

## Part 2 — What the external sources actually offer

### 2.1 walt.id / awesome-SSI — the standards layer we are missing

Neither repo is a reputation system; both are **credential-format and protocol**
infrastructure. The reusable pieces:

| pattern | what it gives RepID |
|---|---|
| **W3C VC + SD-JWT selective disclosure** | An agent proves "RepID ≥ 700" without revealing its score, history, or identity |
| **OID4VCI / OID4VP** | Standard issuance and presentation flows, so a RepID credential is verifiable by parties who have never heard of Trinity |
| **DIDs + Universal Resolver** | A stable agent identifier not owned by our database — the fix for §1.1's three-rosters problem at the *identity* layer |
| **Pluggable KMS abstraction** | Signing keys in AWS/Hashicorp/OCI rather than in our tables — directly relevant to TRUSTSHELL-V1 §12 Q2 (signing key custody), which is still open |
| **Status lists / accumulators** | Revocation of a RepID credential when an agent is slashed |

**The single most valuable idea here: separate the *identifier* from the
*score*.** Our fragmentation is fundamentally an identifier problem — three
rosters keyed three ways. DIDs solve exactly that, and `repid_credentials`
(54 columns, 6 rows) is already VC-shaped.

### 2.2 cyber-defence-campus — the adversarial reading, and the most useful source

This one is a security assessment of Switzerland's national e-ID, and it is the
most directly applicable because it says what *breaks*:

- **90+ vulnerabilities** found in a national trust infrastructure by threat
  modelling and attack trees.
- **Device binding failed**: private keys extracted from the Android keystore
  under software-bound storage on rooted devices.
- **Anonymous verification was abused at scale** — 3–4 automated verifications
  per minute. *This is our threat model exactly*: an agent that can present a
  RepID credential can present it in a loop.
- **Unlinkability is hard**: static keys, hashes or signatures let verifiers
  correlate presentations across contexts.
- **Issuer–verifier collusion deanonymises** without strong crypto.
- **List-based revocation leaks identifiers**; accumulators are private but
  impractical.
- **KERI was rejected** for the Swiss base registry as too complex with weak
  privacy — a useful negative result, since KERI is the obvious thing to reach
  for.

**Design consequence:** any RepID credential we issue must be rate-limited and
replay-bound at presentation time, not only at issuance. Our
`repid_proof_queue` (122,177 rows) is where that lands.

### 2.3 `topics/agent-identity` — the closest prior art

Most relevant projects: **OATI** (verifiable agent identity, delegated authority,
signed action receipts), **open-agent-trust-registry** (federated root-of-trust
of attestation issuers), **Attestix** (DID + W3C VC agent attestation),
**erc8004-agents** (on-chain identity/reputation/validation — *we already write
to ERC-8004*), and **theauth** / **identity-spiffe** for agent↔agent delegation.

**"Signed action receipts" is the concept that maps onto our
`ComplianceReceipt.ts` and `kya_compliance_receipts` most directly.**

### 2.4 The MoA brief — verified before planning

| system | verified? | reference |
|---|---|---|
| MoA (Wang et al.) | **yes** | [arXiv:2406.04692](https://arxiv.org/html/2406.04692v1) |
| DMoA | **yes** | [arXiv:2605.15706](https://arxiv.org/abs/2605.15706) |
| RouteMoA | **yes** | [ResearchGate](https://www.researchgate.net/publication/400085110_RouteMoA_Dynamic_Routing_without_Pre-Inference_Boosts_Efficient_Mixture-of-Agents) |
| OFA-MAS | **yes**, WWW '26 | [arXiv:2601.12996](https://arxiv.org/abs/2601.12996), [ACM](https://dl.acm.org/doi/10.1145/3774904.3792537) |
| A2A protocol | **yes** | Google → Linux Foundation |
| MMoA / ReM-MoA / Faster-MoA | **NOT VERIFIED** | named in the brief; not confirmed in this session |
| MoMA, NeMo Switchyard, Huawei A2A-T | **NOT VERIFIED** | named in the brief; not confirmed in this session |

Nothing below depends on the unverified rows. They are listed so that a future
reader does not mistake them for checked facts.

**The most important observation: `router.ts` + `quorum.ts` already *is* RouteMoA
in structure.** RouteMoA = a lightweight scorer for prior screening + a
mixture-of-judges for posterior refinement. `TrustRouter` is the scorer;
`QuorumEvaluator` is the judge panel. **We built both halves and never connected
them** (§1.4). The gap between what we have and a published SOTA architecture is
one wiring change, not a rewrite.

Our genuine differentiator against all of the MoA family: **they route on
self-declared or learned scores; we route on earned reputation with an evidence
weight, and we refuse self-report by construction.** DMoA's routing is
differentiable but has no notion of an expert that *lies*. That is the thing
RepID adds to MoA, and it is worth stating in those terms.

---

## Part 3 — The plan

Ordered by value-per-risk. Each phase states its evidence gate. Nothing is
started without a green light on the phase before it.

### Phase 0 — Close the measurement gap (no schema change, highest value)

**0.1 Replay the real 152k events through `ReputationLedger`.**
This is now possible and was not before: the join path in §1.2 resolves, and
`decision_outcome` + `hallucination_caught` give a per-event good/bad label over
four months (2026-04-14 → 2026-08-13, 6,421 events in the last 30 days).

Train on the first N months, hold out the last, and measure whether the ledger's
ranking predicts held-out outcomes. **This closes the standing NOT CHECKED on
every number the harness has produced**, and specifically validates or refutes
`confidenceK = 20`, which currently rests on simulator evidence alone.

*Gate:* if real-data replay contradicts the simulator, the simulator's world
model is wrong and gets fixed before anything else proceeds.

**0.2 Wire `QuorumEvaluator` into the router — the MoA change.**
Route to top-K instead of top-1 for high-stakes tasks, aggregate with the
existing quorum, and A/B it with `harness-experiment.mjs`. This is the single
cheapest path to MoA-class output quality because both halves already exist and
are tested. Expect a cost/latency regression — measure it, and use RouteMoA's
framing (screen cheaply, escalate only when the prior is uncertain) to bound it.

*Gate:* must beat top-1 on held-out seeds **and** in the no-gem counterfactual,
per the standard already established.

### Phase 1 — One canonical identifier (Sean-gated, migrations written not applied)

**1.1 Declare `repid_agents.id` (uuid) the canonical agent identifier** and
`agent_repid` a projection of it. Write a migration adding the missing 45 agents
and a FK. Fixes §1.2.

**1.2 Constrain `decision_outcome`** to a checked enum with a normalising
backfill (`APPROVED` → `approved`). Fixes §1.3.

**1.3 Add `earned_observations` to `agent_repid`** — already written and pending
at `supabase/migrations/20260813210000_agent_repid_earned_observations.sql`.
Without it `SupabaseReputationStore` refuses to load, by design.

**1.4 Formally retire the 30 empty tables** — a migration that drops or renames
them to `zz_deprecated_*`. Every empty table is a place a future agent can write
the truth and have nobody read it.

*Gate:* Sean's approval, individually. These are the only irreversible steps.

### Phase 2 — Credentials and portability (the SSI layer)

**2.1 Issue RepID as a W3C VC with SD-JWT selective disclosure.** `repid_credentials`
already has the shape. The claim to support first is a **threshold** proof
("RepID ≥ 700"), not the score — that is what makes it privacy-preserving and it
is the natural consumer of our 79,062 existing ZK proofs.

**2.2 Give each agent a DID**, resolvable independently of our database. This is
the durable fix for the three-rosters problem, and the thing that makes RepID
portable to parties who do not trust Trinity's tables.

**2.3 Apply the cyber-defence-campus lessons as tests, not prose:**
presentation-time rate limiting (their 3–4/min abuse), replay binding,
unlinkability across presentations, and an accumulator-based revocation path
rather than a leaky list. Each becomes an assertion that fails if the mitigation
is removed — the standard this repo already holds itself to.

### Phase 3 — A2A and adaptive topology

**3.1 Make the existing `agent_a2a_cards` A2A-protocol-conformant** and publish
capability discovery through the MCP fleet endpoint we already ship. Small step,
real interoperability payoff, extends what exists.

**3.2 Signed action receipts** (OATI's pattern) over `ComplianceReceipt.ts`, so
an agent's action history is verifiable by a third party rather than trusted from
our database.

**3.3 OFA-MAS-style topology generation — last, and explicitly Sean's call.**
Generating the collaboration graph per task is the most powerful idea in the
brief and the largest architectural change. It should not be attempted until
Phase 0 has established that our routing decisions can be evaluated against real
outcomes; otherwise we would be generating topologies with no way to tell whether
they are better.

---

## What I recommend doing first

**Phase 0.1, the real-data replay.** Everything this project has measured is
simulator evidence. 152,001 real labelled outcomes are sitting in the database
and the join path to reach them now resolves. Until that replay runs, every
number in `TRUST-HARNESS.md` — including the `confidenceK` change applied today —
carries the same caveat, and no amount of additional simulator work removes it.

It is also the cheapest item on this list, and it is the only one that can tell
us the rest of the plan is aimed in the right direction.
