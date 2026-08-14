# app/api/ — route handler rules

## The build imports this file; it does not run it

`next build` imports every route module to collect page data. So **import-time
code executes during the build**, but **handler bodies do not**.

Two consequences that have both bitten:

1. Anything at module scope needing runtime config fails the build. Build the
   Supabase client inside the handler via `getSupabaseAdmin()` — see `lib/CLAUDE.md`.
2. **A green build proves nothing about handler bodies.** A refactor once left two
   bare `supabase` references inside handlers; the build passed because dynamic
   routes never execute during it. `tsc --noEmit` caught it — the build could not.

So: `npx tsc --noEmit` before claiming a route change is safe, and compare the
error count to the base branch rather than reading "it compiled" as clean. The
baseline is **25** pre-existing type errors (measured 2026-08-13 on
`claude/e2e-mvp-packaging-plttzn`); the number moving is the signal. This file
said "~37" until 2026-08-13, which is the kind of stale number that turns a
regression into a rounding error — re-measure rather than trusting this line.

## These routes hold the service key — that is the point

They run server-side with `SUPABASE_SECRET_KEY`, which bypasses RLS. That is
deliberate and it is why they exist: a browser holding the publishable key is
restricted by `anon` policies, but these routes are not.

It also means **anything you expose here is exposed with full table access**.
Select the columns you need. Do not `select('*')` into a JSON response.

## RLS context you need before changing what a route returns

`agent_kya_registry` and `kya_compliance_receipts` currently carry
`{anon} SELECT USING (true)`, and the publishable key ships in the browser bundle.
Both tables are therefore already readable in full by anyone who views source —
`railway_url`, `recipient_address`, `fireblocks_preauth_id`, spending limits.

That is an open finding (`LESSONS.md` S1), not a design. Do not widen it, and do
not assume a route is the only path to that data — right now it is not.

`x402_settlements` has RLS on with **zero** policies: deny-all for `anon`. A
client-side read of it returns empty rather than an error.

## `export const dynamic = 'force-dynamic'`

Present on several routes. Keep it on anything reading request state or live data.
It is not what saves you from the module-scope problem — lazy construction is.
