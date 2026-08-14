# SESSION SUMMARY — 2026-08-14 (claude-opus-5, cloud/scheduled)

Surface = **cloud/scheduled** (Claude Code Remote, ephemeral container).
Access = GitHub **yes** (MCP), Supabase **yes** (MCP), Railway **no** (proxy denies
CONNECT), Base Sepolia RPC **yes, indirectly** via Supabase `pg_net`.

Preflight: `v_agent_preflight` → **verdict=GO, global_pause=false**. No tasks claimed;
all work was directly user-requested (Phase 0 evaluation + first sprint).

Branch `claude/zkrepid-agentic-os-jfbi18`, **PR #25** (draft, open).
Full report: **`docs/ECOSYSTEM-HEALTH-2026-08-14.md`**. Brain: `trinity_changelog` #131.

## Sprint 2 — RepID is measured (landed, `d4bb85d`)

The live payment path fed RepID four literals, so every agent scored an identical
**3971** and the score could not move with behaviour. It is now computed from
recorded outcomes with 30-day decay and empirical-Bayes shrinkage toward **zero**
(not the population mean — shrinking toward a fleet average is the
reputation-laundering vector). Three states, never two: measured / insufficient /
unmeasured, each carrying its reason, and an unmeasured metric scores zero rather
than being defaulted.

[VERIFIED] measured effect: trinity-orch **2960**, trinity-shofet 2726,
trinity-gcm 2441, trinity-tom **2038** (2 observations — the thin-record penalty
working). Lower than 3971 because 3971 was never earned.

Two silent bugs the data forced out: `x402_settlements.status` and
`.is_simulated` **disagree** (403 `settled` vs 289 simulated — scoring on status
would count ~287 simulated payments as earned), and the payment path and
reputation ledger are **disjoint namespaces** (`TORCH` vs `trinity-torch`, 0 of
12 join directly).

**Two of four inputs are structurally unmeasurable and now say so:** `bftAccuracy`
— heaviest weight at 0.40 — has zero rows in both BFT tables, and no table
records latency per agent. Until those are captured, 50% of RepID's weight can
only resolve to zero. That is the next highest-leverage gap in this subsystem,
and it is a data-capture problem rather than a scoring one.

Gate: `npm run check` exit 0, **157 assertions** (up from 128), `tsc` 0 errors,
`next build` clean. Brain: `trinity_changelog` #132 with rollback SQL.

---

## Accomplished

**Phase 0 — Ecosystem Health Report.** Ten subsystems scored against executed evidence,
composite **~2.5/10**. Everything not checkable from this session is marked NOT CHECKED
rather than inferred.

**`d77cc87` — a committed EVM private key the scanner could not see.** `npm run
check:secrets` printed *"No credential-shaped strings found"* over a literal key in
`scripts/register-agents-erc8004.js`. The scanner was built for the Supabase JWT incident
and had no pattern for a `0x` 32-byte hex key — the one shape this project deploys with.
[VERIFIED on-chain via `pg_net`] leaked address `0xdf6b8215d193b11b4903d223729c3cf7a6de271d`,
~0.059 testnet ETH, nonce 111, and `ownerOf` agent IDs **3747, 3748, 3750**. Registry
`owner()` is a different account, so the registry contract itself is safe. Detection now
reuses the Solana ambiguity rule and treats `env || '0x…'` fallbacks as assignments.

**`bbe0647` + `430251a` — `tsc --noEmit` 25 → 0, and CI exists now.** Deleted
`src/graphs/motor-squad-graph.ts` (17 errors, self-labelled mock, imports a package that
was never in `package.json`, imported by nothing). Restored `tsconfig` `target: es2022`
— the lost fix from changelog #130; note it appears to do nothing until
`tsconfig.tsbuildinfo` is deleted, exactly as CLAUDE.md warns.

**Two real bugs were hiding behind those type errors** in `register-agents-agent0.ts`:
`.agentId` was read off a `TransactionHandle`, which does not have it, so `undefined` was
POSTed to production as `agent_id_onchain` (the id only exists after `waitMined()`); and a
demo branch returned `Math.floor(Math.random() * 10000)` as an agent id, which was written
to the production vault and rendered as a `did:pkh:` identity in a public agent card.

Also: `MemoryRecall` is now exported from `lib/trustshell/index.ts` (421 lines and 44
assertions that nothing could import), and the check scripts resolve the pinned local
compiler instead of `npx tsc`.

## Sprint 3 — the proving stack stops claiming a proof

`ZKPAttestation` returned `proofSystem: 'groth16'` and a `verificationKey` over a
SHA-256 of a timestamp dressed as an IPFS CID, and that value was published
on-chain in a Solana memo under key `zkp`. Four signals were hardcoded `true`
(including a sanctions check that exists nowhere), so a **failing** agent was
attested as passing.

Now: `proven:false`, `proofSystem:'none'`, a reopenable `commit-sha256:`
commitment with its salt returned, signals **derived** from inputs, and unchecked
claims **absent** from `publicSignals` rather than set to `false` — `false` would
assert the agent *is* sanctioned. Memo key `zkp` → `cmt`. 14 assertions.

`services/zkp-postcard/src/circuit.rs` returned
`format!("plonky3_..._value_{}_verified_ok", value)` as proof bytes, where
`value` is `repid − threshold − 1` — **the private input the circuit exists to
hide**. It now returns `Err`, routing `main.rs` onto its own truthful
`sha256_commitment_poc` fallback. **NOT COMPILED** — see below.

Gate: `npm run check` exit 0, **172 assertions**, `tsc` 0 errors, `next build`
clean. Brain: `trinity_changelog` #136.

**Still false in that service, untouched and recorded:** `verify_proof` is a
`HashMap` lookup echoing a boolean stored at write time; `get_agent_repid` is a
hardcoded 4-entry table disagreeing with live RepID. Both need the Rust build.

## Environment blocker worth fixing once

**CORRECTED 2026-08-14.** This previously read *"No Claude session can build
Rust in this ecosystem."* That was an overclaim: I measured one environment and
generalised to all of them. The XAI lane subsequently built the Plonky3 stack
and produced a real STARK (10,673 proof bytes, `prove_local.rs`), which refutes
it. Same shape as A1 and A4 — a conclusion wider than the evidence under it.

**What is actually true, and was actually measured:** *this sandboxed cloud
container* cannot build Rust. The agent proxy allow-list has `index.crates.io`
but not `static.crates.io`, so cargo resolves the sparse index then 403s on
every `.crate` download, with no local cache. Re-verified this session:
`cargo check --offline` fails on an undownloadable dependency, `cargo fetch`
hangs until killed.

Task **#75** is therefore a fix for *agent sessions*, not a global blocker on
the proving stack — a developer machine builds it fine. That distinction
matters for prioritisation: #75 unblocks verification-in-CI and agent work, it
does not gate whether the circuit can exist at all.

## REAL vs STUB

> **Corrected 2026-08-14.** This section was written after Sprint 1 and then went
> stale inside its own file: it listed the Plonky3 `format!` proof, the `groth16`
> label and the four hardcoded RepID inputs as untouched, all three of which
> Sprints 2 and 3 *above* had already fixed. Verified against the source, not
> against this file — `app/api/trustrails/pay/route.ts:58` reads
> `...toScoringInputs(earned.metrics)`. Same defect the rest of the session is
> about: a document asserting a state it had not re-checked.

REAL and landed: EVM key detection, tsc 25→0, CI workflow, MemoryRecall export, two
agent-id bugs fixed, RepID computed from recorded outcomes, `ZKPAttestation`
reporting `proven:false`, the Plonky3 `format!` proof replaced by an `Err`, and the
E2E suite below.

**Still stubbed, documented and not touched:** the ANFIS stub; `verify_proof` (a
`HashMap` lookup echoing a boolean stored at write time) and `get_agent_repid` (a
hardcoded 4-entry table) in `services/zkp-postcard`, both of which need the Rust
build that task #75 unblocks.

## Sprint 4 — the ecosystem can run an E2E test

There was **no test runner in this repo at all** — no jest, no vitest, no
playwright, zero `*.test.*` files. `npm run check` was seven hand-rolled assertion
scripts over pure functions, so nothing had ever executed a route handler.

`npm run test:e2e` now boots the production server (`next start`) and drives the
real payment path over HTTP. Real handler, real `lib/trustshell`, real supabase-js,
real query strings; only the database is replaced, by an in-memory PostgREST
(`scripts/e2e/postgrest-stub.mjs`) — necessary because the sandbox proxy denies the
Supabase host. The seam is at the **wire**, not at `getSupabaseAdmin()`: mocking the
client would have replaced the layer most likely to be wrong, since a hand-written
mock accepts any chain you write, including one PostgREST would reject.

[VERIFIED] **19 VERIFIED, 3 NOT CHECKED, 0 FAILED**, core 8/8, exit 0.

Two design decisions carry the weight:

1. **Three outcomes.** `scripts/e2e/ledger.mjs` records VERIFIED / NOT CHECKED /
   FAILED and fails the run when *zero core steps were verified*, so a suite that
   skipped everything cannot exit 0. That is repid-engine #414 — where every route
   returning 401 produced **6/6 passed, exit 0** — encoded as a guard. A step may
   also only resolve once, so a skip cannot later be upgraded to a pass.
2. **An unseeded table 404s rather than returning `[]`.** An empty array is
   indistinguishable from "no matching rows", so a route reading the wrong table
   would pass silently.

**The suite was verified by breaking the code, not by reading it.** Reintroducing
the four literals into `pay/route.ts` produced **3 FAILED, core 6/8, exit 1**, with
the response reverting to 3971. The mutation was then reverted and the run is green
again. An E2E suite that has never been shown to fail is an untested assertion.

It also tests itself: `scripts/check-e2e-harness.mjs` (29 assertions, in
`npm run check`) reproduces the #414 all-skipped run and asserts it exits 1, and
drives the PostgREST stub through a **real supabase-js client** — a stub validated
against my own idea of the wire format would only have confirmed my idea of the
wire format.

One gap this found in its own first draft: both dual-signature assertions were
passing while blocked at `kya_validation`, because TORCH's per-tx limit denied a
60000 payment before the signature gate ran. A `WHALE` fixture with a 200000 limit
now reaches the gate, and it is asserted in all three directions — unsigned held at
202, CFO+CFO rejected, **CFO+CTO accepted**. A gate that only ever closes is
indistinguishable from a broken one.

Not covered, and reported as NOT CHECKED rather than skipped: Solana broadcast (no
signing key, devnet unreachable), the live Supabase schema (so column drift would
not be caught), and the BFT panel (needs `BFT_ENFORCEMENT_MODE=enforce` and live
providers). CI runs the suite **without** `--strict` for exactly that reason — under
`--strict` the only route to green would be deleting those admissions.

## BLOCKED_FOR_SEAN

0. **Open tasks now: #73 (rotate key, Sean), #74 (llm_call_log attribution, CC),
   #75 (cargo verify + proxy allow-list, CC).** #70 is CLOSED.

1. **`autonomous_tasks` #73 — rotate the Base Sepolia deployer key.** In git history;
   a commit cannot remove it. Generate a fresh signer and `transferFrom` 3747/3748/3750.
   Until then treat those three identities as compromised and do not cite them as
   provenance. Also unrecorded: a **USABLE Solana secret key at `history:e5b0d884`**.
2. ~~**#70 — `v_fleet_truth` masks the fleet.**~~ **FIXED** on Sean's instruction
   (`trinity_changelog` #134). `is_live` now requires fresh heartbeat or work;
   reachability moved to `is_reachable`; `liveness_signal` gained `probe_only`.
   [VERIFIED] 12/12 → **3/12** live, 12/12 reachable, 9/12 probe-only, 0/12
   heartbeat. Canonical now equals `v_fleet_liveness_strict`. Rollback tested.
3. ~~**Durability — the brain can record a build with no artifact.**~~ **RETRACTED
   2026-08-14.** The fourteen harness modules from `trinity_changelog` #130 exist on
   PR #24's branch (`claude/e2e-mvp-packaging-plttzn`), with the portability checker.
   The original check ran `git log --all` in a container that had fetched only
   `origin/main`, so it could not have seen them and its silence was misread as
   absence. Nothing was lost. Fetch all remotes before concluding a path never
   existed.

## Next 3 commands

```sh
git fetch origin && git checkout claude/zkrepid-agentic-os-jfbi18 && npm ci
npm run check && node scripts/scan-secrets.mjs --history
psql -c "select agent_name, is_live_strict, probe_masking from v_fleet_liveness_strict;"
```

Next sprint (2): wire `HarnessProfile` + `MemoryRecall` into the live request path, and
replace the four hardcoded RepID inputs with measured outcomes via a declared-contract →
verify → credit loop. Success metric: a RepID that provably changes when behaviour does.

---

# SESSION SUMMARY — 2026-08-13 (claude-opus-5, cloud/scheduled)

Surface = **cloud/scheduled** (Claude Code Remote).
Access = GitHub **yes** (read+write via MCP), Supabase **yes** (MCP), Vercel **yes** (MCP),
Railway **no** (proxy denies CONNECT). Cloudflare MCP **unauthenticated** — unavailable.

Preflight: `v_agent_preflight` → **verdict=GO, global_pause=false**. No tasks claimed from
the queue; all work below was directly user-requested.

## Accomplished

**`1af1f00` — the harness profile.** Six dimensions (loops, tools, memory, reliability,
permissions, verification) as settings resolving through `vendor → org → user → agent`,
with one authority — `earned` — that no layer may write. Spec in `docs/HARNESS-SPEC.md`,
implementation in `lib/trustshell/HarnessProfile.ts`, **31 assertions** in
`scripts/check-harness-profile.mjs`, wired into `npm run check`. **0 new `tsc` errors**
(36 before, 36 after, none in the new files). REAL, not stub — but see the gap below.

**`249af42` — TrustShell M1, the transcript parser.** The load-bearing gap named in
`HARNESS-SPEC.md` §6: a receipt starts with reading what an agent actually did.
`lib/trustshell/TranscriptParser.ts` is a pure function — transcript string in, census
out, no file handle and no hash, because §7.2 requires the observer be read-only on
`~/.claude` and because a live session is appended to *while it is read* (parsing a path
twice gives two answers). **42 assertions** in `scripts/check-transcript-parser.mjs`
against two synthetic fixtures, wired into `npm run check`. CLI:
`node scripts/trustshell-parse.mjs <session.jsonl>`. **0 new `tsc` errors** (36 → 36).

M1's acceptance criterion — *"reproduces the §3 table on any saved session; 0 phantom
results"* — holds on the live session: 6,946 lines, **0 phantom, 0 malformed, 0
unrecognised record types**. [VERIFIED 2026-08-13 03:09Z — run against
`~/.claude/projects/-home-user-trinity-ecosystem/8c56e4c1….jsonl`]

**Earlier tonight:** `3c7eea7` (mainnet preconditions), `da8208e` (NORTH-STAR blocker list
made live + Done section). PR **#22** open, draft, Vercel **Ready at `249af42`**.

**Agent memory — research, measurement, and the recall path.** Deep dive on
`TencentCloud/TencentDB-Agent-Memory` (MIT) and mapping it onto the RepID harness.
Write-up in `docs/AGENT-MEMORY-SPEC.md`, primitives in `lib/trustshell/MemoryRecall.ts`,
**44 assertions** in `scripts/check-memory-recall.mjs`, wired into `npm run check` as
`check:memory`. **0 new `tsc` errors** (36 → 36; one I introduced — a Map-iterator spread
that the repo target rejects — was caught by the diff and fixed).

The finding that reordered the work: **Trinity has no recall problem it can measure,
because it has never recalled anything.** [VERIFIED 2026-08-13 04:30Z via SQL]
`access_count > 0` matches **0 of 429** rows in `agent_memory_nodes`;
`trinity_skills.last_used_at` is null on all 14. Three months of writes, zero reads.
**CORRECTED 05:20Z — see `LESSONS` A9.** I first reported that all 34
`agent_memory_nodes.agent_id` values resolved to no agent registry and ranked "identity
is broken" as defect #1. **That was wrong.** I checked four registries and missed
`repid_agents`, the one the writing code uses. **34 of 34 owner ids and 429 of 429 nodes
resolve** against it. Nothing to repair; view corrected (changelog #118), `owner_agent_name`
dropped from the migration. Two neighbouring claims were understated, not wrong, and now
rest on stronger evidence: "never recalled" holds on `access_count=0` **and**
`accessed_at = created_at` on all 429 rows (two columns, different writers); and a recall
path **does** exist and is deployed — `GET /api/v1/agents/:id/recall`, public, no auth —
it has simply never returned a row.

The real blocker, and it is sharper than the wrong one: `graph_rag_match_nodes` filters on
`embedding IS NOT NULL`. Of 429 nodes, **204 belong to `test-agent-v11`** carrying **192 of
the 213 embeddings**. The twelve production agents hold 184 nodes with **9 embeddings
between them**, and **eight of the twelve have zero** — nexus, apm, hdm, orch, torch, w3c,
gcm, mel. For those eight recall returns empty **by construction**, forever. Per-agent
breakdown is live in `v_agent_memory_readiness`. Remaining defects: nothing links a memory
to an outcome; no dedup ever ran (215 patterns hold **52** distinct insights).
Also: 13 of 22 memory tables are empty, including the whole warm/cold/glacier tier, and
`trinity_learned_patterns` exists **twice** (`public` has `embedding`, `private` has
`times_reused`) — two complementary halves of one table split across schemas.

`v_memory_recall_readiness` created live (additive, reversible, **changelog #117**) so
this stays visible instead of needing a bespoke query each session. It reports
**FAILED on all four corpora** today.

Seven memory settings added to the harness, three of them `earned`. The cut: recalling
your *own* memory is baseline (floor is 5 items, not 0 — an agent denied it is amnesiac,
which protects nobody); recalling *peers'* memory is the privilege, because that is where
one agent's wrong conclusion becomes twelve agents'. Two upstream ideas deliberately
inverted, both documented at their call sites: their extraction gate is **permissive when
unconfigured** (ours denies), and their `usage_count` is a **popularity counter** that
rewards being retrieved rather than being right (ours nets good against bad outcomes, so
a harmful memory ranks *below* an unproven one — asserted).

## What M1 found — two spec corrections and one defect of mine

1. **Spend in `TRUSTSHELL-V1.md` §4.2 was overcounted 2.36×.** It claimed 2,111,919
   output tokens; that was a **per-record** sum. Claude Code repeats a turn's `usage`
   verbatim on every record of that turn. True figure **1,389,855** across 1,507
   `requestId` groups. [VERIFIED — 1,507 groups over 3,147 records, every group
   internally identical, zero differing.] Parser now reports both, named differently,
   with the ratio.
2. **`tool_result` blocks outnumber `tool_use` blocks.** §3's table implies
   `results = uses − orphans`. A retried or rejected-then-approved call is delivered
   **twice** under one `tool_use_id`: 1,562 uses − 2 orphans + 11 duplicates = 1,571
   blocks. One call, two deliveries, one action. [VERIFIED]
3. **LESSONS A8 — I shipped the house defect into the tool built to catch it.** The
   parser's first run reported "87 records on the active path, 5,421 off it" — 98% of a
   real session called abandoned, as a bare integer. The transcript is a **forest**
   (10 roots, 7 of them compaction/resume seams, 85 branch points, 95 leaves), not one
   tree, so a single leaf walk reaches 1,484 of 5,547 records by construction. Worse:
   nothing in the format records which sibling won at a branch, so liveness is
   **undecidable from this input** and I emitted a precise number for it anyway. Fixed
   by **deleting the field**, not improving the guess. All 42 assertions passed while it
   was wrong — I had written them against my own model. Reading the output caught it.

## Found live — three instances of the same defect

1. **`repid_permissions` has always been empty.** Right shape, zero rows, so
   `get_conductor_permissions()` has returned nothing for every conductor since creation.
   [VERIFIED — row count + function definition read live]
2. **Two reputation scales.** `conductor_state.reputation_score` is **0..1** (8 rows,
   0.4–1.0, unknown defaults to 0.5). `agent_kya_registry.repid_score` and
   `RepIDConfig.ts` are **0..10000**. `repid_permissions.min_repid` is consumed by the
   former despite its name. Banding on the RepID scale would park every conductor in the
   floor tier permanently while looking like a working ladder. [VERIFIED]
3. **`v_fleet_truth` scores a responding port as a working agent.** Reports **12/12 live**;
   all twelve on `probe` alone — heartbeats **~26 days** stale, 8 of 12 with no logged work
   ever. `v_agent_preflight.agents_live_10m` reads the heartbeat table and says **0**. Both
   are in the preflight contract; they disagree. [VERIFIED 2026-08-13 01:50Z]

## REAL vs STUB

| Piece | State |
|---|---|
| `HarnessProfile.ts` registry + resolver | **REAL** — 31 assertions, runs in `npm run check` |
| `repid_permissions` ladder migration | **WRITTEN, NOT APPLIED** — Sean-gated, see below |
| TrustShell M1 transcript parser | **REAL** — 42 assertions, runs in `npm run check`; verified against a live session |
| `MemoryRecall.ts` primitives (RRF, tiers, budget, utility, dedup shape) | **REAL** — 44 assertions, runs in `npm run check` |
| Memory dimension in the harness (7 settings, 3 earned) | **REAL** — resolves and refuses; asserted |
| `v_memory_recall_readiness` | **REAL, LIVE** — changelog #117, reports FAILED on all four corpora |
| Memory recall actually running in an agent loop | **NOT BUILT** — no executor; the plan compiles, nothing executes it. Needs Railway |
| `memory_recall_log` / `memory_outcome_link` / identity repair | **WRITTEN, NOT APPLIED** — `20260813050000_memory_recall_path.sql`, Sean-gated |
| Embedding backfill (216 nodes, 215 patterns) | **NOT DONE** — costs per row and permanently fixes a model choice |
| `owner_agent_name` backfill | **NOT DERIVABLE** — the uuid→name mapping is not in this database; guessing it would fabricate provenance |
| Session receipts (TrustShell M2–M4) | **NOT BUILT** — M1 reads the transcript; nothing emits, signs or verifies a receipt yet, so every earned setting still sits at its floor |
| `repid_writes_require_receipt` enforcement | **NOT BUILT** — declared, nothing enforces it |
| Compiling resolved `rule` settings into agent instructions | **NOT BUILT** |
| Per-user profile storage / onboarding surface | **NOT BUILT** — no table, no UI |

Honest summary: until receipts exist, the harness is a fully tested implementation of
**least privilege for everybody**. Right failure mode, not yet a reputation system.

## BLOCKED_FOR_SEAN

1. **Apply `supabase/migrations/20260813020000_repid_permissions_ladder.sql`.** Exact
   action: run that file against `qnnpjhlxljtqyigedwkb`. Not done because it is a live
   authority expansion — it grants **Platinum to APM, HDM, MEL, VERITAS** on scores of
   exactly 1.0 with **zero receipts** behind them, which is the specific thing
   `HARNESS-SPEC.md` forbids. Nothing in this repo calls `get_conductor_permissions()`,
   but an external Railway caller cannot be ruled out from a sandboxed session, so blast
   radius is **UNVERIFIED**. Rollback SQL is in the file header.
2. **`repid_config` is readable by `anon`, and holds `enterprise_api_key`.** Policy
   `"Enable read for anon"` is `SELECT … USING (true)` for `{anon, authenticated,
   service_role}`; the row `enterprise_api_key = 495150b8-…` is described as "Enterprise
   bypass key for rate limits". Publishable keys map to `anon` and ship in the browser
   bundle, so **anyone who views source can read it**. Unlike the settled legacy JWT, this
   one is live and reachable. Exact action: decide between rotating the key, moving it out
   of `repid_config`, or replacing the blanket policy with a column/row-filtered view.
   Not done here — key rotation and RLS changes on a live read path are both fenced.
3. **Sean-gate bookkeeping is split.** `v_agent_preflight.open_sean_gates` counts
   `autonomous_tasks`, which `NORTH-STAR.md` marks "historical — do not add to". So the
   canonical way to file a gate contradicts the canonical planning surface. Logged here
   instead of adding to a deprecated table. Exact action: point `open_sean_gates` at
   `trinity_tasks`, or un-deprecate `autonomous_tasks` for this one purpose.
4. ~~Apply `supabase/migrations/20260813050000_memory_recall_path.sql`~~ — **DONE
   2026-08-13, Sean-authorised. Changelog #120.** Verified against the catalog, not the
   tool's success flag: 3 columns, 2 tables, 6 indexes, RLS on both new tables with
   **0 policies**, 429 nodes intact. Rollback SQL still valid in the file header.
   What it added: `reused_good` / `reused_bad` / `last_outcome_at` on
   `agent_memory_nodes`; HNSW cosine indexes on both embedding columns; a GIN trigram
   index on `content`; and `memory_recall_log` + `memory_outcome_link`. **Do not add a
   permissive policy to those two tables to "make something work"** — RLS-enabled-with-
   zero-policies is the intended posture, and a permissive policy is exactly how the two
   `USING (true)` tables in LESSONS S1 happened.
5. ~~Where do the 34 orphan agent uuids come from?~~ **RESOLVED 05:20Z — the premise was
   my error.** They were never orphaned; they are a clean FK into `repid_agents`. See
   `LESSONS` A9. No action needed.
6. ~~Embed the 175 unembedded production-agent nodes~~ — **DONE.** 213 → 388 embedded,
   0 remaining, zero failures. All twelve production agents have retrievable memory.
   Drain cron unscheduled. Changelog #119 / #121. Original entry:
   It is the entire gap between "the memory feature exists" and "the memory feature
   returns something" for eight of the twelve agents. Exact action: name the embedding
   model and approve ~175 embedding calls. The model choice is effectively permanent —
   the existing 213 vectors came from whatever `src/services/graph-rag/embedding-service.ts`
   uses, and mixing models within one index silently degrades every similarity score
   without erroring. Match it or re-embed everything; do not mix.
7. **Merge repid-engine PR #425** — recall was pointed at three hardcoded uuids that own
   zero rows and do not exist in `repid_agents`, so injection was a no-op on every HAL
   turn. The backfill in item 6 was necessary but NOT sufficient; `access_count` stays 0
   until #425 ships. After merge, the honest test is: score one event with a prompt for an
   agent that has embedded memory, then confirm `access_count` on its nodes goes non-zero.
8. **Railway access for this session** — an env var on the environment, or a remote MCP
   connector. Note `trinity-egress` (env_01NdsRSYouC9gZx2BapbftQM) was created 00:36Z,
   *after* this session started ~00:07Z, which is the likeliest reason the allowlist never
   reached this container. A NEW session in that environment is the untested case.

## Next 3 commands

```bash
# 1. Confirm the fleet-truth finding for yourself before trusting any liveness number.
#    Expect: every row liveness_signal='probe', minutes_since_ping ~37,000+.
#    psql: select agent_name, is_live, liveness_signal, minutes_since_ping,
#                 minutes_since_work from v_fleet_truth order by agent_name;

# 2. Re-run the harness assertions after any edit to the registry.
npm run check:harness

# 3. M1 is done. Next is M2 — emit the §5 receipt from the parsed transcript, with an
#    audit_hash stable across re-runs of the same pinned bytes. Start by reading what
#    M1 already produces, then decide TRUSTSHELL-V1.md §12 Q1 (receipt storage) and
#    Q2 (signing key custody) — both are open and both block M3.
node scripts/trustshell-parse.mjs --latest --json | head -60
```

**Watch item for M2.** The parser has been run against **one** session on one format
revision. §11's first named risk is transcript format churn. `KNOWN_RECORD_TYPES` is
documented as an observed census rather than a claim about the format; unknown types are
reported, and `--strict` makes them fatal. A second real session on a different Claude
Code version is the cheapest next piece of evidence, and nobody has run one.

---

# SESSION SUMMARY — 2026-08-11 (claude-opus-5, cloud/scheduled)

> **Stale below this line.** The header that follows says `verdict=HOLD,
> global_pause=true` and `0/12 live`. The pause was cleared 2026-08-13 and the fleet
> numbers are contested — see the current section above. Kept for its merged-PR and
> credential history, which is still accurate.

Surface = **cloud/scheduled** (Claude Code Remote).
Access = GitHub **yes** (read+write via MCP), Supabase **yes**, Vercel **yes** (MCP),
npm registry **yes**, Railway **no**.
Cloudflare + Stripe MCP servers **unauthenticated** — unavailable this session.

Preflight: `v_agent_preflight` → **verdict=HOLD, global_pause=true** (Sean-directed
2026-07-21; credential rotation #57 + orphaned-claim release #59). **No tasks claimed,
no loop started.** Everything below was directly user-requested, not claimed from the queue.

---

## WHERE TO LOOK FOR ACTIVE STATUS

Check these in order. Do not trust this file over live state — it is a snapshot from
2026-08-11 ~21:10Z.

| What | Where | Last known |
|---|---|---|
| Preflight / HOLD | `v_agent_preflight` (Supabase) | HOLD, `global_pause=true` |
| Fleet liveness | agent heartbeat tables | 0/12 live since 2026-07-17T22:18Z |
| Open PRs | `DealAppSeo/repid-engine`, `DealAppSeo/trinity-ecosystem` | **none open** — all merged |
| npm credential | repid-engine → Settings → Secrets and variables → **Actions** tab | `NPM_TOKEN` **set** |
| npm cred, live check | Actions → `release-trust-demo` → Run workflow → `dry_run=true` | run 31553742477: **valid, `seangoodwin`** |
| Vercel builds | project `ai-trinity-symphony-landing` (`prj_EtbAAh789ySdcT0AZc8cgZNui3lt`) | prod `READY` at 5b919a9 |
| Vercel env vars | that project → Settings → Environment Variables | server key **missing** — see #2 below |
| Supabase API keys | project `qnnpjhlxljtqyigedwkb` (AITrinitySymphony) → Settings → API Keys | legacy `anon` **disabled**; 5 `sb_publishable_…` active |
| Railway reachability | `repid-engine-production.up.railway.app` | **403 to CONNECT** from cloud sessions |
| RepID substrate | `repid_score_events` (Supabase) | 152,136 rows / 104 agents |

**Trap worth knowing:** two separate systems in this stack reported success they had not
earned. Both were found by *running* the thing, not reading it. When a check is green,
confirm it actually executed something.

---

## MERGED THIS SESSION

**repid-engine #410** — `ci(release): make the trust-demo dry run verify the npm credential`.
Dry run checks `NPM_TOKEN` with three outcomes (absent → NOT CHECKED, rejected → fail,
unreachable → fail but explicitly not a token verdict).

**repid-engine #414** — `test(e2e): stop a skipped step from reporting as a pass`.
The live-flow E2E got **greener the more broken the deployment was**. Returning early from
an `it()` marks it passed, so every soft-skip rendered green. Against stubs, before the fix:
every route 404 → 3/6 passed; every route 401 → 4/6 passed; public GETs live + business
endpoints 401 → **6/6 passed, exit 0, GREEN**; host unreachable → 1 passed (the deposit
step, passing *because* the prior step failed). Fix: verification ledger
(VERIFIED / NOT CHECKED / FAILED), a guard that fails the suite when no core flow step was
verified, and `E2E_STRICT=1`. Working deployment still 7/7 in both modes.

**trinity-ecosystem #14** — `fix(build): defer Supabase client construction`.
`next build` had failed on **every deployment of this project since 2026-06-05**, `main`
included. Cause: `lib/trust/BFTEngine.ts` built a Supabase client at module scope with `!`
assertions; page-data collection imports every route module, so it ran at build time with
no key and threw. Behind it, hidden until the first was fixed:
`components/trustrails/{LiveReceiptFeed,AgentRepIDGrid}.tsx` did the same on the anon key
and broke `/dashboard` prerender. Fix: `getSupabaseAdmin()` / `getSupabaseBrowser()` —
lazy, memoised, throwing a named error when unconfigured. Dummy fallbacks
(`https://dummy.supabase.co` / `dummy_key`) removed; they had been building live clients
against a host that does not exist, so misconfiguration rendered empty instead of erroring.
Production recovered: `main` at 5b919a9 deployed `READY`.

**trinity-ecosystem #13** — this handoff file.

---

## REAL vs STUB

- **REAL**: trust-demo offline E2E (proof verified, 3 tampers rejected, verifier v0.2.0);
  trust-demo online-degraded path (UNKNOWN + reason, no false pass); release gates
  (prod-fixture-guard, 33 trust-demo tests); the Supabase build fix (`npm run build` green
  both with all five Supabase vars unset and with them set; `tsc --noEmit` 37 errors on
  main → 37 on branch, no new); Vercel preview + production deployments; RepID queries below.
- **STUB**: every E2E scenario behind #414. Network policy denies the Railway host, so the
  suite has **never** run against the real deployment. Merging #414 shipped the guard; it
  did not verify it against the live service. **First live run is still the proof.**

---

## RepID selection-layer substrate [VERIFIED 2026-08-11 via SQL]

- `repid_score_events`: 152,136 rows, 104 distinct agents, 12,230 in last 30d
- `task_domain` populated on **99.6%** of rows, **42 distinct domains**
- `x402_settlements`: 404
- Agent×domain pairs: **232** across 43 agents — **70** have n≥30, **61** have n≥100,
  **128 (55.2%)** have n<5
- `counterparty_agent_id`: only **1,277 / 152,136 (0.8%)** — column newly added
  (commit bc7c699), so the collusion graph is effectively empty and any collusion term
  would currently be decorative

Implication: per-domain competence ranking is buildable **today** for ~30% of agent×domain
pairs; the majority case is insufficient evidence and must return **"INSUFFICIENT
EVIDENCE"**, not a low score. Same three-outcome discipline as the #410 and #414 fixes —
verified, not-checked and failed are three different things.

---

## BLOCKED_FOR_SEAN — nothing here can be done by an agent

1. ~~**Add `NPM_TOKEN`**~~ — **DONE 2026-08-12.** A new granular token is set as a
   repository **secret** on repid-engine, and the live dry run
   ([run 31553742477](https://github.com/DealAppSeo/repid-engine/actions/runs/31553742477))
   verified it: `npm credential: valid, authenticated as seangoodwin`. All 14 steps green
   in 20s, including the tarball smoke test (proof verified, 3 tampers rejected,
   verifier v0.2.0).
   *Worth knowing:* the first attempt failed because the token was added under the
   **Variables** tab, not **Secrets**. `${{ secrets.NPM_TOKEN }}` then resolves to an empty
   string and the run still goes green — reported as `NOT CHECKED`, which is exactly the
   distinction #410 exists to preserve. If this ever reads NOT CHECKED again, check the tab
   before regenerating the token.
   **What is still NOT settled:** that `seangoodwin` may publish *this name*. npm offers no
   way to ask about a name that does not exist yet. Circumstantial evidence is strong —
   that account's `@hyperdag` scope already carries `trustshell@1.3.0`, `trustshell-mcp@1.0.0`
   and `proof-verifier@0.2.0` — but the real publish is the only proof.
   **The remaining step is a decision, not a task:** `git tag trust-demo-v0.1.0 && git push
   origin trust-demo-v0.1.0` publishes for real. Irreversible — the version is burned on
   landing and `0.1.0` can never be reused. `package.json` says `0.1.0`, so the tag guard
   agrees. Do not do this on an agent's initiative.
2. **Set the Supabase server key** in the Vercel project (Preview + Production) as
   `SUPABASE_SECRET_KEY` — an `sb_secret_…` key from Supabase → Settings → API Keys.
   #14 removed the *build's* dependency on it, not the *runtime's* — routes throw a named
   configuration error instead of rendering empty, which is clearer but is not data.
   `NEXT_PUBLIC_SUPABASE_URL` is already set.
   **Do not use `SUPABASE_SERVICE_ROLE_KEY`.** This project has moved to Supabase's newer
   API keys and the legacy `anon` JWT is **disabled** (verified 2026-08-11 against project
   `qnnpjhlxljtqyigedwkb`; five `sb_publishable_…` keys active, legacy anon
   `disabled: true`). **SETTLED 2026-08-12: the legacy service_role key is DISABLED along with anon (the dashboard offers "Re-enable JWT-based API keys"), so the copy in public git history is inert — see docs/KEY-ROTATION.md. Formerly UNVERIFIED** — secret
   keys are not readable through any API, so it was never measured. An earlier revision of
   this file asserted it was disabled too; that was an inference from the anon key, not a
   fact, and the Railway deployment at `app.aitrinitysymphony.com` was serving live data
   on 2026-08-12, which may well be running on a legacy service_role key. An earlier
   revision of this file said to set the service-role key — that was wrong for this
   project. #16 updates both helpers to accept the new names, legacy still tolerated.
   Browser side wants `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`).
3. **Network policy**: allow `repid-engine-production.up.railway.app` from cloud sessions,
   or the live-flow E2E can never run from here and #414 stays unproven against reality.
4. **HOLD still in force** since 2026-07-21; fleet 0/12 live since 2026-07-17T22:18Z.
5. Authorize Cloudflare + Stripe MCP connectors if those are wanted in cloud sessions.

---

## Next 3 commands

```bash
# 1. NPM_TOKEN is set and verified (run 31553742477, "authenticated as: seangoodwin").
#    Re-run the dry run any time to re-confirm before releasing:
#    repid-engine → Actions → release-trust-demo → Run workflow → dry_run=true
#    To actually publish — IRREVERSIBLE, Sean's call only:
#      git tag trust-demo-v0.1.0 && git push origin trust-demo-v0.1.0

# 2. Once the Railway host is reachable — the honest E2E, post-rollout mode.
#    This is the outstanding proof for #414.
cd /workspace/repid-engine && E2E_STRICT=1 npm run test:e2e

# 3. Scope the selection layer against real coverage
psql -c "select task_domain, count(distinct agent_id) agents, count(*) n
         from repid_score_events where task_domain is not null
         group by 1 having count(*) >= 30 order by n desc;"
```

---

## 2026-08-14 — identity layer (cloud session, branch `claude/zkrepid-agentic-os-jfbi18`)

**Preflight:** surface=cloud/scheduled; GitHub=yes, Supabase=yes (MCP), Railway=no.
`v_agent_preflight` verdict=GO, global_pause=false. `v_fleet_truth` 3 live / 12.

**Accomplished.** `781efbc` — `lib/trustshell/identity/` (6 modules, zero new
deps, WebCrypto only): `did:key` Ed25519, salted-Merkle selective disclosure,
capability attenuation, `IProofProvider` seam, dual-auth `ControlProof`.
`check:identity` = 57 assertions wired into `npm run check` (now **438**, exit 0,
`tsc --noEmit` clean). Verified by 9 mutations, each compile-checked.
Earlier in session: `5fb3151` merged main after PR #24 (union of both check
suites); `0e06808` fixed a next-server process leak in the E2E harness.

**REAL vs STUB.** REAL: human→agent authorization verifiable offline; selective
disclosure with undisclosed claims cryptographically hidden; audience binding;
capability attenuation; expiry. STUB/NOT PROVEN: zero-knowledge predicates
(`repid >= t` without revealing repid) — blocked on #75; ERC-8004 DID↔agentId
binding is `claimed`, never `proven` (different curves); replay defence reports
`NOT_CHECKED` until a nonce store exists.

**BLOCKED_FOR_SEAN.**
1. Add `static.crates.io` to the proxy allow-list (task #75) — unblocks
   `Plonky3ProofProvider` and `cargo check` on `services/zkp-postcard`, the only
   change on this branch with no executed evidence behind it.
2. Rotate the Base Sepolia deployer key (task #73) — owns ERC-8004 ids
   3747/3748/3750, in git history.
3. Review/merge PR #25.

**Next 3 commands.** See `NEXT.md`.
```
npm run check                    # expect exit 0, 438 assertions
node scripts/check-identity.mjs  # expect 57, VERIFIED
git log --oneline -8
```
