# What writes `repid_agents.tier` — a trigger chain, two tier ladders, and a one-way door

**Measured 2026-08-17** against Supabase `qnnpjhlxljtqyigedwkb`. Resolves the
`NOT CHECKED` left by #80 §5.1.

**Nothing in TypeScript writes it.** `repid_agents.tier` and `current_repid` are
maintained entirely by database triggers. `grep` over the repo finds exactly one
reference to the table — `EarnedMetricsRepo.ts:98`, a **read**. That is why the
column looked unexplained from the code side: the code side is not involved.

---

## 1. The chain

```
INSERT INTO repid_score_events
  ├─ BEFORE INSERT  trg_hal_penalty_guard()      -- may zero a HAL_SCORE_EVENT penalty
  └─ BEFORE INSERT  apply_repid_score_event()    -- UPDATE repid_agents
                                                 --   SET current_repid = current + delta
        └─ that UPDATE fires, on repid_agents:
             ├─ BEFORE UPDATE OF current_repid  trg_repid_earned_floor()  -- the ratchet
             └─ BEFORE UPDATE OF current_repid  trg_sync_tier()           -- tier := compute_tier(...)
```

`tier` is a **pure derived column**. It is never set directly; it is recomputed
from `current_repid` on every write, by `sync_tier()`:

```sql
NEW.tier := compute_tier(NEW.current_repid, NEW.id);
```

`apply_repid_score_event()` also writes a row into `agent_repid_history` and is
idempotent on `repid_delta_applied` — a re-inserted event does not double-apply.

## 2. There are two tier ladders, and they do not agree

| | database `compute_tier` | TypeScript `TIER_FLOORS` |
|---|---|---|
| | **VETERAN** ≥ 8000 | Platinum ≥ 7500 |
| | **AUTONOMOUS** ≥ 5000 | Gold ≥ 5000 |
| | **ESTABLISHED** ≥ 1000 | Silver ≥ 2500 |
| | **EARNING** ≥ 500 | — |
| | **PROBATIONARY** < 500 | Bronze ≥ 0 |

Different names, different count, different thresholds. `repid_agents.tier`
holds the left column; `lib/trustshell/repid-scoring.ts` computes the right one
and stores it nowhere. **Both are live**, and a reader who knows one will
misread the other. `tierForScore` and `compute_tier` agree on exactly one
boundary, 5000.

This is not a claim that either is wrong. It is a claim that **"the tier" is
ambiguous in this system**, and every statement about tiers needs to say which.

## 3. `compute_tier` is overloaded, and the two versions disagree

There are **two functions named `compute_tier`**:

- `compute_tier(repid integer)` — thresholds only
- `compute_tier(p_repid integer, p_agent_id uuid)` — thresholds, then a
  counterparty gate. `STABLE`. **This is the one `sync_tier` calls.**

They return different answers for the same agent. Measured on `test-agent-v11`:

| call | result |
|---|---|
| `compute_tier(10000)` | **VETERAN** |
| `compute_tier(10000, id)` | **ESTABLISHED** |
| stored `tier` | **ESTABLISHED** |

`current_repid` 10000, `counterparties` 0, `is_human` false — **two rungs
apart**. PostgreSQL resolves the overload by argument count, so a caller that
passes one argument silently gets the ungated ladder. Nothing marks the 1-arg
version as superseded.

## 4. The counterparty gate — half of it is dead code

The 2-arg version demotes an agent that lacks distinct settled counterparties:

```
vet_min = 2   auto_min = 2   est_min = 0   earn_min = 0
```

`IF base_tier = 'ESTABLISHED' AND cp < 0` — **`cp` is a `COUNT`, so it is never
negative.** The ESTABLISHED and EARNING gates can never fire. Only VETERAN and
AUTONOMOUS are gated, both at 2 counterparties.

Whether that is intended or a disabled feature left at 0 is **NOT ESTABLISHED** —
the constants are hardcoded locals, with no comment and no config row.

`count_unique_counterparties` counts `DISTINCT buyer_agent_id` in
`service_contracts` where `status IN ('fulfilled','satisfied','settled','resolved')`.
`is_human = true` bypasses the gate entirely.

## 5. RepID is a ratchet — tier demotion is a one-way door that only opens up

`trg_repid_earned_floor()`:

```sql
NEW.peak_repid := greatest(NEW.peak_repid, OLD.peak_repid, NEW.current_repid);
v_floor := coalesce(NEW.floor_override, tier_lower_bound(NEW.peak_repid));
IF NEW.current_repid < v_floor THEN NEW.current_repid := v_floor; END IF;
```

`peak_repid` only rises. `current_repid` is **clamped up** to the lower bound of
the highest tier the agent has ever held. An agent that once reached 8000 can
never score below 8000 again, however it behaves — unless
`app.bypass_repid_floor` is set to `'true'` for the session.

Measured across all **176** agents: **21 sit exactly on a floor value**
(500/1000/5000/8000), 13 have `peak_repid > current_repid`, **0 are below their
ratchet floor**, and **0** have a `floor_override`. The ratchet is holding, and
for 21 agents it is load-bearing.

**The consequence worth stating: any inflation that ever reaches `current_repid`
is permanent.** A penalty can be reversed; a floor cannot. That makes the write
path's guards more important than they look, which is §6.

## 6. This closes #80's question, in the reassuring direction — and refutes my own hypothesis

`trg_hal_penalty_guard()` zeroes a **negative** delta on a `HAL_SCORE_EVENT`
when `hallucination_caught IS NOT TRUE`. Reading that, the obvious worry is that
the 1,585 divergent rows from #79/#80 — `hallucination_caught = true` on a
`clean` decision — are exactly the rows that would **pass** a guard designed to
stop them.

**That hypothesis is wrong.** All 1,512 `clean` + `caught` rows carry
`event_type = 'PREDICTION_RESOLVE'`, not `HAL_SCORE_EVENT`:

| | value |
|---|---|
| rows | **1,512** |
| negative delta | **0** |
| non-zero `repid_delta_applied` | **0** |
| net RepID applied | **0** |
| suppressed by the guard | 0 |

They applied **nothing**. They never reached `current_repid`, never moved
`peak_repid`, never changed `tier`. The guard never inspected them because it
only fires on `HAL_SCORE_EVENT`.

So #80's conclusion tightens: the divergence contaminates the **read-path**
`veritasCatchRate` computed by `EarnedMetricsRepo`, and touches the **stored**
score and tier **not at all**. Two independent paths, and only one is affected.

## 7. Open

- **Whether the 1-arg `compute_tier` has any caller.** Not found in this repo; it
  could be called from SQL, another service, or a dashboard. **NOT CHECKED.**
- **Whether `est_min`/`earn_min` at 0 is intent or a disabled gate.** No comment,
  no config. **NOT ESTABLISHED.**
- **What sets `catch_rate_30d`.** NULL on all five agents in #80; no trigger
  writes it. Nothing found.
- **Who may set `app.bypass_repid_floor`.** It disables the ratchet for a
  session. Not audited here.

## 8. Reproduction

```sql
-- §1  the chain
select c.relname, t.tgname, p.proname, pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid
where not t.tgisinternal and c.relname in ('repid_agents','repid_score_events');

-- §3  the overload disagreeing, on one agent
select agent_name, current_repid, tier,
       compute_tier(current_repid)      as one_arg,
       compute_tier(current_repid, id)  as two_arg,
       count_unique_counterparties(id)  as counterparties
from repid_agents where agent_name='test-agent-v11';

-- §5  the ratchet, across the fleet
select count(*) agents,
       count(*) filter (where current_repid in (500,1000,5000,8000)) on_a_floor,
       count(*) filter (where current_repid < tier_lower_bound(peak_repid)) below_floor
from repid_agents;

-- §6  the divergent rows applied nothing
select event_type, count(*) n, sum(coalesce(repid_delta_applied,0)) net_repid
from repid_score_events
where hallucination_caught and hal_decision='clean' group by 1;
```
