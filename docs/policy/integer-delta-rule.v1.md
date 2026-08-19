# Integer-delta rule (locked) — ledger law

**Claim:** every ledger-applied reputation delta is a JSON integer.  
`events.v1.json` rejects non-integer `delta` and `repid_delta_applied` on `DORMANCY_DECAY`, `ECOSYSTEM_REFERRAL`, and `IMPACT_REWARD`. No implicit exception.

**Why:** `current_repid` is an integer; `round(δ_raw)` on the referral curve is load-bearing; float round-trips drift.

**Merge path:** `claude/reconcile-ga-contracts-integer-delta` @ `a328e7c` (GA additive + integer typing). Do **not** author a competing `events.v1.json`.

**FLAG:** `origin/xc/policy-lock` @ `01079a9` is a pre-#108 fork. Its `docs/contracts/events.v1.json` is the smaller independent envelope from before integer-delta. Leave it. Do not merge that blob onto main.

---

## Rule

Let \(\delta\) be `delta` or `repid_delta_applied`, \(\Delta R = R_{\mathrm{after}} - R_{\mathrm{before}}\).

\[
\delta \in \mathbb{Z},\qquad
R_{\mathrm{before}}, R_{\mathrm{after}} \in \mathbb{Z},\qquad
\Delta R = \delta
\]

\[
\delta_{\mathrm{written}} = \operatorname{clip}\bigl(\operatorname{round}(\delta_{\mathrm{raw}}),\,c_{\min},\,c_{\max}\bigr)
\]

Round: half away from zero, then type clamp.

Decay ticks: \(\Delta_k \in \mathbb{Z}\), remainder on last tick, \(\sum_k \Delta_k = R_{\mathrm{pre}} - R_{\mathrm{final}}\).

Zero after round is legal (referral \(n=100\)). Unproven: **no row**, or \(\delta=0\) that does not increment \(n\).

## Explicit exceptions (non-applied fields only)

These MAY be JSON `number` (float). They MUST NOT be copied into `delta`.

| field | why |
|---|---|
| `metadata.weeks_idle` | idle weeks, real |
| `metadata.effective_rate` | \(\rho \cdot m\) |
| `I`, `delta_raw` before round | impact / curve intermediates |
| `metadata.base_reward`, `base_value`, `severity_multiplier` | inputs to round |
| `X402GateDecision.effective_authority`, `requested_usd`, `real_collateral_usd` | USD / \(\sqrt{S}\), not ledger \(\delta\) |
| passport `axis_scores` | display 0–100, not \(\delta\) |

There is **no** exception that lets a reward path write `1.5` to `delta`. A path that wants a float must round first or it fails ID1.

## Pass / fail

| id | predicate |
|---|---|
| ID1 | \(\delta \notin \mathbb{Z} \Rightarrow\) FAIL |
| ID2 | \(R_{\mathrm{after}} \ne R_{\mathrm{before}} + \delta \Rightarrow\) FAIL |
| ID3 | referral \(\delta(n) \in \{12,8,8,4,0\}\) for \(n=1,2,3,10,100\) |
| ID4 | fixture ledger event with `type: number` on `delta` \(\Rightarrow\) FAIL |
| ID5 | `events.v1.json` `DORMANCY_DECAY.delta.type` is `integer` (mutant `contract-delta-accepts-float`) |

Not claimed: decay already writing live.
