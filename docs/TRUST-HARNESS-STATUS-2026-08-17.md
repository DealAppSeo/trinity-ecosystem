# Trust Harness status — 2026-08-17 (late)

**Single status source for all lanes.** Read this before starting work.
Precedence: `docs/SPRINT-DECISIONS-2026-08-17.md` > this file > `docs/SPRINT-TRUST-HARNESS.md` > `docs/PRIOR-WORK-INDEX.md` > chat.

**Accurate phrase today:** spine in place; activation incomplete.

Do not say “best-in-class accountability for agent verification” until the
confidence-language gate at the bottom is green. Do not say “enforced” about
shadow or observe-mode paths.

Measured [V] against live `qnnpjhlxljtqyigedwkb` at 2026-08-17T23:19Z unless
tagged [code] / [R].

---

## Proven (on `main`, gated)

| item | evidence |
|---|---|
| Duplicate decay modules resolved | #93 merged `42b3bfd`. Survivor: `lib/trustshell/repid-floor-decay.ts`. `ratchet-decay.ts` removed. Rate `NOT_CHECKED` (`staleAfterMs` required). |
| Retracted unobserved-floor census cannot re-enter | `check:prior-work` id `floor-never-observed-6`. Live re-query 23:19Z: **12** pinned (4 human / 7 `test_only` / 1 real `trinity-gcm`). Ever-unobserved floor-holders **3**, all `test_only`. Real non-human unobserved-ever **0**. Cause of the original false census remains UNVERIFIED. |
| Gate 2 provenance reaches the scorer | #94 merged `4fccb6a`. View projects `quorum_providers_used`. `EarnedMetricsRepo` selects it and excludes only **actionable** catches with null/0 providers. |
| Gate 2 effect is tiny on real agents | [R from #94 SQL, 2026-08-17] actionable-unproven share **0.02–0.18%** of decayed integrity weight. The 16–19% “lacks provenance” mass is almost all **clean** evidence — excluding it would delete the positive, not the accusations. Per-agent: shofet +0.04pp, gcm +0.02pp, mel +0.10pp. |
| Spine composition exists and is mutation-tested | `runContractedWork` / `runAcceptedWork`. `check:spine-e2e`, `check:spine-reachable`, `check:checker-assignment`. `checker_must_not_be_doer` is constitutional. |
| Named Trust Harness fixture on `main` | #101 `a4e2d6a`. `check:trust-harness-fixture`: contract → work → independent Evaluator → signed contract-bound verdict → evidence vs progress, accept **and** reject. Extended: amended-after-work unbinds; last-tier outage cannot certify. |
| Live `/pay` contracted gate | `evaluateContractedPayment` → `runContractedWork`. `mayApproveAfterContract` is the only approve predicate. Missing seeds / outage / self-judge / FAILED → deny (503/403), never `approved: true`. `check:live-callers`. BFT remains observe-only. |
| `refusesToIssue` on the scoring path | `provenanceOf` now calls `issuer-stake.refusesToIssue` (no longer an inline lookalike). Unearned actionable veto cannot count. |
| RepID threshold fail-closed | [code] `app/api/trustrails/pay/route.ts`: null threshold → **503**, not a silent 5000. |
| KYA object is not a ZK proof | [code] same route: `proven=false`; commitment, not groth16. |
| Mutation job present | `.github/workflows/check.yml` still has `mutate`. A18 on #93, #94, #101 required it green on the merge head. #101: 167 CAUGHT / 0 SURVIVED. |

## Observe-only (exists; does not enforce)

| item | class | note |
|---|---|---|
| #95 ControlProof on `/pay` | observe-only | Draft. Shadow must not become the live custody gate. Disagreement vs `humanCustodyBound` is unmeasured on `main`. |
| BFT payment evaluations | not fed | `bft_payment_evaluations` **0 rows** [V 23:19Z]. Weight 0.40 of the score is structurally zero. Channel is code-complete; blocked on traffic. |
| Floor decay | observe-only | `EarnedMetricsRepo.load` consults `decideFloor` via `floor-decay-consult`. last-demonstration is not a column, so the typical result is `not_checked`. Missing `TRUSTSHELL_FLOOR_STALE_AFTER_MS` is also `not_checked` — no invented rate. Does **not** write the floor. |
| Issuer stake / `refusesToIssue` | proven on scoring path | Imported by `provenanceOf`. HAL runner in `repid-engine` remains the issue-time enforcer (other repo). |
| HAL detector | blocked-ops | Volume is a trickle, not a product signal. |

## NOT CHECKED / BLOCKED

| item | owner | state |
|---|---|---|
| HAL volume | Sean (Railway + gateway) | [V 23:19Z and remasure 23:55Z, identical] `hal_classifications` 7 / 1d, 15 / 7d, 121 / 30d. `HAL_SCORE_EVENT` 5 / 1d, 12 / 7d. `trinity_tasks` 6 / 1d. Last healthy day remains **2026-07-17**. Three distinct causes already named in PRIOR-WORK — do not re-derive: (1) Railway container stop 22:18Z, (2) gemini/qwen attrition from 07-14, (3) remaining 1–2/day is `e2e_smoke_nightly`. **No threshold tuning.** |
| Production Evaluator caller | kernel | `/pay` calls `evaluateContractedPayment` (fail-closed without seeds). `/review` still REJECT-ONLY without judge **model** secrets — it already calls `runAcceptedWork`. |
| Doer verified-work `ReputationSignal` | cross-lane (XAI) | Missing leaf. Local withheld reasons exist on the spine. Do **not** claim “only verified outcomes move reputation” for doers. |
| `witnessHidden` / `provenWithoutSecret` | cross-lane | Permanently false; sole production `IBindingScheme` throws. Naming is honest; marketing “ZK” is not. Circuit public inputs BLOCKED. |
| HAL replay (147,704 rows) | Sean (secrets) | HMAC + new secret key. Irreversible if run under a weak secret. |
| Fleet redeploy / shared #41 | Sean | Agents observe only. After deploy: verify unknown ≠ dead. |
| Dockerfile-baked keys, leaked deployer | Sean | Not an agent merge. |
| Bot-attributed Actions hold | Sean | Mitigated by `workflow_dispatch`, not fixed. |

## Minimum Sean actions to restore HAL signal

Agents stop at diagnosis. In order:

1. Redeploy the Trinity Railway fleet (autonomous redeploy is disabled; alerts say so).
2. Restore gemini + qwen on the gateway — otherwise a redeploy restores a degraded quorum.
3. Land `TRUSTSHELL_HMAC_SECRET` (≥16, not the abandoned default) + `SUPABASE_SECRET_KEY` before any HAL replay.
4. After (1): confirm `hal_classifications` leaves the 1–2/day band for two consecutive days.

## Confidence-language gate (all required)

- [x] Named E2E fixture green in CI (`check:trust-harness-fixture`) — #101 `a4e2d6a`; accept=1 reject=1 falsePath=1; mutants CAUGHT
- [x] Retracted unobserved-floor figure cannot merge (`check:prior-work`)
- [x] Observe vs enforce labeled in this file
- [x] Payment fail postures mutation-caught as a dedicated suite (`check:live-callers` + RepID 503 [code])
- [ ] Open BLOCKED list short and owned (still long; Sean-heavy)

Until then the phrase is **spine in place; activation incomplete**.

## What we still must not claim

- That unobserved floor-holders numbered six, or that decay is “the smaller half.”
- That provenance-missing rows (the 16–19% band) should be excluded wholesale.
- That HAL is healthy, or that F1 movement is in progress, on <10 events/day.
- That ControlProof / BFT / floor decay / issuer stake are **enforced**.
- That a holder can prove a threshold without revealing (`witnessHidden`).
- That only verified outcomes move doer reputation.
- That Vercel green is A18.
