# SESSION SUMMARY — 2026-08-13 (claude-opus-5, cloud/scheduled)

Surface = **cloud/scheduled** (Claude Code Remote).
Access = GitHub **yes** (read+write via MCP), Supabase **yes** (MCP), Vercel **yes** (MCP),
Railway **no** (proxy denies CONNECT). Cloudflare MCP **unauthenticated** — unavailable.

Preflight: `v_agent_preflight` → **verdict=GO, global_pause=false**. No tasks claimed from
the queue; all work below was directly user-requested.

## Accomplished

**`1af1f00` — the harness profile.** Six dimensions (loops, tools, memory, reliability,
permissions, verification) as settings resolving through `vendor → org → user → agent`,
with one authority — `earned` — that no layer may write. Spec in `docs/HARNESS-SPEC.md`,
implementation in `lib/trustshell/HarnessProfile.ts`, **31 assertions** in
`scripts/check-harness-profile.mjs`, wired into `npm run check`. **0 new `tsc` errors**
(36 before, 36 after, none in the new files). REAL, not stub — but see the gap below.

**Earlier tonight:** `3c7eea7` (mainnet preconditions), `da8208e` (NORTH-STAR blocker list
made live + Done section). PR **#22** open, draft, mergeable clean, Vercel green.

## Found live — three instances of the same defect

1. **`repid_permissions` has always been empty.** Right shape, zero rows, so
   `get_conductor_permissions()` has returned nothing for every conductor since creation.
   [VERIFIED — row count + function definition read live]
2. **Two reputation scales.** `conductor_state.reputation_score` is **0..1** (8 rows,
   0.4–1.0, unknown defaults to 0.5). `agent_kya_registry.repid_score` and
   `RepIDConfig.ts` are **0..10000**. `repid_permissions.min_repid` is consumed by the
   former despite its name. Banding on the RepID scale would park every conductor in the
   floor tier permanently while looking like a working ladder. [VERIFIED]
3. **`v_fleet_truth` scores a responding port as a working agent.** Reports **12/12 live**;
   all twelve on `probe` alone — heartbeats **~26 days** stale, 8 of 12 with no logged work
   ever. `v_agent_preflight.agents_live_10m` reads the heartbeat table and says **0**. Both
   are in the preflight contract; they disagree. [VERIFIED 2026-08-13 01:50Z]

## REAL vs STUB

| Piece | State |
|---|---|
| `HarnessProfile.ts` registry + resolver | **REAL** — 31 assertions, runs in `npm run check` |
| `repid_permissions` ladder migration | **WRITTEN, NOT APPLIED** — Sean-gated, see below |
| Session receipts feeding earned grants | **NOT BUILT** — every earned setting sits at its floor |
| `repid_writes_require_receipt` enforcement | **NOT BUILT** — declared, nothing enforces it |
| Compiling resolved `rule` settings into agent instructions | **NOT BUILT** |
| Per-user profile storage / onboarding surface | **NOT BUILT** — no table, no UI |

Honest summary: until receipts exist, the harness is a fully tested implementation of
**least privilege for everybody**. Right failure mode, not yet a reputation system.

## BLOCKED_FOR_SEAN

1. **Apply `supabase/migrations/20260813020000_repid_permissions_ladder.sql`.** Exact
   action: run that file against `qnnpjhlxljtqyigedwkb`. Not done because it is a live
   authority expansion — it grants **Platinum to APM, HDM, MEL, VERITAS** on scores of
   exactly 1.0 with **zero receipts** behind them, which is the specific thing
   `HARNESS-SPEC.md` forbids. Nothing in this repo calls `get_conductor_permissions()`,
   but an external Railway caller cannot be ruled out from a sandboxed session, so blast
   radius is **UNVERIFIED**. Rollback SQL is in the file header.
2. **`repid_config` is readable by `anon`, and holds `enterprise_api_key`.** Policy
   `"Enable read for anon"` is `SELECT … USING (true)` for `{anon, authenticated,
   service_role}`; the row `enterprise_api_key = 495150b8-…` is described as "Enterprise
   bypass key for rate limits". Publishable keys map to `anon` and ship in the browser
   bundle, so **anyone who views source can read it**. Unlike the settled legacy JWT, this
   one is live and reachable. Exact action: decide between rotating the key, moving it out
   of `repid_config`, or replacing the blanket policy with a column/row-filtered view.
   Not done here — key rotation and RLS changes on a live read path are both fenced.
3. **Sean-gate bookkeeping is split.** `v_agent_preflight.open_sean_gates` counts
   `autonomous_tasks`, which `NORTH-STAR.md` marks "historical — do not add to". So the
   canonical way to file a gate contradicts the canonical planning surface. Logged here
   instead of adding to a deprecated table. Exact action: point `open_sean_gates` at
   `trinity_tasks`, or un-deprecate `autonomous_tasks` for this one purpose.

## Next 3 commands

```bash
# 1. Confirm the fleet-truth finding for yourself before trusting any liveness number.
#    Expect: every row liveness_signal='probe', minutes_since_ping ~37,000+.
#    psql: select agent_name, is_live, liveness_signal, minutes_since_ping,
#                 minutes_since_work from v_fleet_truth order by agent_name;

# 2. Re-run the harness assertions after any edit to the registry.
npm run check:harness

# 3. Start the load-bearing gap: the transcript parser (TRUSTSHELL-V1.md M1).
#    Until it exists, every `earned` setting resolves to its floor by design.
```

---

# SESSION SUMMARY — 2026-08-11 (claude-opus-5, cloud/scheduled)

> **Stale below this line.** The header that follows says `verdict=HOLD,
> global_pause=true` and `0/12 live`. The pause was cleared 2026-08-13 and the fleet
> numbers are contested — see the current section above. Kept for its merged-PR and
> credential history, which is still accurate.

Surface = **cloud/scheduled** (Claude Code Remote).
Access = GitHub **yes** (read+write via MCP), Supabase **yes**, Vercel **yes** (MCP),
npm registry **yes**, Railway **no**.
Cloudflare + Stripe MCP servers **unauthenticated** — unavailable this session.

Preflight: `v_agent_preflight` → **verdict=HOLD, global_pause=true** (Sean-directed
2026-07-21; credential rotation #57 + orphaned-claim release #59). **No tasks claimed,
no loop started.** Everything below was directly user-requested, not claimed from the queue.

---

## WHERE TO LOOK FOR ACTIVE STATUS

Check these in order. Do not trust this file over live state — it is a snapshot from
2026-08-11 ~21:10Z.

| What | Where | Last known |
|---|---|---|
| Preflight / HOLD | `v_agent_preflight` (Supabase) | HOLD, `global_pause=true` |
| Fleet liveness | agent heartbeat tables | 0/12 live since 2026-07-17T22:18Z |
| Open PRs | `DealAppSeo/repid-engine`, `DealAppSeo/trinity-ecosystem` | **none open** — all merged |
| npm credential | repid-engine → Settings → Secrets and variables → **Actions** tab | `NPM_TOKEN` **set** |
| npm cred, live check | Actions → `release-trust-demo` → Run workflow → `dry_run=true` | run 31553742477: **valid, `seangoodwin`** |
| Vercel builds | project `ai-trinity-symphony-landing` (`prj_EtbAAh789ySdcT0AZc8cgZNui3lt`) | prod `READY` at 5b919a9 |
| Vercel env vars | that project → Settings → Environment Variables | server key **missing** — see #2 below |
| Supabase API keys | project `qnnpjhlxljtqyigedwkb` (AITrinitySymphony) → Settings → API Keys | legacy `anon` **disabled**; 5 `sb_publishable_…` active |
| Railway reachability | `repid-engine-production.up.railway.app` | **403 to CONNECT** from cloud sessions |
| RepID substrate | `repid_score_events` (Supabase) | 152,136 rows / 104 agents |

**Trap worth knowing:** two separate systems in this stack reported success they had not
earned. Both were found by *running* the thing, not reading it. When a check is green,
confirm it actually executed something.

---

## MERGED THIS SESSION

**repid-engine #410** — `ci(release): make the trust-demo dry run verify the npm credential`.
Dry run checks `NPM_TOKEN` with three outcomes (absent → NOT CHECKED, rejected → fail,
unreachable → fail but explicitly not a token verdict).

**repid-engine #414** — `test(e2e): stop a skipped step from reporting as a pass`.
The live-flow E2E got **greener the more broken the deployment was**. Returning early from
an `it()` marks it passed, so every soft-skip rendered green. Against stubs, before the fix:
every route 404 → 3/6 passed; every route 401 → 4/6 passed; public GETs live + business
endpoints 401 → **6/6 passed, exit 0, GREEN**; host unreachable → 1 passed (the deposit
step, passing *because* the prior step failed). Fix: verification ledger
(VERIFIED / NOT CHECKED / FAILED), a guard that fails the suite when no core flow step was
verified, and `E2E_STRICT=1`. Working deployment still 7/7 in both modes.

**trinity-ecosystem #14** — `fix(build): defer Supabase client construction`.
`next build` had failed on **every deployment of this project since 2026-06-05**, `main`
included. Cause: `lib/trust/BFTEngine.ts` built a Supabase client at module scope with `!`
assertions; page-data collection imports every route module, so it ran at build time with
no key and threw. Behind it, hidden until the first was fixed:
`components/trustrails/{LiveReceiptFeed,AgentRepIDGrid}.tsx` did the same on the anon key
and broke `/dashboard` prerender. Fix: `getSupabaseAdmin()` / `getSupabaseBrowser()` —
lazy, memoised, throwing a named error when unconfigured. Dummy fallbacks
(`https://dummy.supabase.co` / `dummy_key`) removed; they had been building live clients
against a host that does not exist, so misconfiguration rendered empty instead of erroring.
Production recovered: `main` at 5b919a9 deployed `READY`.

**trinity-ecosystem #13** — this handoff file.

---

## REAL vs STUB

- **REAL**: trust-demo offline E2E (proof verified, 3 tampers rejected, verifier v0.2.0);
  trust-demo online-degraded path (UNKNOWN + reason, no false pass); release gates
  (prod-fixture-guard, 33 trust-demo tests); the Supabase build fix (`npm run build` green
  both with all five Supabase vars unset and with them set; `tsc --noEmit` 37 errors on
  main → 37 on branch, no new); Vercel preview + production deployments; RepID queries below.
- **STUB**: every E2E scenario behind #414. Network policy denies the Railway host, so the
  suite has **never** run against the real deployment. Merging #414 shipped the guard; it
  did not verify it against the live service. **First live run is still the proof.**

---

## RepID selection-layer substrate [VERIFIED 2026-08-11 via SQL]

- `repid_score_events`: 152,136 rows, 104 distinct agents, 12,230 in last 30d
- `task_domain` populated on **99.6%** of rows, **42 distinct domains**
- `x402_settlements`: 404
- Agent×domain pairs: **232** across 43 agents — **70** have n≥30, **61** have n≥100,
  **128 (55.2%)** have n<5
- `counterparty_agent_id`: only **1,277 / 152,136 (0.8%)** — column newly added
  (commit bc7c699), so the collusion graph is effectively empty and any collusion term
  would currently be decorative

Implication: per-domain competence ranking is buildable **today** for ~30% of agent×domain
pairs; the majority case is insufficient evidence and must return **"INSUFFICIENT
EVIDENCE"**, not a low score. Same three-outcome discipline as the #410 and #414 fixes —
verified, not-checked and failed are three different things.

---

## BLOCKED_FOR_SEAN — nothing here can be done by an agent

1. ~~**Add `NPM_TOKEN`**~~ — **DONE 2026-08-12.** A new granular token is set as a
   repository **secret** on repid-engine, and the live dry run
   ([run 31553742477](https://github.com/DealAppSeo/repid-engine/actions/runs/31553742477))
   verified it: `npm credential: valid, authenticated as seangoodwin`. All 14 steps green
   in 20s, including the tarball smoke test (proof verified, 3 tampers rejected,
   verifier v0.2.0).
   *Worth knowing:* the first attempt failed because the token was added under the
   **Variables** tab, not **Secrets**. `${{ secrets.NPM_TOKEN }}` then resolves to an empty
   string and the run still goes green — reported as `NOT CHECKED`, which is exactly the
   distinction #410 exists to preserve. If this ever reads NOT CHECKED again, check the tab
   before regenerating the token.
   **What is still NOT settled:** that `seangoodwin` may publish *this name*. npm offers no
   way to ask about a name that does not exist yet. Circumstantial evidence is strong —
   that account's `@hyperdag` scope already carries `trustshell@1.3.0`, `trustshell-mcp@1.0.0`
   and `proof-verifier@0.2.0` — but the real publish is the only proof.
   **The remaining step is a decision, not a task:** `git tag trust-demo-v0.1.0 && git push
   origin trust-demo-v0.1.0` publishes for real. Irreversible — the version is burned on
   landing and `0.1.0` can never be reused. `package.json` says `0.1.0`, so the tag guard
   agrees. Do not do this on an agent's initiative.
2. **Set the Supabase server key** in the Vercel project (Preview + Production) as
   `SUPABASE_SECRET_KEY` — an `sb_secret_…` key from Supabase → Settings → API Keys.
   #14 removed the *build's* dependency on it, not the *runtime's* — routes throw a named
   configuration error instead of rendering empty, which is clearer but is not data.
   `NEXT_PUBLIC_SUPABASE_URL` is already set.
   **Do not use `SUPABASE_SERVICE_ROLE_KEY`.** This project has moved to Supabase's newer
   API keys and the legacy `anon` JWT is **disabled** (verified 2026-08-11 against project
   `qnnpjhlxljtqyigedwkb`; five `sb_publishable_…` keys active, legacy anon
   `disabled: true`). **SETTLED 2026-08-12: the legacy service_role key is DISABLED along with anon (the dashboard offers "Re-enable JWT-based API keys"), so the copy in public git history is inert — see docs/KEY-ROTATION.md. Formerly UNVERIFIED** — secret
   keys are not readable through any API, so it was never measured. An earlier revision of
   this file asserted it was disabled too; that was an inference from the anon key, not a
   fact, and the Railway deployment at `app.aitrinitysymphony.com` was serving live data
   on 2026-08-12, which may well be running on a legacy service_role key. An earlier
   revision of this file said to set the service-role key — that was wrong for this
   project. #16 updates both helpers to accept the new names, legacy still tolerated.
   Browser side wants `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`).
3. **Network policy**: allow `repid-engine-production.up.railway.app` from cloud sessions,
   or the live-flow E2E can never run from here and #414 stays unproven against reality.
4. **HOLD still in force** since 2026-07-21; fleet 0/12 live since 2026-07-17T22:18Z.
5. Authorize Cloudflare + Stripe MCP connectors if those are wanted in cloud sessions.

---

## Next 3 commands

```bash
# 1. NPM_TOKEN is set and verified (run 31553742477, "authenticated as: seangoodwin").
#    Re-run the dry run any time to re-confirm before releasing:
#    repid-engine → Actions → release-trust-demo → Run workflow → dry_run=true
#    To actually publish — IRREVERSIBLE, Sean's call only:
#      git tag trust-demo-v0.1.0 && git push origin trust-demo-v0.1.0

# 2. Once the Railway host is reachable — the honest E2E, post-rollout mode.
#    This is the outstanding proof for #414.
cd /workspace/repid-engine && E2E_STRICT=1 npm run test:e2e

# 3. Scope the selection layer against real coverage
psql -c "select task_domain, count(distinct agent_id) agents, count(*) n
         from repid_score_events where task_domain is not null
         group by 1 having count(*) >= 30 order by n desc;"
```
