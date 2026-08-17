# The registry was written by a ladder that no longer exists

**Measured 2026-08-17** against `agent_kya_registry` (12 rows, all of them), via
the Supabase MCP connection. Every number below came from a query, not a reading
of the code.

---

## 0. What I set out to do, and why that matters here

I picked this up as *"the tier ladder does not discriminate — a weak fleet is 99%
Platinum"*, which is how `docs/PRIOR-WORK-INDEX.md` line 96 still described it.

**That finding was already closed.** PR #61 applied Option B —
`SCORE_LOG_MULTIPLIER 5000 → 57200`, `SCORE_LOG_INPUT_SCALE 100 → 0.5` — and the
gate has been self-VERIFYING ever since. Run today:

```
strong   median 9250  Platinum 100.0%
typical  median 7505  Gold 49.3%  Platinum 50.7%
weak     median 4571  Silver 83.3%  Gold 16.7%  Platinum 0.0%
cold     median 0     Bronze 100.0%
check:repid-calibration — VERIFIED.        exit 0
```

The custody half closed with it: the `humanCustody` flag alone is weightedSum
0.05, which the current curve scores **613 → Bronze → 1,000 USDC**, not Silver
and 10,000. Silver now needs weightedSum 0.2118, four times the flag's weight.

The index row is corrected in this change. It is recorded here rather than
quietly fixed because **a stale OPEN row cost a full investigation** — the exact
failure `CLAUDE.md` opens with, and the second time in this session I have
propagated a stale claim from a summary file without opening the source first.

## 1. The real finding, which the ladder work could not see

`check:repid-calibration` proves the **ladder** sorts. It says nothing about the
**rows**, and the rows disagree with it.

`agent_kya_registry` stores `repid_score`, `repid_tier` *and*
`spending_limit_daily`. Two of those three are derivable from the first, so they
can drift — and `KYAValidator` reads them from opposite sides:

| | reads | writes |
|---|---|---|
| `validate()` | the **stored** `spending_limit_daily` | — |
| `updateRepID()` | — | `TIER_LIMITS[tierForScore(newScore)]` |

An agent's authorized limit therefore depends on **which writer last touched its
row**, not on anything the agent did.

This is the one-rule-two-implementations defect `repid-scoring.ts` has already
fixed three times — the two tier ladders, the DID comparison, the payment
threshold — arriving a fourth time, now split across the code/database boundary
where neither a type nor a test could see it.

## 2. Nine of twelve rows disagree, every one permissively

```sql
select agent_name, repid_score, repid_tier, spending_limit_daily,
       case when repid_score>=7500 then 'Platinum' when repid_score>=5000 then 'Gold'
            when repid_score>=2500 then 'Silver' else 'Bronze' end as ladder_tier
from agent_kya_registry order by repid_score desc;
```

| agent | score | stored tier / daily | ladder tier / daily | next write |
|---|---|---|---|---|
| VERITAS | 9200 | Platinum / 500,000 | Platinum / 500,000 | — |
| SHOFET | 8800 | Platinum / 500,000 | Platinum / 500,000 | — |
| SOPHIA | 8650 | Platinum / 500,000 | Platinum / 500,000 | — |
| ORCH | 8100 | Gold / 100,000 | Platinum / 500,000 | **×5** |
| NEXUS | 7900 | Gold / 100,000 | Platinum / 500,000 | **×5** |
| W3C | 7700 | Gold / 100,000 | Platinum / 500,000 | **×5** |
| TORCH | 7600 | Silver / 10,000 | Platinum / 500,000 | **×50** |
| GCM | 7400 | Silver / 10,000 | Gold / 100,000 | **×10** |
| HDM | 7300 | Silver / 10,000 | Gold / 100,000 | **×10** |
| CHESED | 7200 | Silver / 10,000 | Gold / 100,000 | **×10** |
| MEL | 7100 | Silver / 10,000 | Gold / 100,000 | **×10** |
| APM | 6900 | Silver / 10,000 | Gold / 100,000 | **×10** |

The stored rows are **self-consistent** — every `repid_tier` matches its
`spending_limit_daily` under `TIER_LIMITS`. They were written correctly, by a
ladder with different floors (stored Platinum starts around 8,650; stored Gold
around 7,700). Nothing here is corrupt data. It is two ladders, one of which is
no longer in the code.

## 3. The trigger is routine, not exotic

`app/api/trustrails/pay/route.ts:200`:

```ts
await kya.updateRepID(agentName, 10, `Successful compliant payment: ${amountUSDC} USDC`);
```

**One successful compliant payment re-rates the agent.** TORCH's daily limit goes
from 10,000 to 500,000 USDC for having made a payment, with no change in any
measured metric.

## 4. The sharper form: a penalty raises the limit

`updateRepID` takes a **signed** delta and rewrites the limit from the ladder
regardless of sign. Because every stored limit sits at or below what the ladder
grants, an agent can be penalised and still end up with more spending power.

`penaltyHeadroom` is how far a score may **fall** while the ladder still grants at
least today's stored limit:

| TORCH | GCM | HDM | CHESED | MEL | APM | ORCH | NEXUS | W3C | VERITAS | SHOFET | SOPHIA |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 5,100 | 4,900 | 4,800 | 4,700 | 4,600 | 4,400 | 3,100 | 2,900 | 2,700 | 1,700 | 1,300 | 1,150 |

TORCH can lose **5,100 points — more than two full tiers** — and its authorized
daily limit never drops below today's 10,000. Any penalty smaller than that
*increases* it.

**A correction I made mid-measurement.** My first pass computed this from the
stored tier's own floor and reported TORCH as 2,600. That is wrong: a row storing
Silver's 10,000 sustains that limit from the **Silver** floor (2,500), not Gold's
(5,000) — understating the headroom by a whole tier. The mutation
`repid-drift-headroom-from-stored-tier` exists so that specific error cannot
return.

## 5. What was built, and what deliberately was not

Built — `describeRegistryDrift(storedScore, storedTier, storedDaily)` in
`lib/trustshell/repid-scoring.ts`, gated by `check:repid-registry-drift`
(14 assertions, 3 mutations, all CAUGHT). Three outcomes: VERIFIED when row and
ladder agree, FAILED when they do not, NOT_CHECKED when an input is unusable —
which matters because `tierForScore` answers **Bronze** for a non-finite score,
so without the guard a garbage score silently "agrees" with any Bronze row.

**Not built: the repair.** The two options are opposites and both move real
spending limits:

- **Trust the ladder** — derive the limit on read. Consistent immediately, and it
  grants TORCH 500,000 USDC the moment it ships.
- **Trust the row** — stop deriving in `updateRepID`. Fail-closed, and it freezes
  every limit at whatever the old ladder wrote, including for agents whose scores
  have since moved.

Picking either from an agent session would move money on a fabricated mandate.
This is the same call the curve recalibration was, and it was right to escalate
that one rather than guess. **It is Sean's.**

## 6. What this does NOT establish

- **The 12 rows are `agent_kya_registry` only.** Three other tables carry a
  `repid_score` — `agents` (12 rows, range 75–97.1), `agent_status` (9 rows,
  85–96) and `agent_repid` (87 rows, 10–10000, median 10). The first two are on a
  **0–100 scale**, not 0–10000. Whether anything passes those to `tierForScore` —
  where every value below 2500 is Bronze — is **NOT CHECKED**. It is the obvious
  next question and I did not answer it.
- **No claim about live enforcement today.** The Trinity fleet has been down since
  2026-07-17 (index line 157), so `/api/trustrails/pay` is not currently firing.
  This is a loaded path, not an active loss.
- **The check suite does not query the database.** CI has no Supabase
  credentials, and a suite that read live rows would go green when somebody
  UPDATEs them — which is not the same as the defect being fixed. The live rows
  are frozen into the suite as fixtures; re-measure with the SQL in §2.
- **Nothing here re-derives the tier floors.** `TIER_FLOORS` at 2500/5000/7500 is
  taken as given; whether those are the right floors is the calibration question,
  and it is closed.
