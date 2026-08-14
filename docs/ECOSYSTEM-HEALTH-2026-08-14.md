# Ecosystem Health Report — 2026-08-14

Phase 0 of the Agentic OS mission. Every score below is backed by something that
was **executed**, not read. Where a thing could not be checked from this session
it says NOT CHECKED rather than guessing — see CLAUDE.md, "three outcomes, never
two."

Surface: cloud/scheduled container. Access: GitHub yes, Supabase yes (MCP),
Railway no (proxy-denied), Base Sepolia RPC **yes indirectly** via Supabase
`pg_net`. Preflight verdict at session start: `GO`, `global_pause=false`.

---

## 1. Scores

| Subsystem | Score | One-line basis |
|---|---:|---|
| Identity & Linking | **2** / 10 | Real ERC-8004 registry with 4 agents actually on-chain; no human SSID at all, no execution path from the app, and 3 of 4 identities sit under a leaked key |
| Reputation (zkRepID) | **5** / 10 | *Raised from 3 by Sprint 2.* Now measured from recorded outcomes with decay and shrinkage, and it moves per agent. Still capped: two of four inputs have no data source at all |
| Proving stack | **1** / 10 | A genuine Plonky3 AIR that discards its proof and returns a `format!` string containing the secret |
| Memory | **4** / 10 | Best-developed area: real schema, real backfill with a fidelity gate, recall proven in prod. Zero encryption, no portable vault, dual-auth is unverified JSON |
| Routing & intelligence | **1** / 10 | No request-time routing exists. ANFIS service returns `confidence: 0.99` from 38 lines. No GNN |
| Harness layer | **3** / 10 | `HarnessProfile.ts` is excellent and has zero runtime callers. The nine-module portable harness the brain records as built **is not in the repo** |
| Safety & autonomy (HAL) | **2** / 10 | HAL is not in this repo; local integration is two table names in a row-count script. BFT defaults to observe mode and never runs inline |
| Infrastructure | **4** / 10 | Dual Railway+Vercel works, `/api/version` works, Vercel green. **No CI workflows exist in this repo at all** |
| Measurement & observability | **5** / 10 | *Raised from 3.* The canonical liveness view is fixed and now agrees with the strict view. CI exists. Still no instrumentation of routing, cost or HAL rates in this repo |
| Fleet & orchestration | **2** / 10 | 2 of 12 agents doing work; heartbeat writer dead 27 days; 23,113 orphaned claims |

**Composite: ~2.5 / 10.** The honest summary is that this is a system with
several pieces of genuinely first-rate engineering, none of which are connected
to each other, sitting under a measurement layer that reports them as working.

---

## 2. The three findings that matter most

### 2.1 A committed private key owning three agent identities — FIXED (detection + source), rotation Sean-gated

`scripts/register-agents-erc8004.js:9` held a literal EVM private key, and
`npm run check:secrets` printed **"No credential-shaped strings found"** over it.
The scanner covered JWTs, Solana base58 and prefixed opaque keys — it was built
for the Supabase JWT incident and never generalised to the one chain this project
deploys on.

VERIFIED on-chain (address derived locally with a keccak-256 that passes the
empty-string vector; queried through `pg_net`):

```
leaked address 0xdf6b8215d193b11b4903d223729c3cf7a6de271d
  balance ~0.059 testnet ETH, nonce 0x6f (111 txs) — live, used
  ownerOf(3747 SOPHIA)   = 0xdf6b…271d   <- leaked
  ownerOf(3748 RAVEN)    = 0xdf6b…271d   <- leaked
  ownerOf(3750 GUARDIAN) = 0xdf6b…271d   <- leaked
  ownerOf(3749 ATLAS)    = 0x7b84…3261   (elsewhere)
  owner() [registry admin] = 0x5472…2603 (NOT the leaked key — registry is safe)
```

Financial exposure is nil. Identity exposure is total for three of four agents:
anyone reading the repo can transfer them or rewrite their on-chain metadata. For
a project whose thesis is verifiable agent identity, that is the exposure that
counts. Rotation is task **#73**, Sean-gated — a commit cannot undo git history.

A second, previously unrecorded **Solana secret key** appears at
`history:e5b0d884` and needs triage.

### 2.2 The canonical fleet view overstates the working fleet by 6×

`v_fleet_truth` is the view the preflight contract names as the *only* answer to
"how many agents are alive". Its `is_live` resolves to `probe_ok` whenever a probe
is under 10 minutes old, and the probe is an HTTP `GET /health` against a Railway
service. A web process answering 200 proves the container is up; it says nothing
about whether the agent loop runs.

Measured this session:

| Signal | Value |
|---|---|
| `v_fleet_truth` is_live | **12 / 12** |
| `v_fleet_liveness_strict` is_live_strict | **2 / 12** (torch, veritas) |
| `probe_masking = true` | **10 / 12** |
| Newest heartbeat, any agent | 2026-07-17 — **~27 days stale** |
| Agents with work in last 7d | torch, veritas, shofet, api-gateway |

`v_fleet_liveness_strict` already exists and is correct. Nothing pointed at it —
the contract pointed at the masked view, so every agent following the preflight
protocol was told 12/12. This was the CLAUDE.md recurring defect sitting inside
the instrument meant to detect it.

**FIXED — task #70 closed, `trinity_changelog` #134.** `is_live` now requires
fresh heartbeat *or* fresh work; a `/health` probe alone no longer counts.
Reachability moved to a new `is_reachable` column so "the port answers" stays
visible without being mistaken for "the agent works", and `liveness_signal`
gained `probe_only` — container up, agent idle — the state the old definition
hid.

| Signal | Before | After |
|---|---:|---:|
| `is_live` | **12 / 12** | **3 / 12** (torch, shofet, veritas — all via `work`) |
| `is_reachable` | *not distinguished* | 12 / 12 |
| `liveness_signal = probe_only` | *invisible* | **9 / 12** |
| `liveness_signal = heartbeat` | — | **0 / 12** (writer dead ~27 days) |

Canonical `v_fleet_truth` (3) now **equals** `v_fleet_liveness_strict` (3); they
disagreed 12 vs 2. The dependent `v_fleet_liveness_audit` was updated in the same
change, because its `probe_only_live` was defined against the old semantics and
would otherwise have read as "no problem" rather than "problem fixed".

Two notes worth keeping. The rollback SQL in #134 was **tested** under a
temporary name — it recreates the original 13-column shape and reproduces the old
12/12 reading, so it is a real rollback rather than an assumed one. And the
preflight skill needed no edit: its instruction ("fleet facts come from
`v_fleet_truth`") was always correct — the view it pointed at was not.

Known trade-off: an agent that works without writing to `trinity_agent_logs` now
reads `is_live = false`. That is a false negative, which is the right direction to
err for a trust system, and it stays visible through `is_reachable`.

### 2.3 A completed sprint exists only in the database

`trinity_changelog` #130 records, in careful detail, a nine-module portable
harness in `lib/trustshell/harness/` — types, reputation, leaky-bucket, capacity,
router, queue, circuit-breaker, quorum, replay — with a portability checker, 126
assertions across three suites, and a 2000-task simulation showing correctness
48.3% → 88.8% across three build-measure-learn cycles.

**None of it is in the repo, and none of it ever was.** `git log --all` for that
path returns nothing; `scripts/harness-portability-check.mjs` does not exist. The
container was reclaimed before a push.

This is the most expensive defect in the ecosystem, because it is not a bug in
any component — it is a hole in how work becomes durable. The brain is treated as
ground truth for what is built, and it can record a sprint that has no artifact.

---

## 3. Mocks and unwired code, explicitly

**Fabricated where it counts**
- `services/zkp-postcard/src/circuit.rs:126` — the "proof" is
  `format!("plonky3_stark_babybear_rangecheck_value_{}_verified_ok", value)`,
  which also **leaks the private input in cleartext**. The verify endpoint is a
  `HashMap` lookup of a boolean stored at write time. The crate has no evidence
  of ever compiling (`check_utf8.txt:172` records 13 errors) and nothing calls it.
- `lib/trustshell/ZKPAttestation.ts:53-63` — SHA-256 of a timestamp, base64'd,
  prefixed `Qm` to look like an IPFS CID, emitted with `proofSystem: 'groth16'`.
  Four public signals hardcoded `true`, including an unperformed sanctions check.
- `app/api/trustrails/pay/route.ts:41-45` — the **production** payment path feeds
  RepID four constants (`bftAccuracy: 94, veritasCatchRate: 97, x402SuccessRate:
  100, latencyMs: 180`). Every live RepID derives from these.
- `scripts/register-agents-agent0.ts:64` — `Math.random()` as an on-chain agent
  id, later rendered as `did:pkh:…` in a public agent card.
- `services/anfis-routing-service/server.js:25` — `confidence: 0.99`, "Stubbed
  routing response". The x402 check accepts any non-empty header.

**Real, high-quality, and connected to nothing**
- `lib/trustshell/HarnessProfile.ts` (1012 lines) — 46 setting specs, 4-layer
  resolver, refuses earned grants with no receipt ids. Zero runtime callers.
- `lib/trustshell/MemoryRecall.ts` (421 lines) — real RRF fusion, tier
  degradation, budget truncation. Not even exported from `index.ts`.
- `lib/trustshell/TranscriptParser.ts` (867 lines) — dead in-app, CLI only.
- `apps/rust-brain/src/anfis_router.rs` — the only genuine fuzzy inference in the
  repo. Never built, never called, no tests.
- `lib/trust/BFTEngine.ts` — a real three-model MoA panel over LiteLLM, default
  `observe` mode, so on stock config no consensus ever runs inline.

**Absent entirely**: human SSID / DID / VC / SD-JWT, zkTLS (zero hits repo-wide),
GNN, encryption of any kind, portable vault, blind index, recursion, LLZK,
hc-stark, Reputation Registry calls, CI workflows.

---

## 4. Where the source material folds in

The research in the brief is well-matched to the gaps, with one important
reordering: **almost every idea in it assumes a substrate this repo does not yet
have.** MoA/DMoA routing, OFA-MAS topology generation and A2A marketplaces all
presuppose reliable measurement of agent quality. Today the only "quality" signal
in the live path is four hardcoded integers, and the fleet instrument overstates
by 6×. Layering adaptive topology generation on that would generate confident
nonsense.

| Source idea | Folds into | When |
|---|---|---|
| ECC Memory Vault + instincts→skills | `HarnessProfile` earned grants + `agent_memory_nodes`; the confidence-scored instinct is the missing soft signal between "did work" and "earned autonomy" | After harness is wired |
| ClawSportBot verification lifecycle + declared contracts | The strongest single fit. Declared intent/confidence/risk *before* acting, verified after, gates reputation credit. Directly fixes "score is a constant" | Sprint 2 |
| Agentic-IAM ML trust scoring + anomaly | HAL's second signal source; also the honest replacement for `bftAccuracy: 94` | Sprint 3 |
| walt.id + SD-JWT | The entire missing human SSID layer. SD-JWT covers ~70% of disclosure needs without a circuit | Sprint 3 |
| zkTLS bootstrap | Highest-leverage reputation unlock — real signals instead of zero, and it needs no circuit work | Sprint 3 |
| Plonky3 + LLZK + hc-stark | Only after the proving stack tells the truth. Step one is deleting the `format!` proof, not adding recursion | Sprint 4+ |
| MoA / DMoA / RouteMoA | `BFTEngine` is already a 3-model MoA panel — the nearest real thing. Needs execution + measurement before routing | Sprint 4 |
| OFA-MAS topology generation | Deliberately last. Requires trustworthy per-agent quality first | Later |
| ERC-8004 Reputation/Validation registries | Anchor once off-chain scores are real; committing a constant on-chain makes it permanently wrong | Sprint 3 |

**The unlock order is: measure honestly → earn a score → prove the score → route
on it → let the topology adapt.** The brief's most advanced ideas are at the end
of that chain, not the start.

---

## 5. Quick wins vs deep structural work

**Quick wins — done this session**
1. EVM key detection in `scan-secrets.mjs` + both call sites env-gated *(landed, PR #25)*
2. Deleted `src/graphs/motor-squad-graph.ts` — `tsc --noEmit` 25 → 8 *(landed)*

**Quick wins — next, all small**
3. Point the preflight contract and docs at `v_fleet_liveness_strict`; retire the masked count
4. Export `MemoryRecall` from `index.ts` — real code currently unreachable by construction
5. Pin `typescript@5.6.3` inside the four `check-*.mjs` scripts (a bare `npx tsc` resolves TS 6 and fails TS5112, which reads as a broken suite; under the pin all 128 assertions pass)
6. Add a CI workflow — there is none, so `npm run check` only ever runs when a human remembers
7. Delete the `format!` fake proof and have the endpoint return an explicit `NOT_IMPLEMENTED` rather than a string that leaks its own secret input

**Deep structural work, in dependency order**
- **D1 Durability.** Work is not done until it is pushed. The brain must not be able to record a build with no artifact.
- **D2 Wire the harness.** `HarnessProfile` + `MemoryRecall` into the live path. The hard part is not the code; it is that nothing currently calls it.
- **D3 Earned reputation.** Replace the four constants with measured outcomes via a declared-contract → verify → credit loop.
- **D4 Honest proving.** Serialise a real proof or return nothing.
- **D5 Human SSID.** Greenfield.
- **D6 Routing.** Only meaningful once D3 produces a real quality signal.

---

## 6. Recommended sprint order

**Sprint 1 — Make the instruments honest.** Liveness contract, CI, `MemoryRecall`
export, TS pin, kill the fake proof. Success: `v_fleet_truth`-derived counts match
strict counts; CI runs `npm run check` on every PR; no endpoint returns a
fabricated proof. Small, and every later sprint depends on it.

**Sprint 2 — Wire the harness and make the score real.** `HarnessProfile` and
`MemoryRecall` into the request path; ClawSportBot-style declared contract before
action and verification after; replace the four hardcoded RepID inputs with
measured values. Success: a RepID that changes when behaviour changes — provably,
via two runs with different outcomes.

**Sprint 3 — Human SSID + zkTLS bootstrap + ERC-8004 anchoring.** Only after
Sprint 2 gives a score worth anchoring.

**Sprint 4+ — Proving stack and routing.**

### Next Highest Leverage Move

**Rotate the deployer key (#73)** — it is the only finding with an active
adversary, and it is the one thing here that Claude cannot do.
Then Sprint 1, which is a day of work and unblocks everything after it.

---

## 6b. Sprint 2 result — RepID is measured (landed)

**Success criterion was "a RepID that provably changes when behaviour changes."
It does.** Computed from live data over a 120-day window:

| | before | after |
|---|---|---|
| every agent | **3971**, always | — |
| trinity-orch | 3971 | **2960** (integrity 0.586 over 6,961 obs) |
| trinity-shofet | 3971 | **2726** (0.365 over 33,999) |
| trinity-gcm | 3971 | **2441** (0.354 over 33,424) |
| trinity-tom | 3971 | **2038** (0.148 over **2** obs — thin-record penalty) |

Scores are lower because the old number was never earned. They now differ by
agent, which was the point.

**What the data forced, and would otherwise have been silent bugs:**

1. `x402_settlements.status` and `.is_simulated` **disagree** — 403 rows read
   `status='settled'` while 289 carry `is_simulated=true`. Scoring on `status`
   would have counted ~287 **simulated** payments as earned successes.
2. The payment path and the reputation ledger are **disjoint namespaces**:
   `agent_kya_registry` holds `TORCH`, `repid_agents` holds `trinity-torch`, and
   a direct join matches 0 of 12. All 12 resolve via the `trinity-` prefix.
3. `repid_score_events` is **non-stationary** — veto rate 92% (May) → 73% (Jun)
   → 68% (Jul) → 5% (Aug), with the shift starting ~07-27. Decay is what stops
   the old regime being reported as current behaviour. Recent evidence is sparse.

**Two of four inputs are structurally unmeasurable, and now say so** rather than
being faked:

- `bftAccuracy` — the **heaviest weight at 0.40** — has no signal anywhere:
  `trinity_receipt_bft_results` and `bft_payment_evaluations` both hold **zero
  rows**. That is an unbuilt subsystem, not a quiet agent.
- per-agent latency does not exist: `hal_classifications` has 147k latency
  samples but no `agent_id`; `repid_score_events` has no latency column.

## 6c. BFT + latency capture (landed)

Both signals now resolve to **measurable but sparse** rather than absent, which
matters because sparsity resolves with volume and absence does not.

**BFT needed no new plumbing.** `pay/route` already calls `bft.authorize` then
`bft.enqueue`, and `app/api/trustrails/bft/process` already drains the queue,
runs the three-provider panel and writes the verdict back. The table is empty
because the payment path has run ~12 times ever — not because anything is
disconnected. The observation feed now exposes those verdicts, counting only rows
the worker actually evaluated: a queued-but-unevaluated row is a pending
question, and counting it either way would invent a verdict.

**Latency now comes from `llm_call_log`** (486,280 rows carrying `agent_id`,
`latency_ms`, `status`). Real measured values, live: trinity-orch **256 ms**,
trinity-veritas 698 ms, trinity-w3c 713 ms, trinity-hdm **933 ms**, fleet mean
**705 ms** — against the **180 ms** that used to be asserted, so the old constant
was roughly 4x optimistic. Effect: trinity-orch 2960 → **3180**, trinity-w3c
2823 → 3017, trinity-hdm 2711 → 2894.

### The real blocker is attribution, not volume

| Defect | Measured |
|---|---|
| `llm_call_log.agent_id` populated | **209 of 486,280 rows (0.04%)** |
| `repid_score_events.llm_call_id` resolving to `llm_call_log` | **15 of 147,617** |

Both tables span the identical window (2026-05-07 → 2026-08-13) and both are
large, so the second is a genuine **dangling reference between two writers**, not
pruning. Setting `agent_id` at the write site would make **486k existing samples
attributable retroactively** — the cheapest large win available in this
subsystem. That write site is in `repid-engine`, so it is out of this repo's
reach: logged as task **#74**.

Because a thin signal and a broken pipeline read identically at a call site,
every unmeasured metric now carries the systemic reason next to the per-agent
one — the difference between "this agent is quiet" and "go fix the writer".

This is why Reputation scores 5 and not higher. **The remaining work is data
capture, not scoring:** the scoring path is correct and coverage improves
automatically the moment attribution is fixed, with no further change here.

## 7. Verification record

| Claim | Status | How |
|---|---|---|
| Leaked key owns 3747/3748/3750 | **VERIFIED** | `eth_call ownerOf` via `pg_net`, 4 separate calls |
| Registry admin is a different account | **VERIFIED** | `eth_call owner()` → `0x5472…2603` |
| Scanner missed the key, now catches it | **VERIFIED** | ran before (clean, exit 0) and after (USABLE, exit 1) |
| Working tree clean post-fix | **VERIFIED** | 0 usable, exit 0 |
| `tsc` 25 → 8, security commit delta 0 | **VERIFIED** | counted at HEAD and HEAD~1 |
| 128 assertions pass under TS 5.6.3 | **VERIFIED** | all four scripts, exit 0 |
| Fleet 2/12 working vs 12/12 reported | **VERIFIED** | `v_fleet_truth` vs `v_fleet_liveness_strict` |
| `lib/trustshell/harness/` never existed | **VERIFIED** | `git log --all -- <path>` empty |
| Vercel build green on PR #25 | **VERIFIED** | deployment Ready |
| RepID differs per agent post-Sprint 2 | **VERIFIED** | computed over the same view the route reads |
| x402 status vs is_simulated disagree | **VERIFIED** | 403 `settled` vs 289 `is_simulated` |
| BFT tables hold zero rows | **VERIFIED** | `pg_stat_user_tables` on both |
| Latency measured per agent (256-933ms) | **VERIFIED** | computed from `llm_call_log` over the observation view |
| `llm_call_log.agent_id` on 209/486,280 | **VERIFIED** | direct count |
| `llm_call_id` dangling (15/147,617) | **VERIFIED** | tested both candidate keys, identical date windows |
| v_fleet_truth 12/12 -> 3/12, matches strict | **VERIFIED** | counted both views after the change |
| #134 rollback SQL actually works | **VERIFIED** | created under a temp name, reproduced the old 12/12, dropped |
| BFT scoring path against real data | **NOT CHECKED** | zero evaluated rows exist; exercised by unit tests only |
| Sprint 2 route invoked end-to-end | **NOT CHECKED** | no running server + keys in this container; the effect was computed from the view the route reads, not an HTTP call |
| zkp-postcard crate compiles | **NOT CHECKED** | no Rust toolchain run this session |
| Whether repid-engine HAL is healthy | **NOT CHECKED** | different repo, Railway proxy-denied |
| Simulation numbers in changelog #130 | **UNVERIFIABLE** | the artifact does not exist |
