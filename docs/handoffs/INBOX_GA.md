# Inbox — GA

Newest entry on top. See `README.md` in this directory for format and what this is/isn't.

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
