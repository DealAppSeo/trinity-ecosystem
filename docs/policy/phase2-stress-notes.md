# Phase 2 — stress notes

Design bounds. Not a delay. These are the cases the predicates in `phase2-e2e-predicates.md` must still hold under.

---

## 1. Simultaneous decay shock

Many agents receive \(\Delta_k\) in the same apply window (fleet idle since ~2026-07-17).

**Must hold**

- Peer \(\rho_{\mathrm{rater}}\) uses \(R^{\mathrm{pre}}\), not the mid-envelope \(R_{\mathrm{ledger}}\). A fleet-wide \(R\) step is not a collusion ring.
- Clustered `DORMANCY_DECAY` / `DECAY` rows with the same tick index are **not** family-disjoint violations.
- Per-agent envelope: \(K\) and \(\sigma\) are per agent. One agent’s settle does not close another’s \(\sigma\).
- \(\max_a \lvert \Delta R^{\mathrm{route}}_k\rvert \le \lambda_\sigma \max_a \Delta_k\) still (D8, fleet-wide).

**Bound:** if a dry-run shows median real (non-`test_only`) \(\tfrac12\Delta^{\mathrm{full}} > 50\), split settle (policy already: two equal settle ticks). Do not raise \(\lambda_\sigma\) ad hoc.

**Fail:** using post-shock \(R\) for peer weights in the same hour as the apply.

---

## 2. Referral farming bounds

Attack: mint identities, refer them, collect \(n=1\) at \(+12\) repeatedly.

**Must hold (R4–R6 plus)**

- \(n\) increments only on **qualification**, not on code issue.
- `test_only` never qualifies.
- Same-family / same-operator / self: \(\delta=0\), \(n\) unchanged.
- Unproven: \(\delta=0\).
- Cap: at most **one** \(n=1\) payout per referrer–referee pair (idempotent).
- \(\delta(100)=0\): industrial farming of qualified humans still hits the noise floor.

**Bound:** cumulative referral credit for one referrer in 30 days \(\le 12+8+8+5\times 7 = 63\) if they somehow qualify 10 distinct real agents in a month (n=1..10: \(12+8+8+5+5+5+4+4+4+4=59\) with the locked table). A fixture that pays \(> 12\) for \(n=1\) or pays the same referee twice **fails**.

**Fail:** treating click / code-create as qualification; paying \(Q\) into \(S\).

---

## 3. \(A^{\mathrm{eff}}\) under missing Capability Declarations / degraded HAL

**Missing Capability Declaration**

- \(\hat c_p, \hat\ell_p, \hat d_p\) are **unknown**, not 0.
- Unknown \(\ne\) hot (ANFIS objective).
- Provider is eligible only as **cold** if \(\mathcal{E}(a)\) otherwise holds, or **excluded** if the declaration is required for the slot.
- \(A^{\mathrm{eff}}\) is a function of \(R^{\mathrm{route}}\) and stake only. Missing declarations **do not** change \(A^{\mathrm{eff}}\). They change class(\(p\)) and \(L_p\).
- Do not invent stake \(S\) (A3). Do not treat missing cost as cheap.

**Degraded HAL**

- Volume trickle is ops, not a threshold to retune.
- Quorum-gated HAL events still feed \(S\); **absence** of HAL is missing axis \(\to\) renormalize \(\Pi\), not a fabricated self-score.
- Evaluator outage: contracted path fail-closed (#104). Routing degradation order: correctness \(\succ\) family \(\succ\) heat \(\succ\) cost; fail closed at step 6.
- Degraded HAL does **not** open `doer_verified_work`. That stays blocked.
- BFT 0 rows: still observe. Do not substitute BFT for HAL in \(\pi_a\).

**Fail:** classifying unknown-declaration providers as hot; raising \(A^{\mathrm{eff}}\) when HAL is silent; using simulated x402 as HAL-substitute collateral (X1).

---

## 4. What this file does not claim

Decay is not enforced on main until an apply is measured. Floor write is observe-only. HAL is not healthy. Capability Declarations are not all present. These notes are the stress **bar**, not a report of live traffic.
