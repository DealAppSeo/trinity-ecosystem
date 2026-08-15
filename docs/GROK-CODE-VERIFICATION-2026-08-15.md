# Checking the checker — the Grok Code review of the 2026-08 status report

**[VERIFIED 2026-08-15 against disk, git, the live database and the GitHub API,
except where a row says NOT CHECKED.]**

Two documents arrived together: a distilled status report of the 2026-08 Claude
sessions, and Grok Code's verification of it. This file verifies **both** against
primary sources. It exists because a verification is itself a claim, and this
repo's standing defect is a system reporting success — or in this case a verdict —
it has not earned.

**Headline: Grok Code's central judgement is correct and its verdict line is
not.** The doer-seat gap is real, "accountable verifier" is not shippable, and
the peer-verify seat is dead — all three confirmed below against live data. But
Grok Code opened by stating the source report **was never attached to its
prompt**, then issued the verdict *"mostly consistent with caveats"*. A review
whose subject was missing has one honest verdict available, and it is
**NOT CHECKED**. It reviewed the themes, not the report. Every "consistency"
claim in that document is about a document it never read.

---

## 1. Where Grok Code marked NOT CHECKED but the answer was on disk

Three of its seven NOT CHECKED items are cheaply verifiable, and it did not look.

| Grok Code said | Actually | Evidence |
|---|---|---|
| "**A18** as a specific PR/incident id — NOT CHECKED" | **EXISTS.** `LESSONS.md:932`, dated 2026-08-15, naming the three ungated commits `38d1544`, `0300ff9`, `666a0ba` and the mechanism (`pull_request` workflows build `refs/pull/N/merge`, which GitHub cannot construct for an unmergeable PR) | `LESSONS.md` § A18 |
| "**Generator-by-context** not in living-docs; if a session promoted it to doctrine that is unlogged" | **LOGGED**, as a section heading — `docs/TRUST-HARNESS-DESIGN-2026-08-15.md` **§1.1** "The Generator is chosen by CONTEXT, not by rank", with a simulator (`scripts/rank-lockin-sim.mjs`) and an `r`-sweep behind it in §1.4 | that doc; `PRIOR-WORK-INDEX.md` row 62 |
| "Whether **peer-verify** still has 0 rows (last [V] 2026-08-03)" | **STILL ZERO, today.** `repid_score_events` holds 16 distinct `event_type` values across 152,152 rows. **No `PEER_VERIFY*` value appears at all** | live query, 2026-08-15 |

The peer-verify one matters most: Grok Code was *right*, and it filed its
strongest finding as unverified. The live check is one query.

**But its substantive point on Generator-by-context survives the correction.**
Being in a design doc is not being a lock. The contrast is visible in code:
`checker_must_not_be_doer` is enforced in three places
(`HarnessProfile.ts:605` as `constitutional`, `loop.ts:1142` by DID comparison,
`work-contract.ts:182` refusing waiver at every layer), while
Generator-by-context is prose with a simulation. Grok Code's "treat as proposal,
not lock" is the right handling for the wrong stated reason.

---

## 2. Where the status report is stale or over-strong

| Report claim | Verified status |
|---|---|
| Trust harness spine (#36) merged | **TRUE.** `33be59c`, 2026-08-15 |
| Evidence-vs-progress discriminator: "Landed" | **TRUE ONLY SINCE 18:07Z TODAY.** PR #48 merged at `e5008c6`, *after* the report was written — it was open when the claim was made. It read as false for most of this session and became true mid-check |
| Provably read-only auditor: "Landed" | **TRUE**, same merge — `lib/trustshell/identity/auditor-grant.ts`, 245 lines |
| "#38 (gates) in-flight, needs authoring agent or explicit takeover" | **STALE.** #38 merged at `c45cf73` |
| "Main verified green after the union of those merges" | **NOT CHECKED for current main.** It was true of the union it named; `main` has since advanced twice (#38, #48). A green recorded against `33be59c` says nothing about `e5008c6` — which is A18's own rule applied to the report itself |
| No signal for completing verified work | **CONFIRMED on disk.** `REPUTATION_SIGNALS` is closed at seven: `bft_vote_correct/incorrect`, `veritas_catch/miss`, `x402_settled/failed`, `latency_sample`. Four are judge-seat, two settlement, one latency. **None is doer-seat** |
| Auditor ground truth is an open problem, not solved | **CONFIRMED structurally.** `veritasSignal()` requires an outside `GroundTruthObservation` and **throws** when `observerDid === verdict.checkerDid` |

Spine suites re-run locally on current `main` after `npm install`:
`check:work-contract`, `check:contracted-evaluator`, `check:harness-loop`,
`check:zkp` (14), `check:identity` (192 assertions), `check:prior-work` (290) —
**all exit 0**. The earlier failures in this session were an uninstalled tree,
not a broken suite; the check script says so itself rather than falling back to
`npx tsc`, which is the correct behaviour.

---

## 3. The HAL volume collapse — confirmed, and it is a cliff, not a decay

Neither document had the shape. The report said "~2026-07-18 onward, tens of
thousands/month → ~1–3/day"; Grok Code filed live volume as NOT CHECKED. Both
ends of the report are right, and the transition is sharper than "collapse"
conveys:

```
  HAL_SCORE_EVENT, events/day        month totals
  2026-07-15    2,689               2026-05     38,543
  2026-07-16    1,707               2026-06     70,066
  2026-07-17    1,360               2026-07     39,079
  2026-07-18        2               2026-08         29   (1.9/active day)
  2026-07-19        2
  … 2026-08-15      1
```

Eight steady days at ~2,650/day, one ramp day, then **2**. A ~1,300× drop
inside 24 hours, holding flat for four weeks. That is a writer being switched
off, not demand decaying — and it dates the event to **2026-07-17/18**, which
is a narrow enough window to diff against deploys and cron schedules. The
report's "cause not established" stands, but the search space is now one day
wide.

**A qualifier neither document states, and it bounds the Simpson finding.**
The `hal_validation_runs` table that the stratification analysis was run on
holds **4,057 rows total, last written 2026-07-04** — before the cliff. So that
analysis is over a small frozen pre-collapse sample. Grok Code's ruling
(provisional, re-run on one frozen corpus with stratum labels) is right, and the
reason is stronger than it knew: the corpus is not merely unlabelled, it is
**closed and unrepresentative of the current system**, which currently produces
about one event a day.

---

## 4. The most consequential risk flag: two vocabularies, one name

Grok Code's recommended fix — add `WORK_VERIFIED` / `WORK_DISPUTED` /
`VERIFY_CONFIRMED` / `VERIFY_FALSE_PASS`, "keep the published band `[-10, +5]`
unchanged" — **spans two different ledgers as if they were one.** They are not,
and the cost of the change differs by orders of magnitude between them:

| | `repid_score_events.event_type` | `ReputationSignal` |
|---|---|---|
| where | live Postgres, repid-engine writes it | `lib/trustshell/identity/reputation-transition.ts` |
| vocabulary | `HAL_SCORE_EVENT`, `GENESIS`, `SERVICE_FULFILLED`, … (16 live values, SCREAMING_CASE) | `bft_vote_correct`, `veritas_catch`, … (7 values, snake_case) |
| overlap with the other | **zero** | **zero** |
| consumed by a circuit | no | **yes** — it is the transition leaf, and the interop spec is already with the other lane |
| cost of adding a value | a CHECK-constraint DDL (Sean-blocked) | **a cross-lane decision** |

`computeDelta`'s `[-10, +5]` band belongs to the first column. `REPUTATION_SIGNALS`
belongs to the second. "Add the signal but keep the band" is coherent for
`event_type` and **means nothing** for `ReputationSignal`, which has no band —
it has a closed leaf vocabulary that a circuit commits to.

So Grok Code's proposal is **safe and cheap in the live ledger** and is
**exactly the cross-lane change PR #48 declined to make unilaterally** in the
circuit one. #48 already implements the no-bytes-move half correctly: direction
travels in the signal *name* (three deliberate `correct`/`incorrect` pairs), and
the missing doer word is returned rather than commented — `withheld` entries
carry `signal: null` with a reason, so an empty `events` array cannot be misread
as "no activity" when it means "nothing was earned, and here is why."

**Recommendation, and it splits the work:**

1. **Live ledger, now, shadow-mode** — add the doer/checker seat events to
   `repid_score_events.event_type` with deltas inside the existing band, emit
   without applying, measure volume against `HAL_SCORE_EVENT` for a week. Needs
   Sean's DDL (the same CHECK constraint that kills the peer-verify writer).
   This is Grok Code's proposal and it is right.
2. **Circuit vocabulary, not yet** — adding `work_verified` to
   `REPUTATION_SIGNALS` changes what the other lane's circuit consumes. That is
   the Poseidon2 standing rule: hand it over, do not decide it here.

Both documents implicitly treat these as one action. They are two, with
different owners.

---

## 5. Verdicts

| subject | verdict |
|---|---|
| Grok Code's review **as a verification of the status report** | **NOT CHECKED** — its own first line says the report was never attached. "Mostly consistent" is unearned |
| Grok Code's review **as an independent read of the themes** | **Sound.** Its three load-bearing calls — doer gap real, verifier seat not live, "accountable verifier" not shippable — all confirm against primary sources |
| The status report's technical claims | **Substantially accurate**, with two stale rows (#38, #48-at-time-of-writing) and one unearned green (`main` after the union) |
| The doer verified-work gap | **REAL, confirmed on disk** |
| Peer-verify seat | **DEAD, confirmed live** — 0 rows of 152,152 |
| HAL collapse | **CONFIRMED**, cliff dated 2026-07-17/18 |
| "Accountable verifier" as an external claim | **BLOCKED_FOR_HUMAN.** Unchanged |

### NOT CHECKED here

- Every repid-engine source claim — `computeDelta`'s band, `SUCCESS_AUDITED` in
  `outcome-classification.ts`, `peer-verify-score.ts`'s `42P10`. That repo is
  **not in this session's scope**; the *consequence* (zero rows) is verified
  live, the *mechanism* is taken on Grok Code's word.
- CI status of `main` at `e5008c6`.
- The HAL F1 / AUC figures either document quotes. Not re-measured. Grok Code's
  "the ruler must travel with the number" rule is adopted, not audited.
- Whether the 2026-07-17/18 cliff has a matching deploy or cron change.

### Unchanged and still Sean's

Peer-verify `event_type` CHECK DDL; any apply-mode flip that moves live RepID;
the external "accountable verifier" claim.
