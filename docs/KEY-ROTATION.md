# Key rotation

## SETTLED 2026-08-12 — legacy keys are DISABLED. Nothing here is urgent.

**Status: CLOSED. Do not re-open.**

The Supabase dashboard for `qnnpjhlxljtqyigedwkb` renders a **"Re-enable
JWT-based API keys"** button at Settings → API Keys → Legacy. That button only
exists when legacy keys are already **off**. The legacy `anon` and
`service_role` JWTs are therefore **not accepted by the API**.

The project runs on the new keys: five `sb_publishable_…` and nine
`sb_secret_…`, visible on the Publishable-and-secret tab.

**The known leak is therefore inert.** The `service_role` JWT (sha256
`f179551d…`, exp 2035-07-08) was committed to the PUBLIC repo
`DealAppSeo/repid-engine` as `service_role.txt` (`fff5500`, 2026-04-20 →
removed `973fc09`, 2026-08-03) and remains readable in that public history. A
disabled key cannot authenticate. **This is not an active incident.**

### The only standing rule

> **Never press "Re-enable JWT-based API keys" on this project.**
> That single click re-arms a credential that is publicly readable on GitHub.

If someone ever does need legacy keys back, the leaked token must be dealt with
*first* — see "What is and isn't possible" below.

### Do not re-open these

| Question | Answer |
| :-- | :-- |
| Should we rotate the legacy `service_role` key? | **No — impossible.** Supabase no longer offers legacy JWT-secret rotation. |
| Should we disable legacy keys? | **Already done.** |
| Is the public leak an emergency? | **No.** The key it exposes is disabled. |
| Do we need the `repid-engine` Go/No-Go consumer inventory? | **Historical.** It planned an action that has since happened. |
| Signing-key migration? | **Optional hardening**, not remediation. Schedule it or don't. |
| Anything left at all? | One optional, low-priority item: review API logs from 2026-04-20 to the disable date for use from unknown egress. |

This supersedes every "UNVERIFIED", "treat it as live", "rotate", and "disable
today" statement anywhere in this repo's history. Mirrored into the database as
a `settled_facts_DO_NOT_REPEAT` row (`trinity_changelog` id 110, with rollback
SQL) so no future session re-litigates it from a stale doc.

---

## What is and isn't possible with these keys

Worth knowing once, so nobody proposes an action that does not exist.

- **Legacy `anon` / `service_role` JWTs cannot be rotated.** Supabase:
  *"it is no longer possible to rotate the legacy anon, service and JWT
  secrets."* They can only be **disabled** (done) — which is reversible and
  does **not** change the token.
- **Disabled ≠ revoked.** The token is unchanged and would work again if legacy
  keys were re-enabled. Hence the standing rule above.
- **The only way to truly retire it** is to migrate to asymmetric
  [JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys), then
  rotate **and revoke** the previous key. Rotating without revoking leaves the
  old key valid. This also touches user sessions, so treat it as a migration.
- **New `sb_secret_…` keys are independently revocable.** That is the point of
  them, and why the leak class above cannot recur in the same way.

## Verifying the state yourself

```bash
npm run check:legacy-key
```

Probes PostgREST with the historical tokens and reports LIVE / INERT / RETIRED
/ **NOT MEASURED**. Given the settled state above, expect `INERT`.

Run it from a laptop. From a cloud session it exits 2 with `NOT MEASURED`
because `*.supabase.co` is denied by the egress proxy — and the proxy answers a
blocked host with **HTTP 403**, which the script deliberately refuses to read as
an auth rejection.

## Rotating a new-style secret key (`sb_secret_…`)

Not currently needed — no `sb_secret_…` value appears in the working tree or in
history (`scan-secrets.mjs` is clean, including all 923 commits of
`repid-engine`). Keep for when it is.

Order matters: add the new key everywhere *before* deleting the old one.
**Deleting a secret key is irreversible.**

1. **Issue** — Supabase → Settings → API Keys → create an `sb_secret_…` key.
2. **Vercel** — project `ai-trinity-symphony-landing` → Environment Variables →
   `SUPABASE_SECRET_KEY`, every environment you deploy.
3. **Railway** — the host actually serving `app.aitrinitysymphony.com`. Easy to
   miss because the custom domain does not resolve to Vercel; see `CLAUDE.md`.
4. **Supabase Edge Functions** — `supabase/functions/agent-tools` reads its own
   secrets, set separately from both hosts.
5. **Local** — your `.env.local`.
6. **Delete the legacy names everywhere.** `lib/supabase-admin.ts` reads, in
   order: `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SUPABASE_SERVICE_KEY`, `SUPABASE_KEY`. A stale legacy value left on one host
   silently wins there and nowhere else — the hardest kind of bug to see.
7. **Redeploy both hosts**, then **delete** the superseded key.
8. Confirm: no `[supabase-admin] … legacy service_role JWT` warning in the logs.
   That warning fires once per process whenever a legacy JWT is in use.

No GitHub Actions secrets to update — no workflow references Supabase.

## Rotating the browser key (optional)

**This does not fix an RLS exposure.** The publishable key ships in the browser
bundle by design; a new one ships the same way and reads the same rows. The fix
for a permissive `anon` policy is the policy, not the credential.

If rotating anyway: same hosts as above. `lib/supabase-browser.ts` reads three
names in order — `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
`NEXT_PUBLIC_*` is inlined at build time, so **a redeploy is mandatory**.

---

## Historical record

Kept for the audit trail, not as a call to action. Everything below is
superseded by the SETTLED block at the top.

### The leak

| | |
| :-- | :-- |
| Repo | `DealAppSeo/repid-engine` — **public** |
| File | `service_role.txt` |
| Added | `fff5500`, 2026-04-20 |
| Removed from HEAD | `973fc09`, 2026-08-03 |
| Still in public history | Yes — `fff5500` is reachable from `origin/main` |
| Same token as this repo's copy | Yes — byte-identical, sha256 `f179551d…` |

Also present in this (private) repo's history: `.env.local`,
`.next/server/app/dashboard/page.js`, webpack cache, 2026-04-17 → `504bba6`.

A full-history scan of `repid-engine` (923 commits) found **exactly one** real
credential — this one. Two other hits were synthetic fixtures in
`tests/security-audit.test.ts`.

`AGENT_SOPHIA_PRIVKEY` also appeared in `audit_output.txt` (88-char base58).
Devnet-only, and it is not the wallet behind any recorded payment — 0 of 12
`kya_compliance_receipts` rows. Rotate if convenient. The three 88-char base58
strings in `TRUST_ATTESTATION.md` are **not secrets**; they are transaction
signatures, which happen to be the same length as an ed25519 key.

### Why the scanners did not catch it

The removal commit says it plainly: *"a LIVE prod service_role key was tracked
in this repo — and every gitleaks check was green."* A scanner ran, passed, and
the key sat there for 3.5 months. `scripts/scan-secrets.mjs` exists because of
this, and it distinguishes "ran and found nothing" from "could not run".

### Why history still holds these

`git rm` removes a file from the current tree, not from history. Rewriting
history (`filter-repo`, force-push) invalidates every open branch and clone.
Not worth it here: the credential is disabled, so the copy in history is inert.
Purging would only reduce future discovery of an already-dead key.

### How they got committed

- `.env.local` was tracked before `.gitignore` covered it. Ignored now.
- `.next/` build output was committed, and `next build` inlines server env into
  the bundle — so the key landed in `.next/server/app/dashboard/page.js` too.
  Ignored now.
- `audit_output.txt` was a one-off audit dump that quoted `.env.local` line by
  line. Untracked and ignored.

`scripts/scan-secrets.mjs` exits non-zero if a usable credential reappears in
the working tree. Wire it into CI or a pre-commit hook to keep it that way.
