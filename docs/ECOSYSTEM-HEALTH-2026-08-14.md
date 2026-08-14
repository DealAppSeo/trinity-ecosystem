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
| Reputation (zkRepID) | **3** / 10 | Real weighted formula with DB-loaded weights — fed four hardcoded constants at the only live call site |
| Proving stack | **1** / 10 | A genuine Plonky3 AIR that discards its proof and returns a `format!` string containing the secret |
| Memory | **4** / 10 | Best-developed area: real schema, real backfill with a fidelity gate, recall proven in prod. Zero encryption, no portable vault, dual-auth is unverified JSON |
| Routing & intelligence | **1** / 10 | No request-time routing exists. ANFIS service returns `confidence: 0.99` from 38 lines. No GNN |
| Harness layer | **3** / 10 | `HarnessProfile.ts` is excellent and has zero runtime callers. The nine-module portable harness the brain records as built **is not in the repo** |
| Safety & autonomy (HAL) | **2** / 10 | HAL is not in this repo; local integration is two table names in a row-count script. BFT defaults to observe mode and never runs inline |
| Infrastructure | **4** / 10 | Dual Railway+Vercel works, `/api/version` works, Vercel green. **No CI workflows exist in this repo at all** |
| Measurement & observability | **3** / 10 | Rich brain views and a real changelog — sitting on a canonical liveness view that overstates the working fleet by 6× |
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

`v_fleet_liveness_strict` already exists and is correct. Nothing points at it —
the contract still points at the masked view, so every agent that follows the
preflight protocol is told 12/12. This is the CLAUDE.md recurring defect sitting
inside the instrument meant to detect it.

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
| zkp-postcard crate compiles | **NOT CHECKED** | no Rust toolchain run this session |
| Whether repid-engine HAL is healthy | **NOT CHECKED** | different repo, Railway proxy-denied |
| Simulation numbers in changelog #130 | **UNVERIFIABLE** | the artifact does not exist |
