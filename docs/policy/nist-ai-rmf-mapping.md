# NIST AI RMF — Measure / Manage mapping (policy)

NIST AI RMF 1.0 functions: Govern, Map, Measure, Manage. This file maps **Measure** and **Manage** only, for delegated agent authority and reputation gaming.  
Promote / park / reject and \(A^{\mathrm{eff}}\) are the Manage controls; Phase 2 predicates and integer-delta are the Measure artifacts.

Govern/Map live in SPRINT-DECISIONS and TRUST-HARNESS-STATUS; not restated here.

No new soft-live surface. No `events.v1.json`.

---

## Measure — delegated authority

| RMF-ish question | Our measure | Predicate / bound |
|---|---|---|
| Is spendable authority computed? | \(A^{\mathrm{eff}}=\min(R^{\mathrm{route}},100\sqrt{S_{\mathrm{real}}})\cdot\mathbf{1}[\mathrm{builder}\ge 500]\) | A1–A3, ZR1 |
| Is simulated money excluded? | `real_collateral_usd`; simulated ⇏ \(S_{\mathrm{real}}\) | X1–X5 |
| Is decay a cliff? | \(K\) ticks, \(\lambda_\sigma=0.5\), settle; F-DECAY-SIM | D4–D11; route step \(\le 1\) on that fixture |
| Is the envelope visible? | `soft_landing_active` \(\iff\sigma=1\) | P1–P5 |
| Independent evaluation? | contracted path or 503/403 | #104; X5 |
| Integer ledger? | \(\delta\in\mathbb{Z}\) | ID1–ID5 |

MISSING Capability Declaration: measure class \(\ne\) hot; \(A^{\mathrm{eff}}\) **unchanged** (F-AEFF). Do not measure “0 cost.”

Degraded HAL: measure missing \(S\) → renormalize \(\Pi\); do not retune HAL thresholds; do not mark HAL healthy.

---

## Measure — reputation gaming

| Attack | Measure | Bound / fail |
|---|---|---|
| Referral farm | \(\delta(n)\) table; 30d sum \(n=1..10=60\) | M1–M8; F-REF; pair idempotent |
| Unproven self-award | evidence.ref required | M4; I1 |
| `test_only` ring | lifecycle gate | M5 |
| Same-family / self refer | \(\delta=0\) | M6 |
| Collusion labeled as decay | clustered DECAY ≠ collusion | phase2-stress-notes §1 |
| Float inflation | schema integer on applied delta | ID1, ID5 |
| Peer-weight crash on simultaneous decay | \(\rho_{\mathrm{rater}}(R^{\mathrm{pre}})\) | D8 fleet; F-DECAY-SIM |

---

## Manage — promote / park / reject

From `authority-policy.v0.5.yaml`. Instantiates Manage (operate, degrade, stop).

| Control | Instantiates | Gaming / authority effect |
|---|---|---|
| **promote** observe→soft-live (named formula + mutant) | Manage: limited production with telemetry | Cannot promote BFT-as-evidence, floor write, doer leaf |
| **promote** soft-live→live write (measured once, idempotent ticks) | Manage: enable write path | Decay `--apply` still flagged; not silent |
| **park** `layers_decay_ts`, doer leaf, halo, EigenTrust overlay | Manage: do not operate | Stops a second decay writer and an unearned self-axis |
| **reject** silent skip of contracted eval | Manage: fail-closed | Delegated pay cannot succeed without evaluator |
| **reject** inventing `last_active_at` | Measure integrity | Stops fake \(W\) |
| **reject** one-shot \(\Delta^{\mathrm{full}}\) into \(A^{\mathrm{eff}}\) | Manage: no cliff | Soft-landing |
| **reject** shadow ControlProof as approve/deny | Manage: keep #95 observe | No fake custody gate |
| **reject** self-award referral without ref | Manage: anti-farm | M4 |
| **\(A^{\mathrm{eff}}\)** stake cap + builder floor | Manage: delegated spending limit | High \(\Pi\) does not raise the cap |
| Hot→warm→cold→fail closed | Manage: graceful degradation | Unknown declaration ≠ hot |
| **reject** expired grant as soft-allow; mint above grantor \(A^{\mathrm{eff}}\) | Manage: scoped delegation | `grants-authority.v0.md` |

Revocable grants plus audit receipts instantiate Manage for **abuse of delegated authority**, not model-only risk. A grantor (root human or delegator DID) must be able to stop a child that is spending, routing, or auditing on their proof — expiry is deny (`validityWindow` FAILED; `authorizer_denied`), not a warning-200; mid-life revoke is required of policy even though today's implementation is expiry-only (G6 NOT_CHECKED). The receipt that makes the abuse visible is the signed handoff / verdict envelope (`handoff.ts`, `verdict-envelope.ts`): who minted, which capabilities, which caveats, whether the auditor was read-only. RMF "model risk" (wrong token, hallucination) is HAL/S; this paragraph is the other half — an agent that was *authorized* and then overreached. See `docs/policy/grants-authority.v0.md`. Harness-wide Govern/Map rows stay in `docs/NIST-AI-RMF-TRUSTSHELL.md`; this file does not replace it.

---

## Status of this mapping

| Item | GateRun |
|---|---|
| Mapping file exists | MEASURED (this path) |
| Each Measure row | MEASURED if the cited predicate suite has been run; else NOT_CHECKED |
| Manage controls | MEASURED as policy; live effect follows Live/Soft-live table — not “enforced” for observe items |

Not claimed: NIST certification; full Govern/Map coverage; HAL health; BFT live.
