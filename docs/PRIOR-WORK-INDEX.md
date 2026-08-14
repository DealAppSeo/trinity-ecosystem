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
| Poseidon2 parameters, the circuit contract, and why we do not implement it | `docs/POSEIDON2-PARAMETER-REQUEST.md` | choosing a parameter set independently |
| The paste-ready Poseidon2 request to send the other lane | `docs/POSEIDON2-HANDOVER-MESSAGE.md` | rewriting the ask from scratch |
| Browser automation for agents: install, Chrome resolution, and what `doctor` gets wrong | `docs/AGENT-BROWSER.md` | the upstream README, which documents none of it |

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

## OPEN — and who owns it

| item | owner | note |
|---|---|---|
| **Task key on `repid_score_events`** | **Sean** | THE blocker, and it now gates **two** things. Co-failure correlation is not computable without it, and that decides whether panels ever run; Sprint Z4 added sub-task routing, whose prize cannot be located on its curve without per-(agent, sub-step) rates from the same key. Needs a real task key or a join table linking events to task instances. |
| `20260813210000_agent_repid_earned_observations.sql` | **Sean** | Written, deliberately **UNAPPLIED**. `SupabaseReputationStore` refuses to load/save without it. |
| Sub-task routing granularity | **Sean** | **Priced Sprint Z4 — the one large prize left.** +3.11pp at specialisation spread 0.10, +10.57pp at 0.20 (24 seeds), vs the +1.64pp bar Sprint V declined. **The cost claim was half wrong**: `router.ts` and `ReputationLedger` need NO change (route() is stateless; the ledger keys on an opaque string) — only the call-site keying, plus a persistence rekey to survive restarts. Blocked on measuring the fleet's actual spread, which needs the task key below. |
| **Newcomer adoption lag** | **Sean** (policy, not code) | Attacked in Sprint Y and **there is almost nothing there** — see CLOSED. What remains is a policy question: how likely is a newly added agent to be better than the incumbents? Every lever trades gem-detection against dud-rejection, so the answer decides the setting. No simulator can supply it. |
| `marginFloor` adoption of 1000 | open, low priority | The retune is **answered** (see CLOSED); applying it to the simulator re-bases Sprint P's panel figures, so it needs those re-measured first. Nothing in production is affected — the parameter has no caller. |
| Rotate the leaked EVM key | **Sean** | Owns 3 live ERC-8004 identities (3747/3748/3750), in git history. A commit cannot fix it, and **no agent session should run it** — rotating needs the live key in a transcripted context, which is how it leaked. **Runbook: `docs/KEY-ROTATION.md` § The EVM deployer key.** Code now refuses to *sign* with it (`scripts/lib/compromised-signer.cjs`), which is not the same as rotating. |

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
