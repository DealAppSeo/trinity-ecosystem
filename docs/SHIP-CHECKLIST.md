# Ship checklist — E2E

Ordered. Two steps are order-dependent and will break production if swapped;
they are marked **⚠ ORDER**.

Everything already applied to the database is marked ✅ — those are done, listed
so the record is complete.

---

## 0. Where production actually is

`app.aitrinitysymphony.com` is served by **Railway**, not Vercel. The same app
runs in both with **separate environment variables**, so a 200 from one says
nothing about the other. Every env var below must be set in **both** places, or
in whichever one you actually serve from.

Vercel preview URLs are SSO-protected (`ssoProtection: all_except_custom_domains`),
so a browser check of a preview will bounce to SSO.

---

## 1. Environment variables

New in this change — the app degrades in specific, visible ways without them.

| Variable | Required? | Without it |
| :-- | :-- | :-- |
| `INTERNAL_ROUTE_SECRET` | **Yes** | `/api/trustrails/internal/update-agent` returns **503** and the service-principal auth path is disabled. Fails closed by design. |
| `CRON_SECRET` | **Yes, to schedule** | The BFT worker cannot be called by Vercel Cron; queued evaluations are never processed and every receipt stays `bft_passed = NULL` forever. |
| `BFT_ENFORCEMENT_MODE` | No | Defaults to `observe`. Leave it unset for now — see §5. |

Already required, confirm they are present:

| Variable | Notes |
| :-- | :-- |
| `SUPABASE_SECRET_KEY` | An `sb_secret_…` key. Legacy names still read, but **delete them** — a stale `SUPABASE_SERVICE_ROLE_KEY` on one host silently wins there and nowhere else. |
| `NEXT_PUBLIC_SUPABASE_URL` | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | An `sb_publishable_…` key. `NEXT_PUBLIC_*` is inlined at build time, so **changing it requires a redeploy**, not just an env edit. |
| `TRUSTRAILS_HMAC_SECRET` | Signs the receipt audit hash (HMAC-SHA256). **REQUIRED — minting throws without it.** The old shared-default fallback was removed 2026-08-16: it made every audit hash forgeable by anyone holding the repo, and this line's own caveat was the debt that let it survive. Must be ≥16 chars, and the abandoned default `trinity-default-sbt-secret` is refused by name. |
| `LITELLM_URL`, `LITELLM_MASTER_KEY` | The BFT panel's three providers route through here. Without them every evaluation fails and rows park after 3 attempts. |
| `AGENT_SOPHIA_SECRET_BYTES` | Solana signing key, as a JSON byte array. Devnet. |
| `SOLANA_RPC_URL`, `USDC_DEVNET_MINT` | Both have devnet defaults. |

`AGENT_SOPHIA_PRIVKEY` is **no longer read by anything** — the executor always
used `AGENT_SOPHIA_SECRET_BYTES` and discarded the parameter. Remove it from
both hosts; it is the key recoverable from git history.

---

## 2. Deploy

1. Merge the PR.
2. Deploy to **Railway** (the custom domain) and Vercel if you serve from both.
3. Confirm the deploy is live before step 3.

---

## 3. ⚠ ORDER — apply the phase-2 RLS migration *after* deploy

`supabase/migrations/20260812220000_rls_phase2_after_deploy.sql`

Applying this **before** the deploy blanks the agent grid and receipt feed on
production, because the currently-deployed code still reads those two tables
from the browser with the publishable key.

Already applied ✅ — `20260812210000` (phase 1: `trade_execution_log`,
`agent_repid`), `20260812120000` (institution_members),
`20260812190000` (activity summary), `20260812230000` (BFT queue),
`20260812234500` (receipt correction).

After applying, confirm as the anon role:

```sql
SET LOCAL ROLE anon;
SELECT count(*) FROM agent_kya_registry;      -- expect 0
SELECT count(*) FROM kya_compliance_receipts; -- expect 0
```

**This is a product change too.** A signed-out visitor keeps the landing page,
both demos and the aggregate system trust score, but loses per-agent rows and
individual receipts. If that is not what you want, the rollback SQL is in the
migration's header comment.

---

## 4. Grant access to anyone else who needs it

Only `dealappseo@gmail.com` currently has membership (owner on all three
institutions). The other three auth users have none and will see sign-in
prompts.

```sql
INSERT INTO institution_members (user_id, institution_id, role, created_by)
SELECT u.id, 'default', 'operator', 'manual-grant'
FROM auth.users u WHERE u.email = 'someone@example.com';
```

Roles: `viewer` reads, `operator` changes risk policy, `owner` adds
freeze/unfreeze and BYOK.

---

## 5. Turn on the BFT worker

Without a scheduler, observe mode queues evaluations that are never run.

**Vercel** — `vercel.json` already declares the cron (`*/10 * * * *`). Set
`CRON_SECRET` and redeploy. Note Hobby plan crons are limited to daily; Pro
allows the 10-minute cadence.

**Railway or any external scheduler** — call it directly:

```bash
curl -X POST https://app.aitrinitysymphony.com/api/trustrails/bft/process \
  -H "x-internal-secret: $INTERNAL_ROUTE_SECRET"
```

Check depth without draining:

```bash
curl https://app.aitrinitysymphony.com/api/trustrails/bft/process \
  -H "x-internal-secret: $INTERNAL_ROUTE_SECRET"
# → {"queue":{"pending":N,"evaluated":N,"failed":N}}
```

**Leave `BFT_ENFORCEMENT_MODE` unset.** The Comma veto fires on *unanimous* high
confidence, so a routine payment can be escalated, and that rate has never been
measured against payments. Collect a few dozen observe-mode evaluations, look at
how often `pythagorean_veto` comes back true, then decide whether to enforce.

---

## 6. Smoke test, in order

Each step tells you a specific thing works. Run them against the deployed host.

```bash
BASE=https://app.aitrinitysymphony.com

# 1. Public surface renders
curl -sf $BASE/ >/dev/null && echo "landing ok"

# 2. Guardrails still block — real KYA/RepID checks, no auth needed
curl -s -X POST $BASE/api/trustrails/demo/villain | head -c 200

# 3. Authorization boundary holds. THIS MUST FAIL.
curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/api/trustrails/settings \
  -H 'content-type: application/json' \
  -d '{"institutionId":"default","config":{"pythagorean_veto_enabled":false}}'
# → 401. Anything 2xx means the fix is not deployed. Stop and investigate.

# 4. Sign in at $BASE/login, then confirm the dashboard's panels load:
#    operations history, agent grid, receipt feed, institutional controls.

# 5. Worker responds
curl -s $BASE/api/trustrails/bft/process -H "x-internal-secret: $INTERNAL_ROUTE_SECRET"
```

Then locally, before or after:

```bash
npm run check   # secret scan + auth policy (11 assertions) + tsc
```

---

## 7. Still open — decide, don't forget

- **Settle the legacy `service_role` key.** A complete JWT valid until 2035 is
  recoverable from git history. Run `npm run check:legacy-key` **from a laptop**
  (a cloud session is proxy-blocked and reports `NOT MEASURED`) — it says
  whether the API still accepts it. Two things that were wrong in earlier
  revisions of this list: the legacy JWT secret **can no longer be rotated**,
  and disabling legacy API keys is **reversible, not a revoke**. Full picture in
  `docs/KEY-ROTATION.md`. The repo is private with zero forks, which is what
  keeps this urgent-but-not-emergency.
- **Run one BFT evaluation against real providers.** The consensus path is wired
  and type-correct but has never executed — the LiteLLM proxy is Railway-hosted
  and unreachable from cloud sessions, so it could not be verified here.
- **Tailwind** is installed and postcss-wired but never imported, so every
  utility class in the app renders as nothing. Enable it or drop the dependency.
- **`lib/trusttrader/` and the ERC-8004 registries** have code and deployed
  contracts but no execution path.
- **Three dashboard controls have no database column** (`llm_version_pinning`,
  `air_gap_fallback_enabled`, `compartmentalized`). They render as `NOT STORED`.
  Add the columns or remove the controls.
- **Two reputation stores.** `agent_repid` has 87 rows, `agent_kya_registry` has
  12, and the UI reads the smaller one.

---

## What "working E2E" means after this

A signed-in operator can see 171k events of real operational history including
2,851 recorded refusals; read and change institutional risk policy with role
enforcement and a server-stamped audit trail; run both guardrail demos; and
issue a payment that produces a compliance receipt stating honestly whether it
settled, whether it was confirmed, and whether consensus was evaluated — with
the verdict filled in by a real three-provider vote minutes later.

No part of that reports a check it did not run.
