# Prior work index — read this before starting anything

**Purpose: stop agents redoing work that is already done, and stop them citing
numbers that have already been retracted.**

This file exists because it happened. Over 2026-08-13/14 a single agent spent
two full sprints optimising a component that was already at 97.9% of its
theoretical bound — because nobody had measured the bound. It then published
four numbers that later work had to retract, three of them for the same reason.
Both failures were cheap to prevent and expensive to discover.

`npm run check:prior-work` enforces the mechanical parts of this file. It is
part of `npm run check`, so it fails the same gate everything else does.

---

## The protocol, in order

1. **Read this index.** It is the map. Do not start by grepping the code — the
   code cannot tell you what was already tried and rejected, or why.
2. **Check the CLOSED list below** before picking up work. If your task is on
   it, the answer is already known; read the linked section instead of
   rebuilding it.
3. **Check the RETRACTED list below** before quoting any figure. Those numbers
   appear in git history and in old entries; they are wrong, and the check
   script will fail the build if a new file cites one.
4. **Measure the ceiling before optimising toward it.** See the rule at the
   bottom — it is the single most expensive lesson in this repo.
5. **When you finish, add your work here.** A result nobody can find gets
   rediscovered at full price.

---

## Where the authoritative answer lives

| question | file | do NOT reconstruct from |
|---|---|---|
| What is the trust harness, what does it measure, what is unbuilt | `docs/TRUST-HARNESS.md` | the module source |
| What real production data says, and which claims were retracted | `docs/TRUST-HARNESS.md` § "What REAL data says" | `docs/SPRINT-LOG.md` entries |
| Day-by-day record of what was tried, including failures | `docs/SPRINT-LOG.md` (status header at top) | anywhere else |
| Deployment topology, Supabase keys, what is SETTLED | `CLAUDE.md` | the dashboard |
| Failures and their root causes | `LESSONS.md` | — |
| The RepID/HAL data model and its known defects | `docs/ROADMAP-HYBRID-REPID.md` | live queries |
| Harness profile / settings authority model | `docs/HARNESS-SPEC.md` | — |
| TrustShell spec, M1 built, M2 blocked | `docs/TRUSTSHELL-V1.md` | — |
| Agent memory: recall path, both halves of the bug | `docs/AGENT-MEMORY-SPEC.md` | — |
| MCP fleet discovery endpoint | `docs/MCP-FLEET.md` | — |
| Release ordering, order-dependent steps | `docs/SHIP-CHECKLIST.md` | — |
| Context/token budget, measured | `docs/CONTEXT-BUDGET.md` | — |
| Key rotation, and why legacy keys stay disabled | `docs/KEY-ROTATION.md` | — |
| End-to-end audit, 2026-08-12 | `docs/E2E-AUDIT.md` | — |
| Ten-subsystem health scores against executed evidence, 2026-08-14 | `docs/ECOSYSTEM-HEALTH-2026-08-14.md` | re-scoring the subsystems yourself |
| All six products from DNS to repo — what is live, what is parked, what is unreproducible, 2026-08-14 | `docs/FULL-STACK-E2E-ASSESSMENT-2026-08-14.md` | re-probing the domains yourself |
| Poseidon2 parameters, the circuit contract, and why we do not implement it | `docs/POSEIDON2-PARAMETER-REQUEST.md` | choosing a parameter set independently |
| The paste-ready Poseidon2 request to send the other lane | `docs/POSEIDON2-HANDOVER-MESSAGE.md` | rewriting the ask from scratch |

---

## CLOSED — do not reopen without new evidence

Each of these was measured. Reopening one costs a sprint and returns nothing
unless the underlying world changed.

| area | verdict | evidence |
|---|---|---|
| **Top-1 routing quality** | At **97.9%** of the omniscient bound. Total remaining prize for any router / scheduler / capacity / timeout change: **2.00pp**. | `TRUST-HARNESS.md`, Sprint L |
| **Panel membership selection** | At **99.23%** of the omniscient panel-of-3 bound. **0.75pp** left. | Sprint P |
| **Panel size** | **3** is the cost-adjusted optimum. 4 buys +1.25pp for **+298% p99**; 5 is strictly dominated. | Sprint P |
| **Whether to run panels at all** | Gated adaptively on measured uplift (`AdaptivePanelPolicy`). Do not hardcode a policy. | Sprint O |
| **Co-failure lift as a gate signal** | **Unfit** — saturates at 2.1–2.3 across the whole decision region. Gate on `panelUplift`, never `fleetLift`. | Sprint N |
| **Quantile budget allocator for escalation** | Built, measured **exactly zero** improvement, removed. The cap is a safety ceiling, not an allocator. | Sprint J |
| **Slot abandonment accounting** | Built, measured **zero** throughput delta, kept on correctness grounds only. | Sprint K |
| **Per-domain reputation** | Priced at **+1.64pp** volume-weighted. **Not worth** rekeying `ReputationLedger`. Cheap alternative: stop ranking the 3 `peer_verify` agents against the other 9. | Sprint V |
| **`hal_quorum_receipts` / `hal_quorum_validator_votes` migration** | **Declined deliberately.** No writer for those tables exists in this repo; the schema would have been invented. | Sprint K |

## OPEN — and who owns it

| item | owner | note |
|---|---|---|
| **Task key on `repid_score_events`** | **Sean** | THE blocker. Co-failure correlation is not computable without it, and that decides whether panels ever run. Needs a real task key or a join table linking events to task instances. |
| `20260813210000_agent_repid_earned_observations.sql` | **Sean** | Written, deliberately **UNAPPLIED**. `SupabaseReputationStore` refuses to load/save without it. |
| Sub-task routing granularity | **Sean** | Architecturally significant; reshapes the task model and `router.ts`. |
| `marginFloor` retune | open | Current 2000 escalates on ~91% of real pairs (cron-only). Not changed — every cut of that data moved the number. |
| Rotate the leaked EVM key | **Sean** | Owns 3 live ERC-8004 identities, in git history. A commit cannot fix it. See PR #25. **Now identified and quantified** [VERIFIED 2026-08-14]: `DEPLOYER_KEY` in `scripts/register-agents-erc8004.js` at `3a22570c`, deriving `0xdf6b8215D193b11B4903d223729c3CF7A6de271d` — which is exactly `trinity_system_config.deployer_wallet`, the fleet's live deployer. Bounding facts: repo is **private**, ETH/Base balance **0**, **nonce 0** (never used on mainnet). So the exposure is **identity control, not funds** — the 3 ERC-8004 identities are the asset. Token/NFT and testnet holdings NOT CHECKED. |
| Rotate the leaked **Solana** key `AGENT_SOPHIA_PRIVKEY` | **Sean** | **New 2026-08-14.** In `audit_output.txt` at `e5b0d884` — an audit dump that captured a local `.env.local` line into the repo. Derives `43TSvktkyt3Fjb1C7eAkzW94GoFpD3Gi3ukGZhNA8FND`, mainnet balance **0**. Same remedy as the EVM key: history cannot be fixed by a commit. Found only after `--root`/history scanning was repaired. |
| **Anon write grants on 15 RLS-disabled tables** — `agent_preflight_control` **CLOSED 2026-08-14**, 59 remain | **Sean** | **The pause switch is closed.** RLS enabled on `agent_preflight_control` with a permissive SELECT-only policy (`agent_preflight_control_read_all`), so reads are preserved and the write path is gone. Proven live over PostgREST with the same browser-shipped publishable key that previously had write access: read **200** (`global_pause` still returned), insert **401 / 42501 new row violates row-level security policy**, row count unchanged at 1. `service_role` bypasses RLS so server writers are unaffected; `v_agent_preflight` is postgres-owned and not `security_invoker`, so it reads through as before. **The remaining 59 anon-writable tables are NOT yet closed** — including `trinity_artifacts` (155,428 rows) and `trinity_agent_logs` (139,659). Held deliberately for a soak period rather than done in one sweep. Original finding below. Anon read VERIFIED live over PostgREST with the browser-shipped publishable key; write verified at the privilege level. `LESSONS` S1 says "two tables"; it is **193 readable / 60 writable / 15 RLS-off**, of 621. **~324k rows are anonymously deletable** (`trinity_artifacts` 155,428, `trinity_agent_logs` 139,659) — the earlier "latent, nobody is using that room" reading was wrong. Confidentiality loss is small and bounded: **no key or token is anon-readable**, only 5 emails in `trustex_identities`. Priority is **integrity**, not secrets. See `FULL-STACK-E2E-ASSESSMENT-2026-08-14.md` §2. |
| ~~`scan-secrets.mjs` ignores unknown flags~~ | **CLOSED** 2026-08-14 | `--root` implemented as `git -C` in the single git() choke point; unknown flags and a missing `--root` value now exit 2. A second defect surfaced while testing: the history scan seeded its dedup set from the working tree, so a secret in **both** places printed *"0 usable in history"* and suppressed the rotation notice — history now dedups only against itself. Fixing both is what surfaced the two real keypairs above. |
| ~~hyperdag.org serves bytes in no commit~~ | **RETRACTED** 2026-08-14 | Wrong twice over, and re-probed the same day it was published. (a) Wrong project: the ERROR deploy and the `repid-engine` metadata belong to `hyperdag-org`, which serves **no custom domain**; the site is served by `hyperdag-trust`, whose prod deploy is READY at `fbf8253` = main HEAD. (b) Wrong unit: 28,908 vs 29,093 compared a Postgres `length()` **character** count against `wc -c` **bytes** on the same file — md5 is identical on both sides (`ff2ef682…`). hyperdag.org is healthy and reproducible. See §1. |
| Delete or rename the unused `hyperdag-org` Vercel project | **Sean** | Serves no domain, latest prod deploy is `state: ERROR`, and its name matches the live domain closely enough to have cost one false headline finding. A decoy named after a domain it does not serve will trap the next reader too. |

---

## RETRACTED — never cite these

`npm run check:prior-work` fails the build if a **new** file cites one. The
historical files that record them (`SPRINT-LOG.md`, `TRUST-HARNESS.md`,
`repid-replay.mjs`) are allowlisted, because deleting the record would hide the
correction.

| claim | why it is wrong | correct position |
|---|---|---|
| p99 cost of correctness is **+446%** | mostly a `confidenceK` tuning artefact | ~**+27%** |
| co-failure lift **1.283** on real data | artefact of grouping by `prompt_text`, which repeats only because cron jobs repeat — pairs agents answering at different times about different data | co-failure is **not computable** from that table |
| fleet improved, **+2419 bps** mean drift | 57 anomalous non-cron events dominated a 17-event EWMA window | no such fleet-wide improvement is established |
| **100%** of margins under `marginFloor: 2000` | outcome order destroyed by interleaving | ~**91%**, cron-only, and itself indicative |
| **56%** of margins under the floor | same contamination as the drift figure | as above |
| `32e0e809` is the **best cron performer (66.7%)** | tail-150 windows spanned different time periods per agent | it ranks **last** on both cron domains on full-slice data |
| "router.ts + quorum.ts already IS RouteMoA" | refuted by measurement — a fail-closed gate scored abstentions as wrong | plurality aggregation is a separate mechanism, and it is what pays |
| **137** anon-readable / **4** anon-writable tables | the census counted only policies naming `anon` and dropped every `PUBLIC`-role policy, then scored a policy open on its role without checking its `USING` clause | **193 readable / 60 writable / 15 RLS-off**, of 621 |
| anon write exposure is "**latent, not currently being exploited**" | the four tables looked at held 0 rows; the population holds ~**324k** — `trinity_artifacts` (155,428) and `trinity_agent_logs` (139,659) are anon-writable | a live **integrity** exposure; "not being exploited" was never measured |
| hyperdag.org serves **28,908 bytes matching no commit** | compared a Postgres `length()` **character** count against `wc -c` **bytes** — the same file, two units, 185 multi-byte UTF-8 chars apart | live and repo `index.html` are **md5-identical** (`ff2ef682…`); the site is reproducible |
| hyperdag.org's newest prod deploy is **ERROR, built from `repid-engine`** | true of the project `hyperdag-org`, which serves **no custom domain**; the assessment picked the project whose *name* matched the domain | the serving project is `hyperdag-trust`; its prod deploy is **READY** at `fbf8253` = main HEAD |

---

## The four rules that would have prevented all of it

1. **Suspect the target before the measurement, and the measurement before the
   code.** A mechanism at 97.9% of its bound has 2pp to give no matter how well
   you build it. Compute the bound first — it is usually cheap.
2. **Suspect the sample before the measurement.** Every real-data retraction
   above came from an assumption about the *shape* of the data made without
   checking the shape: interleaving assumed order did not matter; `id desc`
   assumed id tracked time; a fixed-length tail assumed equal volumes meant
   equal windows. Each check was one query.
3. **A caveat is a debt.** A number published with an unpaid caveat is
   provisional. Do not state it flat. Two of the retractions above were caught
   by caveats the author had written and then ignored.
4. **A mutation that does not compile is not evidence.** Mutation-test by
   grepping for the compile-failure line, not only for the failure count. This
   nearly passed three times in one session, once hiding a real coverage hole
   in the exact mechanism that sprint was about.

## Three outcomes, never two

VERIFIED / NOT CHECKED / FAILED. Two outcomes collapse "we did not look" into
"it passed", which is this codebase's most persistent defect.
