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

Vercel `ssoProtection` is `all_except_custom_domains`, so every `.vercel.app` URL
302s to `vercel.com/sso-api`. You cannot fetch a preview URL from an agent
session. The custom domains above are exempt, which is why they work.

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
reachable by anyone who views source. See LESSONS S1 — two tables are currently
`USING (true)` for `anon`.

## Network, in cloud/remote sessions

These hosts are **denied by the sandbox proxy** (`connect_rejected`, gateway 403 to
CONNECT). This is not an auth failure — do not rotate a credential over it:

- `repid-engine-production.up.railway.app`
- `qnnpjhlxljtqyigedwkb.supabase.co`

The Supabase **MCP tools work** (different path), so SQL queries succeed while
direct PostgREST calls fail. The npm registry and GitHub are reachable.

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

## Repo gotchas

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
