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

### DECIDED 2026-08-17: TRUST THE ROW

`spending_limit_daily` and `spending_limit_per_tx` are the authoritative
ceiling. `tierForScore` / `TIER_LIMITS` are a derivation aid and a briefing aid,
never the enforcement source and never a writer of one. The reviewer and the
enforcer must see the same number.

Applied:

- **`updateRepID` writes the score and nothing else.** The three ceiling columns
  move only by operator action. That closes the x50 on TORCH and the
  penalty-raises-the-limit path in §4 at the source — not by changing any limit,
  but by removing the writer that changed them.
- **`repid_tier` is a ceiling column too**, and this is the part that is easy to
  get wrong. Dropping the two limit writes while still writing the tier from the
  ladder looks conservative and is worse: §2 measured the rows as internally
  consistent, so rewriting the label alone leaves a row whose tier names a
  ceiling it does not carry. The tier stored beside a ceiling LABELS THAT
  CEILING; it is not a stale copy of `tierForScore(repid_score)` and must not be
  reconciled into one.
- **`system-trust` keeps publishing the stored tier**, for the same reason.
  Deriving it there would put a tier the enforcer does not use on a dashboard.

Gated by `check:ceiling-source` (5 assertions, 3 mutations). It asserts both
halves — the ceiling columns are not WRITTEN by a reputation update, and they are
still READ and enforced. A fix that dropped the second half would leave nothing
enforcing anything, and `ceiling-read-derived-not-stored` is the mutation that
proves the assertion notices.

**The 9-of-12 divergence in §2 is not repaired by this and is not meant to be.**
Those rows are now stable rather than one payment away from a 50x jump. Bringing
score and ceiling back into agreement is a data decision — an operator UPDATE, or
a deliberate re-rating — and nothing in code will do it silently.

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

---

## 7. The same defect on the READ path — found, and fixed (2026-08-17)

§6 listed the 0–100 scale question as the obvious unanswered one. Checking it
closed negative — **nothing reads `agents` or `agent_status`**, and all three
production `tierForScore` callers are on the 0–10000 scale — but the sweep
surfaced a third instance of this root cause, on a path that needs no write to
fire.

`app/api/trustrails/pay/route.ts` briefed the BFT authorization panel with a
`maxWithdrawal` it derived itself:

```ts
const maxWithdrawal = TIER_LIMITS[tierForScore(kyaResult.repidScore)].perTx;
```

while `KYAValidator.validate()` enforces the **stored** `spending_limit_per_tx`.
Two sources for one fact, again. Ladder applied to the stored score, against what
is actually enforced:

| agent | enforced per-tx | ladder says | overstated |
|---|---|---|---|
| TORCH | 5,000 | 100,000 | **×20** |
| GCM / HDM / CHESED / MEL / APM | 5,000 | 50,000 | ×10 |
| ORCH / NEXUS / W3C | 50,000 | 100,000 | ×2 |
| VERITAS / SHOFET / SOPHIA | 100,000 | 100,000 | — |

**That table is a floor on the confusion, not the runtime figure.** Line 92 of
the route overwrites `kyaResult.repidScore` with `repidResult.repidScore`,
recomputed from live earned metrics, *before* the brief is built — so the deleted
expression applied the ladder to a score no stored limit was ever derived from.
The actual runtime brief was a third number, and it is **NOT MEASURABLE** from
outside a live request. Stated because the ×20 figure is the one worth quoting
and it would be wrong to quote it as the brief.

That line's own comment already recorded deleting a hand-rolled fourth ladder
from it (`repidScore > 7500 ? 100000 : 50000`) and the reason: *"the panel weighs
this number, so a wrong one is a wrong brief."* The replacement used the **right**
ladder against a row the ladder did not write — same defect, entered from the
other side.

**Fixed.** `KYAComplianceResult` gains a required `enforcedPerTxLimit:
number | null`, set on all four `validate()` return paths from the same
`profile.spendingLimitPerTx` that `checkPerTxLimit` measures; the route reads it
and no longer imports the ladder. A null ceiling **denies with 503** rather than
substituting a number — the invariant spans two files, so it is checked rather
than asserted away with `!`.

**This changes no limit.** Reconciling row and ladder is still the open operator
decision in §5. Briefing a reviewer with a ceiling nobody will enforce was never
a way of taking it.

Gated by `check:pay-brief` (8 assertions, 3 mutations). It reads SOURCE and
proves the **wiring, not the runtime behaviour** — `KYAValidator` and the route
reach Supabase through the `@/` alias so neither compiles standalone, which is
why neither has ever had a unit test. The hard half is enforced by something
stronger: the field is **required**, so `tsc` guarantees every return path sets
it.

One of the three mutations exists because my first version of that suite was
weak: it asserted that *some* occurrence read `profile.spendingLimitPerTx`, and
`pay-brief-exports-the-wrong-limit` changed one of four return paths and walked
straight through a green run. The assertion now enumerates all four.
