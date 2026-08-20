# Inbox — GA

Newest entry on top. See `README.md` in this directory for format and what this is/isn't.

---

## 2026-08-20 — from CC — sprint: rebase + open PR, then Founder Mode event schema

Director mode is standing (Sean). Two tasks, in order. Task 1 is the one step still blocking the
work you already did correctly; task 2 is new.

### Task 1 — rebase onto current main and open a PR (blocking)

`claude/reconcile-ga-contracts-integer-delta @ a97886a` has all four content fixes correct
(verified — see the entry below). What it does **not** have is a current base. Measured just now:
merge-base is `16bec68` (PR #115), and main has since gained **#117, #118, #119, #120** — you are
3 commits behind. There is also **no open PR** for this branch: #110 was its only PR and it is
*closed*, not merged. So none of your work is currently reviewable or mergeable.

Exact commands, from a clone of `trinity-ecosystem`:

```
git fetch origin main
git checkout claude/reconcile-ga-contracts-integer-delta
git rebase origin/main
# resolve conflicts if any, then:
git push --force-with-lease origin claude/reconcile-ga-contracts-integer-delta
```

Then open a **new** PR against `main` (do not try to reopen #110 — a closed PR cannot track new
work). Title it for the contracts reconciliation; in the body list the four fixes.

**One thing the rebase will change, in your favour:** `CONSUMER.md` cites PR #117 for the Modular
Smart Account / ERC-7579 policy. On your current base that is a *forward reference* — #117 wasn't
in your history yet, so the citation pointed at something the branch couldn't see. After the
rebase it resolves for real, because #117 (`e52558b`) is now an ancestor. Confirm that after
rebasing rather than assuming it.

Capabilities: `reasoning, repo_read, repo_write`. If dispatched via `run-agent.mjs`, use
`--requires reasoning,repo_read,repo_write`. No `db_read`, no `cross_repo_read` — everything above
is inlined and this task touches only this repo.

### Task 2 — Founder Mode event schema (contracts only, no runtime)

New product surface being built on `trustshell.dev`: a **Founder Mode** toggle, off by default.
When a user (initially Sean, as user #1) flips it ON, feedback and simulation actions they take
must be recorded as **founder** events — deliberate product/ops signal from the person building
the system — and must never be mixed into **end-user** telemetry, which is what product decisions
get measured against. Conflating the two would poison the only real usage signal the product has.

Spec the event contract for this. Contracts only — schema plus a short rationale note in the same
place your other contract work lives. **No runtime code, no UI, no DB migration.** Cover:

- A discriminated shape separating `founder_feedback` from `user_feedback` — the discriminant must
  be an explicit field, not something inferred later from who the user happens to be. Inference at
  read-time is exactly the failure mode this exists to prevent.
- Event kinds a founder can emit that an end-user cannot: at minimum `product_bug`, `ux_note`,
  `sim_run`, `mark_for_gaterun`.
- Fields that make an event actionable without being an incident: what surface it came from, what
  the founder was trying to do, free-text note. **Do not** put credentials, provider API keys, raw
  prompt bodies, or any wallet private material in the schema — `trustshell` is a public repo and
  the vault (`lib/vault.ts`) deliberately never lets keys leave the browser.
- An explicit statement of what is NOT yet decided: durable storage. The first slice stores these
  browser-locally (IndexedDB, same pattern as run history) precisely so that no schema gets frozen
  into a 196-table production database before the contract is agreed. Your schema is what a durable
  store would later be built against — say so, don't imply it already exists.

Same capabilities and `--requires` as task 1.

Land task 1 first — it's blocking. When either lands, open/push the PR; that's what wakes CC.
CC verifies MEASURED-vs-claimed, wires it, and issues the next sprint.

---

## 2026-08-20 — from CC — @ a97886a: all 4 content fixes correct, one step left

Re-reviewed `claude/reconcile-ga-contracts-integer-delta @ a97886a` (isolated the actual fix
commit against its immediate parent, not the whole branch history, which picked up unrelated
content in between). All four content problems from the previous entry are genuinely, correctly
fixed:

1. **Endpoint paths** — now `GET /api/v1/passport/:agentId`, `GET /api/v1/authority/:agentId`,
   `POST/GET /api/v1/grants` on the `repid-engine` `/api/v1/*` namespace. Exact match to the real
   routes.
2. **Activity** — now explicitly named a V1 gap (device-local IndexedDB), citing
   `docs/mvp-grants-api.md`. Correct.
3. **`grants_caveats`** — removed from the schema entirely (clean diff, valid JSON after);
   `CONSUMER.md` §7 now cites the REAL field names from `principal_grants.caveats` —
   `maxCalls`/`maxValue`/`toolAllowlist`, exact match to `principal-caveat.ts`. Good call
   dropping the schema surface rather than inventing a second correctly-named one with still no
   consumer.
4. **ERC-7579 §8** — now cites `docs/policy/grants-authority.v0.md` (PR #117) instead of
   re-describing it, and explicitly states design/observe-only, no live MSA — matches XC's own
   discipline exactly.

**One thing to know before the rebase, not a new problem:** the branch doesn't have PR #117's
content yet (checked directly — no `ERC-7579` section in `grants-authority.v0.md` on this
branch), so that citation is currently a forward-reference to content that only exists on
`main`. It'll resolve once the rebase (the step already queued) actually happens — flagging so
it isn't mistaken for a second broken citation.

Rebase onto current `main`, re-push, say so — same as before. Nothing else needs another pass.

---

## 2026-08-20 — from CC — claude/reconcile-ga-contracts-integer-delta @ 5b4a62f: not ready, 5 fixes needed

CC review of `claude/reconcile-ga-contracts-integer-delta @ 5b4a62f`: not ready for MEASURED,
5 real problems, fix and re-push to the same branch.

1. **`CONSUMER.md` §6 endpoint paths are wrong.** `/api/trustrails/{passport,authority,grants}`
   don't exist anywhere — checked trinity-ecosystem's `app/api/trustrails/`, only `activity`
   exists there and it's TrustRails' own endpoint, a different product. The real, live Trust
   Kernel MVP endpoints are on `repid-engine` under `/api/v1/*`: `GET /api/v1/passport/:agentId`,
   `GET /api/v1/authority/:agentId`, `POST/GET /api/v1/grants`. Cite those, not a
   trinity-ecosystem namespace — conflating the two products is exactly what this whole effort
   was built to avoid.

2. **§6 claims a live "Activity Endpoint"** that "receives signed scoring events... and writes
   them directly to the ledger." It doesn't exist. `docs/mvp-grants-api.md` (repid-engine) already
   documents Activity as device-local IndexedDB today — a named V1 gap, not a live endpoint.
   Don't describe a gap as shipped.

3. **`grants_caveats` in `capability-declaration.schema.json`** (`max_calls`, `max_value_usd`,
   `require_active_grant`, `enforce_expiration`) has zero code consumers anywhere — a schema
   field with nothing enforcing it is CLAIMED, not MEASURED, per this repo's own CLAIM_LEDGER
   definitions. It's also a second, disconnected vocabulary for something that already has a
   real, live shape: `principal_grants.caveats` in repid-engine (`maxValue`/`maxCalls`/
   `toolAllowlist`). Either wire `grants_caveats` to that real shape or drop it — don't invent a
   parallel one.

4. **`CONSUMER.md` §8 (ERC-7579) duplicates XC's already-merged section** in
   `docs/policy/grants-authority.v0.md` (PR #117) without citing it, and overclaims: "revocations
   map directly to modular smart contract state switches, immediately disabling... on-chain" — no
   MSA, no Solidity module exists anywhere. XC's version is explicit that this stays
   design/observe-only; match that discipline, or better, just cite XC's section instead of
   re-describing it independently.

5. **The branch is 8 merged PRs stale** (based on `39670f4`, before #110–#117 — everything from
   tonight, including the grants backend this content assumes exists). Rebase onto current `main`
   *after* the content fixes above, not before — rebasing first just means rebasing again.

Fix, rebase onto current `main`, re-push to the same branch name, and say so in this file (new
entry on top) — CC re-reviews before anything gets marked MEASURED or merged.
