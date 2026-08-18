# CLAUDE.md — operational ground truth

## FIRST: read `docs/PRIOR-WORK-INDEX.md`

**Before you plan, build, or quote a number.** It lists what is already CLOSED
(with the measurement that closed it), what is OPEN and who owns it, and which
figures have been RETRACTED and must never be cited again.

This is not a formality. Two full sprints were once spent optimising a component
already at **97.9% of its theoretical bound**, because nobody had measured the
bound. Four published numbers had to be retracted, three for the same root
cause. Both were cheap to prevent and expensive to discover.

Three habits carry most of the value:

- **Suspect the target before the measurement, and the measurement before the
  code.** Compute the ceiling before optimising toward it — it is usually one
  cheap calculation, and it tells you whether the work can pay at all.
- **Suspect the sample before the measurement.** Every real-data retraction here
  came from an assumption about the *shape* of the data made without checking
  it: interleaving assumed order did not matter; `id desc` assumed id tracked
  time; a fixed-length tail assumed equal volumes meant equal windows.
- **A caveat is a debt.** A number published with an unpaid caveat is
  provisional — do not state it flat. Two retractions were caught by caveats
  their own author had written and then ignored.

**When you finish, add your result to the index.** `npm run check:prior-work`
enforces the mechanical half — a new file citing a retracted figure fails the
build, and a doc missing from the index fails it too.

---

Read this before touching anything. It is deliberately short: it holds only facts
that are **not discoverable from the code** and that have already cost someone a
wasted hour. Architecture narrative lives in `CLAUDE_HANDOFF_TRINITY.md`; current
task state in `SESSION_SUMMARY.md`; the failure log in `LESSONS.md`.

**Everything here is a snapshot. Re-verify before relying on it.** This file has
already been wrong once — see LESSONS A4.

---

## Deployment topology — the thing that fools people

| Surface | Actually served by |
|---|---|
| `app.aitrinitysymphony.com` | **Railway** (`x-railway-edge` in response headers) |
| `aitrinitysymphony.com` (apex) | **Vercel** — 200, redirects to `www` |
| `www.aitrinitysymphony.com` | **Vercel** (`x-vercel-id`) |
| `*.vercel.app` for this repo | Vercel project `ai-trinity-symphony-landing` (`prj_EtbAAh789ySdcT0AZc8cgZNui3lt`) |
| `trustrails.dev`, `www.trustrails.dev` | Vercel project **`trustrails`** (`prj_y0aIbpcHHJfGd8TcruunVxVYmLVI`) — **NOT `trustrails-dev`** |
| `hyperdag.org` | Vercel project **`hyperdag-trust`** — **NOT `hyperdag-org`** |
| `trustshell.dev`, `www.trustshell.dev` | Vercel project **`trustshell-landing`** (`prj_ye1cqfvwyj9axPMXZBdkfB7YCE0k`), repo `DealAppSeo/trustshell` — here the name match **is** real, verified against the `domains` array, not a decoy |

**Two projects here are named after a domain they do not serve, and both have
already cost a wrong finding** [VERIFIED 2026-08-15 against the Vercel API]:

- `trustrails-dev` (`prj_F2jvc7BuDydh0R30GJjw3sZhbxIZ`) serves **no custom
  domain** — only `*.vercel.app`. The live `trustrails.dev` is the `trustrails`
  project. **Both are fed by the same repo**, `DealAppSeo/trustrails-dev`, so a
  single push builds both, and they differ only in environment variables. That is
  why `trustrails-dev` sat in state ERROR for a whole session while `trustrails`
  built fine **on the identical commit** — and why "the trustrails-dev project is
  broken" does not mean the live site is.
- `hyperdag-org` serves no custom domain either; its ERROR deploy and
  `repid-engine` build metadata were read as a fault on the live `hyperdag.org`.
  That produced a published finding that had to be retracted.

**Before concluding anything about a live domain from a Vercel project, check the
project's `domains` array.** Matching the name is not evidence.

**`trustshell.dev` is the case where checking the array CONFIRMED the name-match**
[VERIFIED 2026-08-16 against the Vercel API] — do not reflexively treat
`trustshell-landing` as a third decoy just because the two rows above are. Its
`domains` array holds `trustshell.dev` and `www.trustshell.dev`, it is a Next.js
app built from `DealAppSeo/trustshell`, and the production deployment serving the
domain (`dpl_J53jTJ3cXfRJPuQcoV3XtSPzEwC5`, `main` @ `6cfd2d3`) is the current
production target — production is **not** stale here, unlike `trustrails.dev`. The
newest *build* is a `target: null` preview, which is the ordinary preview/production
split, not a drought. **One gap:** `trustshell.dev` has **no `/api/version`**
[VERIFIED 2026-08-16 via pg_net — 404], so "which commit is live / is a required
secret set" is not observable from the outside the way it is on the aitrinitysymphony
surfaces — the Vercel API is the only way to answer it for this domain.

The same Next app runs in **both places with separate environment variables.** A
200 from the custom domain says nothing about the Vercel deployment, and vice
versa. Check `x-railway-edge` / `x-vercel-id` in the response headers to know which
one answered you. Body sizes differ between the two (23,588 vs 23,995 bytes on
2026-08-13) — that is the separate-env split, not a bug.

**The apex and `www` rows were missing from this table until 2026-08-13**, which
cost real time: with only `app.*` listed, `app.*` looks like the whole product,
and it is the one surface Vercel does **not** serve. Those two are Vercel, they
are **publicly reachable**, and they are the only way to observe the Vercel
deployment when the Vercel API is unavailable — which is exactly the situation
that surfaced them.

**Publicly reachable is not the same as reachable from here.** All three custom
domains are proxy-denied to `curl` and to the browser tool from an agent session;
`pg_net` reaches them. See *Network, in cloud/remote sessions* below before
concluding a domain is down.

Vercel `ssoProtection` is `all_except_custom_domains`, so every `.vercel.app` URL
302s to `vercel.com/sso-api`. You cannot fetch a preview URL from an agent
session. The custom domains above are exempt from **SSO** — that is why `pg_net`
gets a 200 from them and never from a preview URL. It is not proxy exemption.

### Knowing WHICH COMMIT a surface is running

`GET /api/version` → `{ commit, commit_short, platform, environment, region }`.
Public, uncached, and it names which platform answered.

A 200 from a domain proves the site is **up**, not that it is running the commit
you just merged: a platform keeps the last SUCCESSFUL build serving when a new
deploy fails, so a green pipeline and a healthy page are both compatible with
week-old code. Compare `commit` against `origin/main` HEAD before believing a
deploy landed. `www` was seen serving `x-vercel-cache: HIT`, so cache-busting
matters here — this route sets `no-store` for that reason.

repid-engine has the same thing at `GET /health` → `deployed_commit`.

### Reaching these hosts from a sandboxed agent session

`curl` from the container is proxy-denied for most external hosts, but **Supabase
`pg_net` is not** — it egresses from Supabase infrastructure:

```sql
select net.http_get(url := 'https://www.aitrinitysymphony.com/api/version',
                    timeout_milliseconds := 45000);
-- then: select status_code, headers, content from net._http_response where id = <id>;
```

`net._http_response.headers` carries `x-vercel-id` / `x-railway-edge`, so this
answers "which surface, which commit" in one round trip.

## Supabase

Project **AITrinitySymphony**, ref `qnnpjhlxljtqyigedwkb` (the ref that used to be
hardcoded as a fallback in `trade_pipeline.ts`).

This project uses Supabase's **newer API keys** (5 `sb_publishable_…`, 9
`sb_secret_…`).

### KEYS ARE NOT ROLES — read this before writing an RLS policy

**This is the single most re-litigated fact in the project.** It has been
rediscovered repeatedly, and every time, the cause is the same conflation.
Both halves below are true at once:

| | old | new | status |
|---|---|---|---|
| **API KEY** (the credential you put in an env var) | `anon` JWT, `service_role` JWT | **`sb_publishable_…`**, **`sb_secret_…`** | legacy JWTs are **DEPRECATED and disabled here** |
| **POSTGRES ROLE** (the principal RLS is written against) | `anon`, `authenticated`, `service_role` | *unchanged* | **ALIVE. Not deprecated. Do not remove from policies.** |

The keys were replaced. **The roles were not.** A `sb_publishable_…` key
authenticates **as the `anon` role**; a `sb_secret_…` key authenticates **as the
`service_role` role**. So:

- "The anon key is deprecated" — **true of the key, false of the role.**
- `CREATE POLICY … TO anon` is still correct, current SQL. It is what governs
  every browser caller, because the publishable key they hold *is* `anon`.
- Deleting `anon` from a policy because "anon is deprecated" either does nothing
  or silently changes authorization. That mistake is the reason this box exists.

**`service_role` has `rolbypassrls = true`** [VERIFIED 2026-08-15 against
`pg_roles`]. It never consults a policy. Therefore:

- A policy `TO service_role` is **decorative** — it grants nothing that the role
  did not already have.
- To restrict a table to server-side callers only, you **DROP the policies that
  reach `anon`/`PUBLIC`**. You do not "add a service_role policy". Secret-key
  callers keep working by bypassing RLS, not by matching a rule.
- Conversely, RLS **cannot** protect you from a leaked `sb_secret_…` key. RLS is
  not a control on that path at all.

`anon` and `authenticated` have `rolbypassrls = false`, so policies do bind them.

**Do not take this on trust — ask the database.** `public.whoami()` returns the
role the CALLING KEY resolved to. It is `SECURITY INVOKER`, read-only, and takes
no arguments:

```bash
curl -s "$SUPABASE_URL/rest/v1/rpc/whoami" -X POST \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{}'
```

Called on 2026-08-15 with a **`sb_publishable_…`** key — a current, new-format
key, not a legacy JWT — it returned:

```json
{"current_role_name": "anon", "session_user_name": "authenticator", "bypasses_rls": false}
```

That is the whole point in one line: **the new publishable key IS the `anon`
role.** Not a replacement for it. `sb_secret_…` resolves to `service_role` the
same way. If this comes up again, run the call rather than re-deriving it —
that is what the function is for.

**That `curl` does not run from an agent session** — `$SUPABASE_URL` is
`qnnpjhlxljtqyigedwkb.supabase.co`, which the sandbox proxy denies (403 to
CONNECT, verified 2026-08-15). A failure there says nothing about the key. The
Supabase MCP tools reach the database, but calling `whoami()` through them
**answers a different question**: the reply describes the role *that* connection
resolved to, not the role of the key you are asking about — the key under test
never leaves your hands. To resolve a specific key you need the PostgREST path
above, from somewhere the proxy does not block.

**SETTLED 2026-08-12 — do not re-open.** The legacy `anon` and `service_role`
JWTs are **disabled**; the dashboard shows a *"Re-enable JWT-based API keys"*
button, which only appears when they are off. A copy of the legacy
`service_role` JWT is public in `DealAppSeo/repid-engine`'s git history and is
**inert** because the key is disabled — not an incident, no rotation needed
(Supabase no longer offers legacy JWT rotation anyway). The one standing rule:
**never re-enable legacy API keys on this project.** Full reasoning in
`docs/KEY-ROTATION.md`; mirrored in the DB's `settled_facts_DO_NOT_REPEAT`.

Use the helpers, never `createClient` directly:

- `lib/supabase-admin.ts` → `getSupabaseAdmin()` — server. Reads
  `SUPABASE_SECRET_KEY`, then legacy names.
- `lib/supabase-browser.ts` → `getSupabaseBrowser()` — client. Reads
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, then legacy names.

**Never construct a Supabase client at module scope.** `next build` collects page
data by importing every route module, and client components are server-rendered
during prerender — a module-scope client runs at build time and fails the build
when a key is absent. This broke every deployment of this project from 2026-06-05
to 2026-08-11.

`NEXT_PUBLIC_*` is inlined by **static analysis of literal references**.
`process.env[name]` is not inlined and is `undefined` in the browser. Multi-name
fallbacks in client code must spell out each candidate; server code can loop.

**Publishable keys map to the `anon` Postgres role and ship in the browser
bundle.** They are public. Anything reachable under an `anon` RLS policy is
reachable by anyone who views source.

**It is 196 tables, not two** [MEASURED 2026-08-16 against `pg_policies`]. This
line previously said "two", generalising LESSONS S1 — which had audited exactly
two tables and never claimed they were the only ones. Both of S1's are now fixed
(`agent_kya_registry` and `kya_compliance_receipts` are `{authenticated}`), so
the sentence was wrong in both directions at once: the named pair was closed and
the real number was two orders of magnitude larger. Full finding, severity and
the remediation SQL: `LESSONS.md` S3. Do not re-derive the count by reading a
migration — ask `pg_policies`.

## Network, in cloud/remote sessions

These hosts are **denied by the sandbox proxy** (`connect_rejected`, gateway 403 to
CONNECT). This is not an auth failure — do not rotate a credential over it:

- `repid-engine-production.up.railway.app`
- `qnnpjhlxljtqyigedwkb.supabase.co`
- `app.aitrinitysymphony.com` — verified 2026-08-15
- `www.aitrinitysymphony.com` — verified 2026-08-15

The Supabase **MCP tools work** (different path), so SQL queries succeed while
direct PostgREST calls fail. The npm registry and GitHub are reachable.

**The last two are denied to `curl` and to the browser tool, but reachable via
`pg_net`** — those are different egress paths, and only `pg_net` leaves Supabase
infrastructure. The browser fails as `net::ERR_TUNNEL_CONNECTION_FAILED`, which
looks like a site outage and is not one; `curl` gives the usual
`CONNECT tunnel failed, response 403`. Until 2026-08-15 this section listed only
the first two hosts while the topology section called the custom domains
reachable, so a denial on `www` read as "the deploy is down."

This is why **no agent session can observe these pages after hydration.** `pg_net`
returns the SSR HTML and any static asset, so "which commit, which surface" and
"is this string in the shipped bundle" are answerable; anything that only appears
once React mounts is **NOT CHECKABLE from here** — say so rather than inferring it
from healthy-looking SSR HTML, which renders identically whether or not a
client-side effect throws.

The apex `aitrinitysymphony.com` was **NOT CHECKED** against the proxy — do not
assume it matches `www` either way.

When a request 403s, run `curl -sS "$HTTPS_PROXY/__agentproxy/status"` and look at
`recentRelayFailures` before drawing any conclusion.

## CI / credentials

`NPM_TOKEN` on `DealAppSeo/repid-engine` must be a **repository secret** under
Settings → Secrets and variables → **Actions**. Secrets and Variables are two tabs
on one page; a token in the Variables tab makes `${{ secrets.NPM_TOKEN }}` resolve
to an **empty string** with no error. Verified working 2026-08-12 as `seangoodwin`.

Rehearse with Actions → `release-trust-demo` → Run workflow → `dry_run=true`. Read
the **npm credential** line in the job summary, not the green tick — `NOT CHECKED`
and `valid` are both green runs.

Publishing is `git tag trust-demo-v0.1.0 && git push origin trust-demo-v0.1.0`. It
is **irreversible** and a version can never be reused. **Never do this on your own
initiative.**

### A GREEN CHECK IS NOT EVIDENCE CI RAN

Four rules, from LESSONS A26. PR #56 had no CI for **eight hours** while looking
checked, and six commits were reported verified on local runs alone.

1. **Verify the JOBS ran, not the checks list.** The green tick on a PR here is
   often Vercel's *preview deploy*, which passes whether or not a single test
   executed. Open the workflow run and look at its jobs.
2. **`action_required` means CREATED AND NEVER STARTED.** It is not red, it
   produces **no check run at all**, and it therefore does not appear in the
   place people look — `get_check_runs` returns only the deploy. Tell a finished
   run from one that never began by comparing `run_started_at` (and
   `updated_at`) against `created_at`: **equal timestamps mean it never ran.**
3. **On this repo, do not trust the PR checks list alone.** `workflow_dispatch`
   is the reliable path until the `pull_request` trigger gap is understood — see
   the OPEN entry. `check.yml` and `prior-work.yml` both take a `ref_note` input
   so the reason for a manual run is recorded on the run itself.
4. **A bot-authored head commit lands in approval limbo.** Copilot resolving a
   conflict makes the run's `actor` a Bot, which arms the approval gate.
   Dispatch bypasses that **without disabling the gate — do not disable it.**

Only `actions_get(get_workflow_run)` names the `actor`, which is why it is the
call that settles this. Two tidier hypotheses were asserted before that evidence
and both were wrong.

## Repo gotchas

- **Adding a check suite: add a `"check:name"` script to `package.json`, and
  nothing else.** `npm run check` is `scripts/check-all.mjs`, which discovers
  every `check:*` and runs it. Do NOT reintroduce a hand-maintained chain — it
  was one shared line that five PRs had to resolve conflicts over in a single
  night, and it silently kept 5 suites (145 assertions) out of CI because adding
  one meant editing that line. See LESSONS A16. Exit codes carry the verdict:
  **0 VERIFIED, 2 NOT_CHECKED, anything else FAILED.**
- `tsconfig.tsbuildinfo` is a build artefact. Every `tsc` run rewrites it, which
  makes `git stash`/`pop` around a typecheck conflict — and a failed `pop` is
  silent if you redirect its output. Never redirect `git stash pop`.
- `.next/` and `.claude/worktrees/` have both been committed here before and both
  caused stale-deployment bugs. Check `git status` before assuming a build
  directory is ignored.

## How to be right here

The recurring defect in this codebase is **a system reporting success it has not
earned** — a skipped test scored as a pass, a build green over undefined
references, a credential check green with no credential. Three instances in one
session, in three unrelated components.

1. **Run it; don't read it.** Every wrong claim in `LESSONS.md` came from
   describing behaviour without executing it. The build finds things reading does
   not, and finds the *next* thing only after the first is fixed.
2. **`tsc --noEmit`, diffed against base.** Compare error counts to the base
   branch. It catches what `next build` structurally cannot: dynamic routes never
   execute during a build.
3. **Three outcomes, never two.** VERIFIED / NOT CHECKED / FAILED. Two outcomes
   collapse "we did not look" into "it passed."
4. **If a tool cannot return it, write UNVERIFIED.** Do not infer a fact and state
   it plainly; this file has already carried one such error.
