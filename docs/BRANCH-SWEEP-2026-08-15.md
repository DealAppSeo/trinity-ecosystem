# The unapplied-work sweep — what was actually unapplied, and what merging would have cost

**Task:** read every doc on `claude/zkrepid-agentic-os-jfbi18`, apply what has not
been applied, test each thing switched on, log all results.

**Result: one line of `.gitignore`.** Everything else on that branch — and on the
two other lanes that committed the same day — is either already applied here or
is an older version of it. Two of the three would have caused regressions.

This document exists because *"nothing to apply"* is a result that has to be
evidenced, not asserted. It was asserted once already in
`COMPOSITION-EXPERIMENTS-2026-08-15.md` §0 on weaker evidence (a doc listing);
this is the re-verification, done by content hash and full-tree diff.

---

## 1. Method

A name comparison is not enough — a same-named file can differ. So:

1. `git ls-tree -r` both sides, compare **names**
2. `git rev-parse <ref>:<path>` per file, compare **blob hashes**
3. `git diff HEAD FETCH_HEAD -- . ':!docs'` for everything outside `docs/`
4. read every **insertion** — the lines they have that we lack

Step 4 is the one that matters. A diff between two long-diverged branches is
mostly deletions, and deletions are *our* work missing from *theirs* — the exact
opposite of what the task asks about. **The insertions are the whole question.**

## 2. `claude/zkrepid-agentic-os-jfbi18` — 24 docs, 0 unapplied

| check | result |
|---|---|
| their docs missing here, by name | **0 of 24** |
| present on both, content differs | **1** — `PRIOR-WORK-INDEX.md` only |
| their index rows lost in our union merge | **0** |
| non-doc diff | 4,202 deletions, **18 insertions** |

**The two "lost" index rows were a false alarm in my own check.** An exact-line
match reported the `bft-judge` and `handoff` rows as missing; both are present
and were *extended in place* earlier that day, so the line no longer matches
exactly. Verified by prefix before reporting — a line-exact diff is the wrong
instrument for a file that gets appended to.

**All 18 insertions are superseded predecessors**, one-for-one:

| their line | superseded by |
|---|---|
| `async function hash(…)` in `contracted-evaluator` | exported `evidenceDigest` — the change that gives the verdict hash **one** implementation, and the reason experiment 3 found no drift |
| `capReason: 'evidence_invalid'` for a sound-but-FAILED verdict | `contradicted_by_evidence` (this session) |
| `const SEP = '…'` / `const FIELD = '…'` with **raw C0 bytes** | the escape fix; `check:raw-bytes` |
| `loop.ts` fingerprints with raw `U+001F` | same |
| `**The substrate is alive…**` in `NORTH-STAR.md` | struck through here and marked **SUPERSEDED** — the fleet went down 2026-07-17 |

`scripts/trustshell-dogfood.mjs` shows as **`Bin`** in the diff — git reads it as
binary because *their* copy still contains raw control bytes. Ours is 5 bytes
larger because the escapes are longer than the characters. That is the fix
showing up in the file-type detection.

## 3. The other three lanes — all already applied, two would regress

| branch | verdict |
|---|---|
| `claude/e2e-mvp-packaging-plttzn` | **applied** — `prompts/{CC,GA,T12,VERIFY,XC}.md` already present. Merging costs **15,020 deletions**: most of the harness. |
| `claude/full-stack-e2e-assessment-6rdb6o` | **applied via PR #47.** Its only insertions are the pre-extraction `AGENT-LOOP-PROMPTS.md`. |
| `claude/agent-browser-install-sd1avw` | **applied except one `.gitignore` line** — see §4. |

### 3.1 The near-miss

`agent-browser-install-sd1avw` is the CI performance work, and by the task's own
criterion — *does it help or hinder performance* — it was the obvious thing to
merge first. **Merging it would have been a serious regression**, and the reason
is a direction-of-diff trap:

- `scripts/scan-secrets.mjs` is **blob-identical** to ours. The optimisation
  arrived here through `main` and is already live: `check.yml` passes `--since`
  on the PR path and `--state` with `actions/cache` restore/save on the other.
  Our `check` job ran **5m05s** today.
- Its `check.yml`, however, **predates two things on this branch**: it pins
  `actions/checkout`/`setup-node` back to **v4** (undoing dependabot #39/#40),
  and it has **no `mutate` job at all** — the gate that killed 11 mutants this
  session would have been deleted.

**The lesson is mechanical.** In `git diff A B`, `-` is A and `+` is B. Reading
that diff as "what B adds" inverts it. The safe question is never "what does the
diff show" but **"which side is each line on, and is that side ahead?"**

## 4. The one genuinely unapplied thing — and why it was incomplete

`.gitignore` gains `.secret-history-state.json`, the scanner's per-commit cache.

**As written on that branch the fix no longer works.** It was authored while the
file was untracked. The file arrived here **tracked, at 2.9 MB**, via PR #47
(`7aa4d5b`) — and *an ignore rule does not apply to a file already in the index*.
Adding the line alone would have left 2.9 MB tracked, rewritten by every scan,
across every parallel lane, with a fresh blob in history each time it changed.

So the applied version is `git rm --cached` **plus** the ignore rule.

### 4.1 Measured before deciding, because untracking has a real cost

Untracking means a cache miss starts cold. Measured here at 678 commits:

| | time | findings |
|---|---|---|
| cold (no prior state) | **44.8 s** | 30 findings, 0 usable in tree, 7 in history |
| warm (state reused) | **0.254 s** | identical |

That replicates the recorded 41s/0.2s at 643 commits. **The tracked copy bought
nothing in CI** — `check.yml` already restores the file from `actions/cache`
independently — so the cost of untracking is bounded at one 44.8s cold scan on a
cache miss, against a permanent 2.9 MB-per-update history cost.

**Regression check, run rather than reasoned:** the branch's own comment worried
that an untracked state file would be picked up by the scanner's working-tree
pass. It is not — with the file present and ignored, the working-tree scan
reports *"No credential-shaped strings found"* and references the file **0**
times.

### 4.3 NOT CHECKED IN CI — and a green run does not say otherwise

**The path that consumes the state file did not execute.** On PR `e66b292` all
three jobs concluded SUCCESS, and steps 9–11 — *restore history scan state*,
*report credentials in git history*, *save history scan state* — are each
`conclusion: skipped`.

That is by design, not a fault: the **PR path** scans only the PR's own commits
(step 8, `--since`, 16s) and never reads the cache. The full-history scan with
`--state` runs on the **other** path. So the change was verified locally
(cold 44.8s / warm 0.254s, identical findings, §4.1) and **has never run in CI**.
It first will when this branch lands on `main`.

The exposure is bounded and worth stating exactly: the step carries `|| true`, so
it cannot fail a run, and the worst case is one cold scan of roughly 45s (longer
on a slower runner). But *bounded* is not *verified* — *"all checks green"* on
this PR is **not** evidence about this change, because the step that would
produce that evidence was skipped.

**This is the house defect in miniature**: a green run standing in for a check
that never ran. It is recorded here so that when the main-path scan does run, the
first result is compared against 30 findings / 7 usable rather than read as a
new baseline.

#### RESOLVED — VERIFIED on the main path, 2026-08-16

The branch landed as `0b4a166` and the main-path scan ran for the first time,
in run `31920004705` (job `95098253121`). Steps 9/10/11 all `success`; step 8,
the PR-only path, correctly `skipped`. Compared against the baseline this
section was written to protect:

```
scanning 689 commits (660 reused, 29 new)…
30 finding(s): 0 usable in working tree, 7 usable in history.
```

**30 findings / 7 usable — identical to the local measurement.** The untracking
is VERIFIED: with the tracked copy gone, `actions/cache` restore-keys is the
only source, and it worked.

**One prediction in this section was wrong, and the way it was wrong is the
useful part.** It anticipated *"~0s on a cache hit, ~45s cold"* — a binary. The
step took **18s**, which is neither, and briefly read as an anomaly. It is not:
`660 reused, 29 new` is a **partial** hit via restore-keys, scanning only the
commits added since the last cached run. That is the mechanism working exactly
as designed, and the two-outcome prediction had no room to express it. Recorded
because "the measurement didn't match either expected value" is precisely the
moment this repo has historically reached for a wrong explanation — the third
outcome was missing from the *prediction*, not from the system.

### 4.2 A claim in the index that cost a re-check

The index recorded the cache as producing *"output byte-identical to the
per-commit scan"*. Running both and diffing them, they are **not** identical:

```
< scanning 678 commits (0 reused, 678 new)…
> scanning 678 commits (678 reused, 0 new)…
```

That is the only difference, it is the line reporting **whether the cache
worked**, and it therefore *must* differ. The **findings** are identical. But a
plain `diff` reads as a broken cache when nothing is wrong — which is exactly
what happened here before the lines were inspected. Corrected in the index to
say *findings*, with the 678-commit replication recorded.

## 5. What this does NOT establish

- **Only branches reachable from `origin` were compared**, at the moment of the
  fetch. A lane that pushes after this was written is not covered.
- The two abandoned branches (`fix-deployment-build-TBvZW` 420 ahead,
  `trinity-trustRails-sprint-1T2er` 401 ahead, both ~4 months old) were **NOT
  examined** beyond their commit counts. The index already records that they
  hold 65% of the repo's reachable commits and that deleting them is the only
  thing that shrinks the graph — and that doing so destroys the sole copy.
- **No claim that the other lanes' branches are worthless** — only that this
  branch is ahead of them on every file they share. Work they do next is not
  covered by this sweep.
- The cold/warm timings are from **this container**, once each, not a
  distribution. They are consistent with the recorded CI figures; they are not
  an independent benchmark.
