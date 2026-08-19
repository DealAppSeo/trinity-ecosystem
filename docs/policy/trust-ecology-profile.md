# Trust Ecology profile (Goertzel-shaped)

Which signals are **public** (the evaluation ecology counterparties may use) vs **internal-only** (operators, replay, anti-farm). File-only. No new soft-live surface.

Goertzel: authority is earned in an evaluation ecology — governable, calibrated, multi-agent, cost-aware, latency-aware, fail-closed.  
De Rossi: the public vector must be portable; internals stay off the passport.

---

## Public Trust Ecology profile

Counterparties (and ERC-8004-shaped readers) may rely on these. Each has a measurement hook.

| Ecology slot | Our instantiation | Gate / axis | Status |
|---|---|---|---|
| Governability | Independent evaluator; contracted pay; \(A^{\mathrm{eff}}\) stake cap; builder floor 500 | #104; `A_eff`; checker \(\ne\) doer | Live / formula |
| Calibration | Quorum-gated HAL into \(S\); `refusesToIssue` on unearned veto | \(\Pi_S\); provenance | Live (refuses) / soft-live (\(S\)) |
| Multi-agent | Peer axis \(P\); family-disjoint; primary+independent evaluator mix | \(\Pi_P\); ANFIS \(\beta\) | Soft-live |
| Cost | Provider \(\hat c_p\); cost_model on Capability Declaration | \(L_p\) | Soft-live rules |
| Latency | hot / warm / cold; \(\hat\ell_p\) | class(\(p\)) | Soft-live rules |
| Fail-closed rate | 503/403 when contracted path missing; skip on NULL `last_active`; unknown \(\ne\) hot | D1, X5, F-AEFF | Live / predicates |

Public \(\Pi=(S,P,H,Q,E)\) with missing-axis renormalize. Public booleans: `soft_landing_active`, `used_S_real` (when on a pay receipt). Public integers: ledger \(\delta\).

Not public as ecology scores: BFT weight 0.40 (observe_zero), floor `decideFloor` consult, ControlProof shadow.

---

## Internal-only

Do not put on the public profile. Needed to run and to stop farming.

| Internal | Why not public |
|---|---|
| Per-agent \(W\), \(K\), \(\Delta_k\), \(\sigma\) ticks | Operator envelope; public sees `soft_landing_active` only |
| Referral pair-id, family, operator, `test_only` | Anti-farm (30d cap 60); leaking family enables targeting |
| Impact \(\iota_{\mathrm{sev}}\) of a named bug | Disclosure of unfixed severity |
| `evidence.ref` contents, signing keys | Witness / PII / exploit surface |
| Capability Declaration internals beyond class/cost/latency | Adapter versions, failure-mode lists may be operator-scoped |
| `DEFAULT_WEIGHTS` (bft 0.40 …) | Frozen; not \(\Pi\) |
| Doer-verified-work leaf | Blocked |
| Circuit witnesses, Poseidon2 params | Cross-lane |
| HAL volume / F1 | Ops trickle; not a product signal |

---

## Mapping check

A profile that publishes \(Q\) without publishing the **cap 60** and qualification rule is gameable. Public ecology may say “referral axis exists, decaying, evidence required.” Exact \(n\) and pair ids stay internal.

A profile that publishes \(A^{\mathrm{eff}}\) must disclose `used_S_real` and must not treat simulated collateral as \(S_{\mathrm{real}}\).

Fail-closed **rate** is public ecology (count of 503/403 vs 200 on `/pay`). Raw judge secrets are not.

Not claimed: this profile is already an ERC-8004 schema; HAL is healthy; BFT is live.
