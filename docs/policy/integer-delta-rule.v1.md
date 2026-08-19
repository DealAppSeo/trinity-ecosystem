# Integer-delta rule (locked)

**Claim:** every ledger-applied reputation delta is an integer.  
**Why:** `current_repid` is an integer; `events.v1.json` score rows must round-trip without float drift; `round(δ_raw)` in the referral curve is load-bearing, not cosmetic.

Stand-in for GA: `docs/contracts/events.v1.json` currently types `delta` / `repid_delta_applied` as `number`. Policy below is the lock. GA tightens those fields to `integer` and replaces this stand-in; until then, writers MUST emit integers anyway.

---

## Rule

Let \(\delta\) be any value written as `delta` or `repid_delta_applied` on a score event, and \(\Delta R = R_{\mathrm{after}} - R_{\mathrm{before}}\).

\[
\delta \in \mathbb{Z},\qquad
R_{\mathrm{before}}, R_{\mathrm{after}} \in \mathbb{Z},\qquad
\Delta R = \delta
\]

\[
\delta_{\mathrm{written}} = \operatorname{round}(\delta_{\mathrm{raw}})
\quad\text{with half-away-from-zero, then clip to the type clamp}
\]

Floats may exist **only** in non-applied fields (`weeks_idle`, `effective_rate`, \(I\), \(\delta_{\mathrm{raw}}\) before round). They never enter the ledger column `delta`.

Decay ticks: \(\Delta_k \in \mathbb{Z}\), remainder on last tick, \(\sum_k \Delta_k = \operatorname{round}(\Delta^{\mathrm{full}})\) with the same rounding, and \(\sum_k \Delta_k = R_{\mathrm{pre}} - R_{\mathrm{final}}\).

Zero after round is a legal delta (referral \(n=100\)). Unproven still writes **no** row, or a row with \(\delta=0\) that does not increment \(n\).

## Pass / fail

| id | predicate |
|---|---|
| ID1 | \(\delta \notin \mathbb{Z} \Rightarrow\) FAIL |
| ID2 | \(R_{\mathrm{after}} \ne R_{\mathrm{before}} + \delta \Rightarrow\) FAIL |
| ID3 | referral \(\delta(n)\) equals the locked integers 12, 8, 8, 4, 0 for \(n=1,2,3,10,100\) |
| ID4 | a non-integer `delta` in a fixture that claims to be a ledger event \(\Rightarrow\) FAIL |

## Handoff (GA)

Replace `number` with `integer` on `delta` and `repid_delta_applied` in `docs/contracts/events.v1.json` (`DORMANCY_DECAY`, `ECOSYSTEM_REFERRAL`, `IMPACT_REWARD`). Until that lands, this file is the measurement bar.

Not claimed: schema already integer; decay already writing.
