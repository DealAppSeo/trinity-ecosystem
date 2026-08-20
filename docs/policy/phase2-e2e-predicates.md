# Phase 2 — E2E pass/fail predicates

Measurement contracts. A run is green only if every predicate in a named suite is true.  
No waiting on GA: predicates are evaluable from ledger integers, passport fields, and the CC decay dry-run.

Integer deltas: `docs/policy/integer-delta-rule.v1.md`.  
Policy: `docs/policy/authority-policy.v0.5.yaml`.  
Routing: `docs/policy/anfis-objective.md`.  
Stress: `docs/policy/phase2-stress-notes.md`.

---

## Suite D — decay soft-landing

Let \(W\) be idle weeks, \(K=\min(8,\max(1,\lceil W\rceil))\), \(\lambda_\sigma=0.5\).

| id | pass iff |
|---|---|
| D1 | `last_active_at` is NULL \(\Rightarrow\) skip (no \(\Delta\), no row, \(\sigma\) stays 0) |
| D2 | lifecycle \(\ne\) `active` \(\Rightarrow\) skip |
| D3 | `decay_rate` NULL \(\Rightarrow\) skip |
| D4 | \(K = \min(8,\max(1,\lceil W\rceil))\) when \(W\) is measured |
| D5 | \(\Delta_k \in \mathbb{Z}\) for all ticks; remainder on last tick |
| D6 | \(\sum_{k=1}^{K} \Delta_k = R_{\mathrm{pre}} - R_{\mathrm{ledger, after\ }K}\) |
| D7 | while \(\sigma=1\) and \(k\le K\): \(R^{\mathrm{route}} = R_{\mathrm{pre}} - \lambda_\sigma \sum_{j\le k}\Delta_j\) |
| D8 | \(\lvert R^{\mathrm{route}}(k)-R^{\mathrm{route}}(k-1)\rvert \le \lambda_\sigma \Delta_k\) |
| D9 | \(R^{\mathrm{route}} \ge R_{\mathrm{ledger}}\) while \(\sigma=1\) |
| D10 | \(A^{\mathrm{eff}} = \min(R^{\mathrm{route}}, 100\sqrt{S})\cdot\mathbf{1}[\mathrm{builder}\ge 500]\) uses \(R^{\mathrm{route}}\), not \(R_{\mathrm{ledger}}\), while \(\sigma=1\) |
| D11 | after settle tick: \(R^{\mathrm{route}} = R_{\mathrm{ledger}}\) and \(\sigma=0\) |
| D12 | passport `soft_landing_active` is true iff \(\sigma=1\) |
| D13 | \(A^{\mathrm{eff}}\) never rises because decay was latent |
| D14 | floor observe `decays` does not change \(R^{\mathrm{route}}\) or \(A^{\mathrm{eff}}\) |

Suite D fails closed if a dry-run cannot produce \(W\) for agents that have `last_active_at`: that is NOT_CHECKED, not a pass.

---

## Suite R — referral mutants M1–M8

Locked \(\delta(n)=\mathrm{clip}(\mathrm{round}(40/(n+1)), 0, c(n))\), \(c(1)=12\), \(c(2{,}3)=8\), \(c(n\ge 4)=5\). Integers only.

| id | pass iff |
|---|---|
| M1 | \(\delta(1) > \delta(10)\) namely \(12 > 4\) |
| M2 | \(\delta(10) \gg \delta(100)\) namely \(4 > 0\) and \(\delta(100)=0\) |
| M3 | \(\delta(100)=0\) |
| M4 | unproven (no evidence.ref) \(\Rightarrow \delta=0\) even if \(n=1\) |
| M5 | `test_only` referee \(\Rightarrow n\) does not increment and \(\delta=0\) |
| M6 | same-family or self \(\Rightarrow \delta=0\) |
| M7 | global HAL clamp remains \(+5\); only this type uses \(c(n)\) |
| M8 | \(\delta\) lands on axis \(Q\), not \(S\) |

Worked integers that must match a fixture table: \(n=1\to 12,\ n=2\to 8,\ n=3\to 8,\ n=10\to 4,\ n=100\to 0\).

Qualification OR: \(R_b\ge 500\) or \(\ge 1\) non-sim x402 or \(\ge 1\) quorum HAL; AND not `test_only`.

---

## Suite I — impact

\[
I=\mathrm{clip}_{[0,1]}(\iota_{\mathrm{sev}}\cdot\iota_{\mathrm{who}}\cdot\iota_{\mathrm{proof}})
\quad
\delta_{\mathrm{imp}}=\mathrm{round}(\delta_0\cdot(0.4+1.6 I))
\]

| id | pass iff |
|---|---|
| I1 | \(\iota_{\mathrm{proof}}=0 \Rightarrow I=0 \Rightarrow \delta_{\mathrm{imp}}=0\) (unproven) |
| I2 | \(I=1 \Rightarrow \delta_{\mathrm{imp}} = \mathrm{round}(2\delta_0)\) before clamp |
| I3 | non-bounty types: \(\delta_{\mathrm{written}} \in [-10,+5]\) |
| I4 | `AUDIT_CONTRIBUTION` and \(I\ge 0.85\): clamp max \(+8\), still integer |
| I5 | \(I>1\) never stored; clip applies |
| I6 | impact does not move axis \(S\); it moves \(E\) |

---

## Suite P — passport `soft_landing_active`

| id | pass iff |
|---|---|
| P1 | `soft_landing_active = true` \(\iff \sigma=1\) |
| P2 | `soft_landing_active = false` after settle (D11) |
| P3 | skip (D1–D3) \(\Rightarrow\) `soft_landing_active = false` |
| P4 | field present on the passport object (missing field \(\Rightarrow\) FAIL, not false) |
| P5 | `soft_landing_active = true` does not claim decay is **enforced**; it claims the envelope is open |

---

## Suite X — x402 real-collateral

Reputation and \(\Pi_S\) accrue on **non-simulated** settlements only.

| id | pass iff |
|---|---|
| X1 | simulated settlement \(\Rightarrow\) no positive \(\delta\) on \(S\) or \(Q\) or \(E\) |
| X2 | `simulated=true` on a pay response \(\Rightarrow\) collateral is not treated as real |
| X3 | a referral qualification via x402 requires a **non-sim** settlement |
| X4 | missing Capability Declaration does not mint simulated collateral as real |
| X5 | contracted pay deny (503/403, #104) \(\Rightarrow\) no settlement row that looks approved |

---

## Suite A — \(A^{\mathrm{eff}}\) (shared)

| id | pass iff |
|---|---|
| A1 | \(A^{\mathrm{eff}}=\min(R^{\mathrm{route}},100\sqrt{S})\cdot\mathbf{1}[\mathrm{builder}\ge 500]\) |
| A2 | builder \(< 500\) and not fresh-demo \(\Rightarrow A^{\mathrm{eff}}=0\) |
| A3 | missing stake \(S\) \(\Rightarrow\) do not invent \(S\); \(A^{\mathrm{eff}}\) is NOT_CHECKED, not a fabricated 0-authority pass |

Phase 2 exits when D, R, I, P, X, A are all measured (pass or explicit NOT_CHECKED with owner), none silently skipped.

---

## Fixture numeric pack (for measurement)

Values a fixture MUST use. Derived from locked curves, not invented per test.

### F-REF — locked \(\delta(n)\) table

| \(n\) | \(\delta_{\mathrm{raw}}=40/(n+1)\) | \(\delta\) |
|---|---|---|
| 1 | 20 | 12 |
| 2 | 13.333… | 8 |
| 3 | 10 | 8 |
| 4 | 8 | 5 |
| 5 | 6.667… | 5 |
| 6 | 5.714… | 5 |
| 7 | 5 | 5 |
| 8 | 4.444… | 4 |
| 9 | 4 | 4 |
| 10 | 3.636… | 4 |
| 100 | 0.396… | 0 |

30-day farming cap for 10 distinct qualified referees (\(n=1\ldots10\)):

\[
12+8+8+5+5+5+5+4+4+4 = 60
\]

(\(n=7\) is \(\delta=5\), same as \(n=4,5,6\). A prior sum of 59 dropped that term. \(5\times 7=63\) remains withdrawn.)

Pair idempotency: second \(n=1\) on the same referrer–referee pair \(\Rightarrow\) FAIL if \(\delta=12\).

### F-DECAY-SIM — simultaneous shock

Five agents, identical, non-`test_only`, \(W=5\), \(K=5\), \(\Delta^{\mathrm{full}}=10\), \(\Delta_k=2\), \(\lambda_\sigma=0.5\).

| quantity | bound |
|---|---|
| per-tick \(\lvert\Delta R^{\mathrm{route}}\rvert\) | \(\le 1\) |
| fleet \(\max_a \lvert\Delta R^{\mathrm{route}}_k\rvert\) | \(\le 1\) |
| settle residual \(\tfrac12\Delta^{\mathrm{full}}\) | \(5 \le 50\) → **one** settle tick |
| \(\sigma\) | per-agent; one settle does not close another |

### F-DECAY-SETTLE-SPLIT

\(\Delta^{\mathrm{full}}=120 \Rightarrow \tfrac12\Delta^{\mathrm{full}}=60 > 50\) → **two** settle ticks of 30. Do not raise \(\lambda_\sigma\).

### F-AEFF

| inputs | \(A^{\mathrm{eff}}\) |
|---|---|
| \(R^{\mathrm{route}}=1000\), \(S_{\mathrm{USD}}=100\) | \(\min(1000, 100\sqrt{100})=1000\) |
| \(R^{\mathrm{route}}=1000\), \(S_{\mathrm{USD}}=25\) | \(\min(1000, 500)=500\) |
| builder \(=400\), not fresh-demo | \(0\) |
| \(S\) missing | NOT_CHECKED (A3), not a 0-authority **pass** |
| Capability Declaration missing | \(A^{\mathrm{eff}}\) **unchanged**; \(\mathrm{class}(p)\ne\mathrm{hot}\) |
| HAL axis \(S\) absent | renormalize \(\Pi\); \(A^{\mathrm{eff}}\) unchanged |

Priors: \(\theta_{\mathrm{hot}}=2000\), \(\theta_{\mathrm{warm}}=500\), \(\theta_{\mathrm{cold}}=0\) (testnet may drop \(\theta_{\mathrm{hot}}\) to 1000; that is Phase 3, not a silent change here).

---

## ZK / ecology / RMF (observe; not Phase 2 exit)

GateRun MEASURED / NOT_CHECKED / FAILED only. No circuits. No new soft-live surface.

| file | suites |
|---|---|
| `docs/policy/zk-attestation-predicates.md` | Z1–Z5, ZR1–ZR5, **ZB1–ZB6** zkVM public-input binding. `provenWithoutSecret` blocked. |
| `docs/policy/trust-ecology-profile.md` | public vs internal profile; frozen six |
| `docs/policy/nist-ai-rmf-mapping.md` | Measure / Manage for promote/park/reject and \(A^{\mathrm{eff}}\) |
| `docs/policy/grants-authority.v0.md` | G1–G8; **G6a–G6e** (`F-G6`) ready for measurement; ERC-7579 install=mint / uninstall=revoke observe. |
| `docs/policy/progressive-onboarding.v0.md` | O1–O3. Observe. |
