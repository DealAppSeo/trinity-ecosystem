# Key rotation

What is exposed, what actually needs rotating, and every place each key lives.

Regenerate the findings at any time:

```bash
node scripts/scan-secrets.mjs            # tracked files at HEAD
node scripts/scan-secrets.mjs --history  # every commit reachable from any ref
```

## Findings as of 2026-08-12

Measured, not inferred. Where something could not be checked from a cloud
session, it says so rather than guessing.

| Credential | Where | Complete? | Verdict |
| :-- | :-- | :-- | :-- |
| Supabase `service_role` JWT | `.env.local`, `.next/server/app/dashboard/page.js`, webpack cache — history only, 2026-04-17 → 2026-07-25 (`504bba6`) | **Yes** — 219 chars, 3 parts, `exp` 2035-07-08 | **Rotate.** Bypasses RLS. |
| `AGENT_SOPHIA_PRIVKEY` | `audit_output.txt` | **Yes** — 88-char base58 | Rotate if convenient. Devnet-only. |
| Supabase `anon` / publishable JWT | same places | Yes | No action. Public by design. |
| 3 × 88-char base58 in `TRUST_ATTESTATION.md` | history (`721d52f`) | n/a | **Not secrets.** Transaction signatures — same length as an ed25519 key. |

Three things bound the severity:

- The repository is **private with zero forks**. Exposure is limited to people
  who already have repo access.
- The `AGENT_SOPHIA_*` wallet is **devnet**. Every Solana script targets
  `api.devnet.solana.com`; there is no `mainnet-beta` reference in the repo. The
  wallet appears in **0 of 12** `kya_compliance_receipts` rows and 0
  `agent_kya_registry` rows, so it is not the wallet behind the recorded
  payments.
- Nothing usable remains in the working tree. `scan-secrets.mjs` exits 0.

**Unverified:** whether the legacy `service_role` JWT is still accepted by the
API. Secret keys are not readable through any Supabase API, and the PostgREST
host is proxy-denied from cloud sessions (`curl` returns HTTP 000). Treat it as
live until revoked in the dashboard. Do not let any doc claim otherwise without
a measurement behind it — that claim was made once already and was wrong.

## Rotating the Supabase secret key

This is the one that matters. Order matters: add the new key everywhere *before*
revoking the old one, or you take the app down between steps.

1. **Issue** — Supabase → project `qnnpjhlxljtqyigedwkb` → Settings → API Keys →
   create an `sb_secret_…` key.
2. **Vercel** — project `ai-trinity-symphony-landing` → Settings → Environment
   Variables → set `SUPABASE_SECRET_KEY` for every environment you deploy.
3. **Railway** — the host actually serving `app.aitrinitysymphony.com`. Easy to
   miss because the custom domain does not resolve to Vercel; see `CLAUDE.md`.
   Set `SUPABASE_SECRET_KEY` there too.
4. **Supabase Edge Functions** — `supabase/functions/agent-tools` reads its own
   secrets, set separately from both hosts.
5. **Local** — your `.env.local`.
6. **Delete the legacy names everywhere.** `lib/supabase-admin.ts` reads, in
   order: `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SUPABASE_SERVICE_KEY`, `SUPABASE_KEY`. A stale legacy value left on one host
   silently wins there and nowhere else, which is the hardest kind of bug to
   see.
7. **Redeploy both hosts**, then **revoke** the legacy `service_role` JWT in the
   dashboard.
8. Confirm: the server logs should carry no `[supabase-admin] … legacy
   service_role JWT` warning. That warning fires once per process whenever a
   legacy JWT is in use.

No GitHub Actions secrets to update — no workflow references Supabase.

## Rotating the browser key (optional)

**This does not fix the RLS exposure.** The publishable/anon key ships in the
browser bundle by design; a new one ships the same way and reads the same rows.
The fix for `{anon} SELECT USING (true)` on `agent_kya_registry` and
`kya_compliance_receipts` is the policy, not the credential.

If rotating anyway: same hosts as above, plus note that `lib/supabase-browser.ts`
reads three names in order — `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
`NEXT_PUBLIC_*` is inlined at build time, so **a redeploy is mandatory**; changing
the variable alone changes nothing in an already-built bundle.

## Why history still holds these

`git rm` removes a file from the current tree, not from history. Anyone who can
clone can `git log -p` a deleted secret back out. Rewriting history
(`filter-repo`, force-push) invalidates every open branch and clone and is not
worth it here: once the credential is revoked, the copy in history is inert.

**Rotate first. Consider purging history only if a rotation is impossible.**

## How these got committed

Worth knowing, because the paths are still open:

- `.env.local` was tracked before `.gitignore` covered it. It is ignored now.
- `.next/` build output was committed, and `next build` inlines server env into
  the bundle — so the key landed in `.next/server/app/dashboard/page.js` as well
  as in `.env.local`. `.next` is ignored now.
- `audit_output.txt` was a one-off audit dump that quoted `.env.local` line by
  line. Untracked and ignored as of this change.

`scripts/scan-secrets.mjs` exits non-zero if a usable credential reappears in the
working tree. Wire it into CI or a pre-commit hook to keep it that way.
