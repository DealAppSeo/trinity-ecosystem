# Fleet redeploy — the pre-redeploy baseline, and one agent that must not be redeployed unchanged

**Measured 2026-08-17 against the live database**, immediately before the Railway
redeploy. Every figure below is a query result, not a recollection.

The purpose is narrow: **after the redeploy, "did it work?" must be answerable by
comparison rather than by impression.** A baseline taken afterwards proves
nothing, and the fleet's own status columns — measured below — cannot answer it.

---

## 0. The finding that changes the redeploy: `trinity-mel`

**`trinity-mel` stopped producing on ~2026-06-19, four weeks before the fleet-wide
stop on 2026-07-17 — and went on heartbeating `online` the entire time.**

`lib/trustshell/throughput/ledger.ts` records the 07-17 event as *"twelve agent
loops stopped inside a 48-second window."* The 48-second window is real and
confirmed below. **The count is not.** Eleven loops stopped on 07-17. The twelfth
had already been dead for four weeks, and the fleet-wide outage hid it, because
from 07-17 onward everything was silent and `trinity-mel` looked like one of the
twelve.

Weekly `repid_score_events`, `trinity-mel` against the two comparable producers:

| week of | trinity-mel | trinity-shofet | trinity-gcm |
|---|---|---|---|
| 2026-05-25 | 7,203 | 7,498 | 7,297 |
| 2026-06-01 | 6,686 | 6,717 | 6,640 |
| 2026-06-08 | 4,764 | 4,698 | 4,711 |
| 2026-06-15 | **3,005** | 2,111 | 2,063 |
| 2026-06-22 | **1** | 704 | 710 |
| 2026-06-29 | **0** | 3,034 | 2,942 |
| 2026-07-06 | **6** | 5,896 | 5,863 |
| 2026-07-13 | **0** | 3,231 | 3,185 |
| 2026-07-20 | 1 | 5 | 2 |

`trinity-mel` was the **third-largest producer in June at 688 events/day**. It did
not taper. It stopped.

### The corroboration, in two adjacent columns of `agent_heartbeat`

Every one of the twelve rows reads `status = 'online'`, and every `last_ping` is
inside the same 48 seconds on 2026-07-17. `trinity-mel` is indistinguishable from
its peers on both. It is not indistinguishable on these:

| agent | `loop_count` | `tasks_completed_session` |
|---|---|---|
| **trinity-mel** | **19,155** | **0** |
| trinity-w3c | 4,388 | 2,042 |
| trinity-chesed | 4,385 | 2,078 |
| trinity-veritas | 4,383 | 1,551 |
| trinity-apm | 4,382 | 1,588 |
| trinity-sophia | 4,381 | 2,006 |
| trinity-nexus | 4,378 | 2,074 |
| trinity-orch | 4,372 | 1,991 |
| trinity-hdm | 4,371 | 2,040 |
| trinity-torch | 4,361 | 2,025 |
| trinity-gcm | 4,277 | 380 |
| trinity-shofet | 4,271 | 386 |

**VERIFIED:** `trinity-mel` ran its loop **4.4× more times than any peer and
completed zero tasks** in the session. Two independent tables agree — the event
log says it stopped producing on 06-19, the heartbeat says it kept looping until
07-17.

**NOT CHECKED:** what it was doing on those 19,155 iterations, and what that cost
in Railway CPU or LLM spend. `trinity_tasks.agent_name` does not carry this
fleet's work — all twelve agents show their last completion in **March**, so that
table answers a different question and is not evidence here either way. The
service logs would settle it and are not reachable from an agent session.

### What this means for the redeploy, concretely

Redeploying **`a5e838e8-3a12-41fb-bfa0-778d88988477`** (`trinity-mel`) unchanged
restores an agent that was already failing before the outage. It will heartbeat
`online`, it will raise `loop_count`, and on the evidence above it will produce
nothing.

**It will also make the redeploy look more successful than it is**, because the
natural pass condition — "twelve agents heartbeating again" — was already true of
`trinity-mel` for the four weeks it was dead. Judge `trinity-mel` on
`repid_score_events`, never on its heartbeat.

---

## 1. The baseline

Taken 2026-08-17. **This is the "before" row.**

### Monthly volume

| | June | July | Aug 1–17 |
|---|---|---|---|
| `hal_classifications` | 70,005 | 39,080 | **35** |
| `repid_score_events` | 70,415 | 39,453 | **114** |

### Current run rate, last 7 days

`hal_classifications` **1–2/day**. `repid_score_events` **0–6/day**, and the rows
that do appear cluster at **09:15** and **12:00–12:04 UTC** — scheduled fires, not
work. June ran at ~2,333 HAL rows/day.

### Per-agent, and the exact stop date

Eleven of twelve last produced at volume (≥50 events/day) on **2026-07-17**. The
twelfth is §0.

| agent | Railway service id | June/day | last day at volume |
|---|---|---|---|
| trinity-mel | `a5e838e8-3a12-41fb-bfa0-778d88988477` | 688 | **2026-06-19** |
| trinity-shofet | `65323f70-a98c-4c0c-98bf-03a16da6a72d` | 487 | 2026-07-17 |
| trinity-gcm | `682de179-8f0e-4656-a872-b98938df6b97` | 483 | 2026-07-17 |
| trinity-veritas | `c9c66b97-2ec8-46eb-ab52-cf1592a33912` | 115 | 2026-07-17 |
| trinity-sophia | `72e08089-257b-4531-a704-32b0bdbc06cd` | 110 | 2026-07-17 |
| trinity-orch | `a36308b8-460f-4d28-94dc-17eddf250a21` | 99 | 2026-07-17 |
| trinity-apm | `30ed2439-1fef-4822-993b-5dcff8c10e51` | 98 | 2026-07-17 |
| trinity-nexus | `a722cd1e-dc48-49d7-9df8-8dac0e78d1d0` | 97 | 2026-07-17 |
| trinity-torch | `ae0acc35-d109-43f1-840e-59e3f72c4580` | 95 | 2026-07-17 |
| trinity-chesed | `42807bb7-3164-4313-9fe2-f0b326157196` | 95 | 2026-07-17 |
| trinity-w3c | `3716178a-532b-4305-9199-c98ee1a86051` | 94 | 2026-07-17 |
| trinity-hdm | `8a81239c-7c2a-4329-a75b-2ef054ebbd13` | 92 | 2026-07-17 |

All twelve report `code_version = 8.2.0-reflect-wired`.

---

## 2. The pass condition, decided BEFORE the measurement

Stated now so it cannot be adjusted to fit whatever the redeploy produces.

**RECOVERED** — `hal_classifications` exceeds **50 rows/day** for two consecutive
days, and at least **10 of 12** agents each write **≥50 `repid_score_events`/day**.
That is ~2% of June and still unambiguous: it is 25× the current ceiling and
cannot be reached by the 09:15 scheduler.

**PARTIAL** — volume returns but fewer than 10 agents clear 50/day. Name which.

**NOT RECOVERED** — daily counts stay inside the current 1–6/day band.

**Explicitly NOT evidence of recovery:** twelve rows in `agent_heartbeat`, twelve
`status = 'online'`, a fresh `last_ping`, a rising `loop_count`, a 200 from any
`/health`, or a green UptimeRobot. Every one of those was true throughout the
29-day outage, and every one was true of `trinity-mel` while it was dead.

---

## 3. A fourth green instrument: `repid_agents.activity_30d`

`throughput/ledger.ts` names three instruments that stayed green through the
outage — Railway, UptimeRobot, and `agent_heartbeat.status`. There is a fourth.

`repid_agents.activity_30d`, against an actual 30-day count from
`repid_score_events` on 2026-08-17:

| agent | claimed | actual | error |
|---|---|---|---|
| trinity-sophia | 860 | 22 | **+838** |
| trinity-nexus | 234 | 45 | +189 |
| trinity-veritas | 200 | 14 | +186 |
| trinity-shofet | 169 | 20 | +149 |
| trinity-mel | 134 | 3 | +131 |
| trinity-chesed | 113 | 13 | +100 |
| trinity-torch | 87 | 9 | +78 |
| trinity-apm | 79 | 12 | +67 |
| trinity-gcm | 67 | 11 | +56 |
| trinity-hdm | 45 | 10 | +35 |
| trinity-orch | **0** | 41 | **−41** |
| trinity-w3c | **0** | 13 | **−13** |

**It is wrong in both directions** — ten agents overstate, `trinity-sophia` by
39×, while two report zero activity while actively producing. So it is not a
stale rolling counter that merely lags; it is not a rolling counter at all. It
cannot be repaired by waiting.

`lifecycle_status` is `active` for all twelve, and has been throughout.

**Do not read either column after the redeploy.** Count rows.

---

## 4. What this does NOT claim

- **Not that the redeploy will fail.** Eleven of twelve stopped together, which is
  the signature of a shared cause a redeploy plausibly clears.
- **Not that `trinity-mel`'s cause is known.** Only that it is *different*, *older*,
  and *not addressed by restarting the other eleven*.
- **Not that 50 rows/day is a health target.** It is a detection threshold chosen
  to be unreachable by the scheduler. Health is ~2,300/day.
- **Not a measurement of spend.** See §0.
