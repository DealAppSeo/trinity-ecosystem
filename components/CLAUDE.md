# components/ — `'use client'` does not mean "only in the browser"

## These files run on the server during the build

A client component is still **server-rendered during prerender**. So module-scope
code in a `'use client'` file executes on the build machine, where browser
environment variables may be absent.

`LiveReceiptFeed.tsx` and `AgentRepIDGrid.tsx` each built a Supabase client at
module scope with `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!`. That broke
`/dashboard` at export. The `!` silences the type error and does nothing at
runtime.

Build the client inside the effect:

```ts
useEffect(() => {
  const supabase = getSupabaseBrowser();
  …
}, []);
```

This one hid behind a different failure and was invisible until the first was
fixed. Fix a layer, rebuild, look again — the second layer does not appear until
the first is gone.

## `NEXT_PUBLIC_*` is inlined by static analysis of literal references

Next replaces the literal text `process.env.NEXT_PUBLIC_FOO` at build time. A
computed lookup is **not** inlined and is `undefined` in the browser:

```ts
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY   // inlined ✅
process.env[name]                                   // undefined in browser ❌
```

This is why `lib/supabase-browser.ts` spells out each candidate key name as a
separate literal instead of looping, while the server helper loops freely. If you
"simplify" that list into a loop, it will build fine and fail in the browser.

## The key in this bundle is public

`getSupabaseBrowser()` uses the publishable key, which maps to the `anon` Postgres
role and **ships in the JS bundle** — verified: it appears in
`.next/static/chunks/app/dashboard/*.js`. Anyone can read it from source.

So a client-side query is only as private as the `anon` RLS policy on that table.
Two tables are currently unrestricted (`LESSONS.md` S1). Prefer fetching through
`app/api/*` routes, which hold the server key, for anything that should not be
world-readable.

Never put a secret key in a component. Verified absent today; keep it that way:

```bash
grep -r "sb_secret_" .next/static   # must return nothing
```
