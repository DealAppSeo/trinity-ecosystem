# lib/ — rules that have already broken production here

## Never construct a Supabase client at module scope

Not as a `const`, not as a class field initialiser, not inside a module-scope
`new`. Use the accessors:

```ts
import { getSupabaseAdmin } from '@/lib/supabase-admin';    // server
```

**Why.** `next build` collects page data by importing every route module. Anything
at module scope therefore executes at build time, with whatever environment the
builder has — which is not the runtime environment. A client built there throws
`supabaseKey is required` and fails the build before a single request is served.

This exact pattern broke **every deployment of this project from 2026-06-05 to
2026-08-11**. See `git log 777daa7`, or `node scripts/why.mjs "module scope"`.

A class field is module scope in disguise when the class is instantiated at module
scope — `export const bftEngine = new BFTEngine()` runs the field initialisers on
import. Use a getter:

```ts
private get supabase() { return getSupabaseAdmin(); }
```

## Do not add a dummy fallback

`|| 'https://dummy.supabase.co'` and `|| 'dummy_key'` were removed on purpose. They
did not fix anything — they built a live client pointed at a host that does not
exist, so a misconfigured deployment returned empty result sets instead of saying
what was wrong. Missing configuration must throw and name the variable.

Note `|| ''` is the same bug: supabase-js rejects a falsy key, so an empty-string
fallback throws exactly like `undefined`, just later and less clearly.

## Key names

This project uses Supabase's newer API keys. The legacy `anon` JWT is **disabled**.

- server: `SUPABASE_SECRET_KEY` (`sb_secret_…`), legacy names still accepted
- browser: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`)

`lib/trust/cross-llm-verifier.ts` was already lazy and guarded before the refactor.
It is the reference example; leave it alone.

## Before you claim something about this directory

Run the build. Every wrong claim in `LESSONS.md` came from describing behaviour
without executing it — including a confident list of eight files that would break
the build, when the real answer was one file plus two components nobody had listed.
