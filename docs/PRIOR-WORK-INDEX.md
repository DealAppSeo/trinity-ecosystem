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
| TrustShell spec and milestone ledger — M1–M6 built, every one having falsified something the spec asserted | `docs/TRUSTSHELL-V1.md` | the spec's own unbuilt half, which is a plan not a description |
| Agent memory: recall path, both halves of the bug | `docs/AGENT-MEMORY-SPEC.md` | — |
| MCP fleet discovery endpoint | `docs/MCP-FLEET.md` | — |
| Release ordering, order-dependent steps | `docs/SHIP-CHECKLIST.md` | — |
| Context/token budget, measured | `docs/CONTEXT-BUDGET.md` | — |
| Key rotation, and why legacy keys stay disabled | `docs/KEY-ROTATION.md` | — |
| End-to-end audit, 2026-08-12 | `docs/E2E-AUDIT.md` | — |
| Ten-subsystem health scores against executed evidence, 2026-08-14 | `docs/ECOSYSTEM-HEALTH-2026-08-14.md` | re-scoring the subsystems yourself |
| All six products from DNS to repo — what is live, what is parked, what is unreproducible, 2026-08-14 | `docs/FULL-STACK-E2E-ASSESSMENT-2026-08-14.md` | re-probing the domains yourself |
| **Software Trust Foundation — the harness half, ENFORCED.** Eight controls, one per domain, mechanical rather than asserted; three outcomes; **all eight mutation-tested** by deliberately breaking each and confirming it turns red. Writing TF-02 found a live bug: `cross-llm-verifier.ts` read only legacy key names, so it returned null and silently dropped every record | `scripts/check-trust-foundation.mjs` — run `npm run check:trust` | running it; each control names the incident that earned it |
| **Software Trust Foundation — the mesh and surfaces half, MEASURED.** Eight domains across Supabase, the dispatch harness, six products and ten repos. Every cell is a dated measurement or the words NOT MEASURED — no cell describes a control that merely ought to exist | `docs/TRUST-FOUNDATION-MESH-SURFACES-2026-08-14.md` | re-measuring; the weakest domains are named explicitly |
| Poseidon2 parameters, the circuit contract, and why we do not implement it | `docs/POSEIDON2-PARAMETER-REQUEST.md` | choosing a parameter set independently |
| The paste-ready Poseidon2 request to send the other lane | `docs/POSEIDON2-HANDOVER-MESSAGE.md` | rewriting the ask from scratch |
| Agent execution loop: what is already built, what is wiring, what is new | `docs/AGENT-LOOP-SCOPE.md` | re-surveying the harness modules yourself |
| Which agent works which lane, the paths each owns, and the report block they all emit | `docs/AGENT-LOOP-PROMPTS.md` | inventing a lane split per session |
| Browser automation for agents: install, Chrome resolution, and what `doctor` gets wrong | `docs/AGENT-BROWSER.md` | the upstream README, which documents none of it |
| Dual-view (`/live`) plan: lane split, frozen event contract, what is and is not on the critical path | `docs/DUAL-VIEW-LAUNCH-PLAN.md` | the source Grok/XAI conversation, whose disk inventory was taken against a different repo — see its §1 |
| What the harness caught and missed on a real session, and why 10 sessions is unmet | `docs/TRUSTSHELL-M6-DOGFOOD.md` | re-running the harness and assuming silence means clean |

---

## CLOSED — do not reopen without new evidence

Each of these was measured. Reopening one costs a sprint and returns nothing
unless the underlying world changed.

| area | verdict | evidence |
|---|---|---|
| **Top-1 routing quality** | At **98.16%** of the omniscient bound (24 paired seeds), up from 97.31% before Sprint X. Remaining prize for any router / scheduler / capacity / timeout change: **1.84pp**. The single-seed 97.9% from Sprint L is consistent with this and is **not** retracted — it is one seed, and per-seed ratios range 95.8–99.7%. | `TRUST-HARNESS.md`, Sprints L and X |
| **Cold-start weighting** | **Fixed, Sprint X.** A cold expert is no longer scored at a flat 0.5; `ExpertProfile.observations` separates *no* evidence from *thin* evidence. **+0.85pp of bound**, t = 2.92, no panel effect. Do not restore the flat midpoint — the ablation seam is `--cold-start-midpoint`. | Sprint X |
| **Newcomer adoption lag, re-priced** | Post-join gap to omniscient is **0.45pp** after Sprint X, not 4.82pp. **0.18pp** of it is irreducible regret (Thompson sampling cannot get it either). Attackable residual: **0.27pp ± 0.15pp**. Three levers tried, none a free win. | Sprint Y, `npm run sim:adoption` |
| **`marginFloor`** | **APPLIED: 1000**, Sprint Z2. Was 2000. Answer derived in Sprint Z: Captures **3.11pp of 4.81pp** available for **+18% p99**, where 2000 costs **+75%** for +4.30pp; p99 knee sits between 1000 and 1500. Marginal efficiency falls monotonically (3.20 → 2.43 pp per extra call). Sprint P's figures were re-measured on adoption — see above. | Sprints Z, Z2 |
| **Does the escalation signal discriminate, or is it a volume dial?** | **It discriminates, but only at low rates.** vs random escalation at matched cost: **+0.55pp** (t = 3.78) at floor 1000, but only +0.27pp (t = 2.06) at 2000, which escalates 89% and leaves nothing to select. Seam: `--escalate-random R`. | Sprint Z |
| **Does `EscalationPolicy` run in production?** | **No.** Zero callers — nothing in `lib/` or `app/` imports `escalate.ts`, and the module default is `marginFloor: 0` (disabled). The 2000 lives on one line of `harness-simulate.mjs`. Check this before costing any escalation work. | Sprint Z |
| **Is the EWMA's forgetting hurting adoption?** | **No — refuted.** Replacing `alpha 0.06` with a running mean makes the gem world **1.99pp worse** (t = −5.69). The forgetting is load-bearing: it lets an incumbent decay so a newcomer can overtake. Do not "fix" it. | Sprint Y |
| **Can a mid-run newcomer earn trust?** | **Yes**, 95% of 40 seeds — refuting the closed-form prediction that it could not. The 6775 bps graduation ceiling is real but does not bind, because incumbents' EWMA scores move too. | Sprint X, `npm run sim:newcomer` |
| **Panel membership selection** | At **97.15% ± 0.25** of the omniscient panel-of-3 bound, **2.80pp** left, at the floor now shipped (1000), over 20 seeds. Sprint P's **99.23% / 0.75pp** was a single seed at floor 2000; the same 20-seed measurement at floor 2000 gives **98.17% ± 0.16**, so most of the gap is seed variance, not the floor. | Sprint P, **re-measured Sprint Z2** |
| **Panel size** | **3. Settled Sprint Z3 on stronger grounds than Sprint P had, and no exchange rate was needed.** Compared at *matched call budget* across a (size × floor) grid, size 3 is at least as good on quality **and** cheaper on p99 everywhere both sizes can operate — at ~2.97 calls it is **+0.34pp ± 0.29 (t = 2.35) with 42 ms lower p99**. Size 4 never wins a matched-budget comparison. **5 is strictly dominated by 4.** | Sprints P, Z2, **Z3** |
| **When IS panel size 4 right?** | Only above size 3's ceiling. Size 3 saturates at **~96.8%** (99.1% of tasks escalated at floor 3000 — no floor buys more). Exceeding that requires size 4, at a **2.3× p99 jump** (346 → 782 ms) for +0.76pp. That is a capability question — "do we need >96.8%?" — not a cost-efficiency one. | Sprint Z3 |
| **Whether to run panels at all** | Gated adaptively on measured uplift (`AdaptivePanelPolicy`). Do not hardcode a policy. | Sprint O |
| **Co-failure lift as a gate signal** | **Unfit** — saturates at 2.1–2.3 across the whole decision region. Gate on `panelUplift`, never `fleetLift`. | Sprint N |
| **Quantile budget allocator for escalation** | Built, measured **exactly zero** improvement, removed. The cap is a safety ceiling, not an allocator. | Sprint J |
| **Slot abandonment accounting** | Built, measured **zero** throughput delta, kept on correctness grounds only. | Sprint K |
| **Per-domain reputation** | Priced at **+1.64pp** volume-weighted. **Not worth** rekeying `ReputationLedger`. Cheap alternative: stop ranking the 3 `peer_verify` agents against the other 9. | Sprint V |
| **`hal_quorum_receipts` / `hal_quorum_validator_votes` migration** | **Declined deliberately.** No writer for those tables exists in this repo; the schema would have been invented. | Sprint K |
| **Whether reputation decay can go in the circuit** | **No, and it is forced rather than chosen.** Decay is time-dependent: a score changes with **no new events**, so there is no leaf at the moment of decay for a circuit to constrain. In-circuit decay needs a trusted clock inside the proof — a separate, genuinely hard problem. The transition circuit proves the SEQUENCE; decay and shrinkage stay at read time in `EarnedMetrics`. | `STATUS.md` § Reputation as a constrained transition; `TRANSITION_CONTRACT.provesTheSequenceNotTheScore` |
| **Whether a public commitment beside a nullifier is unlinkable** | **No — that is pseudonymity.** A commitment is stable by design, so publishing it beside every nullifier links all of a holder's presentations. Scope-varying nullifiers give unlinkability *across scopes* only. Fixed by moving the commitment to the witness and proving Merkle membership against a public group root, as Semaphore does. **Unlinkability is then bounded by the group size** and that number must be reported with any privacy claim. | `CIRCUIT_CONTRACT` v2, `describeAnonymitySet()`, LESSONS A13 |
| **What actually makes the `check` job slow** | **Not the check chain — measure the step, not the suite.** On 2026-08-15 the chain was **51s of a 559s job**; `report credentials in git history` was **7m28s (80%)**, inside a step that by design cannot fail the run. It re-derived the same answer every run, scanning all **643 commits reachable from any ref** — `fetch-depth: 0` means all 19 branches, so it grew with the whole agent swarm's commits, not with the PR's. Fixed by batching `git grep` (one call per 64 commits, not one per commit) and carrying per-commit results across runs in a cached state file: **53.3s → 41s cold → 0.2s warm**, output byte-identical to the per-commit scan at both 643 and 649 commits. The 357s run that looked like a fast baseline was the **fastest of 30**, not typical — median was already ~565s. | this change; `scripts/scan-secrets.mjs --state`, `.github/workflows/check.yml` |

## OPEN — and who owns it

| item | owner | note |
|---|---|---|
| **Task key on `repid_score_events`** | **Sean** | THE blocker, and it now gates **two** things. Co-failure correlation is not computable without it, and that decides whether panels ever run; Sprint Z4 added sub-task routing, whose prize cannot be located on its curve without per-(agent, sub-step) rates from the same key. Needs a real task key or a join table linking events to task instances. |
| `20260813210000_agent_repid_earned_observations.sql` | **Sean** | Written, deliberately **UNAPPLIED**. `SupabaseReputationStore` refuses to load/save without it. |
| Sub-task routing granularity | **Sean** | **Priced Sprint Z4 — the one large prize left.** +3.11pp at specialisation spread 0.10, +10.57pp at 0.20 (24 seeds), vs the +1.64pp bar Sprint V declined. **The cost claim was half wrong**: `router.ts` and `ReputationLedger` need NO change (route() is stateless; the ledger keys on an opaque string) — only the call-site keying, plus a persistence rekey to survive restarts. Blocked on measuring the fleet's actual spread, which needs the task key below. |
| **Newcomer adoption lag** | **Sean** (policy, not code) | Attacked in Sprint Y and **there is almost nothing there** — see CLOSED. What remains is a policy question: how likely is a newly added agent to be better than the incumbents? Every lever trades gem-detection against dud-rejection, so the answer decides the setting. No simulator can supply it. |
| `marginFloor` adoption of 1000 | open, low priority | The retune is **answered** (see CLOSED); applying it to the simulator re-bases Sprint P's panel figures, so it needs those re-measured first. Nothing in production is affected — the parameter has no caller. |
| Rotate the leaked EVM key | **Sean** | Owns 3 live ERC-8004 identities, in git history. A commit cannot fix it. See PR #25. **Now identified and quantified** [VERIFIED 2026-08-14]: `DEPLOYER_KEY` in `scripts/register-agents-erc8004.js` at `3a22570c`, deriving `0xdf6b8215D193b11B4903d223729c3CF7A6de271d` — which is exactly `trinity_system_config.deployer_wallet`, the fleet's live deployer. Bounding facts: repo is **private**, ETH/Base balance **0**, **nonce 0** (never used on mainnet). So the exposure is **identity control, not funds** — the 3 ERC-8004 identities are the asset. Token/NFT and testnet holdings NOT CHECKED. Code now refuses to *sign* with it (`scripts/lib/compromised-signer.cjs`), which is not the same as rotating, and **no agent session should run the rotation** — it needs the live key in a transcripted context, which is how it leaked. **Runbook: `docs/KEY-ROTATION.md` § The EVM deployer key.** |
| Rotate the leaked **Solana** key `AGENT_SOPHIA_PRIVKEY` | **Sean** | **New 2026-08-14.** In `audit_output.txt` at `e5b0d884` — an audit dump that captured a local `.env.local` line into the repo. Derives `43TSvktkyt3Fjb1C7eAkzW94GoFpD3Gi3ukGZhNA8FND`, mainnet balance **0**. Same remedy as the EVM key: history cannot be fixed by a commit. Found only after `--root`/history scanning was repaired. |
| **Anon DESTRUCTIVE access to agent memory** — **CLOSED 2026-08-14 (batch 2)** | — | `trinity_agent_logs` and `trinity_artifacts` no longer permit anonymous UPDATE or DELETE. Three `ALL`-command PUBLIC policies with `USING(true)`/`WITH CHECK(true)` were dropped (`allow_all`; `Allow All`; `Enable all for anon`); the dedicated INSERT and SELECT policies were deliberately kept. Verified live with the browser-shipped publishable key: INSERT **201**, DELETE of that exact row by id **200 `[]`** (0 rows), and the row **still present** on re-read — so blocked, not "no match". Probe row removed. **Scope was chosen, not maximal:** `trustrails-dev`'s `lib/trustshell/*` resolve `SUPABASE_SERVICE_ROLE_KEY \|\| NEXT_PUBLIC_SUPABASE_ANON_KEY` — they **fall back to the anon key**, and the legacy service name is a disabled JWT here, so they may be inserting as anon on a live surface. Dropping anon INSERT would have broken it. **Residual, OPEN:** anon can still APPEND to both tables; narrow the INSERT policies to `service_role` once trustrails-dev moves to `SUPABASE_SECRET_KEY`. Exact counts at closure: 141,164 and 161,457 (earlier 139,659/155,428 were `reltuples` planner estimates, not counts). |
| **Anon destructive access, fleet-wide** — **CLOSED 2026-08-15 (batch 4)** | — | Swept all remaining anon-writable tables. **RLS-disabled: 14 → 0. Tables anon can UPDATE or DELETE: 57 → 0.** Anon INSERT 57 → 17, and the 17 are deliberate (waitlist family, `email_captures`, `referrals`, `trinity_leads`, `trinity_access_requests`, plus user-driven `notifications`/`repid_votes`/`trinity_bids`/`trinity_chat_messages`). **Phase A kept INSERT on purpose:** `waitlist` has three live browser INSERT paths in `trustrails-dev` on a serving domain — a blanket revoke would have broken public signups. **Phase B** then removed INSERT from 40 internal tables (logs, metrics, shadow fixtures, agent state, doc storage) with no client writer across 105 `'use client'` files; `antigravity_prompt_queue`, an unauthenticated prompt-injection channel into an agent loop, now returns **401/42501** [VERIFIED]. Live probes: signup insert **201**, anon delete **200 `[]`** (0 rows), anon read **200**. **Coverage gap — `trustmarket` half CLOSED 2026-08-15:** access granted, repo scanned, and it has **no Supabase writers at all** (no `@supabase/supabase-js` dependency, no `createClient`, no table references), so Phase B could not have broken anything there. `aitrinitysymphony-landing` remains NOT SCANNED. The 17 tables keeping anon INSERT are therefore justified by evidence — genuine public-form targets — rather than by uncertainty. |
| **aitrinitysymphony.com lead capture is DEAD — 217 days, 1 lead total** | **Sean** | **Found 2026-08-15**, the most consequential finding of the assessment. `public.leads` holds ONE row, dated 2026-01-10; the form is the flagship landing page's entire conversion path. Broken twice over, verified by replaying the exact live request: (a) `index.html` hardcodes a **legacy `anon` JWT**, disabled project-wide → **401 Invalid API key**; (b) `public.leads` has **RLS enabled with ZERO policies**, so anon INSERT is denied even with a valid key. **Not caused by the RLS batches** — `leads` was never in the 57-table anon-writable set (RLS-on-with-no-policies is already locked), and the drought predates the 2026-08-12 key disablement by seven months. Nothing caught it because the page has no CI, no `/api/version`, and the form swallows the error in a `catch` that only resets the button. **Fix, not applied (live surface):** add an anon INSERT policy on `leads`, and replace the legacy JWT with a current `sb_publishable_…` key. |
| `trustmarket` repo — first look | **VERIFIED 2026-08-15** | Previously NOT CHECKED (private, access ungranted). Secret scan **1 finding, 0 usable** — a legacy `anon` JWT in `public/coming-soon.html`, public by design and inert since legacy JWTs are disabled. **No CI** (no `.github/workflows`). **No `/api/version`** — only `leaderboard` and `services` routes. Default branch is `feat/sandbox-mvp-phase-a`, confirming the assessment. |
| **Anon write grants on 15 RLS-disabled tables** — `agent_preflight_control` **CLOSED 2026-08-14**, 59 remain | **Sean** | **The pause switch is closed.** RLS enabled on `agent_preflight_control` with a permissive SELECT-only policy (`agent_preflight_control_read_all`), so reads are preserved and the write path is gone. Proven live over PostgREST with the same browser-shipped publishable key that previously had write access: read **200** (`global_pause` still returned), insert **401 / 42501 new row violates row-level security policy**, row count unchanged at 1. `service_role` bypasses RLS so server writers are unaffected; `v_agent_preflight` is postgres-owned and not `security_invoker`, so it reads through as before. **The remaining 59 anon-writable tables are NOT yet closed** — including `trinity_artifacts` (155,428 rows) and `trinity_agent_logs` (139,659). Held deliberately for a soak period rather than done in one sweep. Original finding below. Anon read VERIFIED live over PostgREST with the browser-shipped publishable key; write verified at the privilege level. **Batch 3 CLOSED 2026-08-15: anon INSERT removed too** — `trinity_agent_logs` and `trinity_artifacts` now carry SELECT policies only; live anon INSERT returns 401/42501. `LESSONS` S1 says "two tables"; it is **193 readable / 60 writable / 15 RLS-off**, of 621. **~324k rows are anonymously deletable** (`trinity_artifacts` 155,428, `trinity_agent_logs` 139,659) — the earlier "latent, nobody is using that room" reading was wrong. Confidentiality loss is small and bounded: **no key or token is anon-readable**, only 5 emails in `trustex_identities`. Priority is **integrity**, not secrets. See `FULL-STACK-E2E-ASSESSMENT-2026-08-14.md` §2. |
| ~~`scan-secrets.mjs` ignores unknown flags~~ | **CLOSED** 2026-08-14 | `--root` implemented as `git -C` in the single git() choke point; unknown flags and a missing `--root` value now exit 2. A second defect surfaced while testing: the history scan seeded its dedup set from the working tree, so a secret in **both** places printed *"0 usable in history"* and suppressed the rotation notice — history now dedups only against itself. Fixing both is what surfaced the two real keypairs above. |
| ~~hyperdag.org serves bytes in no commit~~ | **RETRACTED** 2026-08-14 | Wrong twice over, and re-probed the same day it was published. (a) Wrong project: the ERROR deploy and the `repid-engine` metadata belong to `hyperdag-org`, which serves **no custom domain**; the site is served by `hyperdag-trust`, whose prod deploy is READY at `fbf8253` = main HEAD. (b) Wrong unit: 28,908 vs 29,093 compared a Postgres `length()` **character** count against `wc -c` **bytes** on the same file — md5 is identical on both sides (`ff2ef682…`). hyperdag.org is healthy and reproducible. See §1. |
| **`trustrails.dev` production is 100 days stale** | **Sean** | **Found 2026-08-15.** The live domain's production deployment is `aac3641a`, **2026-05-06** — every deployment since, including all four commits on `trustrails-dev` PR #1, is `target: null` (**preview**). Merging PR #1 will trigger the **first production deploy in 100 days**. The build gate on that PR is therefore load-bearing in a way it is not on a repo that deploys continuously. **NOT CHECKED, and it gates the merge:** whether the `trustrails` project's production environment actually sets `SUPABASE_SECRET_KEY`. PR #1 removes the `SERVICE_ROLE_KEY \|\| ANON_KEY` fallback, so `getSupabaseAdmin()` now **throws** instead of silently constructing an anon client — correct, but it converts a silent privilege downgrade into a runtime 500 on any server route if no privileged key is set. No Vercel MCP tool lists env var names; this needs the dashboard. |
| `trustrails-dev` secret scan | **VERIFIED 2026-08-15 — clean** | Previously never scanned, and it is a **PUBLIC repo** (`"private": false` per the GitHub API, not merely Vercel metadata), so anything in its history is world-readable. Working tree: **0 usable** of 13 findings (all `solana:base58-88` tx signatures). History: **1 usable**, and it is a placeholder — `TRINITY_DEPLOYER_PRIVATE_KEY \|\| '0xabcdabcd…abcd'` in `scripts/register-agents-agent0.ts` at `e1a7a3b3`, a file **absent at HEAD**. **No rotation needed.** Note the shape: a privileged credential falling back to a hard-coded literal is the same antipattern TF-09 gates, one step worse than falling back to the public key. |
| **The first scan of this repo reported a clean history it never read** | — | **2026-08-15, caught before publication.** `/workspace/trustrails-dev` was a **shallow clone of 5 commits**; `--history` dutifully reported *"0 usable in history"*. Unshallowed and re-fetched all refs → **61 commits**, and the real finding appeared. This is exactly the defect `scan-secrets.mjs` was repaired for, arriving by a different route: the scanner was fixed, the **clone** was not. `check.yml` sets `fetch-depth: 0` for this reason; an ad-hoc scan of a working copy has no such guarantee. **Always print the commit count before believing a history result.** |
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
| newcomer adoption lag is **4.82pp**, the largest unclaimed prize | measured on the point-estimate ranking, not the `upperConfidenceBound` the simulator actually ships — the same wrong-sample error caught mid-Sprint-X and not propagated to this figure | post-join gap is **0.45pp**, of which **0.18pp** is irreducible; residual **0.27pp** |
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
