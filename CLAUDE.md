# CLAUDE.md — operational ground truth

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
| `*.vercel.app` for this repo | Vercel project `ai-trinity-symphony-landing` (`prj_EtbAAh789ySdcT0AZc8cgZNui3lt`) |

The same Next app runs in **both places with separate environment variables.** A
200 from the custom domain says nothing about the Vercel deployment, and vice
versa. Check `x-railway-edge` / `x-vercel-id` in the response headers to know which
one answered you.

Vercel `ssoProtection` is `all_except_custom_domains`, so every `.vercel.app` URL
302s to `vercel.com/sso-api`. You cannot fetch a preview URL from an agent session.

## Supabase

Project **AITrinitySymphony**, ref `qnnpjhlxljtqyigedwkb` (the ref that used to be
hardcoded as a fallback in `trade_pipeline.ts`).

This project uses Supabase's **newer API keys**. The legacy `anon` JWT is
**disabled** (measured 2026-08-12); five `sb_publishable_…` keys are active. The
status of the legacy `service_role` key is **unverified** — secret keys are not
readable through any API, so an agent cannot check it.

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
